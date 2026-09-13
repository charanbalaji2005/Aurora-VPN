import React from 'react';
import {Pressable, ScrollView, Text, View} from 'react-native';
import {Card} from '../design/Surface';
import {useTheme} from '../design/theme';
import {FlagBadge} from '../components/FlagBadge';
import {Icon} from '../components/Icon';
import {Logo} from '../components/Logo';
import {PowerButton, StatusDot} from '../components/PowerButton';
import {ProgressBar, StatChip} from '../components/Primitives';
import {VpnState, isBusy, isProtected, remainingFraction} from '../domain/models';
import {useStore} from '../state/store';
import {
  formatDuration,
  formatDurationShort,
  formatElapsed,
  formatLatency,
  formatRate,
} from '../util/format';

/**
 * Home.
 *
 * One question, answered without reading: am I protected. The power button is
 * the answer and the control at once. Below it sit the three live numbers, and
 * below those the one fact a free user cares about — how much time is left.
 *
 * Nothing on this screen is decorative. If a value is not measured it shows an
 * em dash, and the ring only goes green after a real handshake.
 */
export function HomeScreen({
  sideBySide,
  renderLocations,
  onOpenLocations,
  onOpenDetails,
}: {
  sideBySide: boolean;
  renderLocations: () => React.ReactNode;
  onOpenLocations: () => void;
  onOpenDetails: () => void;
}) {
  const {dimens} = useTheme();

  if (!sideBySide) {
    return (
      <View style={{flex: 1, paddingHorizontal: dimens.gutter}}>
        <ConnectionPanel onOpenLocations={onOpenLocations} onOpenDetails={onOpenDetails} />
      </View>
    );
  }

  return (
    <View
      style={{flex: 1, flexDirection: 'row', gap: dimens.gapLg, paddingHorizontal: dimens.gutter}}>
      <View style={{flex: 1}}>
        <ConnectionPanel onOpenLocations={onOpenLocations} onOpenDetails={onOpenDetails} />
      </View>
      <View style={{flex: 1}}>{renderLocations()}</View>
    </View>
  );
}

function ConnectionPanel({
  onOpenLocations,
  onOpenDetails,
}: {
  onOpenLocations: () => void;
  onOpenDetails: () => void;
}) {
  const {colors, dimens, type} = useTheme();

  const vpnState = useStore(s => s.vpnState);
  const quota = useStore(s => s.quota);
  const metrics = useStore(s => s.metrics);
  const server = useStore(s => s.activeServer);
  const failure = useStore(s => s.failure);
  const connectedSince = useStore(s => s.connectedSince);
  const toggleConnection = useStore(s => s.toggleConnection);

  const on = isProtected(vpnState);
  const tint = stateTint(vpnState, colors);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        gap: dimens.gapMd,
        paddingBottom: 130,
        width: '100%',
        maxWidth: dimens.contentMaxWidth,
        alignSelf: 'center',
      }}>
      {/* Brand bar. Plan badge is real account state, not an upsell. */}
      <View style={{flexDirection: 'row', alignItems: 'center', paddingVertical: dimens.gapSm}}>
        <Logo size={26} />
        <Text style={[type.heading, {color: colors.textPrimary, marginLeft: 8, letterSpacing: 0.6}]}>
          AURORA <Text style={{color: colors.textMuted, fontWeight: '400'}}>VPN</Text>
        </Text>
        <View style={{flex: 1}} />
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 999,
            backgroundColor: quota.unlimited ? colors.accentSoft : colors.surface,
            borderWidth: 1,
            borderColor: colors.line,
          }}>
          <Text style={[type.meta, {color: quota.unlimited ? colors.accent : colors.textSecondary}]}>
            {quota.unlimited ? 'Unlimited' : 'Free plan'}
          </Text>
        </View>
      </View>

      {/* Selected location. Tapping it is how you change country. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          server ? `Location: ${server.city}, ${server.country}. Change location` : 'Choose a location'
        }
        onPress={onOpenLocations}>
        <Card padding={dimens.gapMd}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: dimens.gapMd}}>
            <FlagBadge
              countryCode={server?.countryCode ?? 'XX'}
              countryName={server?.country ?? 'Automatic'}
              size={38}
            />
            <View style={{flex: 1}}>
              <Text style={[type.bodyStrong, {color: colors.textPrimary}]}>
                {server ? server.country : 'Fastest location'}
              </Text>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                {on ? <StatusDot color={colors.protected} size={6} /> : null}
                <Text style={[type.meta, {color: on ? colors.protected : colors.textMuted}]}>
                  {on
                    ? `Connected · ${formatElapsed(connectedSince)}`
                    : server
                      ? server.city
                      : 'Chosen from live load and health'}
                </Text>
              </View>
            </View>
            <Icon name="chevronRight" size={18} color={colors.textMuted} />
          </View>
        </Card>
      </Pressable>

      {/* The hero. */}
      <View style={{alignItems: 'center', gap: dimens.gapSm, paddingVertical: dimens.gapMd}}>
        <PowerButton
          state={vpnState}
          disabled={vpnState === 'QUOTA_EXPIRED'}
          onPress={() => void toggleConnection()}
        />
        <Text style={[type.display, {color: colors.textPrimary, marginTop: dimens.gapSm}]}>
          {stateTitle(vpnState)}
        </Text>
        <Text style={[type.body, {color: tint, textAlign: 'center'}]}>
          {failure && !on ? failure.message : stateSubtitle(vpnState)}
        </Text>
      </View>

      {/* Live figures, straight from the WireGuard backend. */}
      <View style={{flexDirection: 'row', gap: dimens.gapSm}}>
        <StatChip
          icon="download"
          label="Download"
          value={formatRate(metrics.downloadBps)}
          tint={colors.accent}
        />
        <StatChip
          icon="upload"
          label="Upload"
          value={formatRate(metrics.uploadBps)}
          tint={colors.protected}
        />
        <StatChip
          icon="zap"
          label="Latency"
          value={formatLatency(metrics.latencyMs)}
          tint={colors.negotiating}
        />
      </View>

      {on ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Connection details"
          onPress={onOpenDetails}>
          <Card padding={dimens.gapMd} style={{borderColor: colors.protectedSoft}}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: dimens.gapMd}}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: dimens.tileRadius,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.protectedSoft,
                }}>
                <Icon name="shieldCheck" size={18} color={colors.protected} />
              </View>
              <View style={{flex: 1}}>
                <Text style={[type.bodyStrong, {color: colors.protected}]}>Protected</Text>
                <Text style={[type.meta, {color: colors.textMuted}]}>
                  Traffic leaves from {server?.city ?? 'the gateway'} · tap for details
                </Text>
              </View>
              <Icon name="chevronRight" size={18} color={colors.textMuted} />
            </View>
          </Card>
        </Pressable>
      ) : (
        <Card padding={dimens.gapMd}>
          <View style={{gap: dimens.gapSm}}>
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
              <Text style={[type.bodyStrong, {color: colors.textPrimary, flex: 1}]}>
                {quota.unlimited ? 'Unlimited plan' : "Today's free time"}
              </Text>
              <Text style={[type.metric, {color: colors.textPrimary}]}>
                {quota.unlimited ? '∞' : formatDuration(quota.remainingSeconds)}
              </Text>
            </View>
            {!quota.unlimited ? (
              <>
                <ProgressBar
                  fraction={1 - remainingFraction(quota)}
                  tone={quota.remainingSeconds <= 0 ? colors.alert : colors.accent}
                />
                <Text style={[type.meta, {color: colors.textMuted}]}>
                  {quota.remainingSeconds <= 0
                    ? 'Resets at midnight UTC. The counter lives on our servers, not on this phone.'
                    : `${formatDurationShort(quota.usedSeconds)} of ${formatDurationShort(
                        quota.dailySeconds,
                      )} used · counted server-side while the tunnel is up`}
                </Text>
              </>
            ) : null}
          </View>
        </Card>
      )}
    </ScrollView>
  );
}

function stateTitle(state: VpnState): string {
  switch (state) {
    case 'CONNECTED':
      return 'Connected';
    case 'CONNECTING':
      return 'Connecting';
    case 'RECONNECTING':
      return 'Reconnecting';
    case 'DISCONNECTING':
      return 'Disconnecting';
    case 'DISCONNECTED':
      return 'Not connected';
    case 'FAILED':
      return 'Connection failed';
    case 'SERVER_UNAVAILABLE':
      return 'Location unavailable';
    case 'QUOTA_EXPIRED':
      return 'Daily limit reached';
  }
}

function stateSubtitle(state: VpnState): string {
  switch (state) {
    case 'CONNECTED':
      return 'Your internet is now private';
    case 'CONNECTING':
      return 'Waiting for the gateway to answer…';
    case 'RECONNECTING':
      return 'Network changed. Rebuilding the tunnel…';
    case 'DISCONNECTING':
      return 'Closing the tunnel…';
    case 'QUOTA_EXPIRED':
      return 'Your three hours come back at midnight UTC';
    default:
      return 'Tap to connect';
  }
}

function stateTint(state: VpnState, colors: ReturnType<typeof useTheme>['colors']): string {
  if (state === 'CONNECTED') return colors.protected;
  if (isBusy(state)) return colors.negotiating;
  if (state === 'DISCONNECTED') return colors.textMuted;
  return colors.alert;
}
