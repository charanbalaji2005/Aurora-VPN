"""Application configuration.

Every value is environment driven. Nothing secret has a usable default:
the app refuses to start in production without explicit secrets.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- runtime -----------------------------------------------------------
    environment: Literal["development", "staging", "production"] = "development"
    app_name: str = "Aurora VPN Control Plane"
    api_prefix: str = "/api/v1"
    log_level: str = "INFO"
    sentry_dsn: str | None = None

    # --- datastores --------------------------------------------------------
    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db: str = "aurora_vpn"
    redis_url: str = "redis://localhost:6379/0"

    # --- auth --------------------------------------------------------------
    jwt_secret: str = Field(default="dev-only-change-me", min_length=8)
    jwt_algorithm: str = "HS256"
    access_token_ttl_seconds: int = 900  # 15 minutes
    refresh_token_ttl_seconds: int = 60 * 60 * 24 * 30
    password_min_length: int = 10

    # --- gateway trust -----------------------------------------------------
    # Bootstrap secret used once by a gateway agent to register itself; after
    # registration each gateway uses its own rotating token.
    gateway_bootstrap_secret: str = "dev-only-change-me"
    gateway_request_timeout_seconds: float = 6.0
    gateway_health_stale_seconds: int = 90

    # --- quota -------------------------------------------------------------
    free_daily_seconds: int = 10_800  # 3 hours
    quota_reset_timezone: str = "UTC"
    max_concurrent_sessions: int = 1
    session_heartbeat_seconds: int = 30
    session_stale_after_seconds: int = 120
    session_reaper_interval_seconds: int = 30

    # --- abuse / limits ----------------------------------------------------
    rate_limit_auth_per_minute: int = 10
    rate_limit_api_per_minute: int = 120
    rate_limit_session_per_minute: int = 20
    max_devices_per_free_user: int = 3

    # --- retention ---------------------------------------------------------
    usage_record_ttl_days: int = 365  # 1 year retention for analytics
    audit_log_ttl_days: int = 365     # 1 year retention for compliance audit

    # --- cors --------------------------------------------------------------
    admin_origins: list[str] = ["http://localhost:3000"]

    def assert_production_ready(self) -> None:
        if self.environment != "production":
            return
        weak = {"dev-only-change-me", "", "changeme"}
        if self.jwt_secret in weak or len(self.jwt_secret) < 32:
            raise RuntimeError("JWT_SECRET must be >= 32 random chars in production")
        if self.gateway_bootstrap_secret in weak:
            raise RuntimeError("GATEWAY_BOOTSTRAP_SECRET must be set in production")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
