"""Prometheus metrics for the control plane and gateways."""

from __future__ import annotations

from prometheus_client import Counter, Gauge, Histogram

http_requests = Counter(
    "aurora_http_requests_total", "HTTP requests", ["method", "path", "status"]
)
http_latency = Histogram(
    "aurora_http_request_seconds", "HTTP latency in seconds", ["method", "path"]
)
sessions_active = Gauge("aurora_sessions_active", "VPN sessions currently active")
sessions_started = Counter("aurora_sessions_started_total", "VPN sessions started", ["country"])
sessions_ended = Counter("aurora_sessions_ended_total", "VPN sessions ended", ["reason"])
quota_exhausted = Counter("aurora_quota_exhausted_total", "Sessions stopped by quota")
gateway_up = Gauge("aurora_gateway_up", "Gateway reachable (1/0)", ["gateway_id", "country"])
gateway_load = Gauge("aurora_gateway_load_percent", "Gateway load %", ["gateway_id"])
gateway_peer_utilization = Gauge("aurora_gateway_peer_utilization_percent", "Gateway peer capacity utilization %", ["gateway_id"])
gateway_cpu = Gauge("aurora_gateway_cpu_percent", "Gateway CPU utilization %", ["gateway_id"])
gateway_memory = Gauge("aurora_gateway_memory_percent", "Gateway RAM utilization %", ["gateway_id"])
gateway_packet_loss = Gauge("aurora_gateway_packet_loss_percent", "Gateway upstream packet loss %", ["gateway_id"])
gateway_throughput_rx = Gauge("aurora_gateway_rx_bytes_sec", "Gateway network throughput RX bytes/sec", ["gateway_id"])
gateway_throughput_tx = Gauge("aurora_gateway_tx_bytes_sec", "Gateway network throughput TX bytes/sec", ["gateway_id"])
peer_provision_failures = Counter(
    "aurora_peer_provision_failures_total", "Peer provisioning failures", ["gateway_id"]
)
