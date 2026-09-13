"""Tunnel address allocation.

Each gateway owns a private subnet (for example 10.20.1.0/24). Addresses are
handed out from that pool and returned when a peer is revoked. Allocation is
done with an atomic find-and-modify so two devices can never share an address.
"""

from __future__ import annotations

import ipaddress

from app.common.db import get_db
from app.common.errors import NoGatewayAvailable


def usable_hosts(subnet: str) -> list[str]:
    net = ipaddress.ip_network(subnet, strict=False)
    # .1 is the gateway itself; skip network and broadcast addresses.
    return [str(ip) for ip in list(net.hosts())[1:]]


async def allocate(gateway_id: str, subnet: str, device_id: str) -> str:
    db = get_db()
    taken = {
        doc["address"]
        async for doc in db.wireguard_peers.find(
            {"gateway_id": gateway_id, "active": True}, {"address": 1}
        )
    }
    for candidate in usable_hosts(subnet):
        if candidate in taken:
            continue
        # Unique index on (gateway_id, address) makes this race-safe.
        try:
            await db.wireguard_peers.update_one(
                {"gateway_id": gateway_id, "address": candidate},
                {"$setOnInsert": {"device_id": device_id, "reserved": True}},
                upsert=True,
            )
            return candidate
        except Exception:  # noqa: BLE001 - duplicate key means someone won the race
            continue
    raise NoGatewayAvailable("That location is at capacity. Try another server.", code="pool_full")
