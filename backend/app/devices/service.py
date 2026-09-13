"""Device registry.

A device is the unit of VPN identity: one device, one WireGuard key pair.
The private key never leaves the phone's keystore, so the control plane only
ever sees the public half.
"""

from __future__ import annotations

from typing import Any

from app.common import audit
from app.common.db import get_db
from app.common.errors import Conflict, NotFound
from app.common.models import oid, serialise
from app.common.timeutil import utcnow
from app.config.settings import settings


async def register_device(user: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    db = get_db()
    user_id = oid(user["_id"])

    existing = await db.devices.find_one({"public_key": payload["public_key"]})
    if existing:
        if existing["user_id"] != user_id:
            raise Conflict("That device key is already registered.", code="device_key_taken")
        await db.devices.update_one(
            {"_id": existing["_id"]},
            {"$set": {"revoked": False, "last_seen_at": utcnow(), **_meta(payload)}},
        )
        return await db.devices.find_one({"_id": existing["_id"]})

    active = await db.devices.count_documents({"user_id": user_id, "revoked": False})
    if user.get("plan", "free") == "free" and active >= settings.max_devices_per_free_user:
        raise Conflict(
            f"Free accounts can use {settings.max_devices_per_free_user} devices. "
            "Remove a device to add this one.",
            code="device_limit_reached",
        )

    now = utcnow()
    doc = {
        "user_id": user_id,
        "name": payload["name"][:64],
        "platform": payload.get("platform", "android"),
        "public_key": payload["public_key"],
        "revoked": False,
        "created_at": now,
        "last_seen_at": now,
        **_meta(payload),
    }
    result = await db.devices.insert_one(doc)
    doc["_id"] = result.inserted_id
    await audit.record("device.register", actor_id=str(user_id), target=str(result.inserted_id))
    return doc


def _meta(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "os_version": payload.get("os_version"),
        "app_version": payload.get("app_version"),
        "updated_at": utcnow(),
    }


async def list_devices(user_id: str) -> list[dict[str, Any]]:
    cursor = get_db().devices.find({"user_id": oid(user_id)}).sort("created_at", -1)
    return [serialise(d) for d in await cursor.to_list(length=100)]


async def get_device(user_id: str, device_id: str) -> dict[str, Any]:
    device = await get_db().devices.find_one({"_id": oid(device_id), "user_id": oid(user_id)})
    if device is None or device.get("revoked"):
        raise NotFound("That device is no longer registered.", code="device_not_found")
    return device


async def rotate_key(user_id: str, device_id: str, public_key: str) -> dict[str, Any]:
    """Rotating the device key revokes every peer built from the old key."""
    from app.wireguard import provisioning

    db = get_db()
    device = await get_device(user_id, device_id)
    await provisioning.revoke_device_peers(str(device["_id"]))
    await db.devices.update_one(
        {"_id": device["_id"]},
        {"$set": {"public_key": public_key, "updated_at": utcnow()}},
    )
    await audit.record("device.key_rotate", actor_id=user_id, target=device_id)
    return await db.devices.find_one({"_id": device["_id"]})


async def revoke_device(user_id: str, device_id: str) -> None:
    """Revoking removes the peer from every gateway, so the tunnel dies
    within one WireGuard handshake interval."""
    from app.sessions import service as sessions
    from app.wireguard import provisioning

    db = get_db()
    device = await get_device(user_id, device_id)
    await sessions.terminate_device_sessions(str(device["_id"]), reason="device_revoked")
    await provisioning.revoke_device_peers(str(device["_id"]))
    await db.devices.update_one(
        {"_id": device["_id"]}, {"$set": {"revoked": True, "revoked_at": utcnow()}}
    )
    await audit.record("device.revoke", actor_id=user_id, target=device_id)


async def touch(device_id: str) -> None:
    await get_db().devices.update_one(
        {"_id": oid(device_id)}, {"$set": {"last_seen_at": utcnow()}}
    )
