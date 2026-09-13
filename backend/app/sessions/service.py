"""VPN session lifecycle.

A session is the authorisation to hold a tunnel. Creating one provisions a
WireGuard peer; ending one removes it. Because the peer only exists while the
session does, "session ended" and "tunnel closed" are the same event rather
than a UI state.

States: AUTHORIZED -> ACTIVE -> (COMPLETED | EXPIRED | REVOKED | STALE)
"""

from __future__ import annotations

import logging
from typing import Any

from app.common import audit
from app.common.db import get_db
from app.common.errors import Conflict, NoGatewayAvailable, NotFound, QuotaExhausted
from app.common.metrics import (
    quota_exhausted as quota_exhausted_metric,
)
from app.common.metrics import (
    sessions_active,
    sessions_ended,
    sessions_started,
)
from app.common.models import oid
from app.common.timeutil import seconds_between, utcnow
from app.config.settings import settings
from app.devices import service as devices
from app.quota import service as quota
from app.servers import service as servers
from app.wireguard import provisioning

log = logging.getLogger(__name__)

LIVE_STATES = ("AUTHORIZED", "ACTIVE")


async def start_session(user: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    db = get_db()
    user_id = str(user["_id"])

    # Emergency brake: an operator can stop new tunnels being placed without
    # touching the ones already running.
    platform = await db.settings.find_one({"_id": "platform"})
    if platform and platform.get("new_sessions_paused"):
        raise NoGatewayAvailable(
            "New VPN connections are paused for maintenance. Existing sessions are unaffected.",
            code="new_sessions_paused",
        )

    from app.common.cache import lock
    import asyncio

    user_oid = oid(user_id)

    async with lock(f"session:{user_id}", ttl=15) as held:
        if not held:
            for _ in range(6):
                await asyncio.sleep(0.5)
                async with lock(f"session:{user_id}", ttl=15) as reheld:
                    if reheld:
                        held = True
                        break
        if not held:
            raise Conflict("A session connection is already in progress.", code="session_in_progress")

        remaining = await quota.remaining_seconds(user)
        if remaining <= 0:
            quota_exhausted_metric.inc()
            raise QuotaExhausted()

        device = await devices.get_device(user_id, payload["device_id"])

        live = await db.vpn_sessions.count_documents(
            {"user_id": user_oid, "status": {"$in": list(LIVE_STATES)}}
        )
        if live >= settings.max_concurrent_sessions:
            # Replace rather than refuse: reconnecting after a crash is normal and
            # must not lock a user out of their own account.
            await terminate_user_sessions(user_id, reason="superseded")

        server = await servers.pick_server(
            gateway_id=payload.get("gateway_id"),
            country_code=payload.get("country_code"),
            latency_hints=payload.get("latency_hints") or {},
        )
        peer = await provisioning.provision_peer(device, server)

        now = utcnow()
        session = {
            "user_id": user_oid,
            "device_id": str(device["_id"]),
            "gateway_id": server["gateway_id"],
            "peer_public_key": device["public_key"],
            "status": "AUTHORIZED",
            "started_at": now,
            "last_heartbeat": now,
            "ended_at": None,
            "duration_seconds": 0,
            "bytes_up": 0,
            "bytes_down": 0,
        }
        result = await db.vpn_sessions.insert_one(session)
        session_id = str(result.inserted_id)

    await devices.touch(str(device["_id"]))
    sessions_started.labels(server["country_code"]).inc()
    sessions_active.inc()
    await audit.record(
        "session.start", actor_id=user_id, target=session_id,
        metadata={"gateway_id": server["gateway_id"]},
    )

    return {
        "session_id": session_id,
        "status": "AUTHORIZED",
        "server": servers.public_view(server),
        "config": provisioning.client_config(server, peer),
        "quota": await quota.snapshot(user),
        "heartbeat_interval_seconds": settings.session_heartbeat_seconds,
    }


async def _load_session(user_id: str, session_id: str) -> dict[str, Any]:
    session = await get_db().vpn_sessions.find_one(
        {"_id": oid(session_id), "user_id": oid(user_id)}
    )
    if session is None:
        raise NotFound("That VPN session no longer exists.", code="session_not_found")
    return session


async def heartbeat(
    user: dict[str, Any], session_id: str, payload: dict[str, Any]
) -> dict[str, Any]:
    """Charge elapsed server time, record traffic counters, enforce the quota."""
    db = get_db()
    user_id = str(user["_id"])
    session = await _load_session(user_id, session_id)

    if session["status"] not in LIVE_STATES:
        raise Conflict(
            "That VPN session has ended. Connect again to continue.", code="session_ended"
        )

    now = utcnow()
    # Cap the charge so an app that was suspended (doze, no network) cannot be
    # billed for hours it could not possibly have tunnelled.
    delta = min(
        seconds_between(session["last_heartbeat"], now), settings.session_stale_after_seconds
    )
    remaining = await quota.consume(user, delta)

    status = "ACTIVE" if payload.get("tunnel_established", True) else session["status"]
    await db.vpn_sessions.update_one(
        {"_id": session["_id"]},
        {
            "$set": {
                "status": status,
                "last_heartbeat": now,
                "latency_ms": payload.get("latency_ms"),
                "bytes_up": int(payload.get("bytes_up", 0)),
                "bytes_down": int(payload.get("bytes_down", 0)),
            },
            "$inc": {"duration_seconds": delta},
        },
    )

    if remaining <= 0:
        await _end(session, reason="quota_exhausted", status="EXPIRED")
        quota_exhausted_metric.inc()
        return {
            "session_id": session_id,
            "status": "EXPIRED",
            "reason": "quota_exhausted",
            "quota": await quota.snapshot(user),
        }

    return {
        "session_id": session_id,
        "status": status,
        "quota": await quota.snapshot(user),
        "next_heartbeat_seconds": settings.session_heartbeat_seconds,
    }


async def disconnect(
    user: dict[str, Any], session_id: str, payload: dict[str, Any] | None = None
) -> dict[str, Any]:
    user_id = str(user["_id"])
    session = await _load_session(user_id, session_id)
    if session["status"] in LIVE_STATES:
        now = utcnow()
        delta = min(
            seconds_between(session["last_heartbeat"], now), settings.session_stale_after_seconds
        )
        await quota.consume(user, delta)
        await get_db().vpn_sessions.update_one(
            {"_id": session["_id"]}, {"$inc": {"duration_seconds": delta}}
        )
        await _end(session, reason=(payload or {}).get("reason", "user_requested"),
                   status="COMPLETED", counters=payload)
    return {"session_id": session_id, "status": "COMPLETED", "quota": await quota.snapshot(user)}


async def _end(
    session: dict[str, Any],
    *,
    reason: str,
    status: str,
    counters: dict[str, Any] | None = None,
) -> None:
    """Remove the peer first, then close the record. Order matters: the tunnel
    must be gone before we report the session as ended."""
    db = get_db()
    peer = await db.wireguard_peers.find_one(
        {"device_id": session["device_id"], "gateway_id": session["gateway_id"], "active": True}
    )
    if peer:
        await provisioning.revoke_peer(peer)

    update: dict[str, Any] = {
        "status": status,
        "ended_at": utcnow(),
        "end_reason": reason,
    }
    if counters:
        update["bytes_up"] = int(counters.get("bytes_up", session.get("bytes_up", 0)))
        update["bytes_down"] = int(counters.get("bytes_down", session.get("bytes_down", 0)))

    await db.vpn_sessions.update_one({"_id": session["_id"]}, {"$set": update})
    await _write_usage_record(session, update)

    sessions_ended.labels(reason).inc()
    try:
        sessions_active.dec()
    except Exception:  # noqa: BLE001
        pass
    log.info(
        "session ended",
        extra={"event": "session.end", "session_id": str(session["_id"]), "reason": reason},
    )


async def _write_usage_record(session: dict[str, Any], update: dict[str, Any]) -> None:
    from app.common.timeutil import quota_day

    await get_db().usage_records.insert_one(
        {
            "user_id": session["user_id"],
            "device_id": session["device_id"],
            "gateway_id": session["gateway_id"],
            "date": quota_day(session.get("started_at")),
            "duration_seconds": int(session.get("duration_seconds", 0)),
            "bytes_up": int(update.get("bytes_up", session.get("bytes_up", 0))),
            "bytes_down": int(update.get("bytes_down", session.get("bytes_down", 0))),
            "end_reason": update.get("end_reason"),
            "created_at": utcnow(),
        }
    )


async def status_for(user: dict[str, Any]) -> dict[str, Any]:
    session = await get_db().vpn_sessions.find_one(
        {"user_id": oid(user["_id"]), "status": {"$in": list(LIVE_STATES)}},
        sort=[("started_at", -1)],
    )
    if session is None:
        return {"active": False, "quota": await quota.snapshot(user)}
    server = await get_db().vpn_servers.find_one({"gateway_id": session["gateway_id"]})
    return {
        "active": True,
        "session_id": str(session["_id"]),
        "status": session["status"],
        "started_at": session["started_at"].isoformat(),
        "duration_seconds": int(session.get("duration_seconds", 0)),
        "bytes_up": int(session.get("bytes_up", 0)),
        "bytes_down": int(session.get("bytes_down", 0)),
        "server": servers.public_view(server) if server else None,
        "quota": await quota.snapshot(user),
    }


async def terminate_user_sessions(user_id: str, *, reason: str) -> int:
    db = get_db()
    count = 0
    async for session in db.vpn_sessions.find(
        {"user_id": oid(user_id), "status": {"$in": list(LIVE_STATES)}}
    ):
        await _end(session, reason=reason, status="REVOKED")
        count += 1
    return count


async def terminate_device_sessions(device_id: str, *, reason: str) -> int:
    db = get_db()
    count = 0
    async for session in db.vpn_sessions.find(
        {"device_id": device_id, "status": {"$in": list(LIVE_STATES)}}
    ):
        await _end(session, reason=reason, status="REVOKED")
        count += 1
    return count


async def reap_stale_sessions() -> int:
    """Close sessions whose client stopped checking in (crash, reboot, flight
    mode). Without this, a dead client would hold a peer and a quota slot."""
    db = get_db()
    cutoff = utcnow().timestamp() - settings.session_stale_after_seconds
    reaped = 0
    async for session in db.vpn_sessions.find({"status": {"$in": list(LIVE_STATES)}}):
        if session["last_heartbeat"].timestamp() > cutoff:
            continue
        user = await db.users.find_one({"_id": session["user_id"]})
        if user:
            delta = min(
                seconds_between(session["last_heartbeat"], utcnow()),
                settings.session_stale_after_seconds,
            )
            await quota.consume(user, delta)
            await db.vpn_sessions.update_one(
                {"_id": session["_id"]}, {"$inc": {"duration_seconds": delta}}
            )
        await _end(session, reason="stale_heartbeat", status="STALE")
        reaped += 1
    return reaped
