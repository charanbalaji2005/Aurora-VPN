# Security

## Authentication

- Argon2id (`t=3, m=64MiB, p=2`) for passwords; rehash on login when parameters
  change.
- Access tokens live 15 minutes. Refresh tokens live 30 days, are **single
  use**, and rotate on every refresh.
- Refresh tokens are stored only as SHA-256 hashes, so a database leak cannot
  be replayed against the API.
- Replaying a spent refresh token deletes the entire token family and writes an
  `auth.refresh_replay` audit event. That is theft detection, and the user is
  signed out on purpose.
- The unknown-email login path still performs a hash comparison, so response
  timing does not enumerate accounts.

## Gateway trust

Gateways are servers, not users. They register once with a bootstrap secret and
receive their own token (for calling the control plane) and secret (for
verifying calls from it). Control-plane requests to an agent are HMAC-SHA256
signed over `timestamp . body` with a 300-second skew window, so a captured
request cannot be replayed later. A gateway can only ever touch its own record.

## Administrator access

Five roles, a permission matrix and TOTP with short-lived step-up tokens — the
detail is in `docs/rbac.md`. The two properties that matter here: support staff
cannot reach infrastructure, and a stolen console session cannot drain a
gateway without a fresh second factor.

## The gateway terminal

A read-only, exact-match command allowlist with no shell anywhere in the path,
enforced twice (control plane and agent), audited per command, redacted on the
way back. Full reasoning in `docs/terminal.md`. The short version: there is no
input a browser can send that becomes an argument to a process on a gateway.

## Transport

- HTTPS only from the app. `usesCleartextTraffic` is off by default on
  targetSdk 28+ and nothing in the manifest re-enables it, so the control
  channel cannot silently fall back to plaintext — a VPN client that
  negotiates its own control channel down is worse than useless. Certificate
  pinning is *not* implemented; add it via a network security config before a
  public release.
- HSTS, `nosniff`, `no-referrer` and `no-store` on API responses; a CSP on the
  admin console.
- Nothing logs a request body. Bodies carry tokens and, in the session
  response, peer key material.

## Rate limiting and abuse

Sliding windows in Redis: 10/min on auth per address, 8 per 5 min per email
(defeats stuffing that rotates source addresses), 120/min general, 20/min on
session starts per account. Limits fail *open* with a warning when Redis is
down, because a cache outage must not take the VPN offline.

`abuse/service.py` derives signals from data we already hold — session count in
24 h, active devices, reconnect churn — and never from device fingerprinting or
advertising identifiers. Suspension terminates sessions and revokes peers
immediately.

**The honest gap:** mass account creation. Email-only signup with a generous
free tier is farmable, and nothing in this repository stops someone scripting a
thousand accounts. Closing it means email verification, a proof-of-work or
CAPTCHA on registration, or per-address signup limits — deliberate product
decisions, not code that can be quietly added. Until one is made, the free tier
is farmable and you should plan capacity accordingly.

## Gateway hardening

- nftables: default-drop input and forward; **no client-to-client traffic**
  (a VPN is not a LAN); no pivoting into RFC1918 space from inside the tunnel;
  DNS only to the gateway's own resolver; MSS clamping.
- The agent runs with `CAP_NET_ADMIN` and nothing else, under
  `ProtectSystem=strict` with a two-path `ReadWritePaths`.
- Unbound with `log-queries: no`, `qname-minimisation: yes`, refusing anything
  off-tunnel.
- SSH restricted to a bastion CIDR in the Terraform firewall, never `0.0.0.0/0`.

## Secrets

Nothing secret has a working default. `assert_production_ready()` refuses to
start in production with a weak or short `JWT_SECRET` or an unset gateway
bootstrap secret. Android signing keys are injected from CI secrets and never
committed; `.gitignore` covers `*.jks`, `.env` and Terraform state.

## What a compromise gets you

| Compromised | Exposure |
|---|---|
| One gateway | Traffic transiting it *at that moment*. No account data, no user list, no history — the gateway has none. |
| Control plane database | Emails, Argon2 hashes, device public keys, session durations. No traffic, no destinations, no private keys. |
| An admin session | Whatever that role may read, plus support-level writes. Not the terminal and not gateway operations: those need a fresh TOTP the attacker does not have. |
| A device | That device's tunnel. Revoking it removes the peer from every gateway within one reconciliation cycle. |
| The JS bundle | The UI and the API calls it can make with the user's own tokens. Not the WireGuard private key, which is generated and used natively and has no read path across the bridge. |
