from __future__ import annotations

from typing import Literal

from pydantic import Field, field_validator

from app.common.models import ApiModel
from app.common.security import is_valid_wireguard_key


class DeviceRegisterRequest(ApiModel):
    name: str = Field(min_length=1, max_length=64)
    platform: Literal["android", "ios", "desktop"] = "android"
    os_version: str | None = Field(default=None, max_length=32)
    app_version: str | None = Field(default=None, max_length=32)
    public_key: str = Field(description="Device WireGuard public key, base64, 44 chars")

    @field_validator("public_key")
    @classmethod
    def _valid_key(cls, v: str) -> str:
        if not is_valid_wireguard_key(v):
            raise ValueError("public_key must be a 32-byte base64 WireGuard key")
        return v


class DeviceRotateKeyRequest(ApiModel):
    public_key: str

    @field_validator("public_key")
    @classmethod
    def _valid_key(cls, v: str) -> str:
        if not is_valid_wireguard_key(v):
            raise ValueError("public_key must be a 32-byte base64 WireGuard key")
        return v


class DeviceResponse(ApiModel):
    id: str
    name: str
    platform: str
    created_at: str
    last_seen_at: str | None = None
    revoked: bool = False
