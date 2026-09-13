# The gateway terminal

An operator needs to answer "is WireGuard actually up on Singapore?" without
opening an SSH session to a box that carries other people's traffic. That is
what this feature is for, and its entire design follows from one decision:

**The browser never gets a shell.**

Not a restricted shell, not a shell with a filtered allowlist, not a PTY with
input sanitising. There is no shell process anywhere in the path. What looks
like a terminal is a series of individually authorised, individually audited,
read-only commands that happen to be displayed in monospace.

## The path

```
Admin browser
   │  WSS, terminal token bound to one admin and one gateway
   ▼
FastAPI  ── permission check (TERMINAL_OPEN)
         ── fresh MFA step-up (five minute receipt)
         ── session liveness re-checked on every command
         ── exact-match allowlist
         ── audit write BEFORE the result is returned
   │  HMAC-signed, timestamped
   ▼
Gateway agent ── its own copy of the allowlist
   │  subprocess with a fixed argv, shell=False
   ▼
Ubuntu
```

## Why exact matching, not filtering

`app/terminal/commands.py` maps a **literal string** to a fixed argv tuple:

```python
SafeCommand("wg show wg0", ("wg", "show", "wg0"), ...)
```

No part of the request ever becomes an argument. There is no parser to confuse,
no quoting to get wrong, no metacharacter to miss. `wg show; rm -rf /` does not
fail a filter — it simply is not a key in a dictionary.

This is deliberately the least clever file in the repository. Cleverness in a
command allowlist is how RCE happens.

`backend/tests/test_terminal.py` pins it: shell metacharacters, `sudo`, `cat
/etc/wireguard/private.key`, pipes into `nc`, command substitution — each is
refused, and each refusal is recorded while nothing reaches the gateway.

## Defence in depth at the agent

The control plane sends the *key*, not the argv. The agent looks the key up in
its own table (`gateway/agent/main.py`) and refuses anything it does not
recognise. So an attacker who compromises the control plane, or steals a
gateway's HMAC secret, still cannot run arbitrary commands on the host — they
can run `uptime`.

## Nothing here mutates

Every allowlisted command is read-only, and a test asserts it:

```python
mutating = {"restart", "stop", "start", "set", "del", "add", "flush", "reboot", "rm"}
for command in SAFE_COMMANDS.values():
    assert not mutating.intersection(command.argv)
```

Restarting WireGuard, draining a gateway and rotating a key are *named
operations* on the gateway page (`app/gateways/actions.py`), each with its own
permission, a typed confirmation, a written reason and an audit event. A
terminal that can mutate infrastructure is just an RCE endpoint with a nicer
font.

## The grant

Opening a session requires the `write:terminal` permission **and** a step-up
token — proof the admin passed a TOTP check in the last five minutes. A stolen
access token is not enough.

| Control | Value |
|---|---|
| Session lifetime | 15 minutes |
| Idle timeout | 5 minutes |
| Command timeout | 20 seconds |
| Output cap | 64 KB, then truncated |
| Scope | one admin, one gateway |

Liveness is re-checked before *every* command, not just at connect: a session
closed from another tab, or expired mid-use, stops working immediately.

## Redaction

`wg show` legitimately prints public keys, and would print a preshared key if
one were ever echoed. Output passes through the same redaction the logger uses,
plus a line-level filter for anything labelled private key, preshared key,
token, secret or password. The audit record stores the *command* and its
outcome, never the output — otherwise the audit log becomes a copy of
everything the gateway knows.

## What is audited

Every command, before its result is returned: admin, gateway, terminal session,
raw input, resolved command (or null if refused), outcome, exit code, duration.
Refusals are the interesting entries — they are what an attempt looks like.

## What is not implemented

- No PTY, no interactive programs, no tab completion against the filesystem.
- No file transfer, in either direction.
- No multi-gateway broadcast. One session, one gateway, and the gateway's name
  sits above the prompt so nobody runs the right command on the wrong box.
