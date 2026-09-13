"""Database migration runner for Aurora VPN control plane.

Tracks schema and index versions in MongoDB collection `_schema_migrations`.
Ensures safe, idempotent forward migrations.
"""

from __future__ import annotations

import asyncio
import logging
from motor.motor_asyncio import AsyncIOMotorClient

from app.common.db import ensure_indexes
from app.common.timeutil import utcnow
from app.config.settings import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("aurora.migrate")

MIGRATIONS: list[dict] = [
    {
        "version": 1,
        "name": "ensure_base_indexes_and_collections",
        "up": lambda db: ensure_indexes(),
    },
    {
        "version": 2,
        "name": "add_ipv6_and_tamper_evident_audit_fields",
        "up": lambda db: db.audit_events.create_index([("event_hash", 1)], name="idx_audit_hash"),
    },
]


async def run_migrations() -> None:
    client = AsyncIOMotorClient(settings.mongo_uri)
    db = client[settings.mongo_db]

    migrations_col = db["_schema_migrations"]
    await migrations_col.create_index([("version", 1)], unique=True)

    applied_docs = await migrations_col.find({}).to_list(length=100)
    applied_versions = {doc["version"] for doc in applied_docs}

    for migration in MIGRATIONS:
        v = migration["version"]
        name = migration["name"]
        if v in applied_versions:
            log.info("Migration %d (%s) already applied", v, name)
            continue

        log.info("Applying migration %d: %s...", v, name)
        up_fn = migration["up"]
        if asyncio.iscoroutinefunction(up_fn) or callable(up_fn):
            res = up_fn(db)
            if asyncio.iscoroutine(res):
                await res

        await migrations_col.insert_one(
            {
                "version": v,
                "name": name,
                "applied_at": utcnow(),
            }
        )
        log.info("Migration %d applied successfully", v)

    client.close()
    log.info("All migrations completed")


if __name__ == "__main__":
    asyncio.run(run_migrations())
