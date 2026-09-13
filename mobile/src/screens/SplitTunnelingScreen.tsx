import React, {useState} from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {Card, Divider, SectionLabel} from '../design/Surface';
import {useTheme} from '../design/theme';
import {ScreenHeader} from '../components/Primitives';
import {Icon} from '../components/Icon';
import {useStore} from '../state/store';
import {SplitTunnelMode} from '../domain/models';

const COMMON_APPS = [
  {name: 'Google Chrome', pkg: 'com.android.chrome'},
  {name: 'YouTube', pkg: 'com.google.android.youtube'},
  {name: 'Spotify', pkg: 'com.spotify.music'},
  {name: 'Netflix', pkg: 'com.netflix.mediaclient'},
  {name: 'WhatsApp', pkg: 'com.whatsapp'},
  {name: 'Telegram', pkg: 'org.telegram.messenger'},
  {name: 'Banking / Financial', pkg: 'com.example.bank'},
];

export function SplitTunnelingScreen({onBack}: {onBack: () => void}) {
  const {colors, dimens, type} = useTheme();
  const preferences = useStore(s => s.preferences);
  const setPreference = useStore(s => s.setPreference);

  const [customPkg, setCustomPkg] = useState('');

  const currentMode = preferences.splitMode;
  const currentPackages = preferences.splitPackages || [];

  const handleSelectMode = (mode: SplitTunnelMode) => {
    void setPreference('splitMode', mode);
  };

  const handleTogglePackage = (pkg: string) => {
    let updated: string[];
    if (currentPackages.includes(pkg)) {
      updated = currentPackages.filter(p => p !== pkg);
    } else {
      updated = [...currentPackages, pkg];
    }
    void setPreference('splitPackages', updated);
  };

  const handleAddCustom = () => {
    const trimmed = customPkg.trim().toLowerCase();
    if (!trimmed || currentPackages.includes(trimmed)) return;
    void setPreference('splitPackages', [...currentPackages, trimmed]);
    setCustomPkg('');
  };

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
      <ScreenHeader title="Split Tunnelling" onBack={onBack} />

      <Card>
        <Text style={[type.body, {color: colors.textSecondary}]}>
          Split tunnelling lets specific applications bypass or exclusively use the
          WireGuard tunnel.
        </Text>
      </Card>

      <View>
        <SectionLabel>Tunnelling Mode</SectionLabel>
        <Card padding={dimens.gapSm}>
          <ModeOption
            title="All Apps"
            description="All device traffic routes through the secure tunnel"
            selected={currentMode === 'ALL_APPS'}
            onPress={() => handleSelectMode('ALL_APPS')}
          />
          <Divider inset={16} />
          <ModeOption
            title="Bypass VPN"
            description="Selected apps connect directly to the Internet outside VPN"
            selected={currentMode === 'EXCLUDE_SELECTED'}
            onPress={() => handleSelectMode('EXCLUDE_SELECTED')}
          />
          <Divider inset={16} />
          <ModeOption
            title="Only Selected Apps"
            description="Only specified apps route through VPN; all others bypass"
            selected={currentMode === 'ONLY_SELECTED'}
            onPress={() => handleSelectMode('ONLY_SELECTED')}
          />
        </Card>
      </View>

      {currentMode !== 'ALL_APPS' ? (
        <>
          <View>
            <SectionLabel>Add Application Package</SectionLabel>
            <Card padding={dimens.gapMd}>
              <View style={{flexDirection: 'row', gap: dimens.gapSm, alignItems: 'center'}}>
                <TextInput
                  value={customPkg}
                  onChangeText={setCustomPkg}
                  placeholder="e.g. com.android.chrome"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[
                    type.body,
                    {
                      flex: 1,
                      backgroundColor: colors.surfaceHover,
                      borderRadius: dimens.cardRadiusSm,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      color: colors.textPrimary,
                    },
                  ]}
                />
                <Pressable
                  onPress={handleAddCustom}
                  style={{
                    backgroundColor: colors.accent,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: dimens.cardRadiusSm,
                  }}>
                  <Text style={[type.label, {color: '#FFFFFF'}]}>Add</Text>
                </Pressable>
              </View>
            </Card>
          </View>

          <View>
            <SectionLabel>Common Applications</SectionLabel>
            <Card padding={dimens.gapSm}>
              {COMMON_APPS.map((app, idx) => {
                const isSelected = currentPackages.includes(app.pkg);
                return (
                  <React.Fragment key={app.pkg}>
                    {idx > 0 ? <Divider inset={16} /> : null}
                    <Pressable
                      onPress={() => handleTogglePackage(app.pkg)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 12,
                        paddingHorizontal: 12,
                        borderRadius: dimens.cardRadiusSm,
                        backgroundColor: isSelected ? colors.surfaceHover : 'transparent',
                      }}>
                      <View style={{flex: 1, paddingRight: 12}}>
                        <Text style={[type.bodyStrong, {color: colors.textPrimary}]}>
                          {app.name}
                        </Text>
                        <Text style={[type.meta, {color: colors.textMuted}]}>
                          {app.pkg}
                        </Text>
                      </View>
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          borderWidth: 2,
                          borderColor: isSelected ? colors.accent : colors.border,
                          backgroundColor: isSelected ? colors.accent : 'transparent',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                        {isSelected ? <Icon name="check" size={14} color="#FFFFFF" /> : null}
                      </View>
                    </Pressable>
                  </React.Fragment>
                );
              })}
            </Card>
          </View>

          {currentPackages.length > 0 ? (
            <View>
              <SectionLabel>Selected Packages ({currentPackages.length})</SectionLabel>
              <Card padding={dimens.gapMd}>
                <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
                  {currentPackages.map(pkg => (
                    <View
                      key={pkg}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        backgroundColor: colors.accentSoft,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                      }}>
                      <Text style={[type.meta, {color: colors.accent}]}>{pkg}</Text>
                      <Pressable onPress={() => handleTogglePackage(pkg)}>
                        <Icon name="x" size={12} color={colors.accent} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </Card>
            </View>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

function ModeOption({
  title,
  description,
  selected,
  onPress,
}: {
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}) {
  const {colors, dimens, type} = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: dimens.cardRadiusSm,
        backgroundColor: selected ? colors.accentSoft : 'transparent',
      }}>
      <View style={{flex: 1, paddingRight: 12}}>
        <Text
          style={[
            type.bodyStrong,
            {color: selected ? colors.accent : colors.textPrimary},
          ]}>
          {title}
        </Text>
        <Text style={[type.meta, {color: colors.textSecondary, marginTop: 2}]}>
          {description}
        </Text>
      </View>
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          borderWidth: 2,
          borderColor: selected ? colors.accent : colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {selected ? (
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: colors.accent,
            }}
          />
        ) : null}
      </View>
    </Pressable>
  );
}
