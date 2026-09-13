"""MFA exists so that a stolen access token is not enough to drain a gateway.
These tests pin that property."""

from __future__ import annotations

import time

import pytest
from bson import ObjectId

from app.auth import mfa
from app.common.errors import Forbidden, Unauthorized


def current_code(secret: str, drift: int = 0) -> str:
    return mfa._code_at(secret, int(time.time()) // 30 + drift)  # noqa: SLF001


def test_totp_accepts_the_current_code_and_one_step_of_drift():
    secret = mfa.new_secret()
    assert mfa.verify_code(secret, current_code(secret))
    assert mfa.verify_code(secret, current_code(secret, -1))
    assert mfa.verify_code(secret, current_code(secret, 1))


def test_totp_rejects_a_stale_or_wrong_code():
    secret = mfa.new_secret()
    assert not mfa.verify_code(secret, current_code(secret, 5))
    assert not mfa.verify_code(secret, "000000")
    assert not mfa.verify_code(secret, "")
    assert not mfa.verify_code(secret, "12345")
    assert not mfa.verify_code(secret, "abcdef")


def test_a_code_from_a_different_secret_does_not_work():
    mine, theirs = mfa.new_secret(), mfa.new_secret()
    assert not mfa.verify_code(mine, current_code(theirs))


def test_provisioning_uri_carries_the_secret_and_issuer():
    uri = mfa.provisioning_uri("ABCDEFGH", "ops@example.com")
    assert uri.startswith("otpauth://totp/")
    assert "secret=ABCDEFGH" in uri
    assert "issuer=Aurora%20VPN" in uri or "issuer=Aurora VPN" in uri


async def test_enrolment_is_not_active_until_a_code_is_confirmed(db):
    user_id = ObjectId()
    await db.users.insert_one({"_id": user_id, "email": "ops@example.com"})
    user = await db.users.find_one({"_id": user_id})

    started = await mfa.begin_enrolment(user)
    pending = await db.users.find_one({"_id": user_id})
    assert pending.get("mfa_enabled") is not True
    assert pending["mfa_pending_secret"] == started["secret"]

    recovery = await mfa.confirm_enrolment(pending, current_code(started["secret"]))
    confirmed = await db.users.find_one({"_id": user_id})
    assert confirmed["mfa_enabled"] is True
    assert "mfa_pending_secret" not in confirmed
    # Recovery codes are returned once and stored only as hashes.
    assert len(recovery) == 8
    assert all(code not in str(confirmed) for code in recovery)


async def test_confirming_with_a_wrong_code_does_not_enable_anything(db):
    user_id = ObjectId()
    await db.users.insert_one({"_id": user_id, "email": "ops@example.com"})
    user = await db.users.find_one({"_id": user_id})
    await mfa.begin_enrolment(user)
    pending = await db.users.find_one({"_id": user_id})

    with pytest.raises(Unauthorized):
        await mfa.confirm_enrolment(pending, "000000")
    assert (await db.users.find_one({"_id": user_id})).get("mfa_enabled") is not True


async def test_step_up_requires_enrolment_first(db):
    with pytest.raises(Forbidden):
        await mfa.step_up({"_id": ObjectId(), "mfa_enabled": False}, "123456")


async def test_step_up_token_is_bound_to_the_account_that_earned_it(db):
    user_id = ObjectId()
    secret = mfa.new_secret()
    await db.users.insert_one({"_id": user_id, "email": "a@example.com"})
    user = {"_id": user_id, "mfa_enabled": True, "mfa_secret": secret}

    issued = await mfa.step_up(user, current_code(secret))
    mfa.assert_step_up(user, issued["step_up_token"])  # the earner: fine

    someone_else = {"_id": ObjectId()}
    with pytest.raises(Forbidden) as raised:
        mfa.assert_step_up(someone_else, issued["step_up_token"])
    assert raised.value.code == "mfa_mismatch"


async def test_a_missing_step_up_is_refused_with_a_useful_code(db):
    with pytest.raises(Forbidden) as raised:
        mfa.assert_step_up({"_id": ObjectId()}, None)
    assert raised.value.code == "mfa_required"


async def test_a_recovery_code_works_once(db):
    user_id = ObjectId()
    secret = mfa.new_secret()
    await db.users.insert_one({"_id": user_id, "email": "a@example.com"})
    user = await db.users.find_one({"_id": user_id})
    await mfa.begin_enrolment(user)
    pending = await db.users.find_one({"_id": user_id})
    recovery = await mfa.confirm_enrolment(pending, current_code(pending["mfa_pending_secret"]))

    enrolled = await db.users.find_one({"_id": user_id})
    await mfa.step_up(enrolled, recovery[0])

    spent = await db.users.find_one({"_id": user_id})
    with pytest.raises(Unauthorized):
        await mfa.step_up(spent, recovery[0])
