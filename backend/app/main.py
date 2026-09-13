"""Aurora VPN control plane.

This process authorises sessions, provisions WireGuard peers and keeps the
quota. It never carries user traffic: packets go straight from the phone to a
gateway over WireGuard. See docs/architecture.md.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.admin.router import router as admin_router
from app.auth.router import router as auth_router
from app.common.cache import close_redis, connect_to_redis
from app.common.db import close_mongo, connect_to_mongo, ensure_indexes
from app.common.errors import AppError, app_error_handler, unhandled_error_handler
from app.common.logging import configure_logging
from app.common.metrics import http_latency, http_requests
from app.common.tasks import session_reaper
from app.config.settings import settings
from app.devices.router import router as devices_router
from app.gateways.router import router as gateways_router
from app.health.router import router as health_router
from app.quota.router import router as quota_router
from app.servers.router import router as servers_router
from app.sessions.router import router as sessions_router
from app.terminal.router import router as terminal_router
from app.terminal.router import router as terminal_router
from app.usage.router import router as usage_router

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(settings.log_level)
    settings.assert_production_ready()
    if settings.sentry_dsn:
        import sentry_sdk

        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.environment,
            traces_sample_rate=0.05,
            send_default_pii=False,  # never ship user data to an error tracker
        )
    await connect_to_mongo()
    await ensure_indexes()
    await connect_to_redis()
    reaper = asyncio.create_task(session_reaper())
    log.info("control plane started", extra={"event": "app.start"})
    try:
        yield
    finally:
        reaper.cancel()
        try:
            await reaper
        except asyncio.CancelledError:
            pass
        await close_redis()
        await close_mongo()


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url=None,
    openapi_url="/openapi.json" if settings.environment != "production" else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.admin_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(Exception, unhandled_error_handler)


@app.middleware("http")
async def observability(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except AppError as exc:  # raised inside background-ish call stacks
        response = exc.to_response()
    except Exception:
        log.exception("unhandled error", extra={"request_id": request_id})
        response = JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "internal_error",
                    "message": "The VPN service is temporarily unavailable.",
                }
            },
        )
    elapsed = time.perf_counter() - started
    route = request.scope.get("route")
    path = getattr(route, "path", request.url.path)
    http_requests.labels(request.method, path, response.status_code).inc()
    http_latency.labels(request.method, path).observe(elapsed)
    response.headers["x-request-id"] = request_id
    # Hardening headers: the API is consumed by an app and an admin SPA only.
    response.headers["x-content-type-options"] = "nosniff"
    response.headers["referrer-policy"] = "no-referrer"
    response.headers["cache-control"] = "no-store"
    return response


for router in (
    auth_router,
    devices_router,
    servers_router,
    sessions_router,
    quota_router,
    usage_router,
    gateways_router,
    health_router,
    admin_router,
    terminal_router,
):
    app.include_router(router, prefix=settings.api_prefix)


@app.get("/")
async def root():
    return {"service": settings.app_name, "version": "1.0.0", "docs": "/docs"}
