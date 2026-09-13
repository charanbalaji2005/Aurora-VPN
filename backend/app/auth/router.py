from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Body, Depends, Request, status

from app.auth import mfa, schemas, service
from app.common.deps import CurrentUser, auth_rate_limit, client_ip
from app.rate_limit import limiter

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=schemas.TokenPair, status_code=status.HTTP_201_CREATED)
async def register(
    body: schemas.RegisterRequest,
    _: Annotated[None, Depends(auth_rate_limit)],
):
    user = await service.register(body.email, body.password)
    return await service.issue_tokens(user)


@router.post("/login", response_model=schemas.TokenPair)
async def login(
    body: schemas.LoginRequest,
    request: Request,
    _: Annotated[None, Depends(auth_rate_limit)],
):
    # A second, tighter limit per email defeats credential stuffing that
    # rotates source addresses.
    await limiter.hit("auth-email", body.email.lower(), 8, 300)
    user = await service.authenticate(body.email, body.password)
    await limiter.reset("auth", client_ip(request))
    return await service.issue_tokens(user)


@router.post("/refresh", response_model=schemas.TokenPair)
async def refresh(body: schemas.RefreshRequest):
    return await service.rotate_refresh(body.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: schemas.RefreshRequest | None, user: CurrentUser):
    await service.logout(body.refresh_token if body else None, str(user["_id"]))


@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    user: CurrentUser,
    body: schemas.DeleteAccountRequest | None = None,
):
    """Permanently delete account, terminate sessions, revoke device peers, purge data."""
    await service.delete_account(user, password=body.password if body else None)


@router.get("/me", response_model=None)
async def me(user: CurrentUser):
    return service.account_summary(user)


# --- second factor (MFA) ---------------------------------------------------
# Available to any account, required for administrators before they can touch a
# terminal or run a destructive operation.


@router.post("/mfa/setup")
@router.post("/mfa/enrol")
async def mfa_setup(user: CurrentUser):
    """Returns the secret once, plus an otpauth:// URL for the authenticator app.
    It is not active until a code from it is confirmed."""
    return await mfa.begin_enrolment(user)


@router.post("/mfa/confirm")
async def mfa_confirm(
    user: CurrentUser,
    code: str = Body(embed=True),
    _: Annotated[None, Depends(auth_rate_limit)] = None,
):
    """Confirm MFA enrolment with a fresh code. Protected by per-IP and per-account rate limits."""
    await limiter.hit("mfa-confirm", str(user["_id"]), 5, 300)
    recovery_codes = await mfa.confirm_enrolment(user, code)
    # Shown exactly once; only hashes are stored.
    return {"enabled": True, "recovery_codes": recovery_codes}


@router.post("/mfa/step-up")
async def mfa_step_up(
    user: CurrentUser,
    code: str = Body(embed=True),
    _: Annotated[None, Depends(auth_rate_limit)] = None,
):
    """Exchange a fresh TOTP or recovery code for a 5-minute proof token.
    Protected by per-IP and per-account rate limits."""
    await limiter.hit("mfa-step-up", str(user["_id"]), 5, 300)
    return await mfa.step_up(user, code)


@router.get("/mfa")
async def mfa_status(user: CurrentUser):
    return {
        "enabled": bool(user.get("mfa_enabled")),
        "recovery_codes_left": len(user.get("mfa_recovery_hashes", [])),
    }
