from __future__ import annotations

from fastapi import APIRouter, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.common.cache import get_redis
from app.common.db import get_db
from app.common.timeutil import utcnow

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live")
async def live():
    return {"status": "ok", "time": utcnow().isoformat()}


@router.get("/ready")
async def ready(response: Response):
    checks = {"mongo": "down", "redis": "down"}
    try:
        await get_db().command("ping")
        checks["mongo"] = "up"
    except Exception:  # noqa: BLE001
        pass
    r = get_redis()
    if r is not None:
        try:
            await r.ping()
            checks["redis"] = "up"
        except Exception:  # noqa: BLE001
            pass
    # Redis is optional; Mongo is not.
    ok = checks["mongo"] == "up"
    response.status_code = 200 if ok else 503
    return {"status": "ready" if ok else "degraded", "checks": checks}


@router.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
