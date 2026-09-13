import React, {useCallback, useEffect, useState} from 'react';
import {ScrollView, Text, View} from 'react-native';
import {Card, Divider} from '../design/Surface';
import {useTheme} from '../design/theme';
import {PrimaryButton, ScreenHeader} from '../components/Primitives';
import {CheckState, StatusRow} from '../components/StatusRow';
import {isProtected} from '../domain/models';
import {useStore} from '../state/store';
import {AuroraVpn} from '../vpn/native';

type Check = {label: string; value: string; state: CheckState; note?: string};

/**
 * Diagnostics.
 *
 * Written for the support conversation that follows a complaint, and written
 * honestly: a check this app cannot actually perform is reported grey as "Not
 * checked", never as a green tick. A diagnostics page that is always green is
 * worse than none at all, because someone will trust it.
 *
 * Note what is deliberately absent: an "internet leak test". A real one means
 * asking a third-party server what address it sees, on every run — a request
 * that leaves the tunnel and tells someone else you are using this VPN. That
 * is a decision for the user to make, not something to do quietly inside a
 * diagnostics screen.
 */
export function DiagnosticsScreen({onBack}: {onBack: () => void}) {
  const {colors, dimens, type} = useTheme();

  const vpnState = useStore(s => s.vpnState);
  const metrics = useStore(s => s.metrics);
  const connection = useStore(s => s.connection);
  const preferences = useStore(s => s.preferences);
  const server = useStore(s => s.activeServer);

  const [tunnelUp, setTunnelUp] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);

  const read = useCallback(async () => {
    // status() is read-only and does not prompt.
    const status = await AuroraVpn.status().catch(() => null);
    setTunnelUp(status?.up ?? null);
  }, []);

  useEffect(() => {
    void read();
  }, [read]);

  const run = async () => {
    setRunning(true);
    await read();
    // prepare() resolves immediately when consent was already granted; if it
    // was not, Android shows its dialog. The button says so.
    const granted = await AuroraVpn.prepare().catch(() => false);
    setPermission(granted);
    setRunning(false);
  };

  const on = isProtected(vpnState);
  const handshake = metrics.handshakeAgeSeconds;

  const checks: Check[] = [
    {
      label: 'VPN permission',
      value: permission === null ? 'Not checked' : permission ? 'Granted' : 'Denied',
      state: permission === null ? 'unknown' : permission ? 'pass' : 'fail',
      note: permission === null ? 'Run diagnostics to check. Android may ask for consent.' : undefined,
    },
    {
      label: 'WireGuard interface',
      value: tunnelUp === null ? 'Unknown' : tunnelUp ? 'Up' : 'Down',
      state: tunnelUp === null ? 'unknown' : tunnelUp ? 'pass' : 'fail',
    },
    {
      label: 'Gateway handshake',
      value: handshake === null ? 'None yet' : `${Math.round(handshake)}s ago`,
      state: handshake === null ? 'unknown' : handshake < 180 ? 'pass' : 'warn',
      note:
        handshake === null
          ? 'An interface with no handshake carries no traffic.'
          : handshake >= 180
            ? 'Older than three minutes — the tunnel may be stalled.'
            : undefined,
    },
    {
      label: 'Gateway',
      value: server ? `${server.city} (${server.gatewayId})` : 'None',
      state: server ? 'pass' : 'unknown',
    },
    {
      label: 'DNS',
      value: connection?.dns.length ? connection.dns.join(', ') : 'Not set',
      state: connection?.dns.length ? 'pass' : 'unknown',
      note: connection?.dns.length
        ? 'Queries go to the gateway resolver, which keeps no query log.'
        : undefined,
    },
    {
      label: 'IPv6 policy',
      value: preferences.blockIpv6 ? 'Blocked' : 'Carried',
      state: 'pass',
      note: preferences.blockIpv6
        ? 'IPv6 is claimed by the tunnel and dropped, so it cannot escape around it.'
        : 'IPv6 is routed through the gateway.',
    },
    {
      label: 'Kill switch',
      value: preferences.killSwitch ? 'Requested' : 'Off',
      state: preferences.killSwitch ? 'warn' : 'unknown',
      note: 'Only Android can enforce this. Turn on Always-on VPN with "Block connections without VPN" in system settings.',
    },
    {
      label: 'Leak test',
      value: 'Not available',
      state: 'unknown',
      note: 'A real test contacts an outside server. This app will not do that without you asking.',
    },
  ];

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: dimens.gutter,
        paddingBottom: 130,
        gap: dimens.gapMd,
        width: '100%',
        maxWidth: dimens.contentMaxWidth,
        alignSelf: 'center',
      }}>
      <ScreenHeader
        title="Diagnostics"
        onBack={onBack}
        subtitle={on ? 'Tunnel is up' : 'Tunnel is down'}
      />

      <Card padding={dimens.gapMd}>
        {checks.map((check, index) => (
          <View key={check.label}>
            {index > 0 ? <Divider /> : null}
            <StatusRow
              state={check.state}
              label={check.label}
              value={check.value}
              note={check.note}
            />
          </View>
        ))}
      </Card>

      <PrimaryButton
        label={running ? 'Running…' : 'Run diagnostics'}
        icon="refresh"
        disabled={running}
        onPress={() => void run()}
      />

      <Text style={[type.meta, {color: colors.textMuted}]}>
        Nothing here exposes key material. The device private key is generated and used
        natively and has no read path from the app's JavaScript.
      </Text>
    </ScrollView>
  );
}
