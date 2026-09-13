import React, {useState} from 'react';
import {Alert, Pressable, ScrollView, Text, View} from 'react-native';
import {Card, Divider, SectionLabel} from '../design/Surface';
import {useTheme} from '../design/theme';
import {ListRow, ProgressBar, ScreenHeader} from '../components/Primitives';
import {remainingFraction} from '../domain/models';
import {useStore} from '../state/store';
import {formatDuration, formatDurationShort} from '../util/format';
import {nativeVpn} from '../vpn/native';
import {auroraApi} from '../api/auroraApi';

export function AccountScreen({
  onBack,
  onOpenLegal,
}: {
  onBack: () => void;
  onOpenLegal?: () => void;
}) {
  const {colors, dimens, type} = useTheme();

  const account = useStore(s => s.account);
  const devices = useStore(s => s.devices);
  const quota = useStore(s => s.quota);
  const signOut = useStore(s => s.signOut);
  const loadDevices = useStore(s => s.loadDevices);

  const [rotating, setRotating] = useState(false);
  const [rotateStatus, setRotateStatus] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const initial = (account?.email ?? '?').charAt(0).toUpperCase();

  const handleRotateKey = async () => {
    try {
      setRotating(true);
      setRotateStatus('Generating new WireGuard key pair...');
      const newPublicKey = await nativeVpn.rotateKeyPair();
      const currentDeviceId = devices[0]?.id;
      if (currentDeviceId) {
        setRotateStatus('Updating public key on control plane...');
        await auroraApi.rotateDeviceKey(currentDeviceId, newPublicKey);
        await loadDevices();
        setRotateStatus('Key rotated successfully! Old peers revoked.');
      } else {
        setRotateStatus('Local key rotated. Reconnect to apply.');
      }
    } catch (err: any) {
      setRotateStatus('Key rotation failed: ' + (err.message || String(err)));
    } finally {
      setRotating(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      setDeleting(true);
      await auroraApi.deleteAccount();
      await signOut();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to delete account.');
      setDeleting(false);
      setConfirmDelete(false);
    }
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
      <ScreenHeader title="Account" onBack={onBack} />

      <Card>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: dimens.gapMd}}>
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: colors.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Text style={[type.title, {color: colors.accent}]}>{initial}</Text>
          </View>
          <View style={{flex: 1}}>
            <Text style={[type.bodyStrong, {color: colors.textPrimary}]}>
              {account?.email ?? 'Signed in'}
            </Text>
            <View
              style={{
                alignSelf: 'flex-start',
                marginTop: 4,
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 999,
                backgroundColor: colors.surfaceHover,
              }}>
              <Text style={[type.meta, {color: colors.textSecondary, textTransform: 'capitalize'}]}>
                {account?.plan ?? 'free'} plan
                {account?.status === 'suspended' ? ' · suspended' : ''}
              </Text>
            </View>
          </View>
        </View>
      </Card>

      <Card>
        <View style={{gap: dimens.gapSm}}>
          <SectionLabel>Daily VPN time</SectionLabel>
          <View style={{flexDirection: 'row', alignItems: 'baseline'}}>
            <Text style={[type.hero, {color: colors.textPrimary, flex: 1}]}>
              {quota.unlimited ? '∞' : formatDuration(quota.remainingSeconds)}
            </Text>
            <Text style={[type.label, {color: colors.textMuted}]}>
              {quota.unlimited
                ? 'unlimited'
                : `of ${formatDurationShort(quota.dailySeconds)} left`}
            </Text>
          </View>
          {!quota.unlimited ? (
            <ProgressBar
              fraction={1 - remainingFraction(quota)}
              tone={quota.remainingSeconds <= 0 ? colors.alert : colors.accent}
            />
          ) : null}
          <Text style={[type.meta, {color: colors.textMuted}]}>
            {quota.resetsAtIso
              ? `Resets ${new Date(quota.resetsAtIso).toUTCString()}`
              : 'Resets at midnight UTC.'}
          </Text>
        </View>
      </Card>

      <Card padding={dimens.gapMd}>
        <ListRow
          icon="device"
          tint={colors.accentSoft}
          title="Devices"
          subtitle={
            devices.length === 1
              ? '1 device registered to this account'
              : `${devices.length} devices registered to this account`
          }
          showChevron={false}
        />
        <Divider inset={48} />
        <ListRow
          icon="key"
          tint={colors.surfaceHover}
          title="Rotate WireGuard Key"
          subtitle={rotating ? 'Rotating keys…' : 'Regenerate local keypair and update server'}
          onPress={() => void handleRotateKey()}
          showChevron={!rotating}
        />
        {rotateStatus ? (
          <Text
            style={[
              type.meta,
              {
                color: rotateStatus.includes('failed') ? colors.alert : colors.protected,
                marginTop: 8,
                marginLeft: 48,
              },
            ]}>
            {rotateStatus}
          </Text>
        ) : null}
        {onOpenLegal ? (
          <>
            <Divider inset={48} />
            <ListRow
              icon="shield"
              tint={colors.accentSoft}
              title="Privacy Policy & Terms"
              subtitle="Zero-logs guarantee and data retention policy"
              onPress={onOpenLegal}
              showChevron
            />
          </>
        ) : null}
      </Card>

      <Card padding={dimens.gapMd}>
        <ListRow
          icon="logout"
          tint={colors.surfaceHover}
          title="Sign out"
          subtitle="Disconnects the VPN and forgets this session"
          onPress={() => void signOut()}
          showChevron={false}
        />
        <Divider inset={48} />
        <ListRow
          icon="trash"
          tint={colors.alertSoft}
          title={confirmDelete ? 'Confirm Permanent Account Deletion' : 'Delete Account'}
          subtitle={
            confirmDelete
              ? 'Tap again to permanently wipe your account, peers, and sessions.'
              : 'Revokes all devices, ends sessions, and removes account data'
          }
          danger
          onPress={() => void handleDeleteAccount()}
          showChevron={false}
        />
        {confirmDelete ? (
          <Pressable
            onPress={() => setConfirmDelete(false)}
            style={{marginTop: 8, alignSelf: 'flex-start', marginLeft: 48}}>
            <Text style={[type.meta, {color: colors.textMuted}]}>Cancel deletion</Text>
          </Pressable>
        ) : null}
      </Card>
    </ScrollView>
  );
}
