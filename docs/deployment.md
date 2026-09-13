# Deployment

## Order of operations

1. **Control plane first.** It must exist before a gateway can register.
2. **One gateway**, verified end to end with a real phone.
3. **The rest of the fleet**, once the first one demonstrably works.

## Control plane

```bash
docker build -t aurora/control-plane backend/
```

Run it behind a TLS terminator with at least two replicas. Required
environment: `ENVIRONMENT=production`, a `JWT_SECRET` of 32+ random characters,
`GATEWAY_BOOTSTRAP_SECRET`, `MONGO_URI`, `REDIS_URL`, `ADMIN_ORIGINS`. The app
refuses to start in production if the secrets are weak — that check is
`assert_production_ready()` and it is not a formality.

MongoDB should be a replica set with authentication and encryption at rest.
Indexes are created at startup. `/api/v1/health/ready` is the readiness probe
(Mongo required, Redis optional); `/api/v1/health/live` is liveness.

## Gateways

```bash
# On the gateway host, as root:
GATEWAY_ID=sg-sin-01 VPN_SUBNET=10.20.2.0/24 gateway/scripts/install-gateway.sh

CONTROL_PLANE_URL=https://api.aurora.example \
BOOTSTRAP_SECRET=... GATEWAY_ID=sg-sin-01 \
COUNTRY=Singapore COUNTRY_CODE=SG CITY=Singapore \
ENDPOINT_HOST=203.0.113.10 VPN_SUBNET=10.20.2.0/24 \
gateway/scripts/register-gateway.sh
```

The install script generates the gateway key pair, writes a `wg0.conf` with **no
peers** (peers are runtime state, never config), applies the nftables policy,
configures the resolver and installs the agent. Registration stores the agent
credentials in `/etc/aurora/agent.env` (mode 600) and starts the service.

Give each gateway its own `/24`. The address allocator relies on a unique index
on `(gateway_id, address)`, so overlapping subnets across gateways are fine but
overlapping *within* one is not.

For a fleet, `infrastructure/terraform/` creates the instances and
`infrastructure/ansible/site.yml` configures them.

## Verifying a gateway before you trust it

```bash
wg show wg0                       # interface up, no peers yet
systemctl status aurora-agent     # running, syncing
curl -fsS https://api.aurora.example/api/v1/servers   # appears, status online
```

Then connect a real phone and check: a handshake appears in `wg show`,
`https://ifconfig.me` returns the gateway address, and a DNS leak test shows the
gateway resolver. Only then add the location to the fleet.

## Rolling a gateway out of service

Set it to `draining` in the console (no new sessions), wait for existing
sessions to end naturally, then use **Drain & move users** to end the
stragglers. Peers are removed before sessions close, so nothing keeps tunnelling
through a box you are about to destroy.

## Rollback

The control plane is stateless; roll the image back. Migrations are additive —
there is no destructive schema step in this release — so an older image can run
against a newer database.
