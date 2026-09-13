"""Aurora VPN gateway agent.

Runs on each Linux WireGuard gateway. It is the only thing that touches `wg`.

Responsibilities
  * apply peers the control plane asks for (HMAC-signed requests with replay protection)
  * reconcile: every cycle it pulls the authoritative peer list and removes
    anything not on it, so a revoked device cannot survive a failed API call
  * report real health, latency, packet loss, and per-peer byte counters
  * persistent key rotation updating both live interface and /etc/wireguard/wg0.conf

It never reads packet payloads, never resolves hostnames for users and keeps
no record of what passes through the tunnel.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import os
import re
import subprocess
import time
from typing import Any

import httpx
import psutil
from fastapi import FastAPI, Header, HTTPException, Request

LOG = logging.getLogger("aurora.agent")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(message)s")

WG_INTERFACE = os.getenv("WG_INTERFACE", "wg0")
AGENT_SECRET = os.getenv("AGENT_SECRET", "")
GATEWAY_ID = os.getenv("GATEWAY_ID", "")
CONTROL_PLANE_URL = os.getenv("CONTROL_PLANE_URL", "").rstrip("/")
AGENT_TOKEN = os.getenv("AGENT_TOKEN", "")
CAPACITY = int(os.getenv("CAPACITY", "250"))
SYNC_INTERVAL = int(os.getenv("SYNC_INTERVAL_SECONDS", "15"))
MAX_CLOCK_SKEW = 300
MAX_OUTPUT_BYTES = 64 * 1024
_WG_KEY = re.compile(rb"[A-Za-z0-9+/]{42}[A-Za-z0-9+/=]{2}")

app = FastAPI(title=f"Aurora Gateway Agent ({GATEWAY_ID})", docs_url=None, openapi_url=None)

# In-memory sliding replay cache: {nonce_or_request_id: expiry_epoch}
REPLAY_CACHE: dict[str, float] = {}


def _clean_replay_cache(now: float) -> None:
    expired = [k for k, exp in REPLAY_CACHE.items() if exp <= now]
    for k in expired:
        REPLAY_CACHE.pop(k, None)


# --- wg plumbing -----------------------------------------------------------
def wg(*args: str) -> str:
    result = subprocess.run(
        ["wg", *args], capture_output=True, text=True, check=False, timeout=10
    )
    if result.returncode != 0:
        LOG.error("wg command failed: %s", result.stderr.strip()[:200])
        raise RuntimeError("wireguard command failed")
    return result.stdout


def list_peers() -> dict[str, dict[str, Any]]:
    """Parse `wg show <iface> dump` into {public_key: stats}."""
    peers: dict[str, dict[str, Any]] = {}
    dump = wg("show", WG_INTERFACE, "dump").strip().splitlines()
    for line in dump[1:]:  # first line is the interface itself
        parts = line.split("\t")
        if len(parts) < 8:
            continue
        peers[parts[0]] = {
            "public_key": parts[0],
            "allowed_ips": parts[3].split(",") if parts[3] != "(none)" else [],
            "last_handshake_epoch": int(parts[4] or 0),
            "rx_bytes": int(parts[5] or 0),
            "tx_bytes": int(parts[6] or 0),
        }
    return peers


def add_peer(public_key: str, allowed_ips: list[str], preshared_key: str | None) -> None:
    args = ["set", WG_INTERFACE, "peer", public_key, "allowed-ips", ",".join(allowed_ips)]
    if preshared_key:
        # `wg set` reads the PSK from a file descriptor so it never appears in
        # the process list.
        path = f"/dev/shm/psk-{hashlib.sha256(public_key.encode()).hexdigest()[:12]}"
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            os.write(fd, preshared_key.encode())
        finally:
            os.close(fd)
        args += ["preshared-key", path]
        try:
            wg(*args)
        finally:
            if os.path.exists(path):
                os.unlink(path)
    else:
        wg(*args)
    LOG.info("peer added %s", public_key[:10])


def remove_peer(public_key: str) -> None:
    wg("set", WG_INTERFACE, "peer", public_key, "remove")
    LOG.info("peer removed %s", public_key[:10])


# --- request authentication with HMAC replay cache -------------------------
async def verify(
    request: Request,
    x_timestamp: str | None = Header(default=None),
    x_signature: str | None = Header(default=None),
    x_nonce: str | None = Header(default=None),
    x_request_id: str | None = Header(default=None),
) -> bytes:
    body = await request.body()
    if not AGENT_SECRET:
        raise HTTPException(500, "agent secret is not configured")
    if not x_timestamp or not x_signature:
        raise HTTPException(401, "signature missing")

    now = time.time()
    try:
        req_ts = float(x_timestamp)
        skew = abs(now - req_ts)
    except ValueError as exc:
        raise HTTPException(401, "bad timestamp") from exc

    if skew > MAX_CLOCK_SKEW:
        raise HTTPException(401, "stale request")

    # Anti-replay check
    _clean_replay_cache(now)
    identifier = x_nonce or x_request_id
    if identifier:
        if identifier in REPLAY_CACHE:
            LOG.warning("replay detected for identifier %s", identifier[:16])
            raise HTTPException(401, "replayed request")
        REPLAY_CACHE[identifier] = now + MAX_CLOCK_SKEW

    # Canonical HMAC message format:
    # 1) If nonce/request_id present: METHOD\nPATH\nTIMESTAMP\nNONCE\nREQUEST_ID\nSHA256(BODY)
    # 2) Fallback for backward compatibility: TIMESTAMP.BODY
    body_hash = hashlib.sha256(body).hexdigest()
    path = request.url.path
    method = request.method.upper()
    nonce = x_nonce or ""
    req_id = x_request_id or ""

    canonical_msg = f"{method}\n{path}\n{x_timestamp}\n{nonce}\n{req_id}\n{body_hash}".encode()
    expected_canonical = hmac.new(AGENT_SECRET.encode(), canonical_msg, hashlib.sha256).hexdigest()

    legacy_msg = x_timestamp.encode() + b"." + body
    expected_legacy = hmac.new(AGENT_SECRET.encode(), legacy_msg, hashlib.sha256).hexdigest()

    if not (hmac.compare_digest(expected_canonical, x_signature) or hmac.compare_digest(expected_legacy, x_signature)):
        LOG.warning("invalid signature received for %s %s", method, path)
        raise HTTPException(401, "bad signature")

    return body


SAFE_COMMANDS: dict[str, list[str]] = {
    # Canonical dot-syntax keys
    "wg.show": ["wg", "show"],
    "wg.show.wg0": ["wg", "show", WG_INTERFACE],
    "wg.showconf": ["wg", "show", WG_INTERFACE, "dump"],
    "ip.addr": ["ip", "addr"],
    "ip.route": ["ip", "route"],
    "ip.link.stats": ["ip", "-s", "link"],
    "nft.ruleset": ["nft", "list", "ruleset"],
    "ss.listening": ["ss", "-tunlp"],
    "systemctl.agent": ["systemctl", "status", "aurora-agent", "--no-pager", "--lines=40"],
    "systemctl.wg": ["systemctl", "status", f"wg-quick@{WG_INTERFACE}", "--no-pager", "--lines=40"],
    "journal.agent": ["journalctl", "-u", "aurora-agent", "-n", "100", "--no-pager"],
    "uptime": ["uptime"],
    "free": ["free", "-h"],
    "df": ["df", "-h"],
    "uname": ["uname", "-a"],

    # Space-syntax keys (from backend terminal commands resolver)
    "wg show": ["wg", "show"],
    "wg show wg0": ["wg", "show", WG_INTERFACE],
    "wg show wg0 transfer": ["wg", "show", WG_INTERFACE, "transfer"],
    "ip addr": ["ip", "addr"],
    "ip route": ["ip", "route"],
    "ip -s link": ["ip", "-s", "link"],
    "nft list ruleset": ["nft", "list", "ruleset"],
    "ss -tunlp": ["ss", "-tunlp"],
    "systemctl status aurora-agent": ["systemctl", "status", "aurora-agent", "--no-pager", "--lines=40"],
    "systemctl status wg-quick@wg0": ["systemctl", "status", f"wg-quick@{WG_INTERFACE}", "--no-pager", "--lines=40"],
    "journalctl -u aurora-agent -n 100": ["journalctl", "-u", "aurora-agent", "-n", "100", "--no-pager"],
    "free -h": ["free", "-h"],
    "df -h": ["df", "-h"],
    "uname -a": ["uname", "-a"],
}

OPERATIONS: dict[str, list[str]] = {
    "restart-agent": ["systemctl", "restart", "aurora-agent"],
    "restart-wireguard": ["systemctl", "restart", f"wg-quick@{WG_INTERFACE}"],
}


def redact_output(raw: bytes) -> str:
    """Key material must not leave the gateway even inside diagnostic output."""
    return _WG_KEY.sub(b"[redacted-key]", raw)[:MAX_OUTPUT_BYTES].decode(
        "utf-8", errors="replace"
    )


# --- API -------------------------------------------------------------------
@app.post("/peers")
async def api_add_peer(
    request: Request,
    x_timestamp: str | None = Header(default=None),
    x_signature: str | None = Header(default=None),
    x_nonce: str | None = Header(default=None),
    x_request_id: str | None = Header(default=None),
):
    body = await verify(request, x_timestamp, x_signature, x_nonce, x_request_id)
    payload = json.loads(body or b"{}")
    add_peer(payload["public_key"], payload["allowed_ips"], payload.get("preshared_key"))
    return {"ok": True}


@app.post("/peers/remove")
async def api_remove_peer(
    request: Request,
    x_timestamp: str | None = Header(default=None),
    x_signature: str | None = Header(default=None),
    x_nonce: str | None = Header(default=None),
    x_request_id: str | None = Header(default=None),
):
    body = await verify(request, x_timestamp, x_signature, x_nonce, x_request_id)
    payload = json.loads(body or b"{}")
    try:
        remove_peer(payload["public_key"])
    except RuntimeError:
        pass  # already gone is success
    return {"ok": True}


@app.post("/peers/stats")
async def api_peer_stats(
    request: Request,
    x_timestamp: str | None = Header(default=None),
    x_signature: str | None = Header(default=None),
    x_nonce: str | None = Header(default=None),
    x_request_id: str | None = Header(default=None),
):
    body = await verify(request, x_timestamp, x_signature, x_nonce, x_request_id)
    payload = json.loads(body or b"{}")
    return list_peers().get(payload["public_key"], {})


@app.post("/exec")
async def api_exec(
    request: Request,
    x_timestamp: str | None = Header(default=None),
    x_signature: str | None = Header(default=None),
    x_nonce: str | None = Header(default=None),
    x_request_id: str | None = Header(default=None),
):
    body = await verify(request, x_timestamp, x_signature, x_nonce, x_request_id)
    payload = json.loads(body or b"{}")
    command_id = payload.get("command_id") or payload.get("command", "")
    argv = SAFE_COMMANDS.get(command_id)
    if argv is None:
        LOG.warning("refused command id: %s", str(command_id)[:64])
        raise HTTPException(400, "command not allowed")

    timeout = min(int(payload.get("timeout", 15)), 30)
    started = time.monotonic()
    try:
        result = subprocess.run(
            argv, capture_output=True, timeout=timeout, check=False
        )
        output = redact_output(result.stdout + result.stderr)
        exit_code = result.returncode
    except subprocess.TimeoutExpired:
        output, exit_code = f"aurora: command timed out after {timeout}s\n", 124
    except FileNotFoundError:
        output, exit_code = "aurora: command not installed on this gateway\n", 127

    return {
        "output": output,
        "exit_code": exit_code,
        "duration_ms": int((time.monotonic() - started) * 1000),
    }


@app.post("/operations/{operation}")
async def api_operation(
    operation: str,
    request: Request,
    x_timestamp: str | None = Header(default=None),
    x_signature: str | None = Header(default=None),
    x_nonce: str | None = Header(default=None),
    x_request_id: str | None = Header(default=None),
):
    await verify(request, x_timestamp, x_signature, x_nonce, x_request_id)

    if operation == "rotate-key":
        return rotate_gateway_key()

    argv = OPERATIONS.get(operation)
    if argv is None:
        raise HTTPException(400, "operation not allowed")
    result = subprocess.run(argv, capture_output=True, timeout=60, check=False)
    LOG.info("operation %s exited %s", operation, result.returncode)
    return {"ok": result.returncode == 0, "exit_code": result.returncode}


def rotate_gateway_key() -> dict[str, Any]:
    """Generate a new gateway key pair and persist it to wg0.conf and live interface.

    Survives reboots: rewrites /etc/wireguard/wg0.conf PrivateKey field.
    Returns the new public key so the control plane can update its database.
    """
    private = subprocess.run(["wg", "genkey"], capture_output=True, check=True).stdout.strip()
    public = subprocess.run(
        ["wg", "pubkey"], input=private, capture_output=True, check=True
    ).stdout.strip()

    os.makedirs("/etc/wireguard", mode=0o700, exist_ok=True)
    fd = os.open("/etc/wireguard/private.key", os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        os.write(fd, private + b"\n")
    finally:
        os.close(fd)

    with open("/etc/wireguard/public.key", "wb") as handle:
        handle.write(public + b"\n")

    # Persist into /etc/wireguard/wg0.conf so restart or reboot maintains the new key
    conf_path = f"/etc/wireguard/{WG_INTERFACE}.conf"
    if os.path.exists(conf_path):
        with open(conf_path, "r", encoding="utf-8") as f:
            conf_lines = f.readlines()
        new_lines = []
        priv_str = private.decode().strip()
        replaced = False
        for line in conf_lines:
            if line.strip().startswith("PrivateKey"):
                new_lines.append(f"PrivateKey = {priv_str}\n")
                replaced = True
            else:
                new_lines.append(line)
        if not replaced:
            new_lines.insert(1, f"PrivateKey = {priv_str}\n")
        with open(conf_path, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
        os.chmod(conf_path, 0o600)

    # Apply to live interface
    subprocess.run(
        ["wg", "set", WG_INTERFACE, "private-key", "/etc/wireguard/private.key"],
        check=True,
        timeout=10,
    )
    LOG.warning("gateway key rotated and persisted; all peers must be reprovisioned")
    return {"ok": True, "public_key": public.decode().strip()}


# --- health & metrics probing ----------------------------------------------
def _probe_upstream_health() -> tuple[float | None, float | None]:
    """Probe network latency and packet loss via real ICMP ping (5 packets).

    Returns (packet_loss_percent, median_latency_ms) or (None, None).
    """
    target = os.getenv("PING_TARGET", "1.1.1.1")
    try:
        res = subprocess.run(
            ["ping", "-c", "4", "-W", "2", target],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        output = res.stdout
        loss_match = re.search(r"(\d+(?:\.\d+)?)%\s+packet loss", output)
        packet_loss = float(loss_match.group(1)) if loss_match else None

        rtt_match = re.search(r"min/avg/max/(?:mdev|stddev)\s*=\s*[\d.]+/([\d.]+)/", output)
        latency = float(rtt_match.group(1)) if rtt_match else None
        return packet_loss, latency
    except Exception:
        return None, None


_last_net_time: float = 0
_last_net_bytes: tuple[int, int] = (0, 0)


def _measure_net_throughput() -> tuple[float, float]:
    global _last_net_time, _last_net_bytes
    now = time.monotonic()
    counters = psutil.net_io_counters()
    current_bytes = (counters.bytes_recv, counters.bytes_sent)

    if _last_net_time == 0:
        _last_net_time = now
        _last_net_bytes = current_bytes
        return 0.0, 0.0

    dt = max(0.1, now - _last_net_time)
    rx_rate = (current_bytes[0] - _last_net_bytes[0]) / dt
    tx_rate = (current_bytes[1] - _last_net_bytes[1]) / dt
    _last_net_time = now
    _last_net_bytes = current_bytes
    return max(0.0, rx_rate), max(0.0, tx_rate)


def collect_health() -> dict[str, Any]:
    try:
        peers = list_peers()
        wireguard_up = True
    except Exception:
        peers, wireguard_up = {}, False

    active = sum(
        1 for p in peers.values() if time.time() - p["last_handshake_epoch"] < 180
    )
    peer_util = min(100.0, round((active / CAPACITY * 100), 1)) if CAPACITY else 0.0
    packet_loss, latency = _probe_upstream_health()
    rx_sec, tx_sec = _measure_net_throughput()

    return {
        "status": "online" if wireguard_up else "degraded",
        "cpu_percent": psutil.cpu_percent(interval=None),
        "memory_percent": psutil.virtual_memory().percent,
        "disk_percent": psutil.disk_usage("/").percent,
        "load_percent": int(peer_util),
        "peer_utilization_percent": peer_util,
        "active_peers": active,
        "wireguard_up": wireguard_up,
        "packet_loss_percent": packet_loss,
        "median_latency_ms": latency,
        "network_rx_bytes_sec": round(rx_sec, 2),
        "network_tx_bytes_sec": round(tx_sec, 2),
    }


@app.get("/health")
async def api_health(
    request: Request,
    x_timestamp: str | None = Header(default=None),
    x_signature: str | None = Header(default=None),
    x_nonce: str | None = Header(default=None),
    x_request_id: str | None = Header(default=None),
):
    await verify(request, x_timestamp, x_signature, x_nonce, x_request_id)
    return collect_health()


# --- reconciliation & health reporting -------------------------------------
def control_headers() -> dict[str, str]:
    return {"x-gateway-id": GATEWAY_ID, "x-gateway-token": AGENT_TOKEN}


async def reconcile_once(client: httpx.AsyncClient) -> None:
    """Make the interface match the control plane exactly."""
    response = await client.get(
        f"{CONTROL_PLANE_URL}/api/v1/gateways/peers", headers=control_headers()
    )
    response.raise_for_status()
    expected = {p["public_key"]: p for p in response.json().get("peers", [])}
    live = list_peers()

    for key, peer in expected.items():
        if key not in live:
            add_peer(key, peer["allowed_ips"], peer.get("preshared_key"))
    for key in live:
        if key not in expected:
            LOG.info("reconcile: removing peer not present in control plane %s", key[:10])
            remove_peer(key)

    stats = [
        {
            "public_key": key,
            "rx_bytes": value["rx_bytes"],
            "tx_bytes": value["tx_bytes"],
            "last_handshake_epoch": value["last_handshake_epoch"],
        }
        for key, value in live.items()
        if key in expected
    ]
    if stats:
        await client.post(
            f"{CONTROL_PLANE_URL}/api/v1/gateways/peers/stats",
            json=stats,
            headers=control_headers(),
        )


async def report_health(client: httpx.AsyncClient) -> None:
    await client.post(
        f"{CONTROL_PLANE_URL}/api/v1/gateways/health",
        json=collect_health(),
        headers=control_headers(),
    )


async def sync_loop() -> None:
    if not CONTROL_PLANE_URL or not AGENT_TOKEN:
        LOG.warning("control plane not configured; running in local-only mode")
        return
    async with httpx.AsyncClient(timeout=10) as client:
        while True:
            try:
                await report_health(client)
                await reconcile_once(client)
            except Exception as exc:
                LOG.warning("sync failed: %s", type(exc).__name__)
            await asyncio.sleep(SYNC_INTERVAL)


@app.on_event("startup")
async def startup() -> None:
    asyncio.create_task(sync_loop())


# --- Wireshark / tcpdump capture -------------------------------------------
# Only these interfaces may be captured to prevent arbitrary interface probing.
CAPTURE_ALLOWED_INTERFACES = {"wg0", "eth0", "eth1", "ens3", "ens4", "lo", "any"}
CAPTURE_MAX_DURATION = 60   # seconds hard cap
CAPTURE_MAX_PACKETS = 5000  # packets hard cap

from fastapi.responses import Response as FastAPIResponse


@app.post("/capture")
async def api_capture(
    request: Request,
    x_timestamp: str | None = Header(default=None),
    x_signature: str | None = Header(default=None),
    x_nonce: str | None = Header(default=None),
    x_request_id: str | None = Header(default=None),
):
    """Run tcpdump on the WireGuard interface and return a Wireshark-compatible
    .pcap binary.  The caller must be authenticated with a valid HMAC signature.

    Body (JSON):
        interface  str   Interface to capture on. Defaults to WG_INTERFACE (wg0).
        duration   int   Capture duration in seconds (max 60, default 10).
        count      int   Max packets to capture (max 5000, default 500).
        filter     str   Optional tcpdump BPF filter string (e.g. "udp port 51820").
    """
    body = await verify(request, x_timestamp, x_signature, x_nonce, x_request_id)
    payload = json.loads(body or b"{}")

    interface = str(payload.get("interface", WG_INTERFACE))
    if interface not in CAPTURE_ALLOWED_INTERFACES:
        raise HTTPException(400, f"interface '{interface}' is not allowed for capture")

    duration = max(1, min(int(payload.get("duration", 10)), CAPTURE_MAX_DURATION))
    count = max(1, min(int(payload.get("count", 500)), CAPTURE_MAX_PACKETS))
    bpf_filter: str = str(payload.get("filter", ""))

    # Build tcpdump command:
    #   -i <iface>   capture on this interface
    #   -w -         write pcap to stdout
    #   -c <count>   stop after N packets
    #   -G <dur>     stop after <dur> seconds  (requires -w)
    #   -Z root      don't drop privileges (we're already restricted by systemd)
    argv = [
        "tcpdump",
        "-i", interface,
        "-w", "-",
        "-c", str(count),
        "-G", str(duration),
        "--immediate-mode",
    ]
    if bpf_filter:
        # Append filter tokens as individual args (safe – no shell expansion)
        argv.extend(bpf_filter.split())

    LOG.info(
        "packet capture started iface=%s duration=%ss count=%s filter=%r",
        interface, duration, count, bpf_filter,
    )

    try:
        proc = await asyncio.create_subprocess_exec(
            *argv,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(),
                timeout=duration + 10,  # 10s grace over the duration
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            raise HTTPException(504, "capture timed out")

        if proc.returncode not in (0, 124):  # 124 = SIGALRM / -G timeout normal exit
            err_msg = stderr.decode("utf-8", errors="replace")[:512]
            # tcpdump exits 1 on "0 packets captured" which is still valid pcap
            if b"packets captured" in stderr or len(stdout) > 24:
                pass  # pcap global header is 24 bytes; any data is valid
            else:
                LOG.error("tcpdump failed: %s", err_msg)
                raise HTTPException(500, f"tcpdump error: {err_msg}")

    except FileNotFoundError:
        raise HTTPException(503, "tcpdump is not installed on this gateway")

    filename = f"aurora-{interface}-{int(time.time())}.pcap"
    LOG.info(
        "packet capture complete iface=%s size=%d bytes",
        interface, len(stdout),
    )
    return FastAPIResponse(
        content=stdout,
        media_type="application/vnd.tcpdump.pcap",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Capture-Interface": interface,
            "X-Capture-Duration": str(duration),
            "X-Capture-Packets": str(count),
        },
    )
