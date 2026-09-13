"""Server registry and selection.

Selection is a weighted score, not just distance: a nearby gateway that is
95% loaded is a worse experience than a slightly further one that is idle.
Latency is measured by the client and sent back as a hint; the control plane
scores load, capacity, health and region.
"""

from __future__ import annotations

from typing import Any

from app.common.db import get_db
from app.common.errors import NoGatewayAvailable, NotFound
from app.common.models import serialise
from app.common.timeutil import seconds_between, utcnow
from app.config.settings import settings

SELECTABLE = {"online", "degraded"}

# Weights sum to 1.0. Tuned so a healthy-but-distant server beats an
# overloaded local one, while a *degraded* server is only ever a last resort.
W_LOAD = 0.45
W_CAPACITY = 0.2
W_LATENCY = 0.25
W_HEALTH = 0.1


def _is_fresh(server: dict[str, Any]) -> bool:
    reported = server.get("health_reported_at")
    if reported is None:
        return False
    return seconds_between(reported, utcnow()) <= settings.gateway_health_stale_seconds


def effective_status(server: dict[str, Any]) -> str:
    declared = server.get("status", "offline")
    if declared in {"maintenance", "draining", "offline"}:
        return declared
    return declared if _is_fresh(server) else "offline"


def score(server: dict[str, Any], latency_hint_ms: float | None = None) -> float:
    """Higher is better. Range roughly 0..1."""
    load = min(max(server.get("load_percent", 0), 0), 100) / 100
    capacity = server.get("capacity", 1) or 1
    peers = server.get("active_peers", 0)
    headroom = max(0.0, 1 - (peers / capacity))
    latency = latency_hint_ms if latency_hint_ms is not None else server.get("median_latency_ms", 120)
    latency_score = max(0.0, 1 - (min(latency, 400) / 400))
    health = 1.0 if effective_status(server) == "online" else 0.35
    return W_LOAD * (1 - load) + W_CAPACITY * headroom + W_LATENCY * latency_score + W_HEALTH * health


async def list_servers(
    *, include_unavailable: bool = True, latency_hints: dict[str, float] | None = None
) -> list[dict[str, Any]]:
    hints = latency_hints or {}
    docs = await get_db().vpn_servers.find({}).to_list(length=500)
    out = []
    for doc in docs:
        status = effective_status(doc)
        if not include_unavailable and status not in SELECTABLE:
            continue
        out.append(
            {
                "id": str(doc["_id"]),
                "gateway_id": doc["gateway_id"],
                "country": doc["country"],
                "country_code": doc["country_code"],
                "city": doc["city"],
                "name": doc["name"],
                "status": status,
                "load_percent": int(doc.get("load_percent", 0)),
                "capacity": int(doc.get("capacity", 0)),
                "active_peers": int(doc.get("active_peers", 0)),
                "premium_only": bool(doc.get("premium_only", False)),
                "score": round(score(doc, hints.get(doc["gateway_id"])), 4),
            }
        )
    out.sort(key=lambda s: (-s["score"], s["country"], s["city"]))
    return out


async def pick_server(
    *,
    gateway_id: str | None = None,
    country_code: str | None = None,
    latency_hints: dict[str, float] | None = None,
    exclude: set[str] | None = None,
) -> dict[str, Any]:
    """Resolve a user's choice to a concrete, healthy gateway document."""
    db = get_db()
    exclude = exclude or set()

    if gateway_id:
        server = await db.vpn_servers.find_one({"gateway_id": gateway_id})
        if server is None:
            raise NotFound("That VPN server no longer exists.", code="server_not_found")
        if effective_status(server) in SELECTABLE and gateway_id not in exclude:
            return server
        # Fall through to a sibling in the same country rather than failing.
        country_code = server["country_code"]

    query: dict[str, Any] = {}
    if country_code:
        query["country_code"] = country_code.upper()
    candidates = [
        s
        for s in await db.vpn_servers.find(query).to_list(length=500)
        if effective_status(s) in SELECTABLE and s["gateway_id"] not in exclude
    ]
    if not candidates:
        raise NoGatewayAvailable(
            "No server in that location is available right now. Pick another location."
            if country_code
            else "No VPN servers are available right now."
        )
    hints = latency_hints or {}
    candidates.sort(key=lambda s: -score(s, hints.get(s["gateway_id"])))
    return candidates[0]


async def get_server(gateway_id: str) -> dict[str, Any]:
    server = await get_db().vpn_servers.find_one({"gateway_id": gateway_id})
    if server is None:
        raise NotFound("That VPN server no longer exists.", code="server_not_found")
    return server


def public_view(server: dict[str, Any]) -> dict[str, Any]:
    doc = serialise(server) or {}
    return {
        "id": doc["id"],
        "gateway_id": doc["gateway_id"],
        "country": doc["country"],
        "country_code": doc["country_code"],
        "city": doc["city"],
        "name": doc["name"],
        "status": effective_status(server),
        "load_percent": int(doc.get("load_percent", 0)),
        "capacity": int(doc.get("capacity", 0)),
        "active_peers": int(doc.get("active_peers", 0)),
        "premium_only": bool(doc.get("premium_only", False)),
    }
