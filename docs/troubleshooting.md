# Troubleshooting

## "Connecting" never becomes "Protected"

The interface came up but no handshake landed. In order of likelihood:

- UDP 51820 blocked between the phone and the gateway — try mobile data to rule
  out the local network.
- Wrong `endpoint_host` in the server record (check `GET /api/v1/servers`).
- The peer was never installed: `wg show wg0` on the gateway should list the
  device's public key. If not, look for `gateway.unreachable` or
  `peer.provision` failures in the control-plane logs.
- Clock skew over 300 s between the control plane and the gateway — agent
  requests are rejected as replays.

## The tunnel is up but nothing loads

- `nft list ruleset` — the forward chain must accept `wg0 → <WAN>` and the nat
  table must masquerade the VPN subnet.
- `sysctl net.ipv4.ip_forward` must be 1.
- MTU. Drop the client MTU to 1280 (the default) or lower; some mobile
  carriers black-hole larger packets silently.

## DNS does not resolve inside the tunnel

Unbound must be listening on the gateway's tunnel address and the input chain
must allow port 53 from `wg0`. `dig @10.20.2.1 example.com` from a connected
client is the direct test.

## Sessions end after two minutes

That is the reaper doing its job: heartbeats are not arriving. Check that the
app can reach the control plane *through* the tunnel — if `AllowedIPs` covers
the API and the gateway cannot route to it, the client goes silent the moment
it connects.

## "That location is unavailable" for a server that looks fine

`effective_status` is computed, not declared. A gateway whose last health
report is older than 90 seconds is treated as offline no matter what its stored
status says. Check the agent is running and reaching
`POST /api/v1/gateways/health`.

## The app builds but the tunnel never starts

Check the native module is registered: `AuroraVpnPackage` must be in
`MainApplication.getPackages()`, and `NativeModules.AuroraVpn` must be defined
in JS. A missing module shows up as "cannot read property 'prepare' of
undefined" on the first Connect.

## Quota seems wrong

`GET /api/v1/quota` is authoritative — compare it with the `daily_quotas`
document. Remember charges are capped at 120 s per heartbeat interval, so a
suspended app shows less usage than wall-clock time, deliberately.

## Admin console shows nothing

The API rejects non-admin tokens; the console does not hide the pages. Confirm
`is_admin` on the account (`scripts/seed.py` sets it) and that
`ADMIN_ORIGINS` includes the console's origin, or CORS will block every call.
