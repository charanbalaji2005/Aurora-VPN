"""Device registry: key rotation must not let two devices share one
WireGuard public key, the same way registration already prevents it."""

from __future__ import annotations

import pytest
from bson import ObjectId

from app.common.errors import Conflict
from app.common.timeutil import utcnow
from app.devices import service as devices

KEY_A = "A" * 43 + "="
KEY_B = "B" * 43 + "="


@pytest.fixture()
def agent(monkeypatch):
    calls = []

    class StubAgent:
        async def add_peer(self, *a, **k):
            return {"ok": True}

        async def remove_peer(self, *a, **k):
            return {"ok": True}

    monkeypatch.setattr("app.wireguard.provisioning.GatewayClient", StubAgent, raising=False)
    return calls


@pytest.fixture()
async def user(db):
    user_id = ObjectId()
    await db.users.insert_one(
        {"_id": user_id, "email": "a@example.com", "plan": "free", "status": "active"}
    )
    return {"_id": user_id, "plan": "free", "status": "active"}


async def _register(db, user, key, name="Pixel"):
    return await devices.register_device(
        user, {"name": name, "platform": "android", "public_key": key}
    )


async def test_register_device_rejects_a_key_already_owned_by_someone_else(db, user):
    other = ObjectId()
    await db.devices.insert_one(
        {
            "user_id": other,
            "name": "Someone else's phone",
            "platform": "android",
            "public_key": KEY_A,
            "revoked": False,
            "created_at": utcnow(),
        }
    )
    with pytest.raises(Conflict):
        await _register(db, user, KEY_A)


async def test_rotate_key_rejects_a_key_already_owned_by_another_device(db, user, agent):
    device = await _register(db, user, KEY_A)

    other_owner = ObjectId()
    await db.devices.insert_one(
        {
            "user_id": other_owner,
            "name": "Someone else's phone",
            "platform": "android",
            "public_key": KEY_B,
            "revoked": False,
            "created_at": utcnow(),
        }
    )

    with pytest.raises(Conflict):
        await devices.rotate_key(str(user["_id"]), str(device["_id"]), KEY_B)

    # Rejected rotation must not have touched the device's stored key.
    unchanged = await db.devices.find_one({"_id": device["_id"]})
    assert unchanged["public_key"] == KEY_A


async def test_rotate_key_to_a_fresh_key_succeeds(db, user, agent):
    device = await _register(db, user, KEY_A)

    updated = await devices.rotate_key(str(user["_id"]), str(device["_id"]), KEY_B)

    assert updated["public_key"] == KEY_B
