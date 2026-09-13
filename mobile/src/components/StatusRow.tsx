import React from 'react';
import {Text, View} from 'react-native';
import {useTheme} from '../design/theme';
import {Icon, IconName} from './Icon';

export type CheckState = 'pass' | 'warn' | 'fail' | 'unknown';

/**
 * One diagnostic line.
 *
 * `unknown` is a first-class state and it is used honestly: a check the app
 * cannot actually perform renders grey with "Not checked", never a green tick.
 * A diagnostics screen that always reports green is worse than no diagnostics
 * screen, because someone will trust it.
 */
export function StatusRow({
  state,
  label,
  value,
  note,
}: {
  state: CheckState;
  label: string;
  value: string;
  note?: string;
}) {
  const {colors, type, dimens} = useTheme();

  const tint =
    state === 'pass'
      ? colors.protected
      : state === 'warn'
        ? colors.negotiating
        : state === 'fail'
          ? colors.alert
          : colors.textMuted;

  const icon: IconName =
    state === 'pass' ? 'checkCircle' : state === 'fail' ? 'alert' : state === 'warn' ? 'alert' : 'info';

  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}${note ? `. ${note}` : ''}`}
      style={{flexDirection: 'row', alignItems: 'center', gap: dimens.gapMd, paddingVertical: 11}}>
      <Icon name={icon} size={20} color={tint} />
      <View style={{flex: 1}}>
        <Text style={[type.body, {color: colors.textPrimary}]}>{label}</Text>
        {note ? <Text style={[type.meta, {color: colors.textMuted}]}>{note}</Text> : null}
      </View>
      <Text style={[type.label, {color: tint}]}>{value}</Text>
    </View>
  );
}
