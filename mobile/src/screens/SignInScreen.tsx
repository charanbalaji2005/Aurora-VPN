import React, {useState} from 'react';
import {KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View} from 'react-native';
import {useTheme} from '../design/theme';
import {Logo} from '../components/Logo';
import {PrimaryButton, TextField} from '../components/Primitives';
import {Icon} from '../components/Icon';
import {useStore} from '../state/store';

/**
 * Sign in.
 *
 * The account exists for exactly one reason and the screen says so: the free
 * allowance is counted on the server, so it has to belong to an account rather
 * than to a phone. Nothing else is asked for — no name, no phone number.
 *
 * There are no "continue with Google / Apple" buttons. The control plane has
 * no OAuth implementation, and a button that cannot work is worse than a
 * missing one.
 */
export function SignInScreen() {
  const {colors, type, dimens} = useTheme();
  const signIn = useStore(s => s.signIn);
  const busy = useStore(s => s.signingIn);
  const error = useStore(s => s.signInError);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);

  const canSubmit = !busy && email.trim().length > 3 && password.length > 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{flex: 1}}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingHorizontal: dimens.gutter,
          paddingVertical: dimens.gapXl,
          maxWidth: 460,
          width: '100%',
          alignSelf: 'center',
          gap: dimens.gapMd,
        }}>
        <View style={{alignItems: 'center', gap: dimens.gapSm, marginBottom: dimens.gapSm}}>
          <Logo size={52} />
          <Text style={[type.title, {color: colors.textPrimary, letterSpacing: 1}]}>AURORA VPN</Text>
        </View>

        <View style={{gap: 4, marginBottom: dimens.gapSm}}>
          <Text style={[type.display, {color: colors.textPrimary}]}>
            {creating ? 'Create your account' : 'Welcome back'}
          </Text>
          <Text style={[type.body, {color: colors.textSecondary}]}>
            {creating
              ? 'Three hours of protected browsing a day. The clock runs on our servers, so it follows your account, not this phone.'
              : 'Sign in to continue.'}
          </Text>
        </View>

        <TextField
          value={email}
          onChangeText={setEmail}
          placeholder="Email address"
          icon="mail"
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextField
          value={password}
          onChangeText={setPassword}
          placeholder={creating ? 'Password (at least 10 characters)' : 'Password'}
          icon="lock"
          secure
          autoComplete={creating ? 'new-password' : 'password'}
        />

        {error ? (
          <View
            style={{
              flexDirection: 'row',
              gap: 8,
              alignItems: 'flex-start',
              backgroundColor: colors.alertSoft,
              borderRadius: dimens.controlRadius,
              padding: 12,
            }}>
            <Icon name="alert" size={16} color={colors.alert} />
            <Text style={[type.body, {color: colors.alert, flex: 1}]}>{error}</Text>
          </View>
        ) : null}

        <PrimaryButton
          label={busy ? 'Working…' : creating ? 'Create account' : 'Sign in'}
          disabled={!canSubmit}
          onPress={() => signIn(email.trim(), password, creating)}
        />

        <Pressable
          accessibilityRole="button"
          onPress={() => setCreating(!creating)}
          style={{alignSelf: 'center', paddingVertical: 12}}>
          <Text style={[type.body, {color: colors.textMuted}]}>
            {creating ? 'Already have an account? ' : "Don't have an account? "}
            <Text style={{color: colors.accent, fontWeight: '600'}}>
              {creating ? 'Sign in' : 'Sign up'}
            </Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
