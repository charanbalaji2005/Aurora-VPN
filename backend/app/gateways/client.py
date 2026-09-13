"""HTTP client for the gateway agent.

The control plane never touches `wg` directly. It asks the agent running on
each Linux gateway to add or remove a peer. Requests are HMAC signed with a
per-gateway secret, binding method, path, timestamp, nonce, and request_id to prevent replay.
"""

from __future__ import annotations

import json
import logging
import secrets
from typing import Any

import httpx

from app.common.errors import GatewayUnreachable
from app.common.metrics import peer_provision_failures
from app.common.security import gateway_signature
from app.common.timeutil import utcnow
from app.config.settings import settings

log = logging.getLogger(__name__)


class GatewayClient:
    def __init__(self, server: dict[str, Any]):
        self.gateway_id: str = server["gateway_id"]
        self.base_url: str = server["agent_url"].rstrip("/")
        self.secret: str = server["agent_secret"]

    def _headers(self, method: str, path: str, body: bytes) -> dict[str, str]:
        ts = str(int(utcnow().timestamp()))
        nonce = secrets.token_hex(16)
        request_id = secrets.token_hex(16)
        sig = gateway_signature(
            self.secret,
            body,
            ts,
            method=method,
            path=path,
            nonce=nonce,
            request_id=request_id,
        )
        return {
            "content-type": "application/json",
            "x-gateway-id": self.gateway_id,
            "x-timestamp": ts,
            "x-nonce": nonce,
            "x-request-id": request_id,
            "x-signature": sig,
        }

    async def _request(self, method: str, path: str, payload: dict | None = None) -> dict:
        body = json.dumps(payload or {}, separators=(",", ":")).encode()
        url = f"{self.base_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=settings.gateway_request_timeout_seconds) as c:
                response = await c.request(method, url, content=body, headers=self._headers(method, path, body))
        except httpx.HTTPError as exc:
            peer_provision_failures.labels(self.gateway_id).inc()
            log.warning(
                "gateway unreachable",
                extra={"event": "gateway.unreachable", "gateway_id": self.gateway_id},
            )
            raise GatewayUnreachable() from exc
        if response.status_code >= 400:
            peer_provision_failures.labels(self.gateway_id).inc()
            log.warning(
                "gateway rejected request",
                extra={"event": "gateway.rejected", "gateway_id": self.gateway_id},
            )
            raise GatewayUnreachable("The VPN server rejected this device.", code="peer_rejected")
        return response.json() if response.content else {}

    async def add_peer(
        self, public_key: str, allowed_ips: list[str], preshared_key: str | None = None
    ) -> dict:
        return await self._request(
            "POST",
            "/peers",
            {"public_key": public_key, "allowed_ips": allowed_ips, "preshared_key": preshared_key},
        )

    async def remove_peer(self, public_key: str) -> dict:
        return await self._request("POST", "/peers/remove", {"public_key": public_key})

    async def peer_stats(self, public_key: str) -> dict:
        return await self._request("POST", "/peers/stats", {"public_key": public_key})

    async def health(self) -> dict:
        return await self._request("GET", "/health")

    async def exec_command(self, command_id: str, timeout: int = 15) -> dict:
        """Run one allowlisted diagnostic. The agent is sent an identifier, not
        a command line -- see app/terminal/commands.py."""
        return await self._request("POST", "/exec", {"command_id": command_id, "timeout": timeout})

    async def operation(self, operation: str) -> dict:
        """Named privileged operation. The agent implements a fixed set of
        these; there is no generic 'run as root' path."""
        return await self._request("POST", f"/operations/{operation}", {})

    async def capture_traffic(
        self,
        interface: str = "wg0",
        duration: int = 10,
        count: int = 500,
        bpf_filter: str = "",
    ) -> bytes:
        """Trigger a tcpdump capture on the gateway agent and return raw pcap
        bytes suitable for saving as a Wireshark-compatible .pcap file.

        The request blocks for up to `duration` seconds on the agent side, so
        the httpx timeout is set generously to duration + 20s.
        """
        payload = {"interface": interface, "duration": duration, "count": count}
        if bpf_filter:
            payload["filter"] = bpf_filter

        body = json.dumps(payload, separators=(",", ":")).encode()
        url = f"{self.base_url}/capture"
        timeout = duration + 20
        try:
            async with httpx.AsyncClient(timeout=timeout) as c:
                response = await c.request(
                    "POST", url, content=body,
                    headers=self._headers("POST", "/capture", body),
                )
        except httpx.HTTPError as exc:
            peer_provision_failures.labels(self.gateway_id).inc()
            log.warning("gateway unreachable during capture", extra={"gateway_id": self.gateway_id})
            raise GatewayUnreachable() from exc

        if response.status_code >= 400:
            raise GatewayUnreachable(
                f"Gateway capture failed: {response.status_code}", code="capture_failed"
            )
        return response.content
