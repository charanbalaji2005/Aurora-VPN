from __future__ import annotations

from fastapi import APIRouter, status

from app.common.deps import CurrentUser
from app.common.models import serialise
from app.devices import schemas, service

router = APIRouter(prefix="/devices", tags=["devices"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def register_device(body: schemas.DeviceRegisterRequest, user: CurrentUser):
    device = await service.register_device(user, body.model_dump())
    return _public(device)


@router.get("")
async def list_devices(user: CurrentUser):
    return {"devices": [_public(d) for d in await service.list_devices(str(user["_id"]))]}


@router.post("/{device_id}/rotate-key")
async def rotate_key(device_id: str, body: schemas.DeviceRotateKeyRequest, user: CurrentUser):
    device = await service.rotate_key(str(user["_id"]), device_id, body.public_key)
    return _public(device)


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_device(device_id: str, user: CurrentUser):
    await service.revoke_device(str(user["_id"]), device_id)


def _public(device: dict) -> dict:
    doc = serialise(device) if "_id" in device else device
    # The public key is intentionally not returned to other surfaces.
    return {
        "id": doc["id"],
        "name": doc.get("name"),
        "platform": doc.get("platform"),
        "created_at": doc.get("created_at"),
        "last_seen_at": doc.get("last_seen_at"),
        "revoked": bool(doc.get("revoked")),
    }
