from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request, status

from app.common.deps import CurrentUser, api_rate_limit, client_ip
from app.config.settings import settings
from app.rate_limit import limiter
from app.sessions import schemas, service

router = APIRouter(prefix="/vpn", tags=["vpn"])


@router.post("/session", status_code=status.HTTP_201_CREATED)
async def start_session(body: schemas.SessionStartRequest, user: CurrentUser, request: Request):
    await limiter.hit(
        "session-start", str(user["_id"]), settings.rate_limit_session_per_minute
    )
    return await service.start_session(user, body.model_dump())


@router.post("/session/{session_id}/heartbeat")
async def heartbeat(session_id: str, body: schemas.HeartbeatRequest, user: CurrentUser):
    return await service.heartbeat(user, session_id, body.model_dump())


@router.post("/session/{session_id}/disconnect")
async def disconnect(session_id: str, body: schemas.DisconnectRequest, user: CurrentUser):
    return await service.disconnect(user, session_id, body.model_dump())


@router.get("/status", dependencies=[Depends(api_rate_limit)])
async def vpn_status(user: CurrentUser):
    return await service.status_for(user)
