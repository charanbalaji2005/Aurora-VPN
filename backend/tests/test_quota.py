"""The quota engine is the part a user has the most incentive to attack,
so it gets the most direct tests."""

from __future__ import annotations

import pytest
from bson import ObjectId

from app.common.timeutil import quota_day
from app.quota import service as quota


@pytest.fixture()
def user():
    return {"_id": ObjectId(), "plan": "free"}


async def test_new_user_starts_with_the_full_allowance(db, user):
    state = await quota.snapshot(user)
    assert state["remaining_seconds"] == 10_800
    assert state["used_seconds"] == 0


async def test_consumption_is_cumulative_across_sessions(db, user):
    await quota.consume(user, 1800)   # 30 min
    await quota.consume(user, 900)    # 15 min in a later session
    state = await quota.snapshot(user)
    assert state["used_seconds"] == 2700
    assert state["remaining_seconds"] == 8100


async def test_quota_cannot_go_negative_and_reports_exhausted(db, user):
    await quota.consume(user, 10_000)
    await quota.consume(user, 5_000)
    state = await quota.snapshot(user)
    assert state["remaining_seconds"] == 0
    assert await quota.is_exhausted(user)


async def test_counter_is_keyed_by_server_side_day(db, user):
    await quota.consume(user, 600)
    doc = await db.daily_quotas.find_one({"user_id": user["_id"], "date": quota_day()})
    assert doc["used_seconds"] == 600


async def test_clearing_the_device_changes_nothing(db, user):
    """There is no device state involved at all: the same account id always
    resolves to the same server-side counter."""
    await quota.consume(user, 3600)
    reinstalled_app_same_account = {"_id": user["_id"], "plan": "free"}
    state = await quota.snapshot(reinstalled_app_same_account)
    assert state["used_seconds"] == 3600


async def test_paid_plan_is_not_metered(db):
    unlimited = {"_id": ObjectId(), "plan": "unlimited"}
    assert (await quota.snapshot(unlimited))["unlimited"] is True
    assert await quota.remaining_seconds(unlimited) > 10_800
