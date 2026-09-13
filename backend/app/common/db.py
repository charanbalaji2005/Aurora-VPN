"""MongoDB access layer.

MongoDB is the durable control-plane source of truth. It never sees packet
data -- only accounts, devices, peers, sessions and counters.
"""

from __future__ import annotations

import logging

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING, IndexModel
from pymongo.errors import OperationFailure

from app.config.settings import settings

log = logging.getLogger(__name__)

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


def get_db() -> AsyncIOMotorDatabase:
    if _db is None:
        raise RuntimeError("Database is not initialised. Call connect_to_mongo() first.")
    return _db


async def connect_to_mongo(uri: str | None = None, db_name: str | None = None) -> None:
    global _client, _db
    _client = AsyncIOMotorClient(
        uri or settings.mongo_uri,
        uuidRepresentation="standard",
        # Read datetimes back as timezone-aware UTC; the alternative is naive
        # values that blow up the first time they meet an aware one.
        tz_aware=True,
    )
    _db = _client[db_name or settings.mongo_db]
    await _db.command("ping")
    log.info("mongo connected", extra={"event": "mongo.connected"})


async def close_mongo() -> None:
    global _client, _db
    if _client is not None:
        _client.close()
    _client, _db = None, None


# Indexes are deliberate: each one backs a query that runs on the hot path.
INDEXES: dict[str, list[IndexModel]] = {
    "users": [
        IndexModel([("email", ASCENDING)], unique=True, name="uniq_email"),
        IndexModel([("status", ASCENDING)], name="by_status"),
    ],
    "devices": [
        IndexModel([("user_id", ASCENDING)], name="by_user"),
        IndexModel([("public_key", ASCENDING)], unique=True, name="uniq_public_key"),
        IndexModel([("user_id", ASCENDING), ("revoked", ASCENDING)], name="by_user_active"),
    ],
    "vpn_servers": [
        IndexModel([("country_code", ASCENDING), ("status", ASCENDING)], name="by_country_status"),
        IndexModel([("gateway_id", ASCENDING)], unique=True, name="uniq_gateway"),
    ],
    "wireguard_peers": [
        IndexModel([("device_id", ASCENDING), ("gateway_id", ASCENDING)], name="by_device_gateway"),
        IndexModel([("public_key", ASCENDING)], name="by_public_key"),
        IndexModel([("gateway_id", ASCENDING), ("active", ASCENDING)], name="by_gateway_active"),
        IndexModel(
            [("gateway_id", ASCENDING), ("address", ASCENDING)],
            unique=True,
            name="uniq_gateway_address",
        ),
    ],
    "vpn_sessions": [
        IndexModel([("user_id", ASCENDING), ("status", ASCENDING)], name="by_user_status"),
        IndexModel([("status", ASCENDING), ("last_heartbeat", ASCENDING)], name="reaper"),
        IndexModel([("device_id", ASCENDING), ("started_at", DESCENDING)], name="by_device_recent"),
    ],
    "daily_quotas": [
        IndexModel([("user_id", ASCENDING), ("date", ASCENDING)], unique=True, name="uniq_user_day"),
    ],
    "usage_records": [
        IndexModel([("user_id", ASCENDING), ("date", ASCENDING)], name="by_user_day"),
        IndexModel(
            [("created_at", ASCENDING)],
            expireAfterSeconds=settings.usage_record_ttl_days * 86400,
            name="ttl",
        ),
    ],
    "server_health": [
        IndexModel([("gateway_id", ASCENDING)], unique=True, name="uniq_gateway"),
    ],
    "refresh_tokens": [
        IndexModel([("token_hash", ASCENDING)], unique=True, name="uniq_token"),
        IndexModel([("user_id", ASCENDING)], name="by_user"),
        IndexModel([("expires_at", ASCENDING)], expireAfterSeconds=0, name="ttl"),
    ],
    "audit_events": [
        IndexModel([("created_at", DESCENDING)], name="recent"),
        IndexModel([("actor_id", ASCENDING)], name="by_actor"),
        IndexModel(
            [("created_at", ASCENDING)],
            expireAfterSeconds=settings.audit_log_ttl_days * 86400,
            name="ttl",
        ),
    ],
    "terminal_sessions": [
        IndexModel([("token_hash", ASCENDING)], unique=True, name="uniq_token"),
        IndexModel([("admin_id", ASCENDING), ("created_at", DESCENDING)], name="by_admin"),
        IndexModel([("gateway_id", ASCENDING), ("closed_at", ASCENDING)], name="by_gateway_open"),
        IndexModel([("gateway_id", ASCENDING)], name="by_gateway"),
        IndexModel([("expires_at", ASCENDING)], expireAfterSeconds=86_400, name="ttl"),
    ],
    "terminal_commands": [
        IndexModel([("terminal_session_id", ASCENDING)], name="by_session"),
        IndexModel([("gateway_id", ASCENDING), ("created_at", DESCENDING)], name="by_gateway"),
        IndexModel([("created_at", DESCENDING)], name="recent"),
        IndexModel([("created_at", ASCENDING)], expireAfterSeconds=settings.audit_log_ttl_days * 86400, name="ttl"),
    ],
    "subscriptions": [
        IndexModel([("user_id", ASCENDING)], unique=True, name="uniq_user"),
    ],
    "settings": [],
}


async def ensure_indexes() -> None:
    db = get_db()
    for collection, models in INDEXES.items():
        if not models:
            continue
        try:
            await db[collection].create_indexes(models)
        except OperationFailure as e:
            if e.code == 85 or "IndexOptionsConflict" in str(e):
                log.warning("Index options conflict in collection %s, updating indexes: %s", collection, e)
                for model in models:
                    try:
                        await db[collection].create_indexes([model])
                    except OperationFailure as ie:
                        if ie.code == 85 or "IndexOptionsConflict" in str(ie):
                            name = model.document.get("name")
                            if name:
                                log.info("Dropping conflicting index '%s' in '%s' to apply updated options", name, collection)
                                await db[collection].drop_index(name)
                                await db[collection].create_indexes([model])
            else:
                raise
    log.info("indexes ensured", extra={"event": "mongo.indexes"})
