"""Terminal API.

Opening a session needs the TERMINAL_OPEN permission *and* a fresh MFA
step-up. The WebSocket then carries only the terminal token, which is bound to
one admin and one gateway and dies on its own.
"""

from __future__ import annotations

import json
import logging
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, Query, WebSocket, WebSocketDisconnect

from app.auth import mfa
from app.common.errors import AppError
from app.common.rbac import Permission, require
from app.terminal import commands, service

log = logging.getLogger(__name__)
router = APIRouter(prefix="/admin/terminal", tags=["terminal"])

TerminalAdmin = Annotated[dict, Depends(require(Permission.TERMINAL_OPEN))]


@router.get("/commands")
async def list_commands(admin: TerminalAdmin):
    """What the terminal can actually do. The console renders this rather than
    hardcoding a list that could drift from the server's allowlist."""
    return {"commands": commands.catalogue()}


@router.post("/session")
async def open_session(
    admin: TerminalAdmin,
    gateway_id: str = Body(embed=True),
    step_up_token: str | None = Body(default=None, embed=True),
):
    mfa.assert_step_up(admin, step_up_token)
    return await service.open_session(admin, gateway_id)


@router.post("/session/{session_id}/close")
async def close_session(session_id: str, admin: TerminalAdmin):
    await service.close_session(session_id, "closed_by_admin")
    return {"ok": True}


@router.get("/history")
async def command_history(
    admin: TerminalAdmin, gateway_id: str | None = None, limit: int = Query(100, le=500)
):
    return {"commands": await service.history(gateway_id, limit)}


@router.websocket("/ws/{session_id}")
async def terminal_socket(websocket: WebSocket, session_id: str, token: str = Query(...)):
    """One command at a time, strictly request/response.

    Deliberately not a PTY stream. A PTY implies a persistent shell on the far
    side; this is a series of individually authorised, individually audited
    commands that happen to be displayed in a terminal.
    """
    await websocket.accept()
    try:
        session = await service.authenticate(session_id, token)
    except AppError as exc:
        await websocket.send_text(json.dumps({"type": "error", "message": exc.message, "code": exc.code}))
        await websocket.close(code=4403)
        return

    await websocket.send_text(
        json.dumps(
            {
                "type": "ready",
                "gateway_id": session["gateway_id"],
                "hint": "Type 'help' to list available commands.",
            }
        )
    )

    try:
        while True:
            raw = await websocket.receive_text()
            message = _parse(raw)
            if message is None:
                continue

            if message.get("type") == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
                continue
            if message.get("type") != "command":
                continue

            command = str(message.get("command", "")).strip()
            if not command:
                continue

            if command in {"help", "?"}:
                await websocket.send_text(
                    json.dumps({"type": "help", "commands": commands.catalogue()})
                )
                continue

            # Re-authenticate on every command: the session may have expired or
            # been closed from another tab since the socket opened.
            try:
                session = await service.authenticate(session_id, token)
            except AppError as exc:
                await websocket.send_text(
                    json.dumps({"type": "error", "message": exc.message, "code": exc.code})
                )
                await websocket.close(code=4403)
                return

            result = await service.run(session, command)
            await websocket.send_text(json.dumps({"type": "output", "command": command, **result}))
    except WebSocketDisconnect:
        await service.close_session(session_id, "disconnected")
    except Exception:  # noqa: BLE001 - never leak a traceback down the socket
        log.exception("terminal socket failed", extra={"event": "terminal.socket_error"})
        await service.close_session(session_id, "error")
        await websocket.close(code=1011)


def _parse(raw: str) -> dict[str, Any] | None:
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None
