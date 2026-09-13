import React from 'react';
import {Text, View} from 'react-native';
import Svg, {Defs, LinearGradient, Path, Stop} from 'react-native-svg';
import {useTheme} from '../design/theme';
import {TrafficSample} from '../state/store';
import {formatRate} from '../util/format';

/**
 * Throughput over the session.
 *
 * Every point is a real reading the engine took from the WireGuard backend two
 * seconds apart — there is no synthetic smoothing and no placeholder waveform.
 * With fewer than two readings the chart says so rather than drawing a
 * plausible-looking line, because a fake graph is the single most convincing
 * lie a VPN app can tell.
 */
export function TrafficChart({
  samples,
  height = 132,
}: {
  samples: TrafficSample[];
  height?: number;
}) {
  const {colors, type, dimens} = useTheme();

  if (samples.length < 2) {
    return (
      <View
        style={{
          height,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: dimens.controlRadius,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: colors.line,
        }}>
        <Text style={[type.meta, {color: colors.textMuted, textAlign: 'center'}]}>
          Throughput appears here once the tunnel has been up for a few seconds.
        </Text>
      </View>
    );
  }

  const width = 320; // viewBox units; the SVG scales to its container
  const peak = Math.max(...samples.flatMap(s => [s.down, s.up]), 1);
  const step = width / (samples.length - 1);

  const line = (pick: (sample: TrafficSample) => number) =>
    samples
      .map((sample, index) => {
        const x = index * step;
        const y = height - (pick(sample) / peak) * (height - 12) - 6;
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');

  const downPath = line(s => s.down);
  const upPath = line(s => s.up);
  const downArea = `${downPath} L${width} ${height} L0 ${height} Z`;

  return (
    <View accessible accessibilityLabel={`Throughput chart, peak ${formatRate(peak)}`}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="downFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.accent} stopOpacity="0.22" />
            <Stop offset="1" stopColor={colors.accent} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Path d={downArea} fill="url(#downFill)" />
        <Path d={downPath} stroke={colors.accent} strokeWidth={2} fill="none" strokeLinejoin="round" />
        <Path d={upPath} stroke={colors.protected} strokeWidth={2} fill="none" strokeLinejoin="round" />
      </Svg>

      <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 6}}>
        <Text style={[type.meta, {color: colors.textMuted}]}>
          {samples.length * 2}s of readings
        </Text>
        <Text style={[type.meta, {color: colors.textMuted}]}>peak {formatRate(peak)}</Text>
      </View>
    </View>
  );
}

/** Legend dot + label, shared by the chart headers. */
export function Legend({color, label, value}: {color: string; label: string; value: string}) {
  const {colors, type} = useTheme();
  return (
    <View style={{gap: 2}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
        <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: color}} />
        <Text style={[type.meta, {color: colors.textMuted}]}>{label}</Text>
      </View>
      <Text style={[type.metricLarge, {color: colors.textPrimary}]}>{value}</Text>
    </View>
  );
}
