"""End-to-end session accounting with a stubbed gateway agent.

These tests prove the two properties the product depends on:
1. time is charged from server timestamps, and
2. when the allowance runs out the peer is removed, not just the UI.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from bson import ObjectId

from app.common.timeutil import utcnow
from app.quota import service as quota
from app.sessions import service as sessions


class StubAgent:
    """Stands in for the WireGuard agent on a real gateway."""

    def __init__(self, server):
        self.server = server

    async def add_peer(self, public_key, allowed_ips, preshared_key=None):
        StubAgent.added.append(public_key)
        return {"ok": True}

    async def remove_peer(self, public_key):
        StubAgent.removed.append(public_key)
        return {"ok": True}


StubAgent.added = []
StubAgent.removed = []

PUBLIC_KEY = "A" * 43 + "="


@pytest.fixture()
def agent(monkeypatch):
    StubAgent.added, StubAgent.removed = [], []
    monkeypatch.setattr("app.wireguard.provisioning.GatewayClient", StubAgent)
    monkeypatch.setattr("app.gateways.client.GatewayClient", StubAgent, raising=False)
    return StubAgent


@pytest.fixture()
async def world(db, agent):
    user_id = ObjectId()
    await db.users.insert_one(
        {"_id": user_id, "email": "a@example.com", "plan": "free", "status": "active"}
    )
    device = await db.devices.insert_one(
        {
            "user_id": user_id,
            "name": "Pixel",
            "platform": "android",
            "public_key": PUBLIC_KEY,
            "revoked": False,
            "created_at": utcnow(),
        }
    )
    await db.vpn_servers.insert_one(
        {
            "gateway_id": "sg-sin-01",
            "name": "SG-SIN-01",
            "country": "Singapore",
            "country_code": "SG",
            "city": "Singapore",
            "status": "online",
            "load_percent": 12,
            "capacity": 200,
            "active_peers": 3,
            "vpn_subnet": "10.20.2.0/24",
            "endpoint_host": "sg1.example.net",
            "listen_port": 51820,
            "public_key": "B" * 43 + "=",
            "agent_url": "http://gateway.internal:8443",
            "agent_secret": "secret",
            "health_reported_at": utcnow(),
        }
    )
    return {
        "user": {"_id": user_id, "plan": "free", "status": "active"},
        "device_id": str(device.inserted_id),
    }


async def test_starting_a_session_installs_a_peer_and_returns_client_config(world, db):
    result = await sessions.start_session(
        world["user"], {"device_id": world["device_id"], "gateway_id": "sg-sin-01"}
    )
    assert StubAgent.added == [PUBLIC_KEY]
    assert result["status"] == "AUTHORIZED"
    # The client gets the gateway's public key and never a private one.
    config = result["config"]
    assert config["peer"]["public_key"] == "B" * 43 + "="
    assert "private_key" not in str(config)
    assert config["peer"]["endpoint"] == "sg1.example.net:51820"
    assert config["interface"]["addresses"][0].startswith("10.20.2.")


async def test_heartbeat_charges_elapsed_server_time(world, db):
    started = await sessions.start_session(
        world["user"], {"device_id": world["device_id"], "gateway_id": "sg-sin-01"}
    )
    # Rewind the stored heartbeat by 60s: the *server* decides the delta.
    await db.vpn_sessions.update_one(
        {"_id": ObjectId(started["session_id"])},
        {"$set": {"last_heartbeat": utcnow() - timedelta(seconds=60)}},
    )
    result = await sessions.heartbeat(
        world["user"], started["session_id"], {"bytes_up": 100, "bytes_down": 900}
    )
    assert result["quota"]["used_seconds"] == 60
    assert result["quota"]["remaining_seconds"] == 10_740


async def test_exhausted_quota_terminates_the_tunnel(world, db):
    started = await sessions.start_session(
        world["user"], {"device_id": world["device_id"], "gateway_id": "sg-sin-01"}
    )
    await quota.consume(world["user"], 10_799)
    await db.vpn_sessions.update_one(
        {"_id": ObjectId(started["session_id"])},
        {"$set": {"last_heartbeat": utcnow() - timedelta(seconds=60)}},
    )
    result = await sessions.heartbeat(world["user"], started["session_id"], {})
    assert result["status"] == "EXPIRED"
    assert result["reason"] == "quota_exhausted"
    # The peer is gone from the gateway, so traffic stops at the data plane.
    assert StubAgent.removed == [PUBLIC_KEY]
    peer = await db.wireguard_peers.find_one({"public_key": PUBLIC_KEY})
    assert peer["active"] is False


async def test_new_session_is_refused_once_the_allowance_is_spent(world):
    await quota.consume(world["user"], 10_800)
    from app.common.errors import QuotaExhausted

    with pytest.raises(QuotaExhausted):
        await sessions.start_session(
            world["user"], {"device_id": world["device_id"], "gateway_id": "sg-sin-01"}
        )


async def test_disconnect_then_reconnect_keeps_the_remaining_time(db, world):
    """Time already spent stays spent; a reconnect resumes from what is left.

    Note the 90 second gap: a charge is capped at `session_stale_after_seconds`
    so an app that was suspended by the OS can never be billed for the hours it
    spent unreachable. A client that stops checking in for longer than that is
    reaped instead (see the next test).
    """
    first = await sessions.start_session(
        world["user"], {"device_id": world["device_id"], "gateway_id": "sg-sin-01"}
    )
    await db.vpn_sessions.update_one(
        {"_id": ObjectId(first["session_id"])},
        {"$set": {"last_heartbeat": utcnow() - timedelta(seconds=90)}},
    )
    await sessions.disconnect(world["user"], first["session_id"], {"reason": "user_requested"})
    after_first = await quota.snapshot(world["user"])
    assert after_first["remaining_seconds"] == 10_800 - 90

    second = await sessions.start_session(
        world["user"], {"device_id": world["device_id"], "gateway_id": "sg-sin-01"}
    )
    assert second["quota"]["remaining_seconds"] == 10_710


async def test_stale_client_is_reaped_and_peer_removed(world, db):
    started = await sessions.start_session(
        world["user"], {"device_id": world["device_id"], "gateway_id": "sg-sin-01"}
    )
    await db.vpn_sessions.update_one(
        {"_id": ObjectId(started["session_id"])},
        {"$set": {"last_heartbeat": utcnow() - timedelta(minutes=30)}},
    )
    reaped = await sessions.reap_stale_sessions()
    assert reaped == 1
    assert StubAgent.removed == [PUBLIC_KEY]
    doc = await db.vpn_sessions.find_one({"_id": ObjectId(started["session_id"])})
    assert doc["status"] == "STALE"
