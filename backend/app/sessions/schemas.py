from __future__ import annotations

from pydantic import Field

from app.common.models import ApiModel


class SessionStartRequest(ApiModel):
    device_id: str
    gateway_id: str | None = Field(default=None, description="Omit to let the server choose")
    country_code: str | None = None
    latency_hints: dict[str, float] = Field(default_factory=dict)


class HeartbeatRequest(ApiModel):
    bytes_up: int = 0
    bytes_down: int = 0
    latency_ms: float | None = None
    tunnel_established: bool = True


class DisconnectRequest(ApiModel):
    bytes_up: int = 0
    bytes_down: int = 0
    reason: str = "user_requested"
