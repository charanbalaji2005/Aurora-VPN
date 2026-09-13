# Mobile client (React Native)

## The shape of it

React Native + TypeScript for everything, plus one native module for the
things Android will not expose to JavaScript.

```
src/design      tokens, theme provider, Card/IconTile surfaces, splash scene
src/components  icon set, power button, flag badges, primitives, chart
src/domain      models and the maths over them
src/api         HTTP client, encrypted token store, endpoint mapping
src/vpn         engine, native bridge typing, network monitor, selector
src/state       zustand store mirroring the engine
src/screens     Home, Locations, Diagnostics, Settings, Sign in
android/        native host project and AuroraVpnModule.java
```

## Where the native/JS line is drawn

It is drawn as far towards JavaScript as the platform allows.

Native, because there is no alternative: `VpnService.prepare()` needs an
Activity; the WireGuard tunnel is a Go library reached over JNI; per-app
routing is `Interface.Builder.includeApplication`; the ongoing notification is
a foreground service; and encrypted storage is `EncryptedSharedPreferences`.

TypeScript, because it can be: when to connect, what "connected" means, the
quota heartbeat, the reconnect policy, server choice, every screen.

The module exposes verbs and returns facts. It holds no product logic, so
there is no second state machine hiding in Java that could disagree with the
one in `engine.ts`.

**The private key never crosses the bridge.** `ensureKeyPair()` returns only
the public half; `up()` takes a config with no private key in it and the module
reads the private key from local storage itself. A compromised JS bundle, or
someone's stray `console.log(config)`, cannot leak it.

## State ownership

`VpnEngine` is the only thing allowed to decide the connection state. The
zustand store subscribes to its snapshot and mirrors it; screens read the
store. There is no second source of truth, so the screen cannot claim
protection the tunnel does not have.

`CONNECTED` requires three things in order: the control plane authorised a
session, the native backend brought the interface up, and a handshake actually
completed. `status()` returns `handshakeAgeSeconds` as **null** when there has
never been one — not zero — precisely so the engine cannot mistake "no
handshake yet" for "handshake one second ago".

## Testability

`src/vpn/engine.ts` imports nothing from `react-native`. Its dependencies are
four interfaces (`api`, `native`, `isOnline`, `watchNetwork`) plus a clock,
wired to reality in `createEngine.ts`. The result is that the full connection
flow — permission, session, handshake wait, failure classification, teardown —
runs under Jest in Node, in about five seconds, with no emulator.

Injecting the clock is what makes the 15-second handshake timeout testable in
milliseconds.

## The bits React Native makes harder, and what was done about them

**Blur.** There is no `backdrop-filter`, and the community blur views on
Android are expensive and inconsistent across OEM skins. The app does not need
one: the interface is flat dark surfaces with hairline borders, so depth comes
from the border and the fill. The earlier frosted-glass build was dropped for
readability as much as performance — translucent panels over a moving gradient
make small numbers hard to read, and this app is mostly small numbers.

**Animation on the JS thread.** Everything animated uses the native driver:
the power button's glow animates opacity, the connecting arc animates a view
rotation rather than an SVG transform. The one exception is the traffic
chart's path, which is redrawn from new samples about every two seconds while
connected and not animated at all.

**Icons and flags.** No icon font package and no emoji. `components/Icon.tsx`
is hand-written SVG paths on a 24×24 grid, and `FlagBadge.tsx` draws each
country as a circular SVG — real geometry for the fleet, an ISO-code disc for
anything else. Emoji flags render differently on every OEM skin, are missing
for some territories, and are read aloud as "flag: Japan" mid-sentence.

**Navigation.** Two pieces of `useState` — the active tab, and an optional
pushed screen (connection details, diagnostics, account) — not a router. There
are no deep links, no stacks to restore and no route params in this app, so a
router would be a large dependency re-implementing `useState`.

## Responsiveness

`useWindowDimensions` feeds `dimensFor(width)`, which resolves one token set
for the tree. Recomputing on every dimension change is what makes the app
correct on a foldable and in split-screen, not just at two remembered sizes.

| | Phone (<600) | Tablet (600–1239) | Large (≥1240) |
|---|---|---|---|
| Gutter | 20 | 28 | 36 |
| Power button | 188 | 224 | 248 |
| Content max width | 520 | 900 | 1180 |
| Navigation | bottom tab bar | side rail | side rail |
| Home | single column | connection + locations side by side | same |

## Known gaps

- The split-tunnel app picker screen is not built; the engine, the preference
  and the native `includeApplication`/`excludeApplication` path all are.
- Latency probing is not implemented on this client. The engine sends whatever
  hints it has (none, initially) and the control plane scores on load and
  health; a TCP-connect probe would need a raw socket module. Locations show no
  latency number rather than a fabricated one.
- `autoConnect` is stored but there is no boot receiver wired to it yet.
- No component/UI tests — the suite covers logic only.
