"""Shared Pydantic building blocks."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from bson import ObjectId
from pydantic import BaseModel, ConfigDict


class ApiModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


def oid(value: str | ObjectId) -> ObjectId:
    if isinstance(value, ObjectId):
        return value
    return ObjectId(value)


def serialise(doc: dict[str, Any] | None) -> dict[str, Any] | None:
    """Mongo document -> JSON-safe dict with `id` instead of `_id`."""
    if doc is None:
        return None
    out: dict[str, Any] = {}
    for key, value in doc.items():
        if key == "_id":
            out["id"] = str(value)
        elif isinstance(value, ObjectId):
            out[key] = str(value)
        elif isinstance(value, datetime):
            out[key] = value.isoformat()
        elif isinstance(value, dict):
            out[key] = serialise(value)
        elif isinstance(value, list):
            out[key] = [serialise(v) if isinstance(v, dict) else v for v in value]
        else:
            out[key] = value
    return out
