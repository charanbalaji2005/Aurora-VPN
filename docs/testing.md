# Testing

## What is covered now

```bash
cd backend && python -m pytest -q     # 21 passing
```

- `test_security.py` — password round trip, token type confusion (a refresh
  token must not work as an access token), WireGuard key validation, HMAC
  tampering.
- `test_server_selection.py` — an idle server beats a loaded one, latency hints
  matter, stale health means offline, declared maintenance wins.
- `test_quota.py` — the attack surface: cumulative spend, no negative
  remainder, server-side day bucketing, reinstall changes nothing, paid plans
  unmetered.
- `test_sessions.py` — end to end against a stubbed agent: provisioning
  installs a peer, the client config contains no private key, elapsed *server*
  time is charged, exhaustion removes the peer before the session is marked
  expired, reconnect keeps the remainder, a silent client is reaped.

```bash
cd mobile && npm test                  # 21 passing, Node, ~5s
```

- `format.test.ts` — durations, byte units, and the rule that absent values
  render as `—` while a real zero still renders as zero.
- `quota.test.ts` — the display maths: the ring fraction never exceeds full or
  drops below empty, and only a metered plan can be exhausted.
- `serverSelector.test.ts` — an idle server beats a saturated one, the lowest
  latency does *not* win when that gateway is full, unavailable servers are
  skipped.
- `engine.test.ts` — the whole connection flow against fake dependencies:
  permission is asked for before a session is requested, a refused permission
  never reaches the API, `CONNECTED` is never published before a handshake
  lands, a silent gateway produces `SERVER_UNAVAILABLE` with the city named,
  an exhausted allowance gets its own state rather than a generic failure, and
  disconnecting brings the interface down before closing the session.

That last file is possible because `src/vpn/engine.ts` imports nothing from
React Native — its dependencies are interfaces, and the clock is injected, so
the 15-second handshake timeout is exercised in milliseconds.

`mongomock-motor` stands in for MongoDB so the suite runs in about a second
with no services running.

## What is not covered, and should be before launch

- **The real tunnel.** Nothing here proves a handshake against live kernel
  WireGuard. That needs a gateway VM and a device.
- **Leak tests.** DNS, IPv6 and WebRTC, with the VPN up and while it is
  reconnecting. The reconnect window is where leaks actually happen.
- **Kill-switch behaviour** with Android's always-on VPN enabled.
- **Load.** The quota `$inc` path under concurrent reconnects is the thing to
  break first; `sessions_active` and p95 latency are the signals.
- **Component and UI tests.** The suite covers logic only; nothing renders a
  React tree. Adding them means switching Jest to the `react-native` preset for
  a second project.
- **Device testing** on a phone and a tablet, in both themes, at large font
  scales.

## Manual checklist for a release

0. `npm test` and `npm run typecheck` are green.
1. Connect, confirm a handshake in `wg show` on the gateway.
2. `https://ifconfig.me` returns the gateway address.
3. A DNS leak test shows only the gateway resolver.
4. Flip Wi-Fi to mobile mid-session: the app reconnects, the session survives
   or is cleanly replaced.
5. Kill the app from recents: the notification and heartbeat persist.
6. Let the allowance run out: the tunnel actually stops carrying traffic.
7. Revoke the device from the console: traffic stops within one reconciliation
   cycle (≤30 s).
