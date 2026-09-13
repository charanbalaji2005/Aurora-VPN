import React from 'react';
import Svg, {Defs, LinearGradient, Path, Stop} from 'react-native-svg';
import {palette} from '../design/tokens';

/**
 * The Aurora mark: an A cut from a rising light.
 *
 * Drawn rather than bundled as a raster so it stays sharp at every density and
 * needs no per-DPI assets.
 */
export function Logo({size = 32}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityLabel="Aurora VPN">
      <Defs>
        <LinearGradient id="auroraMark" x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0" stopColor={palette.auroraTeal} />
          <Stop offset="0.55" stopColor={palette.auroraGreen} />
          <Stop offset="1" stopColor={palette.auroraViolet} />
        </LinearGradient>
      </Defs>
      <Path d="M24 4 L44 42 L34 42 L24 20 L14 42 L4 42 Z" fill="url(#auroraMark)" />
      <Path d="M24 26 L31 42 L17 42 Z" fill={palette.base} opacity={0.55} />
    </Svg>
  );
}
