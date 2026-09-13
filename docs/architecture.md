# Architecture

## The separation that everything else follows

There are two planes and they never mix.

**Control plane** (`backend/`) decides *who may connect, to where, for how
long*. It holds accounts, devices, peers, sessions and the quota counter. It
handles no user packets and has no route to them.

**Data plane** (`gateway/`) carries the packets. Each gateway runs kernel
WireGuard plus a small agent that installs the peers the control plane asks
for. It holds no account data — a compromised gateway exposes the traffic
passing through it at that moment and nothing else, no user list, no history.

The phone talks to both: HTTPS to the control plane, WireGuard UDP straight to
the gateway. Traffic never transits the control plane, so control-plane
capacity has nothing to do with how much bandwidth the service can carry.

```
                 HTTPS (auth, sessions, quota)
   ┌─────────┐ ───────────────────────────────▶ ┌──────────────────┐
   │  React  │                                   │  Control plane   │
   │ Native  │                                   │ FastAPI + Mongo  │
   └────┬────┘                                   └───────┬──────────┘
        │                                                │ signed HTTPS
        │ WireGuard UDP (all user traffic)                │ (add/remove peer)
        │                                                ▼
        └──────────────────────────────────▶  ┌──────────────────────┐
                                               │ Gateway: wg0 + agent │
                                               │  nftables, resolver  │
                                               └──────────┬───────────┘
                                                          │
                                                     the Internet
```

## Connecting, step by step

1. **Sign in.** Argon2id password check, access token (15 min) and refresh
   token (30 days, single use, rotating).
2. **Register the device.** The phone generates a Curve25519 pair natively in
   `DeviceKeyStore.java` and sends only the public key — the private half never
   reaches JavaScript. A device without a
   registered key has nothing a gateway could build a peer from.
3. **Start a session.** The client posts its measured latencies; the control
   plane scores every healthy gateway on load, headroom, latency and health,
   picks one, allocates a tunnel address, and asks that gateway's agent to
   install the peer.
4. **Receive the client config.** Addresses, DNS, MTU, the gateway's *public*
   key, the endpoint and an optional pre-shared key. No private key ever
   crosses the wire in either direction.
5. **Bring the tunnel up**, wait for a handshake, then publish `CONNECTED`.
6. **Heartbeat every 30 s.** The server charges elapsed server time, returns
   the authoritative quota, and ends the session when the allowance is gone.
7. **Disconnect** (or get reaped after 120 s of silence). The peer is removed
   from the gateway either way.

## The administrative path

The console never talks to a gateway. It talks to the control plane, which
holds the permission check, the MFA requirement and the audit write, and only
then signs a request to the agent.

```
Admin browser ──HTTPS/WSS──► Control plane ──HMAC, timestamped──► Gateway agent
                             │
                             ├─ permission check
                             ├─ MFA step-up
                             ├─ typed confirmation + reason
                             └─ audit event
```

That ordering is the point: every privileged thing that happens to a gateway
has a name, a reason and an operator attached to it before it happens.

## Why MongoDB

The write path that matters is `daily_quotas`: a single atomic `$inc` on one
document per user per day, which is exactly what a document store does well.
Sessions are short-lived documents with a TTL-shaped lifecycle, and the peer
table is a small keyed set per gateway. There are no multi-table joins in the
hot path, so a relational schema would buy little here. Every index in
`backend/app/common/db.py` backs a query that actually runs.

Redis is a cache and a rate limiter, never a source of truth: when it is down
the API keeps serving and limits fail open with a warning.

## Failure behaviour

| Failure | What happens |
|---|---|
| Gateway stops reporting health | Marked offline after 90 s; no new sessions are placed there |
| Gateway unreachable during provisioning | Session start fails with `gateway_unreachable`; the app offers another location |
| Client stops heartbeating | Reaper closes the session and removes the peer after 120 s |
| Peer removal call fails | Peer is flagged `pending_removal`; the agent's reconciliation loop drops it on the next cycle |
| Redis down | Rate limits fail open, quota still exact (it lives in Mongo) |
| Control plane down | Existing tunnels keep working until their session is reaped; no new connections |

That last row is deliberate. The control plane is not in the packet path, so an
outage degrades signup and reconnection rather than cutting everyone off
mid-session.
