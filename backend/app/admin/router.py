"""Admin API.

Every route declares the permission it needs. Nothing here trusts the console:
hiding a button is a courtesy, the check is what stops the action.

Gateway private keys and agent secrets are excluded at the query level rather
than filtered afterwards, so a new field cannot leak by being forgotten.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, Query

from app.abuse import service as abuse
from app.common import audit
from app.common.cache import get_redis
from app.common.db import get_db
from app.common.errors import NotFound
from app.common.models import oid, serialise
from app.common.rbac import Permission, ROLE_PERMISSIONS, Role, permissions_of, require, role_of
from app.common.timeutil import quota_day, utcnow
from app.config.settings import settings
from app.gateways import actions
from app.quota import service as quota
from app.servers import service as servers
from app.sessions import service as sessions

router = APIRouter(prefix="/admin", tags=["admin"])

# Secrets are dropped in the projection, not in Python.
SERVER_PROJECTION = {"agent_secret": 0, "agent_token_hash": 0}

Dashboard = Annotated[dict, Depends(require(Permission.VIEW_DASHBOARD))]
UserReader = Annotated[dict, Depends(require(Permission.VIEW_USERS))]
SessionReader = Annotated[dict, Depends(require(Permission.VIEW_SESSIONS))]
DeviceReader = Annotated[dict, Depends(require(Permission.VIEW_DEVICES))]
GatewayReader = Annotated[dict, Depends(require(Permission.VIEW_GATEWAYS))]
AnalyticsReader = Annotated[dict, Depends(require(Permission.VIEW_ANALYTICS))]
HealthReader = Annotated[dict, Depends(require(Permission.VIEW_HEALTH))]
AuditReader = Annotated[dict, Depends(require(Permission.VIEW_AUDIT))]


# --- who am I --------------------------------------------------------------
@router.get("/me")
async def whoami(admin: Dashboard):
    """The console renders its navigation from this, so what an operator can
    see always matches what the API will allow."""
    role = role_of(admin)
    return {
        "id": str(admin["_id"]),
        "email": admin["email"],
        "role": role.value if role else None,
        "permissions": sorted(p.value for p in permissions_of(admin)),
        "mfa_enabled": bool(admin.get("mfa_enabled")),
    }


# --- overview --------------------------------------------------------------
@router.get("/overview")
async def overview(admin: Dashboard):
    db = get_db()
    live = {"$in": ["AUTHORIZED", "ACTIVE"]}
    server_docs = await db.vpn_servers.find({}, SERVER_PROJECTION).to_list(length=500)
    online = [s for s in server_docs if servers.effective_status(s) == "online"]

    today = quota_day()
    yesterday = quota_day(utcnow() - timedelta(days=1))

    quota_today = await _sum(db.daily_quotas, {"date": today}, {"seconds": "$used_seconds"})
    quota_yesterday = await _sum(db.daily_quotas, {"date": yesterday}, {"seconds": "$used_seconds"})
    usage_today = await _sum(
        db.usage_records, {"date": today}, {"up": "$bytes_up", "down": "$bytes_down"}
    )

    return {
        "sessions_active": await db.vpn_sessions.count_documents({"status": live}),
        "sessions_today": await db.usage_records.count_documents({"date": today}),
        "users_total": await db.users.count_documents({}),
        "users_suspended": await db.users.count_documents({"status": "suspended"}),
        "users_new_today": await db.users.count_documents(
            {"created_at": {"$gte": utcnow() - timedelta(days=1)}}
        ),
        "devices_total": await db.devices.count_documents({"revoked": False}),
        "gateways_total": len(server_docs),
        "gateways_online": len(online),
        "gateway_load_average": round(
            sum(s.get("load_percent", 0) for s in online) / len(online), 1
        )
        if online
        else None,
        "quota_seconds_used_today": quota_today.get("seconds", 0),
        "quota_seconds_used_yesterday": quota_yesterday.get("seconds", 0),
        "bytes_up_today": usage_today.get("up", 0),
        "bytes_down_today": usage_today.get("down", 0),
        "free_daily_seconds": await quota.daily_allowance(),
        "server_time": utcnow().isoformat(),
    }


async def _sum(collection, match: dict, fields: dict[str, str]) -> dict[str, int]:
    group = {"_id": None, **{name: {"$sum": expr} for name, expr in fields.items()}}
    rows = await collection.aggregate([{"$match": match}, {"$group": group}]).to_list(length=1)
    return {name: int(rows[0].get(name, 0)) for name in fields} if rows else {}


# --- users -----------------------------------------------------------------
@router.get("/users")
async def list_users(
    admin: UserReader,
    q: str | None = None,
    status: str | None = None,
    plan: str | None = None,
    limit: int = Query(50, le=200),
    skip: int = 0,
):
    query: dict[str, Any] = {}
    if q:
        query["email"] = {"$regex": q.lower(), "$options": "i"}
    if status:
        query["status"] = status
    if plan:
        query["plan"] = plan

    db = get_db()
    cursor = (
        db.users.find(query, {"password_hash": 0, "mfa_secret": 0, "mfa_recovery_hashes": 0})
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
    )
    rows = await cursor.to_list(length=limit)
    return {
        "users": [serialise(u) for u in rows],
        "total": await db.users.count_documents(query),
    }


@router.get("/users/{user_id}")
async def user_detail(user_id: str, admin: UserReader):
    db = get_db()
    user = await db.users.find_one(
        {"_id": oid(user_id)}, {"password_hash": 0, "mfa_secret": 0, "mfa_recovery_hashes": 0}
    )
    if user is None:
        raise NotFound("That account no longer exists.", code="user_not_found")

    devices = await db.devices.find({"user_id": oid(user_id)}).to_list(length=50)
    recent = (
        await db.vpn_sessions.find({"user_id": oid(user_id)})
        .sort("started_at", -1)
        .limit(20)
        .to_list(length=20)
    )
    usage = (
        await db.usage_records.aggregate(
            [
                {"$match": {"user_id": oid(user_id)}},
                {
                    "$group": {
                        "_id": "$date",
                        "duration_seconds": {"$sum": "$duration_seconds"},
                        "bytes": {"$sum": {"$add": ["$bytes_up", "$bytes_down"]}},
                    }
                },
                {"$sort": {"_id": -1}},
                {"$limit": 14},
            ]
        ).to_list(length=14)
    )
    return {
        "user": serialise(user),
        "devices": [_device_view(d) for d in devices],
        "sessions": [serialise(s) for s in recent],
        "quota_today": serialise(
            await db.daily_quotas.find_one({"user_id": oid(user_id), "date": quota_day()})
        ),
        "usage": [{"date": r["_id"], **{k: r[k] for k in ("duration_seconds", "bytes")}} for r in usage],
        "signals": await abuse.signals_for_user(user_id),
    }


@router.post("/users/{user_id}/suspend")
async def suspend(
    user_id: str,
    admin: Annotated[dict, Depends(require(Permission.SUSPEND_USER))],
    reason: str = Body(embed=True),
):
    await abuse.suspend_user(user_id, reason)
    await audit.record(
        "admin.user_suspend", actor_id=str(admin["_id"]), target=user_id,
        metadata={"reason": reason[:200]},
    )
    return {"ok": True}


@router.post("/users/{user_id}/reinstate")
async def reinstate(
    user_id: str, admin: Annotated[dict, Depends(require(Permission.SUSPEND_USER))]
):
    await abuse.reinstate_user(user_id)
    await audit.record("admin.user_reinstate", actor_id=str(admin["_id"]), target=user_id)
    return {"ok": True}


# --- devices ---------------------------------------------------------------
def _device_view(device: dict) -> dict:
    doc = serialise(device)
    # The public key identifies a peer on every gateway. Support staff have no
    # reason to see it, and nothing in the console needs it.
    doc.pop("public_key", None)
    return doc


@router.get("/devices")
async def list_devices(
    admin: DeviceReader,
    q: str | None = None,
    platform: str | None = None,
    limit: int = Query(50, le=200),
    skip: int = 0,
):
    db = get_db()
    query: dict[str, Any] = {}
    if platform:
        query["platform"] = platform
    if q:
        users = await db.users.find(
            {"email": {"$regex": q.lower(), "$options": "i"}}, {"_id": 1}
        ).to_list(length=200)
        query["user_id"] = {"$in": [u["_id"] for u in users]}

    rows = await db.devices.find(query).sort("last_seen_at", -1).skip(skip).limit(limit).to_list(
        length=limit
    )
    emails = await _emails_for({r["user_id"] for r in rows})
    live = await db.vpn_sessions.find(
        {"status": {"$in": ["AUTHORIZED", "ACTIVE"]}}, {"device_id": 1, "gateway_id": 1}
    ).to_list(length=1000)
    by_device = {s["device_id"]: s.get("gateway_id") for s in live}

    return {
        "devices": [
            {
                **_device_view(row),
                "user_email": emails.get(row["user_id"]),
                "gateway_id": by_device.get(str(row["_id"])),
                "connected": str(row["_id"]) in by_device,
            }
            for row in rows
        ],
        "total": await db.devices.count_documents(query),
    }


async def _emails_for(user_ids) -> dict:
    rows = await get_db().users.find({"_id": {"$in": list(user_ids)}}, {"email": 1}).to_list(
        length=500
    )
    return {r["_id"]: r["email"] for r in rows}


@router.post("/devices/{device_id}/revoke")
async def revoke_device(
    device_id: str,
    admin: Annotated[dict, Depends(require(Permission.REVOKE_DEVICE))],
    reason: str = Body(embed=True),
):
    from app.wireguard import provisioning

    db = get_db()
    device = await db.devices.find_one({"_id": oid(device_id)})
    if device is None:
        raise NotFound("That device is not registered.", code="device_not_found")

    # Sessions first, then peers: the tunnel must be gone before the record is.
    await sessions.terminate_device_sessions(device_id, reason="device_revoked")
    await provisioning.revoke_device_peers(device_id)
    await db.devices.update_one(
        {"_id": device["_id"]}, {"$set": {"revoked": True, "revoked_at": utcnow()}}
    )
    await audit.record(
        "admin.device_revoke", actor_id=str(admin["_id"]), target=device_id,
        metadata={"reason": reason[:200]},
    )
    return {"ok": True}


# --- sessions --------------------------------------------------------------
@router.get("/sessions")
async def list_sessions(
    admin: SessionReader,
    active_only: bool = True,
    gateway_id: str | None = None,
    limit: int = Query(100, le=500),
):
    db = get_db()
    query: dict[str, Any] = {}
    if active_only:
        query["status"] = {"$in": ["AUTHORIZED", "ACTIVE"]}
    if gateway_id:
        query["gateway_id"] = gateway_id

    rows = await db.vpn_sessions.find(query).sort("started_at", -1).limit(limit).to_list(length=limit)
    emails = await _emails_for({r["user_id"] for r in rows})
    return {
        "sessions": [
            {**serialise(row), "user_email": emails.get(row["user_id"])} for row in rows
        ],
        "total": await db.vpn_sessions.count_documents(query),
    }


@router.post("/sessions/{session_id}/terminate")
async def terminate_session(
    session_id: str,
    admin: Annotated[dict, Depends(require(Permission.TERMINATE_SESSION))],
    reason: str = Body(default="admin_terminated", embed=True),
):
    session = await get_db().vpn_sessions.find_one({"_id": oid(session_id)})
    if session is None:
        raise NotFound("That session no longer exists.", code="session_not_found")
    await sessions._end(session, reason=reason, status="REVOKED")  # noqa: SLF001
    await audit.record(
        "admin.session_terminate", actor_id=str(admin["_id"]), target=session_id,
        metadata={"reason": reason[:200]},
    )
    return {"ok": True}


# --- gateways --------------------------------------------------------------
@router.get("/gateways")
async def list_gateways(admin: GatewayReader):
    db = get_db()
    docs = await db.vpn_servers.find({}, SERVER_PROJECTION).to_list(length=500)
    live = await db.vpn_sessions.aggregate(
        [
            {"$match": {"status": {"$in": ["AUTHORIZED", "ACTIVE"]}}},
            {"$group": {"_id": "$gateway_id", "sessions": {"$sum": 1}}},
        ]
    ).to_list(length=500)
    by_gateway = {row["_id"]: row["sessions"] for row in live}

    out = []
    for doc in docs:
        view = serialise(doc)
        view["effective_status"] = servers.effective_status(doc)
        view["sessions_active"] = by_gateway.get(doc["gateway_id"], 0)
        out.append(view)
    return {"gateways": out}


@router.get("/gateways/{gateway_id}")
async def gateway_detail(gateway_id: str, admin: GatewayReader):
    db = get_db()
    server = await db.vpn_servers.find_one({"gateway_id": gateway_id}, SERVER_PROJECTION)
    if server is None:
        raise NotFound("That gateway is not registered.", code="gateway_not_found")

    health = await db.server_health.find_one({"gateway_id": gateway_id})
    peers = await db.wireguard_peers.count_documents({"gateway_id": gateway_id, "active": True})
    live = await db.vpn_sessions.count_documents(
        {"gateway_id": gateway_id, "status": {"$in": ["AUTHORIZED", "ACTIVE"]}}
    )
    recent_ops = (
        await db.audit_events.find({"target": gateway_id})
        .sort("created_at", -1)
        .limit(20)
        .to_list(length=20)
    )
    return {
        "gateway": {**serialise(server), "effective_status": servers.effective_status(server)},
        "health": serialise(health),
        "peers_active": peers,
        "sessions_active": live,
        "operations": [
            {
                "operation": op,
                "permission": perm.value,
                "confirmation": actions.confirmation_for(op, gateway_id),
                "allowed": perm in permissions_of(admin),
            }
            for op, (perm, _, _) in actions.OPERATIONS.items()
        ],
        "recent_events": [serialise(e) for e in recent_ops],
    }


@router.post("/gateways/{gateway_id}/operations/{operation}")
async def gateway_operation(
    gateway_id: str,
    operation: str,
    admin: Dashboard,
    reason: str = Body(embed=True),
    confirmation: str = Body(embed=True),
    step_up_token: str | None = Body(default=None, embed=True),
):
    """Destructive infrastructure work: permission, MFA, typed confirmation,
    written reason, audit event. All five, every time."""
    from app.auth import mfa
    from app.common.errors import Forbidden

    if operation not in actions.OPERATIONS:
        raise NotFound("That operation does not exist.", code="unknown_operation")

    permission = actions.OPERATIONS[operation][0]
    if permission not in permissions_of(admin):
        raise Forbidden("Your role cannot perform that operation.", code="permission_denied")

    mfa.assert_step_up(admin, step_up_token)
    return await actions.execute(operation, gateway_id, admin, reason, confirmation)


@router.post("/gateways/{gateway_id}/capture")
async def gateway_capture(
    gateway_id: str,
    admin: GatewayReader,
    interface: str = Body(default="wg0", embed=True),
    duration: int = Body(default=10, ge=1, le=60, embed=True),
    count: int = Body(default=500, ge=1, le=5000, embed=True),
    bpf_filter: str = Body(default="", embed=True),
):
    """Trigger a live tcpdump packet capture on the gateway and return a
    Wireshark-compatible .pcap file for download.

    The request blocks for `duration` seconds while tcpdump runs on the gateway,
    then streams the binary pcap back. Open the downloaded file in Wireshark.

    Args:
        interface:  Network interface on the gateway (wg0, eth0, any, …).
        duration:   Capture duration in seconds (1–60).
        count:      Max packets before early stop (1–5000).
        bpf_filter: Optional Berkeley Packet Filter expression,
                    e.g. "udp port 51820" or "host 10.100.0.1".
    """
    from fastapi.responses import Response as FastAPIResponse
    from app.gateways.client import GatewayClient

    db = get_db()
    # Fetch the full server record including agent_secret (excluded from SERVER_PROJECTION)
    server = await db.vpn_servers.find_one({"gateway_id": gateway_id})
    if server is None:
        raise NotFound("That gateway is not registered.", code="gateway_not_found")

    client = GatewayClient(server)
    pcap_bytes = await client.capture_traffic(
        interface=interface,
        duration=duration,
        count=count,
        bpf_filter=bpf_filter,
    )

    import time
    filename = f"aurora-{gateway_id}-{interface}-{int(time.time())}.pcap"
    await audit.record(
        "admin.gateway_capture",
        actor_id=str(admin["_id"]),
        target=gateway_id,
        metadata={"interface": interface, "duration": duration, "bytes": len(pcap_bytes)},
    )
    return FastAPIResponse(
        content=pcap_bytes,
        media_type="application/vnd.tcpdump.pcap",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Gateway-Id": gateway_id,
            "X-Capture-Interface": interface,
            "X-Capture-Duration": str(duration),
        },
    )



@router.get("/analytics")
async def analytics(admin: AnalyticsReader, days: int = Query(14, ge=1, le=90)):
    """Aggregated from completed sessions. Durations and byte totals only --
    there is no destination data to report because none is recorded."""
    db = get_db()
    since = (utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")

    daily = await db.usage_records.aggregate(
        [
            {"$match": {"date": {"$gte": since}}},
            {
                "$group": {
                    "_id": "$date",
                    "sessions": {"$sum": 1},
                    "duration_seconds": {"$sum": "$duration_seconds"},
                    "bytes_up": {"$sum": "$bytes_up"},
                    "bytes_down": {"$sum": "$bytes_down"},
                }
            },
            {"$sort": {"_id": 1}},
        ]
    ).to_list(length=days)

    by_gateway = await db.usage_records.aggregate(
        [
            {"$match": {"date": {"$gte": since}}},
            {
                "$group": {
                    "_id": "$gateway_id",
                    "sessions": {"$sum": 1},
                    "bytes": {"$sum": {"$add": ["$bytes_up", "$bytes_down"]}},
                    "duration_seconds": {"$sum": "$duration_seconds"},
                }
            },
            {"$sort": {"sessions": -1}},
        ]
    ).to_list(length=100)

    endings = await db.usage_records.aggregate(
        [
            {"$match": {"date": {"$gte": since}}},
            {"$group": {"_id": "$end_reason", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ]
    ).to_list(length=20)

    return {
        "days": [{"date": r["_id"], **{k: r[k] for k in r if k != "_id"}} for r in daily],
        "gateways": [{"gateway_id": r["_id"], **{k: r[k] for k in r if k != "_id"}} for r in by_gateway],
        "end_reasons": [{"reason": r["_id"] or "unknown", "count": r["count"]} for r in endings],
    }


# --- health ----------------------------------------------------------------
@router.get("/health/services")
async def service_health(admin: HealthReader):
    """Live checks, measured now. Nothing here is cached, because a cached
    health page is worse than none."""
    import time

    db = get_db()
    services = []

    started = time.perf_counter()
    try:
        await db.command("ping")
        services.append(_service("MongoDB", "operational", started))
    except Exception:  # noqa: BLE001
        services.append(_service("MongoDB", "down", started))

    started = time.perf_counter()
    redis = get_redis()
    if redis is None:
        services.append({"name": "Redis", "status": "degraded", "latency_ms": None,
                         "note": "Not configured. Rate limits fail open."})
    else:
        try:
            await redis.ping()
            services.append(_service("Redis", "operational", started))
        except Exception:  # noqa: BLE001
            services.append({"name": "Redis", "status": "down", "latency_ms": None,
                             "note": "Rate limiting is failing open."})

    gateways = await db.vpn_servers.find({}, {"gateway_id": 1, "status": 1, "health_reported_at": 1}).to_list(
        length=500
    )
    fresh = [g for g in gateways if servers.effective_status(g) == "online"]
    services.append(
        {
            "name": "Gateway agents",
            "status": "operational" if len(fresh) == len(gateways) and gateways else
            ("degraded" if fresh else "down"),
            "latency_ms": None,
            "note": f"{len(fresh)} of {len(gateways)} reporting health",
        }
    )
    services.append(
        {"name": "Control plane API", "status": "operational", "latency_ms": None,
         "note": f"{settings.environment}"}
    )
    return {"services": services, "checked_at": utcnow().isoformat()}


def _service(name: str, status: str, started: float) -> dict:
    import time

    return {"name": name, "status": status, "latency_ms": round((time.perf_counter() - started) * 1000, 1)}


# --- logs and audit --------------------------------------------------------
@router.get("/logs")
async def logs(
    admin: AuditReader,
    level: str | None = None,
    gateway_id: str | None = None,
    q: str | None = None,
    limit: int = Query(200, le=1000),
):
    """The operational event stream.

    This is the audit trail plus gateway health transitions -- the events this
    system actually records. It is not application stdout: those logs go to the
    platform's log sink, and pretending otherwise would give operators a viewer
    that silently misses most of what happened.
    """
    db = get_db()
    query: dict[str, Any] = {}
    if gateway_id:
        query["target"] = gateway_id
    if q:
        query["event"] = {"$regex": q, "$options": "i"}

    rows = await db.audit_events.find(query).sort("created_at", -1).limit(limit).to_list(length=limit)
    entries = [
        {
            "timestamp": serialise(r)["created_at"],
            "level": _level_for(r["event"]),
            "service": r["event"].split(".")[0],
            "event": r["event"],
            "actor": r.get("actor_id"),
            "target": r.get("target"),
            "metadata": r.get("metadata", {}),
        }
        for r in rows
    ]
    if level:
        entries = [e for e in entries if e["level"] == level.lower()]
    return {"entries": entries, "source": "audit_events"}


def _level_for(event: str) -> str:
    if event.startswith(("gateway.disable", "gateway.drain", "admin.user_suspend")):
        return "warning"
    if "replay" in event or "failed" in event:
        return "error"
    if event.startswith("terminal."):
        return "warning"
    return "info"


@router.get("/audit")
async def audit_log(
    admin: AuditReader,
    actor_id: str | None = None,
    limit: int = Query(100, le=500),
):
    query = {"actor_id": actor_id} if actor_id else {}
    rows = await get_db().audit_events.find(query).sort("created_at", -1).limit(limit).to_list(
        length=limit
    )
    return {"events": [serialise(e) for e in rows]}


# --- settings and roles ----------------------------------------------------
@router.get("/settings")
async def get_settings(admin: Annotated[dict, Depends(require(Permission.VIEW_DASHBOARD))]):
    return {
        "free_daily_seconds": await quota.daily_allowance(),
        "session_heartbeat_seconds": settings.session_heartbeat_seconds,
        "session_stale_after_seconds": settings.session_stale_after_seconds,
        "max_concurrent_sessions": settings.max_concurrent_sessions,
        "max_devices_per_free_user": settings.max_devices_per_free_user,
        "quota_reset_timezone": settings.quota_reset_timezone,
        "environment": settings.environment,
        # Everything below is deployment configuration, deliberately read-only
        # in the console: changing it needs a restart and a review.
        "editable": ["free_daily_seconds"],
    }


@router.put("/settings/quota")
async def set_quota_config(
    admin: Annotated[dict, Depends(require(Permission.EDIT_SETTINGS))],
    free_daily_seconds: int = Body(embed=True),
):
    value = await quota.set_daily_allowance(free_daily_seconds)
    await audit.record(
        "admin.quota_update", actor_id=str(admin["_id"]),
        metadata={"free_daily_seconds": value},
    )
    return {"free_daily_seconds": value}


@router.get("/roles")
async def list_roles(admin: Annotated[dict, Depends(require(Permission.MANAGE_ADMINS))]):
    return {
        "roles": [
            {"role": role.value, "permissions": sorted(p.value for p in perms)}
            for role, perms in ROLE_PERMISSIONS.items()
        ]
    }


@router.put("/users/{user_id}/role")
async def set_role(
    user_id: str,
    admin: Annotated[dict, Depends(require(Permission.MANAGE_ADMINS))],
    role: str | None = Body(embed=True),
    step_up_token: str | None = Body(default=None, embed=True),
):
    from app.auth import mfa
    from app.common.errors import ValidationFailed

    mfa.assert_step_up(admin, step_up_token)
    if role is not None and role not in {r.value for r in Role}:
        raise ValidationFailed("That is not a known role.", code="unknown_role")
    if str(admin["_id"]) == user_id:
        raise ValidationFailed(
            "You cannot change your own role. Ask another super admin.",
            code="self_role_change",
        )

    update = {"$set": {"role": role, "is_admin": role is not None}} if role else {
        "$unset": {"role": ""}, "$set": {"is_admin": False}
    }
    await get_db().users.update_one({"_id": oid(user_id)}, update)
    await audit.record(
        "admin.role_change", actor_id=str(admin["_id"]), target=user_id, metadata={"role": role}
    )
    return {"ok": True, "role": role}


# --- admin session management ----------------------------------------------
@router.get("/admin-sessions")
async def list_admin_sessions(admin: Dashboard):
    """List active sessions for the current admin across devices."""
    db = get_db()
    tokens = await db.refresh_tokens.find(
        {"user_id": oid(admin["_id"]), "used": False, "expires_at": {"$gt": utcnow()}}
    ).sort("created_at", -1).to_list(length=50)
    return {
        "sessions": [
            {
                "id": str(t["_id"]),
                "family": t.get("family"),
                "created_at": t.get("created_at"),
                "expires_at": t.get("expires_at"),
                "device_id": t.get("device_id"),
            }
            for t in tokens
        ]
    }


@router.delete("/admin-sessions/{session_id}", status_code=204)
async def revoke_admin_session(session_id: str, admin: Dashboard):
    """Revoke a specific admin session by ID."""
    db = get_db()
    res = await db.refresh_tokens.delete_one({"_id": oid(session_id), "user_id": oid(admin["_id"])})
    if res.deleted_count == 0:
        raise NotFound("Session not found.", code="session_not_found")
    await audit.record("admin.session_revoked", actor_id=str(admin["_id"]), target=session_id)


@router.delete("/admin-sessions", status_code=204)
async def revoke_all_admin_sessions(admin: Dashboard):
    """Revoke all active sessions for the current administrator."""
    db = get_db()
    await db.refresh_tokens.delete_many({"user_id": oid(admin["_id"])})
    await audit.record("admin.all_sessions_revoked", actor_id=str(admin["_id"]))

