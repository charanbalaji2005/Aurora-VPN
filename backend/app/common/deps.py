"""FastAPI dependencies: authentication, authorisation and per-caller limits."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.common.db import get_db
from app.common.errors import Forbidden, Unauthorized
from app.common.models import oid
from app.common.security import decode_token
from app.config.settings import settings
from app.rate_limit import limiter

bearer = HTTPBearer(auto_error=False)


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> dict[str, Any]:
    if credentials is None:
        raise Unauthorized("Sign in to use the VPN.")
    payload = decode_token(credentials.credentials, "access")
    user = await get_db().users.find_one({"_id": oid(payload["sub"])})
    if user is None:
        raise Unauthorized("That account no longer exists.", code="account_missing")
    if user.get("status") == "suspended":
        raise Forbidden("This account is suspended. Contact support.", code="account_suspended")
    user["token"] = payload
    return user


async def current_admin(user: Annotated[dict, Depends(current_user)]) -> dict[str, Any]:
    if not user.get("is_admin"):
        raise Forbidden("Administrator access is required.", code="admin_required")
    return user


async def api_rate_limit(request: Request) -> None:
    await limiter.hit("api", client_ip(request), settings.rate_limit_api_per_minute)


async def auth_rate_limit(request: Request) -> None:
    await limiter.hit("auth", client_ip(request), settings.rate_limit_auth_per_minute)


async def gateway_identity(
    x_gateway_id: Annotated[str | None, Header()] = None,
    x_gateway_token: Annotated[str | None, Header()] = None,
) -> dict[str, Any]:
    """Authenticate a gateway agent by its own rotating token."""
    if not x_gateway_id or not x_gateway_token:
        raise Unauthorized("Gateway credentials are missing.", code="gateway_unauthorized")
    from app.common.security import hash_refresh_token  # local import avoids cycle

    server = await get_db().vpn_servers.find_one(
        {"gateway_id": x_gateway_id, "agent_token_hash": hash_refresh_token(x_gateway_token)}
    )
    if server is None:
        raise Unauthorized("Gateway credentials are not valid.", code="gateway_unauthorized")
    return server


CurrentUser = Annotated[dict, Depends(current_user)]
CurrentAdmin = Annotated[dict, Depends(current_admin)]
GatewayIdentity = Annotated[dict, Depends(gateway_identity)]
