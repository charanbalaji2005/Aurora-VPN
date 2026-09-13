import React from 'react';
import {StyleProp, Text, View, ViewStyle} from 'react-native';
import {useTheme} from './theme';

/**
 * The one container in the app.
 *
 * A card is a flat surface one step lighter than the page, with a hairline
 * border and no shadow. Depth is communicated by that single step in value,
 * the way it is in a terminal or a well-built console UI — not by stacked
 * blurs and glows, which cost a frame and read as decoration.
 */
export function Card({
  children,
  style,
  padding,
  radius,
  raised,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padding?: number;
  radius?: number;
  raised?: boolean;
}) {
  const {colors, dimens} = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: raised ? colors.surfaceRaised : colors.surface,
          borderRadius: radius ?? dimens.cardRadius,
          borderWidth: 1,
          borderColor: colors.line,
          padding: padding ?? dimens.gapMd,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

/** Section heading: small, uppercase, muted. Used above every group. */
export function SectionLabel({children}: {children: string}) {
  const {colors, type, dimens} = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[
        type.meta,
        {
          color: colors.textMuted,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          marginBottom: dimens.gapSm,
        },
      ]}>
      {children}
    </Text>
  );
}

/** Hairline between rows inside a card. */
export function Divider({inset = 0}: {inset?: number}) {
  const {colors} = useTheme();
  return <View style={{height: 1, backgroundColor: colors.line, marginLeft: inset}} />;
}

/**
 * A square icon tile.
 *
 * Settings rows use a tinted tile per row so the list is scannable by shape
 * and hue before it is read. The tint is always a semantic colour at low
 * opacity, never a decorative gradient.
 */
export function IconTile({
  children,
  tint,
  size = 34,
}: {
  children: React.ReactNode;
  tint: string;
  size?: number;
}) {
  const {dimens} = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: dimens.tileRadius,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tint,
      }}>
      {children}
    </View>
  );
}
