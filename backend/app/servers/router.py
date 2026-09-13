from __future__ import annotations

from fastapi import APIRouter, Body, Depends

from app.common.deps import CurrentUser, api_rate_limit
from app.servers import service

router = APIRouter(prefix="/servers", tags=["servers"], dependencies=[Depends(api_rate_limit)])


@router.get("")
async def list_servers(user: CurrentUser):
    servers = await service.list_servers()
    available = [s for s in servers if s["status"] in service.SELECTABLE]
    return {
        "servers": servers,
        "recommended_gateway_id": available[0]["gateway_id"] if available else None,
        "updated_at": None,
    }


@router.post("/recommend")
async def recommend(
    user: CurrentUser,
    latency_hints: dict[str, float] = Body(default_factory=dict, embed=True),
    country_code: str | None = Body(default=None, embed=True),
):
    """The client measures latency to each endpoint and posts it back; we
    combine that with live load to pick the fastest usable server."""
    server = await service.pick_server(country_code=country_code, latency_hints=latency_hints)
    return service.public_view(server)


@router.get("/{gateway_id}")
async def get_server(gateway_id: str, user: CurrentUser):
    return service.public_view(await service.get_server(gateway_id))
