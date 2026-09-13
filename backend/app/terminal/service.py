"""Terminal sessions.

A terminal session is a short-lived, single-gateway, single-admin grant. It is
not a shell and it does not persist: the token lives fifteen minutes, the
session dies after five minutes of silence, and every command is recorded
before its output is returned.

Output is redacted on the way back. `wg show` legitimately prints public keys
and would print a preshared key if one were ever echoed, so the same filter the
logger uses is applied to anything the gateway sends.
"""

from __future__ import annotations

import logging
import re
import secrets
from datetime import timedelta
from typing import Any

from app.common import audit
from app.common.db import get_db
from app.common.errors import Forbidden, NotFound
from app.common.logging import redact
from app.common.models import oid, serialise
from app.common.timeutil import ensure_utc, seconds_between, utcnow
from app.gateways.client import GatewayClient
from app.terminal import commands

log = logging.getLogger(__name__)

SESSION_TTL_SECONDS = 900
IDLE_TIMEOUT_SECONDS = 300
COMMAND_TIMEOUT_SECONDS = 20
MAX_OUTPUT_BYTES = 64 * 1024

_SECRET_LINE = re.compile(
    r"(?i)^(\s*(private\s*key|preshared\s*key|psk|token|secret|password)\s*[:=]).*$",
    re.MULTILINE,
)


def sanitise(output: str) -> str:
    """Redact anything key-shaped, then truncate. Both matter: a 50MB
    `nft list ruleset` would otherwise sit in a browser tab."""
    cleaned = _SECRET_LINE.sub(r"\1 [redacted]", output)
    cleaned = redact(cleaned)
    encoded = cleaned.encode()
    if len(encoded) > MAX_OUTPUT_BYTES:
        cleaned = encoded[:MAX_OUTPUT_BYTES].decode(errors="ignore")
        cleaned += f"\n… output truncated at {MAX_OUTPUT_BYTES // 1024} KB"
    return cleaned


async def open_session(admin: dict[str, Any], gateway_id: str) -> dict[str, Any]:
    db = get_db()
    server = await db.vpn_servers.find_one({"gateway_id": gateway_id})
    if server is None:
        raise NotFound("That gateway is not registered.", code="gateway_not_found")

    token = secrets.token_urlsafe(32)
    now = utcnow()
    doc = {
        "admin_id": oid(admin["_id"]),
        "admin_email": admin["email"],
        "gateway_id": gateway_id,
        "token_hash": _hash(token),
        "opened_at": now,
        "last_activity_at": now,
        "expires_at": now + timedelta(seconds=SESSION_TTL_SECONDS),
        "closed_at": None,
        "command_count": 0,
    }
    result = await db.terminal_sessions.insert_one(doc)
    session_id = str(result.inserted_id)

    await audit.record(
        "terminal.open",
        actor_id=str(admin["_id"]),
        target=gateway_id,
        metadata={"terminal_session_id": session_id},
    )
    log.info(
        "terminal opened",
        extra={"event": "terminal.open", "gateway_id": gateway_id, "user_id": str(admin["_id"])},
    )
    return {
        "terminal_session_id": session_id,
        "token": token,
        "gateway_id": gateway_id,
        "gateway_name": f"{server['city']}, {server['country']}",
        "expires_in": SESSION_TTL_SECONDS,
        "idle_timeout": IDLE_TIMEOUT_SECONDS,
        "commands": commands.catalogue(),
    }


def _hash(token: str) -> str:
    from app.common.security import hash_refresh_token

    return hash_refresh_token(token)


async def authenticate(session_id: str, token: str) -> dict[str, Any]:
    """Resolve a WebSocket connection to a live session, or refuse it."""
    session = await get_db().terminal_sessions.find_one({"_id": oid(session_id)})
    if session is None or session.get("closed_at"):
        raise Forbidden("That terminal session has closed.", code="terminal_closed")
    if not secrets.compare_digest(session["token_hash"], _hash(token)):
        raise Forbidden("That terminal token is not valid.", code="terminal_unauthorized")
    if utcnow() > ensure_utc(session["expires_at"]):
        await close_session(session_id, "expired")
        raise Forbidden("That terminal session expired.", code="terminal_expired")
    if seconds_between(session["last_activity_at"], utcnow()) > IDLE_TIMEOUT_SECONDS:
        await close_session(session_id, "idle_timeout")
        raise Forbidden("That terminal session timed out.", code="terminal_idle")
    return session


async def run(session: dict[str, Any], raw_command: str) -> dict[str, Any]:
    """Resolve, execute on the gateway agent, record, return."""
    db = get_db()
    started = utcnow()

    try:
        safe = commands.resolve(raw_command)
    except commands.CommandNotAllowed as refusal:
        await _record_command(session, raw_command, None, str(refusal), 126, 0, "refused")
        return {"ok": False, "output": str(refusal), "exit_code": 126, "refused": True}

    server = await db.vpn_servers.find_one({"gateway_id": session["gateway_id"]})
    if server is None:
        return {"ok": False, "output": "That gateway is no longer registered.", "exit_code": 127}

    try:
        result = await GatewayClient(server).exec_command(safe.key, COMMAND_TIMEOUT_SECONDS)
    except Exception as exc:  # noqa: BLE001 - the agent being down is normal
        message = "The gateway agent did not respond. It may be restarting."
        await _record_command(session, raw_command, safe.key, message, 1, 0, "unreachable")
        log.warning(
            "terminal command failed",
            extra={"event": "terminal.unreachable", "gateway_id": session["gateway_id"]},
        )
        return {"ok": False, "output": message, "exit_code": 1, "error": type(exc).__name__}

    output = sanitise(result.get("output", ""))
    exit_code = int(result.get("exit_code", 0))
    duration_ms = int(seconds_between(started, utcnow()) * 1000) or int(
        result.get("duration_ms", 0)
    )

    await _record_command(session, raw_command, safe.key, None, exit_code, duration_ms, "ran")
    await db.terminal_sessions.update_one(
        {"_id": session["_id"]},
        {"$set": {"last_activity_at": utcnow()}, "$inc": {"command_count": 1}},
    )
    return {"ok": exit_code == 0, "output": output, "exit_code": exit_code, "duration_ms": duration_ms}


async def _record_command(
    session: dict[str, Any],
    raw: str,
    resolved: str | None,
    note: str | None,
    exit_code: int,
    duration_ms: int,
    outcome: str,
) -> None:
    """The command and its outcome are stored. The *output* is not: it would
    turn the audit log into a copy of everything the gateway knows."""
    await get_db().terminal_commands.insert_one(
        {
            "terminal_session_id": session["_id"],
            "admin_id": session["admin_id"],
            "gateway_id": session["gateway_id"],
            "command_raw": raw[:200],
            "command_resolved": resolved,
            "outcome": outcome,
            "note": note,
            "exit_code": exit_code,
            "duration_ms": duration_ms,
            "created_at": utcnow(),
        }
    )


async def close_session(session_id: str, reason: str) -> None:
    await get_db().terminal_sessions.update_one(
        {"_id": oid(session_id), "closed_at": None},
        {"$set": {"closed_at": utcnow(), "close_reason": reason}},
    )


async def history(gateway_id: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
    query = {"gateway_id": gateway_id} if gateway_id else {}
    cursor = get_db().terminal_commands.find(query).sort("created_at", -1).limit(limit)
    return [serialise(row) for row in await cursor.to_list(length=limit)]
