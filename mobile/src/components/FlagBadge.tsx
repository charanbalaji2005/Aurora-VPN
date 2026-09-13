import React from 'react';
import {Text, View} from 'react-native';
import Svg, {Circle, ClipPath, Defs, G, Path, Rect} from 'react-native-svg';
import {useTheme} from '../design/theme';

/**
 * Circular country marks.
 *
 * Drawn, not emoji. Emoji flags render differently on every OEM skin, are
 * absent for several territories, and are announced by screen readers as
 * "flag: Japan" in the middle of a sentence. These are simple geometric
 * renderings — enough to identify a country at 28px in a list, deliberately
 * not detailed heraldry — and each one carries the country's name as its
 * accessibility label.
 *
 * Anything without a drawing falls back to a tinted disc with the ISO code,
 * so an unknown region degrades to something readable rather than to a blank.
 */
export function FlagBadge({
  countryCode,
  countryName,
  size = 34,
}: {
  countryCode: string;
  countryName?: string;
  size?: number;
}) {
  const {colors, type} = useTheme();
  const code = countryCode.toUpperCase();
  const drawing = flags[code];
  const label = countryName ?? code;

  if (!drawing) {
    return (
      <View
        accessible
        accessibilityLabel={label}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surfaceHover,
          borderWidth: 1,
          borderColor: colors.line,
        }}>
        <Text style={[type.meta, {color: colors.textSecondary, fontWeight: '600'}]}>{code}</Text>
      </View>
    );
  }

  return (
    <View accessible accessibilityLabel={label}>
      <Svg width={size} height={size} viewBox="0 0 32 32">
        <Defs>
          <ClipPath id={`disc-${code}`}>
            <Circle cx="16" cy="16" r="16" />
          </ClipPath>
        </Defs>
        <G clipPath={`url(#disc-${code})`}>{drawing}</G>
        {/* A hairline keeps white flags from dissolving into a light theme. */}
        <Circle cx="16" cy="16" r="15.4" stroke="rgba(255,255,255,0.18)" strokeWidth="1.2" fill="none" />
      </Svg>
    </View>
  );
}

const band = (y: number, h: number, fill: string) => (
  <Rect key={`${y}-${fill}`} x="0" y={y} width="32" height={h} fill={fill} />
);
const stripeV = (x: number, w: number, fill: string) => (
  <Rect key={`${x}-${fill}`} x={x} y="0" width={w} height="32" fill={fill} />
);

/** Union flag canton, reused by the UK and Australia. */
const unionJack = (scale = 1, ox = 0, oy = 0) => (
  <G key="union" transform={`translate(${ox} ${oy}) scale(${scale})`}>
    <Rect x="0" y="0" width="32" height="32" fill="#012169" />
    <Path d="M0 0 L32 32 M32 0 L0 32" stroke="#FFFFFF" strokeWidth="7" />
    <Path d="M0 0 L32 32 M32 0 L0 32" stroke="#C8102E" strokeWidth="3" />
    <Path d="M16 0 V32 M0 16 H32" stroke="#FFFFFF" strokeWidth="10" />
    <Path d="M16 0 V32 M0 16 H32" stroke="#C8102E" strokeWidth="5.5" />
  </G>
);

const flags: Record<string, React.ReactNode> = {
  SG: (
    <G key="SG">
      {band(0, 16, '#ED2939')}
      {band(16, 16, '#FFFFFF')}
      <Circle cx="8" cy="8" r="4.6" fill="#FFFFFF" />
      <Circle cx="10" cy="8" r="4.6" fill="#ED2939" />
    </G>
  ),
  IN: (
    <G key="IN">
      {band(0, 10.7, '#FF9933')}
      {band(10.7, 10.6, '#FFFFFF')}
      {band(21.3, 10.7, '#138808')}
      <Circle cx="16" cy="16" r="3.6" fill="none" stroke="#000080" strokeWidth="1.1" />
      <Circle cx="16" cy="16" r="0.9" fill="#000080" />
    </G>
  ),
  JP: (
    <G key="JP">
      <Rect x="0" y="0" width="32" height="32" fill="#FFFFFF" />
      <Circle cx="16" cy="16" r="8" fill="#BC002D" />
    </G>
  ),
  US: (
    <G key="US">
      {[0, 1, 2, 3, 4, 5, 6].map(i => (
        <Rect key={i} x="0" y={i * 4.6} width="32" height="2.3" fill="#B22234" />
      ))}
      <Rect x="0" y="0" width="32" height="32" fill="none" />
      <Rect x="0" y="0" width="14" height="16" fill="#3C3B6E" />
    </G>
  ),
  DE: (
    <G key="DE">
      {band(0, 10.7, '#000000')}
      {band(10.7, 10.6, '#DD0000')}
      {band(21.3, 10.7, '#FFCE00')}
    </G>
  ),
  GB: <G key="GB">{unionJack()}</G>,
  AU: (
    <G key="AU">
      <Rect x="0" y="0" width="32" height="32" fill="#012169" />
      {unionJack(0.5, 0, 0)}
      <Circle cx="22" cy="22" r="1.6" fill="#FFFFFF" />
      <Circle cx="26" cy="13" r="1.1" fill="#FFFFFF" />
      <Circle cx="27.5" cy="24" r="1" fill="#FFFFFF" />
      <Circle cx="21" cy="28" r="0.9" fill="#FFFFFF" />
    </G>
  ),
  CA: (
    <G key="CA">
      {stripeV(0, 8, '#D80621')}
      {stripeV(8, 16, '#FFFFFF')}
      {stripeV(24, 8, '#D80621')}
      <Path
        d="M16 8 L17.4 12.2 L20.4 10.6 L19.2 14.4 L22.6 14 L20 16.6 L23 18.4 L19.6 19.2 L20.2 22 L17 20.6 L16.6 24.4 L15.4 24.4 L15 20.6 L11.8 22 L12.4 19.2 L9 18.4 L12 16.6 L9.4 14 L12.8 14.4 L11.6 10.6 L14.6 12.2 Z"
        fill="#D80621"
      />
    </G>
  ),
  FR: (
    <G key="FR">
      {stripeV(0, 10.7, '#0055A4')}
      {stripeV(10.7, 10.6, '#FFFFFF')}
      {stripeV(21.3, 10.7, '#EF4135')}
    </G>
  ),
  NL: (
    <G key="NL">
      {band(0, 10.7, '#AE1C28')}
      {band(10.7, 10.6, '#FFFFFF')}
      {band(21.3, 10.7, '#21468B')}
    </G>
  ),
  KR: (
    <G key="KR">
      <Rect x="0" y="0" width="32" height="32" fill="#FFFFFF" />
      <Circle cx="16" cy="16" r="7" fill="#CD2E3A" />
      <Path d="M9 16a3.5 3.5 0 017 0 3.5 3.5 0 007 0 7 7 0 01-14 0z" fill="#0047A0" />
    </G>
  ),
  BR: (
    <G key="BR">
      <Rect x="0" y="0" width="32" height="32" fill="#009C3B" />
      <Path d="M16 4 L29 16 L16 28 L3 16 Z" fill="#FFDF00" />
      <Circle cx="16" cy="16" r="5.4" fill="#002776" />
    </G>
  ),
  CH: (
    <G key="CH">
      <Rect x="0" y="0" width="32" height="32" fill="#D52B1E" />
      <Path d="M16 9 V23 M9 16 H23" stroke="#FFFFFF" strokeWidth="4.6" />
    </G>
  ),
  SE: (
    <G key="SE">
      <Rect x="0" y="0" width="32" height="32" fill="#006AA7" />
      <Path d="M12 0 V32 M0 16 H32" stroke="#FECC00" strokeWidth="5" />
    </G>
  ),
};
