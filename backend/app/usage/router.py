from __future__ import annotations

from fastapi import APIRouter, Query

from app.common.db import get_db
from app.common.deps import CurrentUser
from app.common.models import oid
from app.quota import service as quota

router = APIRouter(prefix="/usage", tags=["usage"])


@router.get("")
async def usage(user: CurrentUser, days: int = Query(default=7, ge=1, le=31)):
    """Per-day totals, built from completed sessions only.

    This contains durations and byte counts. It does not and cannot contain
    anything about what was accessed through the tunnel.
    """
    pipeline = [
        {"$match": {"user_id": oid(user["_id"])}},
        {
            "$group": {
                "_id": "$date",
                "duration_seconds": {"$sum": "$duration_seconds"},
                "bytes_up": {"$sum": "$bytes_up"},
                "bytes_down": {"$sum": "$bytes_down"},
                "sessions": {"$sum": 1},
            }
        },
        {"$sort": {"_id": -1}},
        {"$limit": days},
    ]
    rows = await get_db().usage_records.aggregate(pipeline).to_list(length=days)
    return {
        "quota": await quota.snapshot(user),
        "days": [
            {
                "date": r["_id"],
                "duration_seconds": r["duration_seconds"],
                "bytes_up": r["bytes_up"],
                "bytes_down": r["bytes_down"],
                "sessions": r["sessions"],
            }
            for r in rows
        ],
    }
