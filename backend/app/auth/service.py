"""Account creation, sign-in and refresh-token rotation.

Refresh tokens are single use: refreshing rotates the token and revokes the
whole family if a used token is replayed (theft detection).
"""

from __future__ import annotations

import secrets
from typing import Any

from app.common import audit
from app.common.db import get_db
from app.common.errors import Conflict, Unauthorized
from app.common.models import oid, serialise
from app.common.security import (
    create_token,
    hash_password,
    hash_refresh_token,
    needs_rehash,
    verify_password,
)
from app.common.timeutil import utcnow
from app.config.settings import settings
from datetime import timedelta


async def register(email: str, password: str) -> dict[str, Any]:
    db = get_db()
    email = email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise Conflict("An account already exists for that email.", code="email_taken")
    now = utcnow()
    doc = {
        "email": email,
        "password_hash": hash_password(password),
        "plan": "free",
        "status": "active",
        "is_admin": False,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.users.insert_one(doc)
    doc["_id"] = result.inserted_id
    await audit.record("auth.register", actor_id=str(result.inserted_id))
    return doc


async def authenticate(email: str, password: str) -> dict[str, Any]:
    db = get_db()
    user = await db.users.find_one({"email": email.lower().strip()})
    # Constant-ish work on the unknown-user path to avoid user enumeration.
    stored = user.get("password_hash") if user else hash_password(secrets.token_urlsafe(16))
    if not verify_password(password, stored) or user is None:
        raise Unauthorized("That email and password do not match.", code="invalid_credentials")
    if user.get("status") == "suspended":
        raise Unauthorized("This account is suspended.", code="account_suspended")
    if needs_rehash(stored):
        await db.users.update_one(
            {"_id": user["_id"]}, {"$set": {"password_hash": hash_password(password)}}
        )
    return user


async def issue_tokens(user: dict[str, Any], family: str | None = None) -> dict[str, Any]:
    db = get_db()
    user_id = str(user["_id"])
    access, ttl = create_token(user_id, "access", is_admin=bool(user.get("is_admin")))
    refresh, refresh_ttl = create_token(user_id, "refresh")
    await db.refresh_tokens.insert_one(
        {
            "user_id": oid(user_id),
            "token_hash": hash_refresh_token(refresh),
            "family": family or secrets.token_urlsafe(12),
            "used": False,
            "created_at": utcnow(),
            "expires_at": utcnow() + timedelta(seconds=refresh_ttl),
        }
    )
    return {"access_token": access, "refresh_token": refresh, "expires_in": ttl}


async def rotate_refresh(refresh_token: str) -> dict[str, Any]:
    from app.common.security import decode_token

    db = get_db()
    payload = decode_token(refresh_token, "refresh")
    token_hash = hash_refresh_token(refresh_token)
    now = utcnow()

    # Atomically claim the unspent token: only ONE concurrent request can succeed
    stored = await db.refresh_tokens.find_one_and_update(
        {
            "token_hash": token_hash,
            "used": False,
            "expires_at": {"$gt": now},
        },
        {"$set": {"used": True, "updated_at": now}},
    )

    if stored is None:
        # Replay check: if the token exists with used=True, revoke the family
        existing = await db.refresh_tokens.find_one({"token_hash": token_hash})
        if existing:
            await db.refresh_tokens.delete_many({"family": existing["family"]})
            await audit.record("auth.refresh_replay", actor_id=str(existing["user_id"]))
            raise Unauthorized("Sign in again to continue.", code="refresh_replayed")
        raise Unauthorized("Sign in again to continue.", code="refresh_unknown")
    user = await db.users.find_one({"_id": oid(payload["sub"])})
    if user is None or user.get("status") == "suspended":
        raise Unauthorized("That account is not available.", code="account_unavailable")
    return await issue_tokens(user, family=stored["family"])


async def logout(refresh_token: str | None, user_id: str) -> None:
    db = get_db()
    if refresh_token:
        stored = await db.refresh_tokens.find_one({"token_hash": hash_refresh_token(refresh_token)})
        if stored:
            await db.refresh_tokens.delete_many({"family": stored["family"]})
            return
    await db.refresh_tokens.delete_many({"user_id": oid(user_id)})


def account_summary(user: dict[str, Any]) -> dict[str, Any]:
    doc = serialise(user) or {}
    return {
        "id": doc["id"],
        "email": doc["email"],
        "plan": doc.get("plan", "free"),
        "status": doc.get("status", "active"),
        "is_admin": bool(doc.get("is_admin")),
        "created_at": doc.get("created_at"),
        "free_daily_seconds": settings.free_daily_seconds,
    }


async def delete_account(user: dict[str, Any], password: str | None = None) -> None:
    """Permanently delete user account, terminate sessions, revoke peers, and clean data."""
    from app.common.security import verify_password
    from app.sessions import service as sessions
    from app.wireguard import provisioning

    db = get_db()
    user_id = str(user["_id"])

    if password and not verify_password(password, user.get("password_hash", "")):
        raise Unauthorized("The password provided is incorrect.", code="password_incorrect")

    # 1. Terminate all active sessions
    await sessions.terminate_user_sessions(user_id, reason="account_deleted")

    # 2. Revoke all peers across gateways
    await provisioning.revoke_user_peers(user_id)

    # 3. Mark all devices as revoked
    await db.devices.update_many(
        {"user_id": oid(user_id)},
        {"$set": {"revoked": True, "revoked_at": utcnow()}},
    )

    # 4. Purge refresh tokens
    await db.refresh_tokens.delete_many({"user_id": oid(user_id)})

    # 5. Delete daily quotas
    await db.daily_quotas.delete_many({"user_id": oid(user_id)})

    # 6. Delete user document
    await db.users.delete_one({"_id": oid(user_id)})

    # 7. Audit account deletion
    await audit.record("account.delete", actor_id=user_id, target=user_id)

