from __future__ import annotations

from app.common.models import ApiModel


class ServerResponse(ApiModel):
    id: str
    gateway_id: str
    country: str
    country_code: str
    city: str
    name: str
    status: str
    load_percent: int
    capacity: int
    active_peers: int
    recommended: bool = False
    premium_only: bool = False


class ServerListResponse(ApiModel):
    servers: list[ServerResponse]
    recommended_gateway_id: str | None = None
