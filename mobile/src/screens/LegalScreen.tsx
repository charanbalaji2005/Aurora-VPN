import React from 'react';
import {ScrollView, Text, View} from 'react-native';
import {Card, SectionLabel} from '../design/Surface';
import {useTheme} from '../design/theme';
import {ScreenHeader} from '../components/Primitives';

export function LegalScreen({onBack}: {onBack: () => void}) {
  const {colors, dimens, type} = useTheme();

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
      <ScreenHeader title="Privacy & Legal" onBack={onBack} />

      <View>
        <SectionLabel>Privacy Policy</SectionLabel>
        <Card padding={dimens.gapMd}>
          <Text style={[type.titleSm, {color: colors.textPrimary, marginBottom: 8}]}>
            Strict Zero-Log Network Guarantee
          </Text>
          <Text style={[type.body, {color: colors.textSecondary, marginBottom: 12}]}>
            Aurora VPN does not inspect, monitor, record, store, or log any user DNS queries,
            browsing history, traffic destinations, data content, or IP addresses assigned during
            tunnel sessions.
          </Text>
          <Text style={[type.body, {color: colors.textSecondary}]}>
            WireGuard cryptographic keys are generated locally on your device and are never
            transferred to our servers. Only your public key is provisioned to authorized VPN
            gateways for the duration of an active session.
          </Text>
        </Card>
      </View>

      <View>
        <SectionLabel>Terms of Service</SectionLabel>
        <Card padding={dimens.gapMd}>
          <Text style={[type.titleSm, {color: colors.textPrimary, marginBottom: 8}]}>
            Acceptable Use Policy
          </Text>
          <Text style={[type.body, {color: colors.textSecondary, marginBottom: 12}]}>
            By connecting to the Aurora VPN platform, you agree not to use the service for
            unlawful activities, denial-of-service attacks, transmitting malicious code, or
            violating intellectual property rights.
          </Text>
          <Text style={[type.titleSm, {color: colors.textPrimary, marginBottom: 8}]}>
            Account & Data Rights (GDPR & CCPA)
          </Text>
          <Text style={[type.body, {color: colors.textSecondary}]}>
            You hold the right to delete your account at any time. Triggering account deletion
            instantly terminates all sessions, revokes WireGuard peers on all gateways, and
            purges your account credentials and daily usage counters permanently.
          </Text>
        </Card>
      </View>
    </ScrollView>
  );
}
