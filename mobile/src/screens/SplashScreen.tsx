import React from 'react';
import {Text, View} from 'react-native';
import {AuroraScene} from '../design/AuroraScene';
import {useTheme} from '../design/theme';
import {Logo} from '../components/Logo';

/**
 * Splash.
 *
 * Shown only while the app reads its stored session — typically a few hundred
 * milliseconds. It is the one screen with the aurora on it; everything past
 * this point is the flat console. No progress bar, because a spinner for
 * something this short is noise.
 */
export function SplashScreen() {
  const {colors, type, dimens} = useTheme();
  return (
    <View style={{flex: 1, backgroundColor: colors.base}}>
      <AuroraScene />
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: dimens.gapSm,
          paddingHorizontal: dimens.gutter,
        }}>
        <Logo size={64} />
        <Text style={[type.display, {color: '#FFFFFF', letterSpacing: 1}]}>AURORA VPN</Text>
        <Text style={[type.body, {color: 'rgba(255,255,255,0.72)'}]}>Privacy without borders</Text>
      </View>
    </View>
  );
}
