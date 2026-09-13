"""Second factor for administrators.

Two separate ideas here, and keeping them separate is what makes the terminal
safe to ship:

* **Enrolment** -- a TOTP secret bound to the account, stored once.
* **Step-up** -- a short-lived token proving the admin passed a fresh TOTP
  check *just now*. Destructive actions and terminal sessions require one, so
  a stolen access token alone cannot drain a gateway.

The step-up token lives five minutes and is bound to the user. It is not a
session upgrade: it is a receipt for one moment of proof.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
import time
from typing import Any

from app.common.db import get_db
from app.common.errors import Forbidden, Unauthorized
from app.common.models import oid
from app.common.security import create_token, decode_token
from app.common.timeutil import utcnow

STEP_UP_TTL_SECONDS = 300
_DIGITS = 6
_PERIOD = 30
_WINDOW = 1  # accept the neighbouring step, for clock drift


def new_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def provisioning_uri(secret: str, email: str, issuer: str = "Aurora VPN") -> str:
    return (
        f"otpauth://totp/{issuer}:{email}?secret={secret}"
        f"&issuer={issuer}&algorithm=SHA1&digits={_DIGITS}&period={_PERIOD}"
    )


def _code_at(secret: str, counter: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(value % (10**_DIGITS)).zfill(_DIGITS)


def verify_code(secret: str, code: str) -> bool:
    """RFC 6238 TOTP. Compared in constant time, and only over a +/-1 step
    window -- a wider window is a meaningfully larger guessing surface."""
    if not code or not code.isdigit() or len(code) != _DIGITS:
        return False
    counter = int(time.time()) // _PERIOD
    return any(
        hmac.compare_digest(_code_at(secret, counter + drift), code)
        for drift in range(-_WINDOW, _WINDOW + 1)
    )


async def begin_enrolment(user: dict[str, Any]) -> dict[str, str]:
    secret = new_secret()
    await get_db().users.update_one(
        {"_id": oid(user["_id"])},
        {"$set": {"mfa_pending_secret": secret, "mfa_updated_at": utcnow()}},
    )
    return {"secret": secret, "otpauth_url": provisioning_uri(secret, user["email"])}


async def confirm_enrolment(user: dict[str, Any], code: str) -> list[str]:
    """Confirming returns recovery codes once. They are stored hashed; if the
    admin loses them another SUPER_ADMIN has to reset the factor."""
    pending = user.get("mfa_pending_secret")
    if not pending:
        raise Forbidden("Start MFA setup before confirming.", code="mfa_not_started")
    if not verify_code(pending, code):
        raise Unauthorized("That code is not valid.", code="mfa_invalid")

    recovery = [secrets.token_hex(5) for _ in range(8)]
    await get_db().users.update_one(
        {"_id": oid(user["_id"])},
        {
            "$set": {
                "mfa_secret": pending,
                "mfa_enabled": True,
                "mfa_recovery_hashes": [hashlib.sha256(c.encode()).hexdigest() for c in recovery],
                "mfa_updated_at": utcnow(),
            },
            "$unset": {"mfa_pending_secret": ""},
        },
    )
    return recovery


async def step_up(user: dict[str, Any], code: str) -> dict[str, Any]:
    """Exchange a fresh TOTP (or a one-time recovery code) for a step-up token."""
    if not user.get("mfa_enabled"):
        raise Forbidden(
            "Set up two-factor authentication before using this.", code="mfa_required"
        )

    secret = user.get("mfa_secret", "")
    if not verify_code(secret, code):
        digest = hashlib.sha256(code.strip().encode()).hexdigest()
        # Recovery codes are single use: atomically claim and pull in one operation
        claimed = await get_db().users.find_one_and_update(
            {"_id": oid(user["_id"]), "mfa_recovery_hashes": digest},
            {"$pull": {"mfa_recovery_hashes": digest}},
        )
        if claimed is None:
            raise Unauthorized("That code is not valid.", code="mfa_invalid")

    token, ttl = create_token(
        str(user["_id"]), "access", ttl=STEP_UP_TTL_SECONDS, is_admin=True
    )
    await get_db().users.update_one(
        {"_id": oid(user["_id"])}, {"$set": {"mfa_last_used_at": utcnow()}}
    )
    return {"step_up_token": token, "expires_in": ttl}


def assert_step_up(user: dict[str, Any], token: str | None) -> None:
    """Raise unless `token` is a live step-up token for this same account."""
    if not token:
        raise Forbidden(
            "Confirm with your authenticator app to continue.", code="mfa_required"
        )
    payload = decode_token(token, "access")
    if payload.get("sub") != str(user["_id"]):
        raise Forbidden("That confirmation belongs to another account.", code="mfa_mismatch")
    issued = int(payload.get("iat", 0))
    if time.time() - issued > STEP_UP_TTL_SECONDS:
        raise Forbidden("That confirmation expired. Try again.", code="mfa_expired")
