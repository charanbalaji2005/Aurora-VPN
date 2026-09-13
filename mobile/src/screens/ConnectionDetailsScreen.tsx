import React from 'react';
import {ScrollView, Text, View} from 'react-native';
import {Card, Divider} from '../design/Surface';
import {useTheme} from '../design/theme';
import {FlagBadge} from '../components/FlagBadge';
import {StatusDot} from '../components/PowerButton';
import {DetailRow, EmptyState, ScreenHeader} from '../components/Primitives';
import {isProtected} from '../domain/models';
import {useStore} from '../state/store';
import {EM_DASH, formatBytes, formatElapsed, formatLatency, formatRate} from '../util/format';

/**
 * Connection details.
 *
 * The exit address shown here is the gateway's own endpoint — that really is
 * the address the Internet sees your traffic come from, so it is a fact rather
 * than an inference. The app does not call an "what is my IP" service to
 * confirm it: that would send a request to a third party on every connect,
 * which is exactly the sort of thing a VPN should not do quietly.
 */
export function ConnectionDetailsScreen({onBack}: {onBack: () => void}) {
  const {colors, dimens, type} = useTheme();

  const vpnState = useStore(s => s.vpnState);
  const metrics = useStore(s => s.metrics);
  const server = useStore(s => s.activeServer);
  const connection = useStore(s => s.connection);
  const connectedSince = useStore(s => s.connectedSince);

  const on = isProtected(vpnState);

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
      <ScreenHeader title="Connection details" onBack={onBack} />

      {!on || !connection ? (
        <EmptyState
          icon="shield"
          title="Not connected"
          body="Connect to a location and the tunnel's addresses, protocol and live counters appear here."
        />
      ) : (
        <>
          <Card>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: dimens.gapMd}}>
              <FlagBadge
                countryCode={server?.countryCode ?? 'XX'}
                countryName={server?.country}
                size={38}
              />
              <View style={{flex: 1}}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                  <StatusDot color={colors.protected} size={7} />
                  <Text style={[type.bodyStrong, {color: colors.protected}]}>Connected</Text>
                </View>
                <Text style={[type.meta, {color: colors.textMuted}]}>
                  {server ? `${server.city}, ${server.country}` : 'Gateway'} ·{' '}
                  {formatElapsed(connectedSince)}
                </Text>
              </View>
            </View>
          </Card>

          <Card padding={dimens.gapMd}>
            <DetailRow label="Server" value={server?.name ?? EM_DASH} />
            <Divider />
            <DetailRow label="Tunnel address" value={connection.addresses[0] ?? EM_DASH} mono />
            <Divider />
            <DetailRow label="Exit address" value={connection.endpoint} mono />
            <Divider />
            <DetailRow label="Protocol" value="WireGuard" />
            <Divider />
            <DetailRow label="DNS" value={connection.dns.join(', ') || EM_DASH} mono />
            <Divider />
            <DetailRow label="MTU" value={String(connection.mtu)} />
          </Card>

          <Card padding={dimens.gapMd}>
            <DetailRow label="Latency" value={formatLatency(metrics.latencyMs)} />
            <Divider />
            <DetailRow label="Download" value={formatRate(metrics.downloadBps)} />
            <Divider />
            <DetailRow label="Upload" value={formatRate(metrics.uploadBps)} />
            <Divider />
            <DetailRow label="Received" value={formatBytes(metrics.bytesDown)} />
            <Divider />
            <DetailRow label="Sent" value={formatBytes(metrics.bytesUp)} />
            <Divider />
            <DetailRow
              label="Last handshake"
              value={
                metrics.handshakeAgeSeconds === null
                  ? EM_DASH
                  : `${Math.round(metrics.handshakeAgeSeconds)}s ago`
              }
            />
          </Card>

          <Text style={[type.meta, {color: colors.textMuted}]}>
            Keys are never shown here. The device private key stays in the phone's encrypted
            store and is never readable by the app's JavaScript.
          </Text>
        </>
      )}
    </ScrollView>
  );
}
