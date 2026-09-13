"""Privileged gateway operations.

These are the things the terminal deliberately cannot do. Each one is a named
operation with its own permission, a typed confirmation, a written reason and
an audit event -- so "restart WireGuard in Singapore" is a decision with a name
attached to it, not a line someone typed into a box.
"""

from __future__ import annotations

import logging
from typing import Any

from app.common import audit
from app.common.db import get_db
from app.common.errors import Conflict, NotFound
from app.common.rbac import Permission
from app.common.timeutil import utcnow
from app.gateways.client import GatewayClient

log = logging.getLogger(__name__)

# operation -> (permission, agent verb, what the admin must type)
OPERATIONS: dict[str, tuple[Permission, str | None, str]] = {
    "restart-wireguard": (Permission.GATEWAY_RESTART, "restart-wireguard", "RESTART {gateway}"),
    "restart-agent": (Permission.GATEWAY_RESTART, "restart-agent", "RESTART {gateway}"),
    "drain": (Permission.GATEWAY_DRAIN, None, "DRAIN {gateway}"),
    "disable": (Permission.GATEWAY_STATUS, None, "DISABLE {gateway}"),
    "enable": (Permission.GATEWAY_STATUS, None, "ENABLE {gateway}"),
    "rotate-key": (Permission.GATEWAY_ROTATE_KEY, "rotate-key", "ROTATE {gateway}"),
}


def confirmation_for(operation: str, gateway_id: str) -> str:
    _, _, template = OPERATIONS[operation]
    return template.format(gateway=gateway_id.upper())


async def execute(
    operation: str,
    gateway_id: str,
    admin: dict[str, Any],
    reason: str,
    confirmation: str,
) -> dict[str, Any]:
    if operation not in OPERATIONS:
        raise NotFound("That operation does not exist.", code="unknown_operation")

    expected = confirmation_for(operation, gateway_id)
    if confirmation.strip().upper() != expected:
        raise Conflict(
            f"Type exactly '{expected}' to confirm.", code="confirmation_mismatch", expected=expected
        )
    if len(reason.strip()) < 5:
        raise Conflict("Give a reason of at least five characters.", code="reason_required")

    db = get_db()
    server = await db.vpn_servers.find_one({"gateway_id": gateway_id})
    if server is None:
        raise NotFound("That gateway is not registered.", code="gateway_not_found")

    _, agent_verb, _ = OPERATIONS[operation]
    outcome: dict[str, Any] = {"operation": operation, "gateway_id": gateway_id}

    # Status first, so a restart cannot be handed new sessions mid-flight.
    if operation in {"drain", "disable"}:
        await db.vpn_servers.update_one(
            {"gateway_id": gateway_id},
            {"$set": {"status": "draining" if operation == "drain" else "offline"}},
        )
    elif operation == "enable":
        await db.vpn_servers.update_one({"gateway_id": gateway_id}, {"$set": {"status": "online"}})

    if operation in {"drain", "disable", "restart-wireguard", "rotate-key"}:
        outcome["sessions_ended"] = await _end_sessions_on(gateway_id, operation)

    if agent_verb:
        try:
            agent_res = await GatewayClient(server).operation(agent_verb)
            outcome["agent"] = agent_res
            if operation == "rotate-key" and agent_res.get("public_key"):
                new_pub = agent_res["public_key"]
                await db.vpn_servers.update_one(
                    {"gateway_id": gateway_id},
                    {"$set": {"public_key": new_pub, "key_rotated_at": utcnow()}},
                )
                await db.wireguard_peers.update_many(
                    {"gateway_id": gateway_id, "active": True},
                    {"$set": {"active": False, "revoked_at": utcnow(), "revoke_reason": "gateway_key_rotated"}},
                )
                outcome["new_public_key"] = new_pub
                log.info("updated gateway %s public key after rotation", gateway_id)
        except Exception as exc:  # noqa: BLE001
            outcome["agent_error"] = type(exc).__name__
            log.warning(
                "gateway operation could not reach the agent",
                extra={"event": "gateway.operation_failed", "gateway_id": gateway_id},
            )

    await db.vpn_servers.update_one(
        {"gateway_id": gateway_id},
        {"$set": {"last_operation": operation, "last_operation_at": utcnow()}},
    )
    await audit.record(
        f"gateway.{operation}",
        actor_id=str(admin["_id"]),
        target=gateway_id,
        metadata={"reason": reason[:200], **{k: v for k, v in outcome.items() if k != "agent"}},
    )
    return outcome


async def _end_sessions_on(gateway_id: str, reason: str) -> int:
    """Peers are removed before the session record closes, so nothing keeps
    tunnelling through a gateway that is being taken out of service."""
    from app.sessions import service as sessions

    db = get_db()
    ended = 0
    async for session in db.vpn_sessions.find(
        {"gateway_id": gateway_id, "status": {"$in": ["AUTHORIZED", "ACTIVE"]}}
    ):
        await sessions._end(session, reason=f"gateway_{reason}", status="REVOKED")  # noqa: SLF001
        ended += 1
    return ended
