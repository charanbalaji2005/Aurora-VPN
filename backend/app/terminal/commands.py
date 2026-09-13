"""The command allowlist.

This is the security boundary of the whole terminal feature, so it is
deliberately the least clever file in the repository.

Commands are matched by **exact string**, and each maps to a fixed argv list.
There is no shell, no interpolation, no user-supplied arguments, no flags
parsed at runtime. That removes injection as a category rather than trying to
filter it: there is no input that can reach a shell, because no shell exists
and no token from the request is ever placed into argv.

Anything that changes state is NOT here. Restarting WireGuard, draining a
gateway or rotating a key are explicit API endpoints with typed confirmation,
a reason and an audit event -- see app/gateways/actions.py. A terminal that can
mutate infrastructure is just an RCE endpoint with a nicer font.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SafeCommand:
    key: str
    argv: tuple[str, ...]
    description: str
    category: str


SAFE_COMMANDS: dict[str, SafeCommand] = {
    c.key: c
    for c in (
        SafeCommand("wg show", ("wg", "show"), "WireGuard interfaces and peers", "wireguard"),
        SafeCommand("wg show wg0", ("wg", "show", "wg0"), "The Aurora tunnel", "wireguard"),
        SafeCommand(
            "wg show wg0 transfer",
            ("wg", "show", "wg0", "transfer"),
            "Per-peer byte counters",
            "wireguard",
        ),
        SafeCommand("ip addr", ("ip", "addr"), "Interface addresses", "network"),
        SafeCommand("ip route", ("ip", "route"), "Routing table", "network"),
        SafeCommand("ip -s link", ("ip", "-s", "link"), "Link statistics", "network"),
        SafeCommand("nft list ruleset", ("nft", "list", "ruleset"), "Firewall policy", "network"),
        SafeCommand("ss -tunlp", ("ss", "-tunlp"), "Listening sockets", "network"),
        SafeCommand(
            "systemctl status aurora-agent",
            ("systemctl", "status", "aurora-agent", "--no-pager"),
            "Gateway agent service",
            "system",
        ),
        SafeCommand(
            "systemctl status wg-quick@wg0",
            ("systemctl", "status", "wg-quick@wg0", "--no-pager"),
            "WireGuard service",
            "system",
        ),
        SafeCommand(
            "journalctl -u aurora-agent -n 100",
            ("journalctl", "-u", "aurora-agent", "-n", "100", "--no-pager"),
            "Recent agent log",
            "system",
        ),
        SafeCommand("uptime", ("uptime",), "Load average and uptime", "system"),
        SafeCommand("free -h", ("free", "-h"), "Memory", "system"),
        SafeCommand("df -h", ("df", "-h"), "Disk", "system"),
        SafeCommand("uname -a", ("uname", "-a"), "Kernel", "system"),
    )
}

# Typed by an admin who is used to a real shell. Answered with a specific
# refusal rather than "command not found", because a vague error invites
# someone to keep probing for a gap that does not exist.
KNOWN_REFUSALS = {
    "sudo": "There is no sudo here. Privileged operations are explicit gateway actions.",
    "bash": "This is not a shell. Only the listed read-only commands run.",
    "sh": "This is not a shell. Only the listed read-only commands run.",
    "rm": "The terminal cannot modify the gateway filesystem.",
    "vi": "There is no editor. Configuration is managed by the control plane.",
    "nano": "There is no editor. Configuration is managed by the control plane.",
    "cat": "Reading arbitrary files is not allowed. Use the listed commands.",
    "curl": "The terminal cannot make outbound requests from a gateway.",
    "wget": "The terminal cannot make outbound requests from a gateway.",
    "ssh": "The terminal cannot open connections from a gateway.",
    "systemctl": "Only the two listed status commands are available.",
    "wg-quick": "Use the gateway actions to restart WireGuard.",
    "reboot": "Use the gateway actions instead of rebooting from a terminal.",
}


def resolve(command: str) -> SafeCommand:
    """Exact match or a specific, honest refusal."""
    normalised = " ".join(command.strip().split())
    if normalised in SAFE_COMMANDS:
        return SAFE_COMMANDS[normalised]

    head = normalised.split(" ")[0] if normalised else ""
    if head in KNOWN_REFUSALS:
        raise CommandNotAllowed(KNOWN_REFUSALS[head])
    if any(ch in normalised for ch in ";|&$`><\n"):
        raise CommandNotAllowed(
            "Shell syntax is not interpreted. Commands are matched exactly, one at a time."
        )
    raise CommandNotAllowed(
        f"'{normalised[:40]}' is not an allowed command. Type 'help' to list what is."
    )


class CommandNotAllowed(Exception):
    pass


def catalogue() -> list[dict[str, str]]:
    return [
        {"command": c.key, "description": c.description, "category": c.category}
        for c in SAFE_COMMANDS.values()
    ]
