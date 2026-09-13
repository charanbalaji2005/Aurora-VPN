"""Server-side time helpers.

The server clock is the only clock the quota engine trusts. The device clock
is never used for any authorisation decision.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from app.config.settings import settings


def utcnow() -> datetime:
    return datetime.now(UTC)


def quota_tz() -> ZoneInfo:
    return ZoneInfo(settings.quota_reset_timezone)


def quota_day(at: datetime | None = None) -> str:
    """The quota bucket key, e.g. '2026-09-12', in the configured reset zone."""
    at = at or utcnow()
    return at.astimezone(quota_tz()).strftime("%Y-%m-%d")


def next_quota_reset(at: datetime | None = None) -> datetime:
    at = at or utcnow()
    local = at.astimezone(quota_tz())
    tomorrow = (local + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return tomorrow.astimezone(UTC)


def ensure_utc(value: datetime) -> datetime:
    """Datetimes read back from MongoDB are naive UTC unless the client is
    tz_aware. Normalise at the edge so comparisons never raise."""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def seconds_between(start: datetime, end: datetime) -> int:
    if start.tzinfo is None:
        start = start.replace(tzinfo=UTC)
    if end.tzinfo is None:
        end = end.replace(tzinfo=UTC)
    return max(0, int((end - start).total_seconds()))
