"""Password hashing, JWT issuance and key validation.

No custom cryptography anywhere: Argon2id for passwords, PyJWT for tokens,
WireGuard for the tunnel. We only *validate* key material here, never invent it.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from datetime import timedelta
from typing import Any, Literal

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.common.errors import Unauthorized
from app.common.timeutil import utcnow
from app.config.settings import settings

_hasher = PasswordHasher(time_cost=3, memory_cost=64 * 1024, parallelism=2)

TokenType = Literal["access", "refresh"]


# --- passwords -------------------------------------------------------------
def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        return _hasher.verify(stored_hash, password)
    except VerifyMismatchError:
        return False
    except Exception:  # noqa: BLE001 - malformed hash must not leak details
        return False


def needs_rehash(stored_hash: str) -> bool:
    try:
        return _hasher.check_needs_rehash(stored_hash)
    except Exception:  # noqa: BLE001
        return False


# --- json web tokens -------------------------------------------------------
def create_token(
    subject: str,
    token_type: TokenType,
    *,
    device_id: str | None = None,
    is_admin: bool = False,
    ttl: int | None = None,
) -> tuple[str, int]:
    now = utcnow()
    ttl = ttl or (
        settings.access_token_ttl_seconds
        if token_type == "access"
        else settings.refresh_token_ttl_seconds
    )
    payload: dict[str, Any] = {
        "sub": subject,
        "typ": token_type,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl)).timestamp()),
        "jti": secrets.token_urlsafe(16),
    }
    if device_id:
        payload["did"] = device_id
    if is_admin:
        payload["adm"] = True
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm), ttl


def decode_token(token: str, expected_type: TokenType) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError as exc:
        raise Unauthorized("Your session expired. Sign in again.", code="token_expired") from exc
    except jwt.PyJWTError as exc:
        raise Unauthorized("That sign-in is no longer valid.", code="token_invalid") from exc
    if payload.get("typ") != expected_type:
        raise Unauthorized("That sign-in is no longer valid.", code="token_invalid")
    return payload


def hash_refresh_token(token: str) -> str:
    """Refresh tokens are stored only as a hash so a database leak cannot
    be replayed against the API."""
    return hashlib.sha256(token.encode()).hexdigest()


def gateway_signature(
    secret: str,
    body: bytes,
    timestamp: str,
    method: str = "POST",
    path: str = "",
    nonce: str = "",
    request_id: str = "",
) -> str:
    if nonce or request_id or path:
        body_hash = hashlib.sha256(body).hexdigest()
        msg = f"{method.upper()}\n{path}\n{timestamp}\n{nonce}\n{request_id}\n{body_hash}".encode()
    else:
        msg = timestamp.encode() + b"." + body
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()


def verify_gateway_signature(
    secret: str,
    body: bytes,
    timestamp: str,
    signature: str,
    method: str = "POST",
    path: str = "",
    nonce: str = "",
    request_id: str = "",
) -> bool:
    canonical = gateway_signature(secret, body, timestamp, method, path, nonce, request_id)
    legacy = gateway_signature(secret, body, timestamp)
    return hmac.compare_digest(canonical, signature) or hmac.compare_digest(legacy, signature)


# --- wireguard key material ------------------------------------------------
def is_valid_wireguard_key(value: str) -> bool:
    """A WireGuard key is exactly 32 bytes, base64 encoded (44 chars)."""
    if not isinstance(value, str) or len(value) != 44 or not value.endswith("="):
        return False
    try:
        return len(base64.standard_b64decode(value)) == 32
    except Exception:  # noqa: BLE001
        return False


def new_preshared_key() -> str:
    """Optional per-peer PSK (post-quantum hardening layer of WireGuard)."""
    return base64.standard_b64encode(secrets.token_bytes(32)).decode()
