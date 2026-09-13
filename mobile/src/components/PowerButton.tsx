import React, {useEffect, useRef} from 'react';
import {AccessibilityInfo, Animated, Easing, Pressable, View} from 'react-native';
import Svg, {Circle, Defs, RadialGradient, Stop} from 'react-native-svg';
import {useTheme} from '../design/theme';
import {VpnState, isBusy, isProtected} from '../domain/models';
import {Icon} from './Icon';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * The connect control — the single hero of the app.
 *
 * It is a physical-feeling button, not a decorative dial: a dark disc with a
 * ring that lights emerald when, and only when, the tunnel is genuinely up.
 * The glow is state, not styling. While the engine is negotiating the ring
 * pulses amber; it settles the moment a handshake lands and never animates to
 * imply progress that is not happening.
 *
 * One tap is the whole interaction, and the label under it always says what
 * the next tap will do.
 */
export function PowerButton({
  state,
  onPress,
  disabled,
}: {
  state: VpnState;
  onPress: () => void;
}& {disabled?: boolean}) {
  const {colors, dimens} = useTheme();
  const size = dimens.powerSize;
  const busy = isBusy(state);
  const on = isProtected(state);

  const accent = on
    ? colors.protected
    : busy
      ? colors.negotiating
      : state === 'FAILED' || state === 'SERVER_UNAVAILABLE'
        ? colors.alert
        : colors.off;

  const pulse = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;
    let loop: Animated.CompositeAnimation | undefined;
    if (busy) {
      AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
        if (cancelled || reduced) return;
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(pulse, {toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true}),
            Animated.timing(pulse, {toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true}),
          ]),
        );
        loop.start();
      });
    } else {
      pulse.setValue(0);
    }
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [busy, pulse]);

  const ringOpacity = busy
    ? pulse.interpolate({inputRange: [0, 1], outputRange: [0.35, 1]})
    : new Animated.Value(on ? 1 : 0.5);

  const stroke = size * 0.045;
  const radius = size / 2 - stroke;

  return (
    <Animated.View style={{transform: [{scale: press}]}}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{disabled: !!disabled, selected: on}}
        accessibilityLabel={on ? 'Disconnect the VPN' : 'Connect the VPN'}
        disabled={disabled}
        onPressIn={() =>
          Animated.timing(press, {toValue: 0.97, duration: 110, useNativeDriver: true}).start()
        }
        onPressOut={() =>
          Animated.timing(press, {toValue: 1, duration: 110, useNativeDriver: true}).start()
        }
        onPress={onPress}
        style={{width: size, height: size, alignItems: 'center', justifyContent: 'center'}}>
        <Svg width={size} height={size} style={{position: 'absolute'}}>
          <Defs>
            <RadialGradient id="powerFace" cx="50%" cy="35%" r="75%">
              <Stop offset="0" stopColor={colors.surfaceHover} />
              <Stop offset="1" stopColor={colors.base} />
            </RadialGradient>
            <RadialGradient id="powerGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0.62" stopColor={accent} stopOpacity="0" />
              <Stop offset="0.88" stopColor={accent} stopOpacity={on ? 0.30 : 0.12} />
              <Stop offset="1" stopColor={accent} stopOpacity="0" />
            </RadialGradient>
          </Defs>

          {/* The halo. Present only as a function of state. */}
          <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#powerGlow)" />

          <Circle cx={size / 2} cy={size / 2} r={radius} fill="url(#powerFace)" />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.lineStrong}
            strokeWidth={1}
            fill="none"
          />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={accent}
            strokeWidth={stroke}
            fill="none"
            opacity={ringOpacity as unknown as number}
            strokeLinecap="round"
            // While negotiating the ring is a dashed arc rather than a solid
            // one, so "working" and "done" differ in shape, not just colour.
            strokeDasharray={busy ? `${radius * 1.1} ${radius * 0.6}` : undefined}
          />
        </Svg>

        <Icon
          name="power"
          size={size * 0.28}
          color={on ? colors.protected : colors.textSecondary}
          strokeWidth={2}
        />
      </Pressable>
    </Animated.View>
  );
}

/** Small coloured dot used beside status words. */
export function StatusDot({color, size = 8}: {color: string; size?: number}) {
  return <View style={{width: size, height: size, borderRadius: size / 2, backgroundColor: color}} />;
}
