from __future__ import annotations

from pydantic import EmailStr, Field

from app.common.models import ApiModel
from app.config.settings import settings


class RegisterRequest(ApiModel):
    email: EmailStr
    password: str = Field(min_length=settings.password_min_length, max_length=256)


class LoginRequest(ApiModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class RefreshRequest(ApiModel):
    refresh_token: str


class TokenPair(ApiModel):
    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int


class AccountSummary(ApiModel):
    id: str
    email: str
    plan: str
    status: str
    is_admin: bool = False
    created_at: str


class DeleteAccountRequest(ApiModel):
    password: str | None = None

