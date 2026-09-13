"""Abuse controls for a free service.

The goal is to keep the service usable, not to profile people. Everything here
works from account and session behaviour that we already have to store. There
is no device fingerprinting, no advertising identifiers, no location tracking.
"""

from __future__ import annotations

from typing import Any

from app.common.db import get_db
from app.common.models import oid
from app.common.timeutil import quota_day, utcnow
from datetime import timedelta


async def signals_for_user(user_id: str) -> dict[str, Any]:
    db = get_db()
    since = utcnow() - timedelta(hours=24)
    sessions_24h = await db.vpn_sessions.count_documents(
        {"user_id": oid(user_id), "started_at": {"$gte": since}}
    )
    devices = await db.devices.count_documents({"user_id": oid(user_id), "revoked": False})
    quota_doc = await db.daily_quotas.find_one({"user_id": oid(user_id), "date": quota_day()})
    return {
        "sessions_24h": sessions_24h,
        "active_devices": devices,
        "used_seconds_today": int((quota_doc or {}).get("used_seconds", 0)),
        # Reconnect churn is the cheapest honest signal of scripted abuse.
        "reconnect_churn": sessions_24h > 120,
    }


async def suspend_user(user_id: str, reason: str) -> None:
    from app.sessions import service as sessions
    from app.wireguard import provisioning

    await get_db().users.update_one(
        {"_id": oid(user_id)},
        {"$set": {"status": "suspended", "suspended_reason": reason, "suspended_at": utcnow()}},
    )
    await sessions.terminate_user_sessions(user_id, reason="account_suspended")
    await provisioning.revoke_user_peers(user_id)


async def reinstate_user(user_id: str) -> None:
    await get_db().users.update_one(
        {"_id": oid(user_id)},
        {"$set": {"status": "active"}, "$unset": {"suspended_reason": "", "suspended_at": ""}},
    )
