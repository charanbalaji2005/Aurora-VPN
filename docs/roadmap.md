# Where to go from here

The code is written; the parts that touch real hardware are unproven. Do these
in order — each one is cheap to fix and expensive to skip.

1. **Build the app.** `npm install && npm run android` on a machine with the
   Android SDK. The TypeScript logic is tested, but nothing here has been
   through Metro or the Android toolchain — expect autolinking and native
   build fixes first.
2. **Stand up one gateway** on a small VM. Verify `wg show`, the agent's sync
   loop and the nftables policy before any client touches it.
3. **First real handshake.** Point a debug build at that gateway and connect.
   This is the milestone that proves the design.
4. **Leak testing.** DNS, IPv6, and specifically during reconnection.
5. **Second region**, to exercise selection and failover with more than one
   candidate.
6. **Quota under load.** Script many concurrent reconnects and confirm the
   counter stays exact.
7. **Kill switch** verified against Android always-on VPN.
8. **Monitoring with real traffic** — tune the alert thresholds in
   `monitoring/prometheus/alerts.yml` against observed behaviour rather than
   guesses.
9. **Decide the signup-abuse policy** (see `docs/security.md`). This is a
   product decision that gates the free tier's economics.
10. **Then** build the split-tunnel picker, on-device latency probing, the
    auto-connect boot receiver, payments, and anything else on the wish list.
