"""Operational audit trail with tamper-evident cryptographic hash chaining.

Records *administrative and security* events only. It never records browsing
activity, DNS queries or anything about the contents of user traffic.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from app.common.db import get_db
from app.common.logging import redact
from app.common.timeutil import utcnow

GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000"


async def record(
    event: str,
    *,
    actor_id: str | None = None,
    actor_type: str = "user",
    target: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    db = get_db()
    now = utcnow()
    clean_meta = redact(metadata or {})

    # Fetch last audit record for cryptographic chaining
    last_event = await db.audit_events.find_one({}, sort=[("created_at", -1)])
    prev_hash = last_event.get("event_hash", GENESIS_HASH) if last_event else GENESIS_HASH

    # Compute tamper-evident hash
    meta_serialized = json.dumps(clean_meta, sort_keys=True, default=str)
    canonical = f"{prev_hash}|{now.isoformat()}|{event}|{actor_id}|{actor_type}|{target}|{meta_serialized}"
    event_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    doc = {
        "event": event,
        "actor_id": actor_id,
        "actor_type": actor_type,
        "target": target,
        "metadata": clean_meta,
        "prev_hash": prev_hash,
        "event_hash": event_hash,
        "created_at": now,
    }
    await db.audit_events.insert_one(doc)
    return doc


async def verify_chain(limit: int = 1000) -> tuple[bool, int, str | None]:
    """Verify integrity of the tamper-evident audit chain.

    Returns (is_valid, records_verified, error_detail).
    """
    db = get_db()
    cursor = db.audit_events.find({}).sort("created_at", 1).limit(limit)
    events = await cursor.to_list(length=limit)

    prev_hash = GENESIS_HASH
    for idx, e in enumerate(events):
        expected_prev = e.get("prev_hash")
        if expected_prev != prev_hash:
            return False, idx, f"Chain broken at record {e.get('_id')}: expected prev {prev_hash}, got {expected_prev}"

        meta_serialized = json.dumps(e.get("metadata", {}), sort_keys=True, default=str)
        created = e.get("created_at")
        created_str = created.isoformat() if hasattr(created, "isoformat") else str(created)
        canonical = f"{expected_prev}|{created_str}|{e.get('event')}|{e.get('actor_id')}|{e.get('actor_type')}|{e.get('target')}|{meta_serialized}"
        calculated_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()

        if calculated_hash != e.get("event_hash"):
            return False, idx, f"Hash mismatch at record {e.get('_id')}: tampered content detected"

        prev_hash = e.get("event_hash")

    return True, len(events), None
