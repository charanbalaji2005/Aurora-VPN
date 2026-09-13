"""Background maintenance loops."""

from __future__ import annotations

import asyncio
import logging

from app.common.metrics import sessions_active
from app.config.settings import settings

log = logging.getLogger(__name__)


async def session_reaper() -> None:
    from app.common.db import get_db
    from app.sessions import service as sessions

    while True:
        try:
            reaped = await sessions.reap_stale_sessions()
            if reaped:
                log.info("reaped stale sessions", extra={"event": "session.reaped"})
            live = await get_db().vpn_sessions.count_documents(
                {"status": {"$in": ["AUTHORIZED", "ACTIVE"]}}
            )
            sessions_active.set(live)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - the loop must survive transient errors
            log.exception("session reaper failed", extra={"event": "session.reaper_error"})
        await asyncio.sleep(settings.session_reaper_interval_seconds)
