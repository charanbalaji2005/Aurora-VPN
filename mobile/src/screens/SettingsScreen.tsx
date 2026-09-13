import React from 'react';
import {ScrollView, Text, View} from 'react-native';
import {Card, Divider, SectionLabel} from '../design/Surface';
import {useTheme} from '../design/theme';
import {AuroraSwitch, ListRow, ScreenHeader} from '../components/Primitives';
import {useStore} from '../state/store';

/**
 * Settings.
 *
 * Every row says what it actually does, including where Android limits us. The
 * kill switch is the clearest case: an app cannot block traffic system-wide on
 * its own, so the row explains that the system setting is the one that
 * enforces it rather than implying a protection this app provides.
 */
export function SettingsScreen({
  onOpenAccount,
  onOpenDiagnostics,
  onOpenSplitTunneling,
  onOpenLegal,
}: {
  onOpenAccount: () => void;
  onOpenDiagnostics: () => void;
  onOpenSplitTunneling?: () => void;
  onOpenLegal?: () => void;
}) {
  const {colors, dimens, type} = useTheme();
  const preferences = useStore(s => s.preferences);
  const setPreference = useStore(s => s.setPreference);
  const account = useStore(s => s.account);

  const splitSubtitle =
    preferences.splitMode === 'ALL_APPS'
      ? 'All apps go through the VPN'
      : preferences.splitMode === 'EXCLUDE_SELECTED'
        ? `${preferences.splitPackages.length} apps bypass the VPN`
        : `Only ${preferences.splitPackages.length} apps use the VPN`;

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
      <ScreenHeader title="Settings" />

      <Card padding={dimens.gapMd}>
        <ListRow
          icon="user"
          tint={colors.accentSoft}
          title="Account"
          subtitle={account?.email ?? 'Plan, devices and daily time'}
          onPress={onOpenAccount}
        />
      </Card>

      <View>
        <SectionLabel>Connection</SectionLabel>
        <Card padding={dimens.gapMd}>
          <ListRow
            icon="zap"
            tint={colors.accentSoft}
            title="Fastest location"
            subtitle="Picks the gateway with the lowest median latency"
            trailing={
              <AuroraSwitch
                value={preferences.preferFastest}
                onValueChange={value => void setPreference('preferFastest', value)}
              />
            }
          />
          <Divider inset={48} />
          <ListRow
            icon="refresh"
            tint={colors.surfaceHover}
            title="Reconnect automatically"
            subtitle="Resumes the tunnel after network changes"
            trailing={
              <AuroraSwitch
                value={preferences.autoReconnect}
                onValueChange={value => void setPreference('autoReconnect', value)}
              />
            }
          />
          <Divider inset={48} />
          <ListRow
            icon="power"
            tint={colors.surfaceHover}
            title="Connect on start-up"
            subtitle="Turns the VPN on after the phone reboots"
            trailing={
              <AuroraSwitch
                value={preferences.autoConnect}
                onValueChange={value => void setPreference('autoConnect', value)}
              />
            }
          />
        </Card>
      </View>

      <View>
        <SectionLabel>Protection</SectionLabel>
        <Card padding={dimens.gapMd}>
          <ListRow
            icon="lock"
            tint={colors.protectedSoft}
            title="Block traffic when the VPN drops"
            subtitle='Android calls this "Always-on VPN" with "Block connections without VPN". Only the system can enforce it.'
            trailing={
              <AuroraSwitch
                value={preferences.killSwitch}
                onValueChange={value => void setPreference('killSwitch', value)}
              />
            }
          />
          <Divider inset={48} />
          <ListRow
            icon="shield"
            tint={colors.protectedSoft}
            title="Block IPv6 outside the tunnel"
            subtitle="Stops IPv6 escaping on networks the gateway does not carry"
            trailing={
              <AuroraSwitch
                value={preferences.blockIpv6}
                onValueChange={value => void setPreference('blockIpv6', value)}
              />
            }
          />
          <Divider inset={48} />
          <ListRow
            icon="route"
            tint={colors.accentSoft}
            title="Split tunnelling"
            subtitle={splitSubtitle}
            onPress={onOpenSplitTunneling}
            showChevron={!!onOpenSplitTunneling}
          />
        </Card>
      </View>

      <View>
        <SectionLabel>Support & Legal</SectionLabel>
        <Card padding={dimens.gapMd}>
          <ListRow
            icon="activity"
            tint={colors.surfaceHover}
            title="Diagnostics"
            subtitle="Tunnel state, handshake age, DNS and IPv6 policy"
            onPress={onOpenDiagnostics}
          />
          <Divider inset={48} />
          <ListRow
            icon="shield"
            tint={colors.accentSoft}
            title="Privacy Policy & Terms"
            subtitle="Strict zero-log network guarantee and terms"
            onPress={onOpenLegal}
            showChevron={!!onOpenLegal}
          />
          <Divider inset={48} />
          <ListRow
            icon="info"
            tint={colors.surfaceHover}
            title="About"
            subtitle="Aurora VPN 1.0.0 · WireGuard"
            showChevron={false}
          />
        </Card>
      </View>

      <Card>
        <View style={{gap: 6}}>
          <SectionLabel>Privacy</SectionLabel>
          <Text style={[type.body, {color: colors.textSecondary}]}>
            We keep your account, the devices registered to it, and how long sessions lasted —
            that last one is what the free allowance is counted from. We do not keep browsing
            history, DNS queries or connection destinations, because the gateways never write
            them down.
          </Text>
        </View>
      </Card>
    </ScrollView>
  );
}
