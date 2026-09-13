from __future__ import annotations

from datetime import timedelta

from app.common.timeutil import utcnow
from app.servers.service import effective_status, score


def _server(**kw):
    base = {
        "gateway_id": "jp-tok-01",
        "status": "online",
        "load_percent": 10,
        "capacity": 200,
        "active_peers": 20,
        "median_latency_ms": 30,
        "health_reported_at": utcnow(),
    }
    base.update(kw)
    return base


def test_idle_server_outscores_loaded_server():
    idle = _server(load_percent=5, active_peers=5)
    loaded = _server(gateway_id="jp-tok-02", load_percent=95, active_peers=190)
    assert score(idle) > score(loaded)


def test_latency_hint_is_used_when_provided():
    s = _server()
    assert score(s, latency_hint_ms=20) > score(s, latency_hint_ms=300)


def test_stale_health_marks_server_offline():
    stale = _server(health_reported_at=utcnow() - timedelta(minutes=10))
    assert effective_status(stale) == "offline"
    assert effective_status(_server()) == "online"


def test_declared_maintenance_wins_over_fresh_health():
    assert effective_status(_server(status="maintenance")) == "maintenance"
