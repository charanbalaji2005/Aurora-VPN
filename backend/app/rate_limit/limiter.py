"""Redis-backed sliding-window rate limiting.

Fails open (with a warning) when Redis is unavailable so a cache outage never
takes the VPN offline, but every limit breach is counted and auditable.
"""

from __future__ import annotations

import logging

from app.common.cache import get_redis
from app.common.errors import RateLimited

log = logging.getLogger(__name__)


async def hit(bucket: str, identifier: str, limit: int, window_seconds: int = 60) -> int:
    """Count one request. Raises RateLimited when over the limit."""
    r = get_redis()
    if r is None:
        return 0
    key = f"rl:{bucket}:{identifier}"
    try:
        pipe = r.pipeline()
        pipe.incr(key)
        pipe.expire(key, window_seconds)
        count, _ = await pipe.execute()
    except Exception:  # noqa: BLE001 - cache outage must not break the API
        log.warning("rate limiter unavailable", extra={"event": "ratelimit.unavailable"})
        return 0
    if int(count) > limit:
        log.info("rate limited", extra={"event": "ratelimit.block", "bucket": bucket})
        raise RateLimited(
            f"Too many attempts. Try again in {window_seconds} seconds.",
            retry_after=window_seconds,
        )
    return int(count)


async def reset(bucket: str, identifier: str) -> None:
    r = get_redis()
    if r is None:
        return
    try:
        await r.delete(f"rl:{bucket}:{identifier}")
    except Exception:  # noqa: BLE001
        pass
