# The free allowance

Three hours a day, and the number has to be true. Everything here exists
because a client-side timer is worth nothing: anyone can clear app storage,
change the device clock, or reinstall.

## Where the count lives

One document per account per day:

```json
{ "user_id": "...", "date": "2026-09-12", "used_seconds": 4830 }
```

`date` comes from the *server's* clock in the configured reset zone
(`QUOTA_RESET_TIMEZONE`, default UTC). The device clock is not an input to any
authorisation decision anywhere in the codebase.

## How time is charged

At each heartbeat the server computes `now - last_heartbeat` from its own
timestamps and applies it with an atomic `$inc`. Two properties fall out of
that:

- **Concurrency is safe.** Two devices reconnecting at the same instant cannot
  both spend the same second; `$inc` serialises in the database.
- **Suspension cannot overcharge.** The charge is capped at
  `SESSION_STALE_AFTER_SECONDS` (120 s). If Android dozed the app for an hour,
  the most that can be charged at the next contact is two minutes — and a
  client that silent has already been reaped.

## What happens at zero

In this order, which is the whole point:

1. The peer is removed from the gateway. Packets stop.
2. The session is marked `EXPIRED`.
3. The heartbeat response tells the app, which tears the interface down and
   shows the daily-limit state.

If the order were reversed there would be a window where the tunnel still
carried traffic that nobody was counting.

## Attacks it is built against

| Attempt | Why it fails |
|---|---|
| Reinstall the app | Counter is keyed by account, not device |
| Clear app storage | Same |
| Change the device clock | Server timestamps only |
| Block the heartbeat | Reaper closes the session after 120 s and removes the peer |
| Connect two devices at once | `MAX_CONCURRENT_SESSIONS` (default 1); the older session is ended |
| Register many devices | `MAX_DEVICES_PER_FREE_USER` (default 3) |
| Create many accounts | Not solved by the quota engine — see `docs/security.md` on signup abuse; this is the honest weak point of any free tier |

`backend/tests/test_quota.py` and `test_sessions.py` cover the first five rows
directly.

## Changing the allowance

`PUT /api/v1/admin/quota` sets it at runtime (cached in Redis for 60 s). It
applies at the next quota check, so sessions already running are re-measured at
their next heartbeat rather than being cut off mid-connection.
