"""Destructive gateway work. The guarantee: it takes a typed confirmation and a
written reason, it removes peers before it closes records, and it always leaves
an audit trail."""

from __future__ import annotations

import pytest
from bson import ObjectId

from app.common.errors import Conflict, NotFound
from app.common.timeutil import utcnow
from app.gateways import actions


class StubAgent:
    operations: list[str] = []

    def __init__(self, server):
        self.server = server

    async def operation(self, verb):
        StubAgent.operations.append(verb)
        return {"exit_code": 0, "output": "ok"}

    async def remove_peer(self, public_key):
        StubAgent.operations.append(f"remove_peer:{public_key[:4]}")
        return {"ok": True}


@pytest.fixture()
async def world(db, monkeypatch):
    StubAgent.operations = []
    monkeypatch.setattr("app.gateways.actions.GatewayClient", StubAgent)
    monkeypatch.setattr("app.wireguard.provisioning.GatewayClient", StubAgent)

    admin = {"_id": ObjectId(), "email": "ops@example.com", "role": "INFRASTRUCTURE_ADMIN"}
    user_id = ObjectId()
    await db.users.insert_one({"_id": user_id, "email": "u@example.com", "plan": "free"})
    await db.vpn_servers.insert_one(
        {
            "gateway_id": "sg-sin-01",
            "city": "Singapore",
            "country": "Singapore",
            "status": "online",
            "agent_url": "http://gateway.internal:8443",
            "agent_secret": "secret",
        }
    )
    await db.wireguard_peers.insert_one(
        {
            "device_id": "dev-1",
            "user_id": user_id,
            "gateway_id": "sg-sin-01",
            "public_key": "A" * 43 + "=",
            "address": "10.20.2.5",
            "active": True,
        }
    )
    await db.vpn_sessions.insert_one(
        {
            "user_id": user_id,
            "device_id": "dev-1",
            "gateway_id": "sg-sin-01",
            "status": "ACTIVE",
            "started_at": utcnow(),
            "last_heartbeat": utcnow(),
            "duration_seconds": 60,
        }
    )
    return admin


async def test_an_unknown_operation_is_not_invented(db, world):
    with pytest.raises(NotFound):
        await actions.execute("rm-rf", "sg-sin-01", world, "because", "RM-RF SG-SIN-01")


async def test_a_mistyped_confirmation_stops_everything(db, world):
    with pytest.raises(Conflict) as raised:
        await actions.execute("drain", "sg-sin-01", world, "Maintenance window", "DRAIN sg-sin-02")
    assert raised.value.code == "confirmation_mismatch"
    assert raised.value.extra["expected"] == "DRAIN SG-SIN-01"
    # Nothing happened: the gateway is still online and still serving.
    assert (await db.vpn_servers.find_one({}))["status"] == "online"
    assert StubAgent.operations == []


async def test_an_empty_reason_stops_everything(db, world):
    with pytest.raises(Conflict) as raised:
        await actions.execute("drain", "sg-sin-01", world, "x", "DRAIN SG-SIN-01")
    assert raised.value.code == "reason_required"


async def test_draining_ends_sessions_removes_peers_and_audits(db, world):
    result = await actions.execute(
        "drain", "sg-sin-01", world, "Scheduled maintenance", "drain sg-sin-01"
    )

    assert result["sessions_ended"] == 1
    assert (await db.vpn_servers.find_one({}))["status"] == "draining"
    # The peer is gone from the gateway, so traffic stops at the data plane.
    assert any(op.startswith("remove_peer") for op in StubAgent.operations)
    assert (await db.wireguard_peers.find_one({}))["active"] is False
    assert (await db.vpn_sessions.find_one({}))["status"] == "REVOKED"

    event = await db.audit_events.find_one({"event": "gateway.drain"})
    assert event["target"] == "sg-sin-01"
    assert event["metadata"]["reason"] == "Scheduled maintenance"


async def test_restarting_wireguard_asks_the_agent_by_verb_not_by_command(db, world):
    await actions.execute(
        "restart-wireguard", "sg-sin-01", world, "Handshakes stalled", "RESTART SG-SIN-01"
    )
    assert "restart-wireguard" in StubAgent.operations


async def test_enable_puts_a_gateway_back_without_touching_sessions(db, world):
    await db.vpn_servers.update_one({}, {"$set": {"status": "offline"}})
    result = await actions.execute("enable", "sg-sin-01", world, "Maintenance done", "ENABLE SG-SIN-01")
    assert (await db.vpn_servers.find_one({}))["status"] == "online"
    assert "sessions_ended" not in result


async def test_an_unreachable_agent_does_not_hide_the_drain(db, world, monkeypatch):
    """The control-plane half must still take effect, or a gateway would keep
    receiving users because its agent was down."""

    async def refuses(self, verb):
        raise ConnectionError("refused")

    monkeypatch.setattr(StubAgent, "operation", refuses)
    result = await actions.execute(
        "restart-agent", "sg-sin-01", world, "Agent wedged", "RESTART SG-SIN-01"
    )
    assert result["agent_error"] == "ConnectionError"
    assert (await db.audit_events.find_one({"event": "gateway.restart-agent"})) is not None
