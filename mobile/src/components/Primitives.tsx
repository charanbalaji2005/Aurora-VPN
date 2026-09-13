import React, {useRef, useState} from 'react';
import {
  Animated,
  Pressable,
  StyleProp,
  Switch,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import {Card, IconTile} from '../design/Surface';
import {useTheme} from '../design/theme';
import {Icon, IconName} from './Icon';

/**
 * Primary action.
 *
 * Solid indigo, full width, one per screen. The label always states what the
 * tap does rather than a generic "Continue".
 */
export function PrimaryButton({
  label,
  onPress,
  disabled,
  tone = 'accent',
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'accent' | 'protected' | 'alert';
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const {colors, type, dimens} = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const background =
    tone === 'protected' ? colors.protected : tone === 'alert' ? colors.alert : colors.accent;

  return (
    <Animated.View style={[{transform: [{scale}], width: '100%'}, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{disabled: !!disabled}}
        disabled={disabled}
        onPressIn={() =>
          Animated.timing(scale, {toValue: 0.985, duration: 100, useNativeDriver: true}).start()
        }
        onPressOut={() =>
          Animated.timing(scale, {toValue: 1, duration: 100, useNativeDriver: true}).start()
        }
        onPress={onPress}
        style={{
          minHeight: 52,
          borderRadius: dimens.controlRadius,
          backgroundColor: background,
          opacity: disabled ? 0.4 : 1,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
        }}>
        {icon ? <Icon name={icon} size={18} color="#FFFFFF" /> : null}
        <Text style={[type.bodyStrong, {color: '#FFFFFF'}]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

/** Quiet action: surface fill, hairline border. */
export function SecondaryButton({
  label,
  onPress,
  icon,
  tone,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  tone?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const {colors, type, dimens} = useTheme();
  const foreground = tone ?? colors.textPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        {
          minHeight: 44,
          paddingHorizontal: 16,
          borderRadius: dimens.controlRadius,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: colors.surface,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        },
        style,
      ]}>
      {icon ? <Icon name={icon} size={16} color={foreground} /> : null}
      <Text style={[type.label, {color: foreground}]}>{label}</Text>
    </Pressable>
  );
}

/**
 * A settings-style row: tinted icon tile, title, optional subtitle, and either
 * a value, a switch or a chevron on the right.
 */
export function ListRow({
  icon,
  tint,
  title,
  subtitle,
  value,
  onPress,
  trailing,
  danger,
  showChevron = true,
}: {
  icon?: IconName;
  tint?: string;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
  danger?: boolean;
  showChevron?: boolean;
}) {
  const {colors, type, dimens} = useTheme();
  const titleColor = danger ? colors.alert : colors.textPrimary;

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      onPress={onPress}
      disabled={!onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: dimens.gapMd,
        minHeight: dimens.minTouchTarget,
        paddingVertical: 10,
      }}>
      {icon ? (
        <IconTile tint={tint ?? colors.surfaceHover}>
          <Icon name={icon} size={17} color={danger ? colors.alert : colors.textPrimary} />
        </IconTile>
      ) : null}

      <View style={{flex: 1}}>
        <Text style={[type.bodyStrong, {color: titleColor}]}>{title}</Text>
        {subtitle ? (
          <Text style={[type.meta, {color: colors.textMuted}]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {value ? <Text style={[type.label, {color: colors.textSecondary}]}>{value}</Text> : null}
      {trailing}
      {onPress && !trailing && showChevron ? (
        <Icon name="chevronRight" size={18} color={colors.textMuted} />
      ) : null}
    </Pressable>
  );
}

export function AuroraSwitch({
  value,
  onValueChange,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  const {colors} = useTheme();
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      thumbColor="#FFFFFF"
      trackColor={{false: colors.surfaceHover, true: colors.protected}}
    />
  );
}

/**
 * A stat chip — download, upload, latency.
 *
 * Shows an em dash, never a zero, when there is no measurement. "0 Mbps"
 * claims a reading; "—" admits there isn't one. This is the rule the whole UI
 * follows and it is unit-tested.
 */
export function StatChip({
  icon,
  label,
  value,
  tint,
}: {
  icon: IconName;
  label: string;
  value: string;
  tint?: string;
}) {
  const {colors, type, dimens} = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label} ${value}`}
      style={{
        flex: 1,
        backgroundColor: colors.surface,
        borderRadius: dimens.controlRadius,
        borderWidth: 1,
        borderColor: colors.line,
        paddingVertical: 12,
        paddingHorizontal: 10,
        alignItems: 'center',
        gap: 4,
      }}>
      <Text style={[type.metric, {color: colors.textPrimary}]}>{value}</Text>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
        <Icon name={icon} size={12} color={tint ?? colors.textMuted} />
        <Text style={[type.meta, {color: colors.textMuted}]}>{label}</Text>
      </View>
    </View>
  );
}

/** Key/value line used in the connection details and diagnostics tables. */
export function DetailRow({
  label,
  value,
  valueColor,
  mono,
}: {
  label: string;
  value: string;
  valueColor?: string;
  mono?: boolean;
}) {
  const {colors, type} = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={{flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 11}}>
      <Text style={[type.body, {color: colors.textSecondary}]}>{label}</Text>
      <Text
        style={[
          mono ? type.mono : type.bodyStrong,
          {color: valueColor ?? colors.textPrimary, flexShrink: 1, textAlign: 'right'},
        ]}>
        {value}
      </Text>
    </View>
  );
}

/** Flat progress bar. Used for the daily allowance. */
export function ProgressBar({
  fraction,
  tone,
  height = 6,
}: {
  fraction: number;
  tone?: string;
  height?: number;
}) {
  const {colors} = useTheme();
  const clamped = Math.max(0, Math.min(1, fraction));
  return (
    <View
      style={{
        height,
        borderRadius: height,
        backgroundColor: colors.surfaceHover,
        overflow: 'hidden',
      }}>
      <View
        style={{
          width: `${clamped * 100}%`,
          height,
          borderRadius: height,
          backgroundColor: tone ?? colors.accent,
        }}
      />
    </View>
  );
}

/** Filter pills: All / Asia / Europe / Americas, and similar. */
export function FilterChips({
  options,
  selectedIndex,
  onSelect,
}: {
  options: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const {colors, type, dimens} = useTheme();
  return (
    <View style={{flexDirection: 'row', gap: dimens.gapSm, flexWrap: 'wrap'}}>
      {options.map((label, index) => {
        const active = index === selectedIndex;
        return (
          <Pressable
            key={label}
            accessibilityRole="tab"
            accessibilityState={{selected: active}}
            onPress={() => onSelect(index)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: active ? colors.accent : colors.surface,
              borderWidth: 1,
              borderColor: active ? colors.accent : colors.line,
            }}>
            <Text
              style={[type.label, {color: active ? '#FFFFFF' : colors.textSecondary}]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SearchField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
}) {
  const {colors, type, dimens} = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 14,
        borderRadius: dimens.controlRadius,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
      }}>
      <Icon name="search" size={17} color={colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={placeholder}
        style={[type.body, {flex: 1, color: colors.textPrimary, paddingVertical: 12}]}
      />
    </View>
  );
}

/** Labelled text field with a leading icon and an optional reveal toggle. */
export function TextField({
  value,
  onChangeText,
  placeholder,
  icon,
  secure,
  keyboardType,
  autoComplete,
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
  icon: IconName;
  secure?: boolean;
  keyboardType?: 'email-address' | 'default';
  autoComplete?: 'email' | 'password' | 'new-password';
}) {
  const {colors, type, dimens} = useTheme();
  const [revealed, setRevealed] = useState(false);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 14,
        borderRadius: dimens.controlRadius,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
      }}>
      <Icon name={icon} size={17} color={colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        secureTextEntry={secure && !revealed}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={autoComplete}
        accessibilityLabel={placeholder}
        style={[type.body, {flex: 1, color: colors.textPrimary, paddingVertical: 14}]}
      />
      {secure ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
          hitSlop={10}
          onPress={() => setRevealed(!revealed)}>
          <Icon name={revealed ? 'eyeOff' : 'eye'} size={17} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Empty and error states.
 *
 * A list with nothing in it says what happened and what to do next. A blank
 * screen is a bug report waiting to happen.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body: string;
  action?: {label: string; onPress: () => void};
}) {
  const {colors, type, dimens} = useTheme();
  return (
    <Card padding={dimens.gapLg}>
      <View style={{alignItems: 'center', gap: dimens.gapSm}}>
        <IconTile tint={colors.surfaceHover} size={44}>
          <Icon name={icon} size={20} color={colors.textMuted} />
        </IconTile>
        <Text style={[type.bodyStrong, {color: colors.textPrimary, textAlign: 'center'}]}>
          {title}
        </Text>
        <Text style={[type.body, {color: colors.textMuted, textAlign: 'center'}]}>{body}</Text>
        {action ? (
          <SecondaryButton label={action.label} onPress={action.onPress} style={{marginTop: 6}} />
        ) : null}
      </View>
    </Card>
  );
}

/** Screen header with an optional back affordance and trailing slot. */
export function ScreenHeader({
  title,
  onBack,
  trailing,
  subtitle,
}: {
  title: string;
  onBack?: () => void;
  trailing?: React.ReactNode;
  subtitle?: string;
}) {
  const {colors, type, dimens} = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: dimens.gapSm,
        paddingVertical: dimens.gapSm,
      }}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={12} onPress={onBack}>
          <Icon name="arrowLeft" size={22} color={colors.textPrimary} />
        </Pressable>
      ) : null}
      <View style={{flex: 1}}>
        <Text style={[type.title, {color: colors.textPrimary}]}>{title}</Text>
        {subtitle ? <Text style={[type.meta, {color: colors.textMuted}]}>{subtitle}</Text> : null}
      </View>
      {trailing}
    </View>
  );
}
