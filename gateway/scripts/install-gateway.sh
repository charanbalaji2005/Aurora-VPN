#!/usr/bin/env bash
# Provision a Linux box as an Aurora VPN gateway with dual-stack IPv4/IPv6.
# Usage: GATEWAY_ID=sg-sin-01 VPN_SUBNET=10.20.2.0/24 ./install-gateway.sh
set -euo pipefail

GATEWAY_ID="${GATEWAY_ID:?set GATEWAY_ID}"
VPN_SUBNET="${VPN_SUBNET:-10.20.1.0/24}"
VPN_SUBNET_V6="${VPN_SUBNET_V6:-fd00:20:1::/64}"
WG_PORT="${WG_PORT:-51820}"
SSH_ALLOW_CIDR="${SSH_ALLOW_CIDR:-10.0.0.0/8}"
WAN_IF="$(ip route show default | awk '/default/ {print $5; exit}')"
GW_ADDR="${VPN_SUBNET%.*/*}.1"
GW_ADDR_V6="${VPN_SUBNET_V6%::/*}::1"

echo "==> installing packages"
apt-get update -qq
apt-get install -y -qq wireguard nftables python3-venv python3-pip unbound curl

echo "==> generating gateway keys"
install -d -m 0700 /etc/wireguard
umask 077
[ -f /etc/wireguard/private.key ] || wg genkey > /etc/wireguard/private.key
wg pubkey < /etc/wireguard/private.key > /etc/wireguard/public.key

echo "==> writing wg0.conf (dual stack)"
cat > /etc/wireguard/wg0.conf <<WGEOF
[Interface]
Address = ${GW_ADDR}/${VPN_SUBNET#*/}, ${GW_ADDR_V6}/64
ListenPort = ${WG_PORT}
PostUp = /etc/aurora/nftables-up.sh
PostDown = /etc/aurora/nftables-down.sh
PrivateKey = $(cat /etc/wireguard/private.key)
# Peers are managed at runtime by the agent, never written to this file.
WGEOF
chmod 600 /etc/wireguard/wg0.conf

echo "==> enabling forwarding"
cat > /etc/sysctl.d/99-aurora.conf <<SYSEOF
net.ipv4.ip_forward = 1
net.ipv6.conf.all.forwarding = 1
net.ipv4.conf.all.rp_filter = 2
SYSEOF
sysctl --system >/dev/null

echo "==> firewall"
install -d /etc/aurora
sed "s|__WAN_IF__|${WAN_IF}|g; s|__VPN_SUBNET__|${VPN_SUBNET}|g; s|__VPN_SUBNET_V6__|${VPN_SUBNET_V6}|g; s|__WG_PORT__|${WG_PORT}|g; s|__SSH_ALLOW_CIDR__|${SSH_ALLOW_CIDR}|g" \
  "$(dirname "$0")/../nftables/aurora.nft" > /etc/nftables.conf
cat > /etc/aurora/nftables-up.sh <<'UPEOF'
#!/usr/bin/env bash
nft -f /etc/nftables.conf
UPEOF
cat > /etc/aurora/nftables-down.sh <<'DOWNEOF'
#!/usr/bin/env bash
nft flush ruleset || true
DOWNEOF
chmod +x /etc/aurora/nftables-*.sh

echo "==> resolver (dual-stack IPv4/IPv6, no query logging)"
cat > /etc/unbound/unbound.conf.d/aurora.conf <<UNBOUNDEOF
server:
  interface: ${GW_ADDR}
  interface: ${GW_ADDR_V6}
  access-control: ${VPN_SUBNET} allow
  access-control: ${VPN_SUBNET_V6} allow
  access-control: 0.0.0.0/0 refuse
  access-control: ::/0 refuse
  hide-identity: yes
  hide-version: yes
  qname-minimisation: yes
  log-queries: no
  log-replies: no
  verbosity: 0
UNBOUNDEOF
systemctl restart unbound

echo "==> agent"
install -d /opt/aurora/agent
cp -r "$(dirname "$0")/../agent/"* /opt/aurora/agent/
python3 -m venv /opt/aurora/venv
/opt/aurora/venv/bin/pip install -q -r /opt/aurora/agent/requirements.txt
cp /opt/aurora/agent/aurora-agent.service /etc/systemd/system/

systemctl enable --now wg-quick@wg0
systemctl daemon-reload

echo
echo "Gateway public key: $(cat /etc/wireguard/public.key)"
echo "Next: write /etc/aurora/agent.env, then run scripts/register-gateway.sh"
