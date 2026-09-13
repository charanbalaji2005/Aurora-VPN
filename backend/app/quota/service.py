"""Free quota engine -- the server is the only authority.

Rules that make the 3 hours real:

* Time is charged from *server* timestamps on an authorised session, never
  from a countdown on the phone.
* The counter lives in ``daily_quotas`` keyed by (user, server-side date),
  so reinstalling the app, clearing storage or changing the device clock
  changes nothing.
* Increments are atomic ``$inc`` operations, so two devices reconnecting at
  once cannot both spend the same second twice.
"""

from __future__ import annotations

import logging
from typing import Any

from app.common.cache import get_redis
from app.common.db import get_db
from app.common.models import oid
from app.common.timeutil import next_quota_reset, quota_day, utcnow
from app.config.settings import settings

log = logging.getLogger(__name__)

_ALLOWANCE_CACHE_KEY = "settings:free_daily_seconds"


async def daily_allowance() -> int:
    """Allowance is admin-configurable at runtime (cached in Redis)."""
    r = get_redis()
    if r is not None:
        try:
            cached = await r.get(_ALLOWANCE_CACHE_KEY)
            if cached:
                return int(cached)
        except Exception:  # noqa: BLE001
            pass
    doc = await get_db().settings.find_one({"_id": "quota"})
    value = int((doc or {}).get("free_daily_seconds", settings.free_daily_seconds))
    if r is not None:
        try:
            await r.set(_ALLOWANCE_CACHE_KEY, value, ex=60)
        except Exception:  # noqa: BLE001
            pass
    return value


async def set_daily_allowance(seconds: int) -> int:
    seconds = max(60, min(seconds, 86_400))
    await get_db().settings.update_one(
        {"_id": "quota"},
        {"$set": {"free_daily_seconds": seconds, "updated_at": utcnow()}},
        upsert=True,
    )
    r = get_redis()
    if r is not None:
        try:
            await r.delete(_ALLOWANCE_CACHE_KEY)
        except Exception:  # noqa: BLE001
            pass
    return seconds


async def snapshot(user: dict[str, Any]) -> dict[str, Any]:
    """Current state of the user's daily allowance."""
    if user.get("plan") != "free":
        return {
            "plan": user.get("plan", "free"),
            "unlimited": True,
            "daily_seconds": 0,
            "used_seconds": 0,
            "remaining_seconds": 0,
            "resets_at": next_quota_reset().isoformat(),
            "server_time": utcnow().isoformat(),
        }
    allowance = await daily_allowance()
    doc = await get_db().daily_quotas.find_one(
        {"user_id": oid(user["_id"]), "date": quota_day()}
    )
    used = int((doc or {}).get("used_seconds", 0))
    return {
        "plan": "free",
        "unlimited": False,
        "daily_seconds": allowance,
        "used_seconds": min(used, allowance),
        "remaining_seconds": max(0, allowance - used),
        "resets_at": next_quota_reset().isoformat(),
        "server_time": utcnow().isoformat(),
    }


async def remaining_seconds(user: dict[str, Any]) -> int:
    state = await snapshot(user)
    if state["unlimited"]:
        return 10**9
    return int(state["remaining_seconds"])


async def consume(user: dict[str, Any], seconds: int) -> int:
    """Charge `seconds` against today's allowance atomically without overshooting."""
    if seconds <= 0:
        return await remaining_seconds(user)
    if user.get("plan") != "free":
        return 10**9

    allowance = await daily_allowance()
    db = get_db()
    day = quota_day()
    user_oid = oid(user["_id"])

    # Ensure the quota record exists
    await db.daily_quotas.update_one(
        {"user_id": user_oid, "date": day},
        {"$setOnInsert": {"used_seconds": 0, "created_at": utcnow()}},
        upsert=True,
    )

    # Atomically charge only if used_seconds + seconds <= allowance
    doc = await db.daily_quotas.find_one_and_update(
        {
            "user_id": user_oid,
            "date": day,
            "used_seconds": {"$lte": max(0, allowance - seconds)},
        },
        {
            "$inc": {"used_seconds": seconds},
            "$set": {"updated_at": utcnow()},
        },
        return_document=True,
    )
    if doc is not None:
        used = int(doc.get("used_seconds", seconds))
        return max(0, allowance - used)

    # If it would overshoot, atomically cap at allowance
    await db.daily_quotas.find_one_and_update(
        {"user_id": user_oid, "date": day},
        {"$set": {"used_seconds": allowance, "updated_at": utcnow()}},
    )
    return 0


async def is_exhausted(user: dict[str, Any]) -> bool:
    return await remaining_seconds(user) <= 0
