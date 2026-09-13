"""Roles are the difference between "an admin" and "the person who may drain
Singapore". These tests pin the boundaries that matter."""

from __future__ import annotations

import pytest
from bson import ObjectId

from app.common.errors import Forbidden
from app.common.rbac import Permission, Role, has, permissions_of, require, role_of


def user(role: str | None = None, **extra):
    return {"_id": ObjectId(), "email": "a@example.com", "role": role, **extra}


def test_legacy_admin_flag_maps_to_super_admin():
    """Existing deployments set is_admin=true and no role. They must not lock
    themselves out on upgrade."""
    assert role_of({"is_admin": True}) is Role.SUPER_ADMIN
    assert role_of({"is_admin": False}) is None
    assert role_of({}) is None


def test_a_normal_account_has_no_admin_permissions():
    assert permissions_of(user()) == set()


def test_read_only_cannot_change_anything():
    account = user(Role.READ_ONLY)
    assert has(account, Permission.VIEW_SESSIONS)
    assert not has(account, Permission.SUSPEND_USER)
    assert not has(account, Permission.TERMINATE_SESSION)
    assert not has(account, Permission.TERMINAL_OPEN)


def test_support_can_help_users_but_never_touch_infrastructure():
    account = user(Role.SUPPORT_ADMIN)
    assert has(account, Permission.SUSPEND_USER)
    assert has(account, Permission.REVOKE_DEVICE)
    # The whole point of splitting the roles:
    assert not has(account, Permission.TERMINAL_OPEN)
    assert not has(account, Permission.GATEWAY_DRAIN)
    assert not has(account, Permission.MANAGE_ADMINS)


def test_infrastructure_admin_can_operate_gateways_but_not_grant_roles():
    account = user(Role.INFRASTRUCTURE_ADMIN)
    assert has(account, Permission.TERMINAL_OPEN)
    assert has(account, Permission.GATEWAY_DRAIN)
    assert has(account, Permission.EMERGENCY)
    assert not has(account, Permission.MANAGE_ADMINS)
    assert not has(account, Permission.SUSPEND_USER)


def test_super_admin_has_every_permission():
    assert permissions_of(user(Role.SUPER_ADMIN)) == set(Permission)


def test_an_unknown_role_grants_nothing():
    """A typo in the database must fail closed."""
    assert role_of({"role": "ALMOST_ADMIN"}) is None
    assert permissions_of({"role": "ALMOST_ADMIN"}) == set()


async def test_require_dependency_refuses_and_names_the_permission():
    dependency = require(Permission.TERMINAL_OPEN)
    with pytest.raises(Forbidden) as raised:
        await dependency(user(Role.SUPPORT_ADMIN))
    assert raised.value.code == "permission_denied"
    assert raised.value.extra["required"] == Permission.TERMINAL_OPEN.value

    allowed = await dependency(user(Role.INFRASTRUCTURE_ADMIN))
    assert allowed["role"] == Role.INFRASTRUCTURE_ADMIN
