# Aurora VPN — React Native client

```bash
npm install
npm test          # 21 unit tests, no emulator needed
npm run typecheck
npm run android   # needs a device or emulator
```

**The Gradle wrapper JAR is not in this archive** (binaries are excluded).
Generate it once with a local Gradle 8.11+ install:

```bash
cd android && gradle wrapper --gradle-version 8.11.1
```

Requires Node 18+, JDK 17 and Android SDK 35. `API_BASE_URL` is a build-config
field per build type in `android/app/build.gradle`; the JS layer reads it
through the native module rather than hardcoding a host.

## Why there is still native code

A VPN cannot be written entirely in JavaScript. `VpnService`, the WireGuard Go
backend and Android's per-app routing are native APIs with no JS equivalent, so
`android/app/src/main/java/com/aurora/vpn/AuroraVpnModule.java` bridges them.

It is deliberately thin — five verbs, no product logic:

| Method | What it does |
|---|---|
| `prepare()` | Android's VPN consent dialog (needs an Activity) |
| `up(config)` | Builds a WireGuard `Config` and brings the interface up |
| `down()` | Tears it down |
| `status()` | `up`, byte counters, and **handshake age** |
| `ensureKeyPair()` / `setSecret()` | Keys and tokens in encrypted storage |

Everything else — when to connect, what counts as connected, the quota
heartbeat, backoff, the whole UI — is TypeScript in `src/`.

Two things never cross the bridge: the device private key (generated and used
natively, so a compromised JS bundle cannot leak it) and anything from inside
the tunnel.

## Layout

```
src/design      tokens, theme, Card/IconTile surfaces, splash scene
src/components  icons, power button, flag badges, primitives, traffic chart
src/domain      models and the small amount of maths over them
src/api         HTTP client, secure store, endpoint mapping
src/vpn         engine, native bridge typing, network monitor, selector
src/state       zustand store that mirrors the engine
src/screens     Home, Locations, Diagnostics, Settings, Sign in
android/        native host project + the bridge module (Java)
```

`src/vpn/engine.ts` imports no React Native at all — every dependency is an
interface, wired to reality in `createEngine.ts`. That is what lets the
connection flow, the handshake wait and the quota heartbeat be tested in Node.

See `../docs/mobile.md` for the architecture and `../docs/design-system.md` for
the tokens.
