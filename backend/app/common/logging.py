"""Structured JSON logging with hard redaction of secrets.

Nothing here may log private keys, tokens, passwords or user traffic.
The redaction filter is the last line of defence.
"""

from __future__ import annotations

import json
import logging
import re
import sys
from datetime import UTC, datetime

REDACT_KEYS = {
    "password",
    "passphrase",
    "private_key",
    "privatekey",
    "preshared_key",
    "access_token",
    "refresh_token",
    "authorization",
    "jwt_secret",
    "secret",
    "token",
}

# A trailing \\b would not match a key ending in "=", so anchor on "no more
# base64 follows" instead.
_WG_KEY = re.compile(r"(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{42}[A-Za-z0-9+/=]{2}(?![A-Za-z0-9+/=])")


def redact(value):
    if isinstance(value, dict):
        return {
            k: ("[redacted]" if k.lower() in REDACT_KEYS else redact(v)) for k, v in value.items()
        }
    if isinstance(value, list):
        return [redact(v) for v in value]
    if isinstance(value, str):
        return _WG_KEY.sub("[key]", value)
    return value


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": redact(record.getMessage()),
        }
        for key in ("request_id", "user_id", "device_id", "session_id", "gateway_id", "event"):
            if hasattr(record, key):
                payload[key] = getattr(record, key)
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())
    for noisy in ("uvicorn.access", "pymongo", "httpx"):
        logging.getLogger(noisy).setLevel("WARNING")
