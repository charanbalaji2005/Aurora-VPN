"""Redis: rate limiting, distributed locks and short-lived state.

Redis is never the source of truth. If it goes down the control plane keeps
serving; limits fall back to permissive-with-logging rather than hard failure.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import redis.asyncio as aioredis

from app.config.settings import settings

log = logging.getLogger(__name__)

_redis: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis | None:
    return _redis


async def connect_to_redis(url: str | None = None) -> None:
    global _redis
    _redis = aioredis.from_url(url or settings.redis_url, decode_responses=True)
    try:
        await _redis.ping()
        log.info("redis connected", extra={"event": "redis.connected"})
    except Exception:
        log.warning("redis unavailable at startup", extra={"event": "redis.unavailable"})


async def close_redis() -> None:
    global _redis
    if _redis is not None:
        await _redis.aclose()
    _redis = None


@asynccontextmanager
async def lock(name: str, ttl: int = 10):
    """Best-effort distributed lock. Yields True when held."""
    r = get_redis()
    if r is None:
        yield True
        return
    key = f"lock:{name}"
    token = await r.set(key, "1", nx=True, ex=ttl)
    try:
        yield bool(token)
    finally:
        if token:
            try:
                await r.delete(key)
            except Exception:  # noqa: BLE001 - lock release is best effort
                pass
