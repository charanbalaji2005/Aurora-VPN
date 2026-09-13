import React from 'react';
import {ScrollView, Text, View} from 'react-native';
import {Card, Divider, SectionLabel} from '../design/Surface';
import {useTheme} from '../design/theme';
import {DetailRow, ProgressBar, ScreenHeader} from '../components/Primitives';
import {Legend, TrafficChart} from '../components/TrafficChart';
import {isProtected, remainingFraction} from '../domain/models';
import {useStore} from '../state/store';
import {
  formatBytes,
  formatDuration,
  formatDurationShort,
  formatElapsed,
  formatRate,
} from '../util/format';

/**
 * Live statistics.
 *
 * Everything here is a counter read from the WireGuard backend or a figure the
 * control plane returned. There is no estimated traffic and no smoothed
 * "typical" curve: when the tunnel is down the chart says it has nothing to
 * plot instead of showing the last session's shape.
 */
export function StatsScreen() {
  const {colors, dimens, type} = useTheme();

  const vpnState = useStore(s => s.vpnState);
  const metrics = useStore(s => s.metrics);
  const quota = useStore(s => s.quota);
  const samples = useStore(s => s.samples);
  const connectedSince = useStore(s => s.connectedSince);
  const server = useStore(s => s.activeServer);

  const on = isProtected(vpnState);
  const total = metrics.bytesDown + metrics.bytesUp;

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
        title="Statistics"
        subtitle={on ? `This session · ${server?.city ?? 'connected'}` : 'No active session'}
      />

      <Card>
        <View style={{flexDirection: 'row', gap: dimens.gapLg, marginBottom: dimens.gapMd}}>
          <Legend color={colors.accent} label="Download" value={formatRate(metrics.downloadBps)} />
          <Legend color={colors.protected} label="Upload" value={formatRate(metrics.uploadBps)} />
        </View>
        <TrafficChart samples={samples} />
      </Card>

      <Card padding={0}>
        <View style={{paddingHorizontal: dimens.gapMd, paddingTop: dimens.gapMd}}>
          <SectionLabel>This session</SectionLabel>
        </View>
        <View style={{paddingHorizontal: dimens.gapMd, paddingBottom: dimens.gapSm}}>
          <DetailRow label="Total traffic" value={on ? formatBytes(total) : '—'} />
          <Divider />
          <DetailRow label="Received" value={on ? formatBytes(metrics.bytesDown) : '—'} />
          <Divider />
          <DetailRow label="Sent" value={on ? formatBytes(metrics.bytesUp) : '—'} />
          <Divider />
          <DetailRow label="Duration" value={on ? formatElapsed(connectedSince) : '—'} />
        </View>
      </Card>

      <Card>
        <View style={{gap: dimens.gapSm}}>
          <View style={{flexDirection: 'row', alignItems: 'flex-end'}}>
            <View style={{flex: 1}}>
              <SectionLabel>Free time today</SectionLabel>
              <Text style={[type.hero, {color: colors.textPrimary}]}>
                {quota.unlimited ? '∞' : formatDuration(quota.remainingSeconds)}
              </Text>
              <Text style={[type.meta, {color: colors.textMuted}]}>
                {quota.unlimited
                  ? 'Unlimited plan'
                  : `${formatDurationShort(quota.usedSeconds)} of ${formatDurationShort(
                      quota.dailySeconds,
                    )} used`}
              </Text>
            </View>
          </View>
          {!quota.unlimited ? (
            <ProgressBar
              fraction={1 - remainingFraction(quota)}
              tone={quota.remainingSeconds <= 0 ? colors.alert : colors.accent}
            />
          ) : null}
          <Text style={[type.meta, {color: colors.textMuted}]}>
            Counted by the server from the time your session was authorised. Reinstalling the
            app or changing the device clock does not change it.
          </Text>
        </View>
      </Card>
    </ScrollView>
  );
}
