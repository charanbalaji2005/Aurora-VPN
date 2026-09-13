# Aurora VPN

A consumer VPN platform: a React Native Android client with a real WireGuard
tunnel, a FastAPI control plane on MongoDB, Linux gateways that carry the
traffic, and a Next.js console to operate it.

The product promise is three hours of free protected browsing per day, counted
server-side so it survives a reinstall.

---

## What is actually implemented

This matters more than a feature list, so it is first.

**Working, with tests**

- Control plane: accounts, refresh-token rotation with replay detection, device
  registry, server selection, session lifecycle, quota engine, usage
  aggregation, admin API, Prometheus metrics. **71 unit tests**, `pytest -q`.
- Role-based access control (five roles) and administrator TOTP with step-up
  tokens for destructive work. See `docs/rbac.md`.
- Gateway terminal: read-only, exact-match allowlist, no shell anywhere in the
  path, every command audited. See `docs/terminal.md`.
- Named gateway operations (restart WireGuard, restart agent, drain, disable,
  enable, rotate key) behind permission + MFA + typed confirmation + reason.
- Quota engine: server-authoritative, atomic, day-bucketed, proven by tests
  that cover reinstall, reconnect, concurrent spend and exhaustion.
- Gateway agent: applies and reconciles WireGuard peers with `wg`, HMAC-signed
  requests, health and byte-counter reporting.
- Gateway host config: nftables policy, resolver without query logging,
  systemd unit with `CAP_NET_ADMIN` and nothing more.
- Mobile client: React Native + TypeScript for the design system, the VPN
  engine, the data layer and every screen, over a thin native module that
  wraps WireGuard's official `tunnel` library. **21 unit tests**, `npm test`,
  no emulator required — the engine has no React Native imports at all.
- Admin console: 15 routes — overview, control center, sessions, users,
  devices, gateways, gateway detail, analytics, health, logs, terminal,
  settings, audit, login. Next.js + shadcn/ui + Radix. Typecheck, lint and
  production build all pass. See `docs/admin.md`.
- Infrastructure, monitoring and CI as described in `infrastructure/`,
  `monitoring/` and `.github/workflows/`.

**Status by component**

| Component | State | Evidence |
|---|---|---|
| Control plane | implemented, tested | 71 tests, `cd backend && pytest -q` |
| Quota engine | implemented, tested | covers reinstall, clock change, concurrency, exhaustion |
| RBAC + MFA | implemented, tested | `test_rbac.py`, `test_mfa.py` |
| Terminal | implemented, tested | `test_terminal.py` — injection, refusals, redaction, timeouts |
| Gateway operations | implemented, tested | `test_gateway_actions.py` |
| Gateway agent | implemented, **not run on a host** | no Ubuntu box in this environment |
| Admin console | implemented, builds clean | `npm run typecheck && lint && build` |
| Mobile client | implemented, tested logic | 21 tests; never compiled for Android |
| Real tunnel | **unproven** | no handshake has happened against a live gateway |
| Terraform / Ansible | written, never applied | no cloud account |
| Monitoring | config written, never scraped | no Prometheus instance |

**Written but not yet run against hardware**

The TypeScript logic is tested and passing, but the app has not been built on
this machine (no Android SDK or Node modules here) and the tunnel has not been
brought up against a live gateway. Treat the first `npm run android` and the
first real handshake as the next milestone, not a formality — `docs/roadmap.md`
gives the order.

**Deliberately not built**

- Payments and paid plans. The `plan` field exists and unmetered accounts work;
  there is no billing integration.
- A fleet-wide kill switch. Taking the whole service down is a sequence of
  individually confirmed per-gateway decisions, on purpose.
- Application log shipping. `/logs` shows the audit and security event stream,
  which is what this system records; stdout goes to your platform's log sink.
- iOS and desktop clients.
- The split-tunnel app picker screen (the engine, the preference and the
  native routing path all exist; the picker UI does not).
- On-device latency probing. Locations show no latency number rather than an
  invented one; server choice falls back to load and health.
- Obfuscation / pluggable transports for censored networks.

---

## Layout

```
backend/       FastAPI control plane + tests
gateway/       Agent, install scripts, nftables policy
mobile/        React Native client + its native VPN module
admin/         Next.js operations console
infrastructure/ Terraform (gateway fleet) + Ansible
monitoring/    Prometheus rules, Grafana dashboard
docs/          Architecture, security, privacy, operations
```

## Running it locally

```bash
cp .env.example .env
# Generate real secrets even for local work:
python -c "import secrets;print('JWT_SECRET='+secrets.token_urlsafe(48))" >> .env

make up                  # control plane, Mongo, Redis, admin, Prometheus, Grafana
make seed ADMIN=you@example.com PASSWORD='a-long-password'
make test-backend
```

API on `:8000`, admin console on `:3000`, Grafana on `:3001`.

A gateway cannot run in Docker — it needs kernel WireGuard and `NET_ADMIN` on a
real host. Provision one with `gateway/scripts/install-gateway.sh`, then point
it at your control plane with `gateway/scripts/register-gateway.sh`.

## Building the app

```bash
cd mobile
npm install
npm test                 # logic suite, runs in Node
npm run android          # device or emulator
```

`API_BASE_URL` is a build-config field per build type in
`mobile/android/app/build.gradle`; JavaScript reads it through the native
module rather than hardcoding a host.

A VPN cannot be written entirely in JavaScript — `VpnService`, the WireGuard Go
backend and per-app routing are native APIs. One module bridges them
(`AuroraVpnModule.java`, five verbs, no product logic) and everything else is
TypeScript. `mobile/README.md` explains where the line is and why.

---

## The two design decisions worth knowing

**The server owns the clock.** Nothing about the free allowance is decided on
the phone. The app displays what `/api/v1/quota` reports and nothing else. Time
is charged from server timestamps at each heartbeat, capped so an app the OS
suspended cannot be billed for hours it could not have used. When the allowance
runs out the control plane removes the WireGuard peer from the gateway *before*
it marks the session expired, so the tunnel stops carrying packets rather than
the UI merely claiming it has.

**"Connected" means a handshake happened.** The engine publishes `CONNECTED`
only after the control plane authorised a session, the WireGuard backend
brought the interface up, *and* a real handshake completed. An interface with
no handshake protects nothing, and showing a shield over it would be a lie the
user cannot check.

Further reading: `docs/architecture.md`, `docs/quota.md`, `docs/security.md`,
`docs/privacy.md`, `docs/rbac.md`, `docs/terminal.md`, `docs/admin.md`,
`docs/design-system.md`, `docs/mobile.md`.

## Licence and legal

WireGuard is a registered trademark of Jason A. Donenfeld. Running a VPN
service carries legal obligations that vary by jurisdiction — data retention,
lawful-intercept regimes, abuse handling and what you may honestly claim in
marketing. `docs/privacy.md` describes what this code stores; it is not legal
advice.
