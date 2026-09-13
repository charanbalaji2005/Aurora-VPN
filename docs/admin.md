# Admin console

Next.js 14 (App Router), TypeScript, Tailwind, shadcn/ui over Radix
primitives, Lucide icons, Recharts.

```bash
cd admin
npm install
npm run typecheck && npm run lint && npm run build
npm run dev            # http://localhost:3000
```

`NEXT_PUBLIC_API_URL` points at the control plane.

## Design

Near-black, low chroma, hairline borders. The contrast between sidebar and
content is about two percent of luminance, because structure should be readable
without being the loudest thing on screen. No gradients, no glass, no oversized
cards — density is the feature. An operator looking at a degraded gateway wants
rows.

Colour is semantic and rationed: green operational, amber degraded, red down,
blue informational, and nothing else is coloured at all. Status is never
carried by colour alone — every badge has a dot, a word, and a shape.

Numbers are tabular everywhere (`.tabular`), so a polling table does not jitter
as digits change.

## Routes

| Route | What it does |
|---|---|
| `/` | Overview: metrics, 14-day chart, gateway table |
| `/control-center` | Incident view: fleet state, regions, live sessions, per-gateway drain |
| `/sessions` | Live sessions, detail drawer, terminate |
| `/users` | Accounts, filters, detail sheet with devices and usage |
| `/devices` | Registered devices, revoke |
| `/gateways` | Fleet cards |
| `/gateways/[id]` | Health, privileged operations, configuration, events |
| `/analytics` | Traffic, sessions, per-gateway, end reasons |
| `/health` | Live service checks and agent freshness |
| `/logs` | Operational event stream, monospace, filterable |
| `/terminal` | Read-only gateway terminal (see `terminal.md`) |
| `/settings` | Free allowance, deployment config, MFA enrolment |
| `/audit` | 90-day administrative audit trail |
| `/login` | Email + password |

Navigation, including which of these appear at all, is rendered from the
permission list returned by `GET /admin/me`.

## Four states, everywhere

Every data surface handles loading (skeletons, not blank screens), error, empty
and data. The error state shows the server's message and a retry, never a stack
trace, and recognises `permission_denied` to explain rather than offer a retry
that will fail again. Empty states say what would make data appear — "a gateway
appears here the moment its agent registers" rather than "no gateways".

Polling is separate from first load, so a refreshing table does not flash a
skeleton every fifteen seconds.

## No mock data

Every figure comes from the control plane. There are no fixtures, no seeded
charts and no placeholder rows anywhere in `admin/`. If the API returns nothing,
the console shows an empty state and says so.

Where a number genuinely is not known, it renders as an em dash — never zero.
`0 ms` claims a measurement.

## Command palette

⌘K navigates. It deliberately cannot *do* anything: no "disconnect session", no
"drain gateway". Destructive work needs a typed confirmation and an MFA code,
and a fuzzy-matched palette is the wrong place for it.

## Verified

`npm run typecheck`, `npm run lint` and `npm run build` all pass — 15 routes
compiled. What has *not* been done is running it against a live control plane
with real data in it; the API shapes come from the FastAPI handlers, but the
end-to-end round trip is untested.
