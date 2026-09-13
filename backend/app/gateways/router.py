"""Gateway agent API.

Gateways are servers, not users: they authenticate with their own credentials
and can only touch their own record. Registration uses a one-time bootstrap
secret supplied by the provisioning playbook and returns a per-gateway token.
"""

from __future__ import annotations

import logging
import secrets
from typing import Annotated

from fastapi import APIRouter, Header

from app.common import audit
from app.common.db import get_db
from app.common.deps import GatewayIdentity
from app.common.errors import Unauthorized
from app.common.metrics import (
    gateway_cpu,
    gateway_load,
    gateway_memory,
    gateway_packet_loss,
    gateway_peer_utilization,
    gateway_throughput_rx,
    gateway_throughput_tx,
    gateway_up,
)
from app.common.security import hash_refresh_token
from app.common.timeutil import utcnow
from app.config.settings import settings
from app.gateways import schemas

log = logging.getLogger(__name__)
router = APIRouter(prefix="/gateways", tags=["gateways"])


@router.post("/register")
async def register_gateway(
    body: schemas.GatewayRegisterRequest,
    x_bootstrap_secret: Annotated[str | None, Header()] = None,
):
    if not x_bootstrap_secret or not secrets.compare_digest(
        x_bootstrap_secret, settings.gateway_bootstrap_secret
    ):
        raise Unauthorized("Gateway bootstrap secret is not valid.", code="bootstrap_invalid")

    db = get_db()
    agent_token = secrets.token_urlsafe(32)
    agent_secret = secrets.token_urlsafe(32)
    existing = await db.vpn_servers.find_one({"gateway_id": body.gateway_id})

    doc = body.model_dump()
    doc.update(
        {
            "agent_token_hash": hash_refresh_token(agent_token),
            "agent_secret": existing["agent_secret"] if existing else agent_secret,
            "status": "online",
            "load_percent": 0,
            "active_peers": 0,
            "health_reported_at": utcnow(),
            "updated_at": utcnow(),
        }
    )
    await db.vpn_servers.update_one(
        {"gateway_id": body.gateway_id},
        {"$set": doc, "$setOnInsert": {"created_at": utcnow()}},
        upsert=True,
    )
    await audit.record("gateway.register", actor_type="gateway", target=body.gateway_id)
    log.info("gateway registered", extra={"event": "gateway.register", "gateway_id": body.gateway_id})
    return {
        "gateway_id": body.gateway_id,
        "agent_token": agent_token,
        "agent_secret": doc["agent_secret"],
        "health_interval_seconds": 30,
    }


@router.post("/health")
async def report_health(body: schemas.GatewayHealthRequest, gateway: GatewayIdentity):
    status = body.status if body.wireguard_up else "degraded"
    gw_id = gateway["gateway_id"]
    peer_util = body.peer_utilization_percent if body.peer_utilization_percent is not None else float(body.load_percent)

    update_fields: dict = {
        "status": gateway["status"]
        if gateway["status"] in {"maintenance", "draining"}
        else status,
        "load_percent": int(peer_util),
        "peer_utilization_percent": peer_util,
        "cpu_percent": body.cpu_percent,
        "memory_percent": body.memory_percent,
        "active_peers": int(body.active_peers),
        "median_latency_ms": body.median_latency_ms,
        "packet_loss_percent": body.packet_loss_percent,
        "health_reported_at": utcnow(),
    }
    if body.network_rx_bytes_sec is not None:
        update_fields["network_rx_bytes_sec"] = body.network_rx_bytes_sec
    if body.network_tx_bytes_sec is not None:
        update_fields["network_tx_bytes_sec"] = body.network_tx_bytes_sec

    await get_db().vpn_servers.update_one(
        {"gateway_id": gw_id},
        {"$set": update_fields},
    )
    await get_db().server_health.update_one(
        {"gateway_id": gw_id},
        {"$set": {**body.model_dump(), "gateway_id": gw_id, "at": utcnow()}},
        upsert=True,
    )
    gateway_up.labels(gw_id, gateway["country_code"]).set(
        1 if body.wireguard_up else 0
    )
    gateway_load.labels(gw_id).set(peer_util)
    gateway_peer_utilization.labels(gw_id).set(peer_util)
    gateway_cpu.labels(gw_id).set(body.cpu_percent)
    gateway_memory.labels(gw_id).set(body.memory_percent)
    if body.packet_loss_percent is not None:
        gateway_packet_loss.labels(gw_id).set(body.packet_loss_percent)
    if body.network_rx_bytes_sec is not None:
        gateway_throughput_rx.labels(gw_id).set(body.network_rx_bytes_sec)
    if body.network_tx_bytes_sec is not None:
        gateway_throughput_tx.labels(gw_id).set(body.network_tx_bytes_sec)

    return {"ok": True, "drain": gateway["status"] in {"draining", "maintenance"}}


@router.get("/peers")
async def list_expected_peers(gateway: GatewayIdentity):
    """Source of truth for reconciliation.

    The agent compares this list against the live WireGuard interface and
    removes anything not on it -- that is what makes revocation reliable even
    if a control-plane call failed earlier.
    """
    cursor = get_db().wireguard_peers.find(
        {"gateway_id": gateway["gateway_id"], "active": True},
        {"public_key": 1, "allowed_ips": 1, "preshared_key": 1, "_id": 0},
    )
    peers = await cursor.to_list(length=5000)
    return {"peers": peers, "generated_at": utcnow().isoformat()}


@router.post("/peers/stats")
async def ingest_peer_stats(stats: list[schemas.PeerStat], gateway: GatewayIdentity):
    """Byte counters from the data plane.

    Only totals per peer. No addresses, no ports, no destinations.
    """
    db = get_db()
    for stat in stats:
        await db.wireguard_peers.update_one(
            {"gateway_id": gateway["gateway_id"], "public_key": stat.public_key, "active": True},
            {
                "$set": {
                    "rx_bytes": stat.rx_bytes,
                    "tx_bytes": stat.tx_bytes,
                    "last_handshake_epoch": stat.last_handshake_epoch,
                    "stats_at": utcnow(),
                }
            },
        )
    return {"ok": True, "received": len(stats)}
