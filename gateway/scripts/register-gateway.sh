#!/usr/bin/env bash
# Register this gateway with the control plane and store the returned
# credentials. Run once per gateway, after install-gateway.sh.
set -euo pipefail

: "${CONTROL_PLANE_URL:?}" "${BOOTSTRAP_SECRET:?}" "${GATEWAY_ID:?}"
: "${COUNTRY:?}" "${COUNTRY_CODE:?}" "${CITY:?}" "${ENDPOINT_HOST:?}"
VPN_SUBNET="${VPN_SUBNET:-10.20.1.0/24}"
VPN_SUBNET_V6="${VPN_SUBNET_V6:-fd00:20:1::/64}"
GW_ADDR="${VPN_SUBNET%.*/*}.1"
GW_ADDR_V6="${VPN_SUBNET_V6%::/*}::1"

# Determine host private/internal IP for remote control plane agent communication
DETECTED_IP="$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}' || echo "127.0.0.1")"
AGENT_HOST="${AGENT_HOST:-0.0.0.0}"
AGENT_PORT="${AGENT_PORT:-8443}"
AGENT_URL="${AGENT_URL:-http://${DETECTED_IP}:${AGENT_PORT}}"

echo "==> registering gateway ${GATEWAY_ID} at ${CONTROL_PLANE_URL}"
response=$(curl -fsS -X POST "${CONTROL_PLANE_URL}/api/v1/gateways/register" \
  -H "content-type: application/json" \
  -H "x-bootstrap-secret: ${BOOTSTRAP_SECRET}" \
  -d @- <<JSON
{
  "gateway_id": "${GATEWAY_ID}",
  "name": "$(echo "${GATEWAY_ID}" | tr '[:lower:]' '[:upper:]')",
  "country": "${COUNTRY}",
  "country_code": "${COUNTRY_CODE}",
  "city": "${CITY}",
  "endpoint_host": "${ENDPOINT_HOST}",
  "listen_port": ${WG_PORT:-51820},
  "public_key": "$(cat /etc/wireguard/public.key)",
  "vpn_subnet": "${VPN_SUBNET}",
  "vpn_subnet_v6": "${VPN_SUBNET_V6}",
  "dns_servers": ["${GW_ADDR}", "${GW_ADDR_V6}"],
  "agent_url": "${AGENT_URL}",
  "capacity": ${CAPACITY:-250}
}
JSON
)

install -d -m 0700 /etc/aurora
umask 077
cat > /etc/aurora/agent.env <<ENVEOF
GATEWAY_ID=${GATEWAY_ID}
WG_INTERFACE=wg0
CAPACITY=${CAPACITY:-250}
CONTROL_PLANE_URL=${CONTROL_PLANE_URL}
AGENT_HOST=${AGENT_HOST}
AGENT_PORT=${AGENT_PORT}
AGENT_TOKEN=$(echo "$response" | python3 -c 'import json,sys;print(json.load(sys.stdin)["agent_token"])')
AGENT_SECRET=$(echo "$response" | python3 -c 'import json,sys;print(json.load(sys.stdin)["agent_secret"])')
ENVEOF

systemctl daemon-reload
systemctl enable --now aurora-agent
echo "successfully registered ${GATEWAY_ID} (agent listening on ${AGENT_HOST}:${AGENT_PORT})"
