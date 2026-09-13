# Privacy

A VPN is a promise about what you do *not* keep. This document is the
engineering statement of that promise, written against the code rather than the
marketing.

## What is stored

| Data | Where | Why | Retention |
|---|---|---|---|
| Email, password hash | `users` | Sign-in, and to key the daily allowance | Until the account is deleted |
| Device name, platform, WireGuard **public** key | `devices` | Building peers | Until revoked |
| Session start/end, duration, gateway, byte totals | `vpn_sessions`, `usage_records` | Charging the allowance, capacity planning | 30 days (TTL index) |
| Daily seconds used | `daily_quotas` | The allowance itself | Rolling |
| Admin and security events | `audit_events` | Accountability | 90 days (TTL index) |

## What is not stored

- Browsing history, visited domains, destination addresses or ports.
- DNS queries. The gateway resolver runs with `log-queries: no` and
  `log-replies: no`.
- Packet contents. The gateway forwards; it does not inspect.
- Source IP addresses in any durable record. They appear transiently in rate
  limiter keys in Redis with a 60-second expiry, and in nothing else.
- Advertising identifiers, device fingerprints or location.

## Why byte counters are kept but destinations are not

Counters are two integers per session and are needed for capacity planning and
abuse signals. Destinations would be a log of what a person did — precisely the
thing a VPN exists to avoid producing. The gateway never writes them down, so
there is nothing to hand over, subpoena or leak.

## Logging discipline

`backend/app/common/logging.py` redacts any field named like a secret and
regex-strips anything shaped like a WireGuard key from every log line, so a
careless `log.info(payload)` cannot leak key material. Sentry is initialised
with `send_default_pii=False`.

## On the phone

- The device private key, the access and refresh tokens and the user's
  preferences are all in EncryptedSharedPreferences under a hardware-backed
  master key, and `data_extraction_rules.xml` excludes everything from cloud
  backup and device transfer. Tokens deliberately do not go in AsyncStorage,
  which is a plaintext SQLite file.
- `QUERY_ALL_PACKAGES` is requested for one reason: listing apps for split
  tunnelling. The list never leaves the device.

## Honest limits

- The control plane can see *when* an account connected, for how long, and to
  which city. That is the minimum required to enforce a time-based allowance.
  A service with no accounts and no allowance could avoid it; this one cannot.
- A gateway operator with root can observe traffic in flight. That is true of
  every VPN, and the reason gateway hardening and access control matter more
  than the wording of a policy.
- Legal obligations vary by jurisdiction and can compel retention that
  contradicts this document. Where you place gateways is a privacy decision.
