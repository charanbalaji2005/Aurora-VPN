# WireGuard

No custom protocol and no hand-rolled cryptography exists in this project. The
client uses WireGuard's official `com.wireguard.android:tunnel` library; the
gateways use kernel WireGuard. What this codebase adds is key *distribution*
and peer lifecycle.

## Key custody

| Key | Generated | Stored | Leaves the machine? |
|---|---|---|---|
| Device private | On the phone, natively in `DeviceKeyStore.java` | EncryptedSharedPreferences, Keystore-backed master key, excluded from backup | Never — not even across the JS bridge |
| Device public | On the phone | Control plane, `devices.public_key` | Yes, to the control plane and the chosen gateway |
| Gateway private | On the gateway, `wg genkey` | `/etc/wireguard/private.key`, mode 600 | Never |
| Gateway public | On the gateway | Control plane, sent to clients | Yes |
| Pre-shared key | Control plane, per peer | Peer record; passed to the agent over an HMAC-signed channel | To the gateway and the client only |

Curve25519 cannot be held as a hardware-bound Android Keystore key, so the
honest description is: the private key sits in storage encrypted by a
hardware-backed master key, is never logged, and is never backed up. It is also
never returned to JavaScript — `up()` takes a config with no private key in it
and the native module supplies it — so a compromised bundle cannot exfiltrate
it. The
redaction filter in `backend/app/common/logging.py` also strips anything shaped
like a WireGuard key from log lines, as a second line of defence.

## Provisioning

```
POST /api/v1/vpn/session
  └─ validate quota, device, gateway health
  └─ allocate address from the gateway's /24 (unique index on gateway+address)
  └─ agent: wg set wg0 peer <pubkey> allowed-ips <addr>/32 preshared-key <fd>
  └─ return the client half of the config
```

The pre-shared key is handed to `wg` through a file descriptor in `/dev/shm`
that is unlinked immediately, so it never appears in the process list.

## Reconciliation is what makes revocation real

Every 30 seconds the agent pulls `GET /api/v1/gateways/peers` — the
authoritative list — and makes the interface match it exactly: install what is
missing, **remove anything not on the list**. A failed removal call, an agent
restart, a network partition during revocation: all of them converge within one
cycle. Without this loop, a single dropped API call could leave a revoked
device tunnelling indefinitely.

## Client configuration

- `AllowedIPs = 0.0.0.0/0, ::/0` — a full tunnel. Split tunnelling is done
  through Android's per-package routing (`includeApplication` /
  `excludeApplication`), not by narrowing `AllowedIPs`, because package routing
  is the only mechanism the OS actually enforces.
- `DNS` points at the gateway's own Unbound, configured with `log-queries: no`.
- `MTU 1280` by default — conservative enough to survive mobile networks that
  do not honour path MTU discovery.
- `PersistentKeepalive 25` so NAT mappings on mobile carriers stay alive.

## IPv6

If the gateway carries IPv6 it is routed through the tunnel. If it does not,
`blockIpv6` claims `::/0` and drops it, because the alternative — leaving IPv6
to the local network while the user believes everything is tunnelled — is a
leak that looks exactly like working software.
