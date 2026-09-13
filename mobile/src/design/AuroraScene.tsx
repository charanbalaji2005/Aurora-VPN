import React, {useEffect, useRef} from 'react';
import {AccessibilityInfo, Animated, Easing, StyleSheet, View} from 'react-native';
import Svg, {Defs, LinearGradient, Path, Rect, Stop} from 'react-native-svg';
import {palette} from './tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * The aurora scene, used on the splash screen only.
 *
 * The rest of the app is a flat near-black console; this is the one place the
 * product shows its name and its face. Drawing it as SVG rather than shipping
 * a photograph keeps the APK small, scales to any screen without a second
 * asset, and means the bands can drift.
 *
 * Motion stops entirely when the system has reduce-motion turned on.
 */
export function AuroraScene() {
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    let loop: Animated.CompositeAnimation | undefined;
    AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (cancelled || reduced) return;
      loop = Animated.loop(
        Animated.timing(drift, {
          toValue: 1,
          duration: 14000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [drift]);

  const bandOne = drift.interpolate({inputRange: [0, 1], outputRange: [0.75, 0.35]});
  const bandTwo = drift.interpolate({inputRange: [0, 1], outputRange: [0.35, 0.7]});
  const bandThree = drift.interpolate({inputRange: [0, 1], outputRange: [0.2, 0.5]});

  return (
    <View style={StyleSheet.absoluteFill}>
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 390 780" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0B1A2E" />
            <Stop offset="0.55" stopColor="#0A1020" />
            <Stop offset="1" stopColor={palette.base} />
          </LinearGradient>
          <LinearGradient id="band1" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={palette.auroraTeal} stopOpacity="0" />
            <Stop offset="0.5" stopColor={palette.auroraGreen} stopOpacity="0.85" />
            <Stop offset="1" stopColor={palette.auroraTeal} stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id="band2" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={palette.auroraViolet} stopOpacity="0" />
            <Stop offset="0.45" stopColor={palette.auroraViolet} stopOpacity="0.7" />
            <Stop offset="1" stopColor={palette.auroraTeal} stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id="ridge" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#101826" />
            <Stop offset="1" stopColor="#05070B" />
          </LinearGradient>
        </Defs>

        <Rect x="0" y="0" width="390" height="780" fill="url(#sky)" />

        {/* Three curtains at different opacities; only opacity animates, so
            this stays on the native driver. */}
        <AnimatedPath
          d="M-40 210 C 60 90, 150 250, 230 130 S 380 60, 440 150 L440 330 C 360 250, 250 360, 160 300 S 30 330, -40 300 Z"
          fill="url(#band1)"
          opacity={bandOne}
        />
        <AnimatedPath
          d="M-40 300 C 80 200, 160 330, 250 220 S 390 180, 440 260 L440 400 C 340 330, 230 430, 140 370 S 20 400, -40 380 Z"
          fill="url(#band2)"
          opacity={bandTwo}
        />
        <AnimatedPath
          d="M-40 150 C 90 60, 200 180, 300 90 S 420 70, 440 120 L440 210 C 340 160, 220 250, 120 200 S 20 220, -40 210 Z"
          fill="url(#band1)"
          opacity={bandThree}
        />

        {/* Ridgeline. A horizon gives the aurora somewhere to sit. */}
        <Path d="M-10 560 L70 470 L130 530 L190 430 L260 520 L320 465 L400 545 L400 790 L-10 790 Z" fill="url(#ridge)" />
        <Path d="M-10 620 L60 560 L140 615 L210 545 L300 610 L400 555 L400 790 L-10 790 Z" fill="#04060A" />
      </Svg>
    </View>
  );
}
