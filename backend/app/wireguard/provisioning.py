"""WireGuard peer provisioning.

Flow (see docs/wireguard.md):

    device public key -> control plane validates -> gateway selected
    -> address allocated -> agent installs peer -> client receives the
    *client side* configuration only.

The gateway private key never leaves the gateway.
"""

from __future__ import annotations

import logging
from typing import Any

from app.common.db import get_db
from app.common.errors import GatewayUnreachable
from app.common.models import oid
from app.common.security import new_preshared_key
from app.common.timeutil import utcnow
from app.gateways.client import GatewayClient
from app.wireguard import addressing

log = logging.getLogger(__name__)


async def provision_peer(device: dict[str, Any], server: dict[str, Any]) -> dict[str, Any]:
    """Install (or refresh) the peer for this device on the chosen gateway."""
    db = get_db()
    device_id = str(device["_id"])
    gateway_id = server["gateway_id"]

    existing = await db.wireguard_peers.find_one(
        {"device_id": device_id, "gateway_id": gateway_id, "active": True}
    )
    address = existing["address"] if existing else await addressing.allocate(
        gateway_id, server["vpn_subnet"], device_id
    )
    preshared = existing.get("preshared_key") if existing else new_preshared_key()
    allowed = [f"{address}/32"]
    if server.get("vpn_subnet_v6"):
        allowed.append(_v6_for(server["vpn_subnet_v6"], address))

    client = GatewayClient(server)
    await client.add_peer(device["public_key"], allowed, preshared)

    doc = {
        "device_id": device_id,
        "user_id": device["user_id"],
        "gateway_id": gateway_id,
        "public_key": device["public_key"],
        "address": address,
        "allowed_ips": allowed,
        "preshared_key": preshared,
        "active": True,
        "reserved": False,
        "updated_at": utcnow(),
    }
    await db.wireguard_peers.update_one(
        {"gateway_id": gateway_id, "address": address},
        {"$set": doc, "$setOnInsert": {"created_at": utcnow()}},
        upsert=True,
    )
    log.info(
        "peer provisioned",
        extra={"event": "peer.provisioned", "device_id": device_id, "gateway_id": gateway_id},
    )
    return doc


def _v6_for(subnet_v6: str, v4_address: str) -> str:
    """Map the last octet of the v4 address into the gateway's v6 /64."""
    last = v4_address.split(".")[-1]
    base = subnet_v6.split("/")[0].rstrip(":")
    return f"{base}:{int(last):x}/128"


def client_config(server: dict[str, Any], peer: dict[str, Any]) -> dict[str, Any]:
    """Everything the phone needs, and nothing it must not have."""
    addresses = [f"{peer['address']}/32"]
    has_v6 = bool(server.get("vpn_subnet_v6"))
    if has_v6:
        addresses.append(_v6_for(server["vpn_subnet_v6"], peer["address"]))

    default_allowed = ["0.0.0.0/0", "::/0"] if has_v6 else ["0.0.0.0/0"]
    return {
        "interface": {
            "addresses": addresses,
            "dns": server.get("dns_servers", ["10.20.0.1"]),
            "mtu": server.get("mtu", 1280),
        },
        "peer": {
            "public_key": server["public_key"],  # gateway PUBLIC key only
            "preshared_key": peer.get("preshared_key"),
            "endpoint": f"{server['endpoint_host']}:{server['listen_port']}",
            "allowed_ips": server.get("client_allowed_ips", default_allowed),
            "persistent_keepalive": server.get("persistent_keepalive", 25),
        },
        "ipv6_carried": has_v6,
    }


async def revoke_peer(peer: dict[str, Any]) -> None:
    db = get_db()
    server = await db.vpn_servers.find_one({"gateway_id": peer["gateway_id"]})
    if server:
        try:
            await GatewayClient(server).remove_peer(peer["public_key"])
        except GatewayUnreachable:
            # Mark for the reconciler; the gateway will drop unknown peers on
            # its next sync so the tunnel cannot outlive the revocation.
            await db.wireguard_peers.update_one(
                {"_id": peer["_id"]}, {"$set": {"pending_removal": True}}
            )
    await db.wireguard_peers.update_one(
        {"_id": peer["_id"]},
        {"$set": {"active": False, "revoked_at": utcnow()}, "$unset": {"preshared_key": ""}},
    )


async def revoke_device_peers(device_id: str) -> None:
    db = get_db()
    async for peer in db.wireguard_peers.find({"device_id": device_id, "active": True}):
        await revoke_peer(peer)


async def revoke_user_peers(user_id: str) -> None:
    db = get_db()
    async for peer in db.wireguard_peers.find({"user_id": oid(user_id), "active": True}):
        await revoke_peer(peer)
