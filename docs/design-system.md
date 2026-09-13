# Design system

## The idea

A near-black instrument panel. Flat surfaces, hairline borders, and exactly one
saturated colour on screen at a time. Emerald means the tunnel is genuinely up;
indigo is the action colour; everything else is greyscale.

That restraint is the whole point. A VPN app has two facts to deliver — *am I
protected* and *how much free time is left* — and they land harder on a quiet
screen than on a decorated one. The power button and the live figures carry
each screen; nothing competes with them.

The earlier build of this app used frosted glass over an animated aurora field.
It was replaced: a translucent panel over a moving gradient makes small text
and small numbers harder to read, and this app is mostly small numbers. The
aurora survives in one place only — the splash scene (`AuroraScene.tsx`), where
there is no data to read.

Tokens live in `mobile/src/design/tokens.ts`.

## Colour

| Token | Value | Use |
|---|---|---|
| `base` | `#08090D` | App background |
| `surface` | `#121419` | Cards, rows, tiles |
| `surfaceRaised` | `#181B22` | Tiles on top of cards, inputs |
| `line` | `white 7%` | Hairline borders — the main structural device |
| `textPrimary` | `#F4F6FA` | Values, titles |
| `textSecondary` | `#9AA3B2` | Labels |
| `textMuted` | `#6A7383` | Captions, inactive tabs |
| `protected` | `#22C55E` | **Only** when a handshake has landed |
| `accent` | `#4C6FFF` | Primary action, informational |
| `negotiating` | `#F5A524` | Connecting, reconnecting, favourites |
| `alert` | `#F0526A` | Failure |
| `off` | `#6A7383` | Disconnected |

Each semantic colour has a `…Soft` companion at ~12–14% alpha for badge
backgrounds, so a status never becomes a solid block of colour.

Emerald is rationed deliberately. It appears on the power button's glow, the
"Protected" card and the diagnostics ticks — and nowhere else. When the screen
turns green, it means something.

Light theme keeps the same structure with inverted surfaces and darkened
semantics (`protected` becomes `#0F9D58`) so contrast holds on white. The
product is designed dark, but a phone set to light should not blind anyone.

Colour is never the only signal: every state also carries an icon and a word.

## Type

Two faces. Space Grotesk carries every number the product is about — the
countdown, throughput, latency — because its flat terminals read as instrument
panel, and its tabular figures stop the counter jittering as digits change.
Inter does everything else.

Scale (phone; ×1.06 tablet, ×1.10 large): hero 40 · display 28 · title 22 ·
heading 17 · body 15 · label 13 · meta 12 · metric 17 · metricLarge 24 ·
mono 13. `hero` is the session timer; `metric` is every stat chip and table
value; `mono` is for addresses and keys, which must never be mistaken for
prose.

Both families currently map to the platform sans face so a fresh checkout runs
without font binaries; `tokens.ts` documents the two-constant change to switch
them on. `fontVariant: ['tabular-nums']` is set on the numeric styles either
way, so nothing shifts when the real faces arrive.

## Structure

Three primitives do almost all the work, in `design/Surface.tsx`:

- **`Card`** — `surface` fill, 1px `line` border, 18px radius. No shadow, no
  gradient, no blur. Depth comes from the border and the fill, which is what
  keeps text crisp.
- **`IconTile`** — a rounded square holding an icon on a soft semantic tint.
  This is what makes the settings and account lists scannable without colour-
  coding the text.
- **`Divider`** / **`SectionLabel`** — inset hairline and a small uppercase
  label; the only two ways sections are separated.

## The power button

The one bold element. `PowerButton.tsx` is concentric rings around a power
glyph: an outer glow that only exists when protected, a track ring, and the
button face. Tap target is the whole disc, 188dp on a phone.

Motion is tied to truth:

- **Disconnected** — flat, grey glyph, no motion.
- **Connecting / reconnecting** — a single arc rotates at a constant rate. It
  is a spinner, not a progress bar, because the app genuinely does not know how
  long a handshake will take and a filling bar would be a lie.
- **Connected** — rotation stops, the glow fades in over 400ms and holds.

It stops animating entirely when `AccessibilityInfo.isReduceMotionEnabled()` is
true.

## Screens

| Screen | Carries |
|---|---|
| Splash | The one aurora scene; shown only while the store boots |
| Sign in | Email + password. Nothing else is asked for |
| Home | Location card → power button → three live tiles → allowance card |
| Locations | Search, region filters, flag · city · latency · signal · star |
| Stats | Traffic chart, totals, session duration, remaining allowance |
| Connection details | Tunnel address, exit address, protocol, DNS, counters |
| Settings | Icon-tiled list rows |
| Diagnostics | Eight checks, each a tick or a cross with a real reason |
| Account | Avatar, plan, daily-time progress, devices, sign out |

Home, Locations, Stats and Settings are tabs. Connection details, diagnostics
and account are pushed over the top and come back with one tap — a fifth tab
would be a sign the hierarchy is wrong.

## Icons and flags

`components/Icon.tsx` is a hand-built set of SVG paths on a 24×24 grid. No icon
font package: they need asset linking and ship thousands of glyphs to deliver
the couple of dozen used here.

**No emoji anywhere.** Flags in particular: `FlagBadge` draws each country as a
circular SVG — the real geometry for the countries in the fleet, an ISO-code
disc for anything else. Emoji flags render differently on every OEM skin, are
missing for some territories, and are announced by screen readers as "flag:
Japan" mid-sentence. Every badge takes a real `accessibilityLabel`.

`SignalBars` shows link quality as four bars rather than a number, so the
locations list is scannable at a glance.

## Absent values

A value we do not have renders as an em dash, never as zero.
`formatLatency(null)` is `—`; `0 ms` would be a claim. A real zero still
renders as zero. Both halves are unit-tested, because this is the first rule
that quietly rots.

The disconnected home screen shows `—` in all three tiles for exactly this
reason.

## Responsiveness

`useWindowDimensions` feeds `dimensFor(width)`, resolving one token set for the
tree. Recomputing on every dimension change is what keeps the app correct on a
foldable and in split-screen, not just at two remembered sizes.

| | Phone (<600) | Tablet (600–1239) | Large (≥1240) |
|---|---|---|---|
| Gutter | 20 | 28 | 36 |
| Card radius | 18 | 20 | 22 |
| Power button | 188 | 224 | 248 |
| Content max width | 520 | 900 | 1180 |
| Navigation | bottom tab bar | side rail | side rail |
| Home | single column | connection + locations side by side | same |

Content is capped and centred on large screens. Minimum touch target is 48
everywhere.

## Motion

Subtle and native-driven. Press states scale by 2%; the power glow fades; the
connecting arc rotates; list rows change background on press. Nothing slides,
bounces or floats in.

The only animation React Native cannot drive natively here is the traffic
chart's path, which redraws on new data — roughly every two seconds, and only
while connected.
