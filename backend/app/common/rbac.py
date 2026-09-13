"""Roles and permissions.

The reason this is a matrix rather than an `is_admin` boolean: the dangerous
operations in this system are not "admin things", they are *specific* things.
Suspending an account and opening a root-adjacent terminal on a gateway are
both "admin", and they should not be reachable by the same people.

Every permission is checked server-side. The console hides what you cannot do,
but hiding is a courtesy -- the API is what enforces it.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Annotated

from fastapi import Depends

from app.common.deps import current_user
from app.common.errors import Forbidden


class Role(StrEnum):
    SUPER_ADMIN = "SUPER_ADMIN"
    INFRASTRUCTURE_ADMIN = "INFRASTRUCTURE_ADMIN"
    SUPPORT_ADMIN = "SUPPORT_ADMIN"
    ANALYST = "ANALYST"
    READ_ONLY = "READ_ONLY"


class Permission(StrEnum):
    # read
    VIEW_DASHBOARD = "view:dashboard"
    VIEW_USERS = "view:users"
    VIEW_SESSIONS = "view:sessions"
    VIEW_DEVICES = "view:devices"
    VIEW_GATEWAYS = "view:gateways"
    VIEW_ANALYTICS = "view:analytics"
    VIEW_HEALTH = "view:health"
    VIEW_AUDIT = "view:audit"
    # support
    SUSPEND_USER = "write:user_status"
    TERMINATE_SESSION = "write:session_terminate"
    REVOKE_DEVICE = "write:device_revoke"
    # infrastructure
    GATEWAY_STATUS = "write:gateway_status"
    GATEWAY_DRAIN = "write:gateway_drain"
    GATEWAY_RESTART = "write:gateway_restart"
    GATEWAY_ROTATE_KEY = "write:gateway_rotate_key"
    TERMINAL_OPEN = "write:terminal"
    # platform
    EDIT_SETTINGS = "write:settings"
    MANAGE_ADMINS = "write:admins"
    EMERGENCY = "write:emergency"


_READ_ALL = {
    Permission.VIEW_DASHBOARD,
    Permission.VIEW_USERS,
    Permission.VIEW_SESSIONS,
    Permission.VIEW_DEVICES,
    Permission.VIEW_GATEWAYS,
    Permission.VIEW_HEALTH,
}

ROLE_PERMISSIONS: dict[Role, set[Permission]] = {
    Role.READ_ONLY: set(_READ_ALL),
    Role.ANALYST: _READ_ALL | {Permission.VIEW_ANALYTICS},
    Role.SUPPORT_ADMIN: _READ_ALL
    | {
        Permission.VIEW_ANALYTICS,
        Permission.SUSPEND_USER,
        Permission.TERMINATE_SESSION,
        Permission.REVOKE_DEVICE,
    },
    Role.INFRASTRUCTURE_ADMIN: _READ_ALL
    | {
        Permission.VIEW_ANALYTICS,
        Permission.VIEW_AUDIT,
        Permission.TERMINATE_SESSION,
        Permission.GATEWAY_STATUS,
        Permission.GATEWAY_DRAIN,
        Permission.GATEWAY_RESTART,
        Permission.GATEWAY_ROTATE_KEY,
        Permission.TERMINAL_OPEN,
        Permission.EMERGENCY,
    },
    Role.SUPER_ADMIN: set(Permission),
}


def role_of(user: dict) -> Role | None:
    """Legacy `is_admin: true` accounts are treated as SUPER_ADMIN so an
    existing deployment does not lock itself out on upgrade."""
    raw = user.get("role")
    if raw:
        try:
            return Role(raw)
        except ValueError:
            return None
    return Role.SUPER_ADMIN if user.get("is_admin") else None


def permissions_of(user: dict) -> set[Permission]:
    role = role_of(user)
    return ROLE_PERMISSIONS.get(role, set()) if role else set()


def has(user: dict, permission: Permission) -> bool:
    return permission in permissions_of(user)


def require(permission: Permission):
    """Dependency factory. Use as `Depends(require(Permission.X))`."""

    async def dependency(user: Annotated[dict, Depends(current_user)]) -> dict:
        role = role_of(user)
        if role is None:
            raise Forbidden("Administrator access is required.", code="admin_required")
        if permission not in ROLE_PERMISSIONS.get(role, set()):
            raise Forbidden(
                f"Your role ({role.value.replace('_', ' ').lower()}) cannot do that.",
                code="permission_denied",
                required=permission.value,
            )
        return user

    return dependency
