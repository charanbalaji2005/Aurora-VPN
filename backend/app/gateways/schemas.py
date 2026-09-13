from __future__ import annotations

from pydantic import Field, field_validator

from app.common.models import ApiModel
from app.common.security import is_valid_wireguard_key


class GatewayRegisterRequest(ApiModel):
    gateway_id: str = Field(min_length=3, max_length=64, pattern=r"^[a-z0-9\-]+$")
    name: str
    country: str
    country_code: str = Field(min_length=2, max_length=2)
    city: str
    endpoint_host: str
    listen_port: int = 51820
    public_key: str = Field(description="Gateway WireGuard PUBLIC key")
    vpn_subnet: str = "10.20.1.0/24"
    vpn_subnet_v6: str | None = None
    dns_servers: list[str] = Field(default_factory=lambda: ["10.20.1.1"])
    agent_url: str
    capacity: int = 250
    mtu: int = 1280

    @field_validator("public_key")
    @classmethod
    def _key(cls, v: str) -> str:
        if not is_valid_wireguard_key(v):
            raise ValueError("public_key must be a 32-byte base64 WireGuard key")
        return v

    @field_validator("country_code")
    @classmethod
    def _cc(cls, v: str) -> str:
        return v.upper()


class GatewayHealthRequest(ApiModel):
    status: str = "online"
    cpu_percent: float = 0
    memory_percent: float = 0
    disk_percent: float = 0
    load_percent: int = 0
    peer_utilization_percent: float | None = None
    active_peers: int = 0
    network_rx_bytes_sec: float | None = None
    network_tx_bytes_sec: float | None = None
    packet_loss_percent: float | None = None
    wireguard_up: bool = True
    median_latency_ms: float | None = None


class PeerStat(ApiModel):
    public_key: str
    rx_bytes: int = 0
    tx_bytes: int = 0
    last_handshake_epoch: int | None = None
