from __future__ import annotations

from fastapi import APIRouter

from app.common.deps import CurrentUser
from app.quota import service

router = APIRouter(prefix="/quota", tags=["quota"])


@router.get("")
async def get_quota(user: CurrentUser):
    """Authoritative quota state. The app displays this; it never computes it."""
    return await service.snapshot(user)
