import React, { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AlertTriangle, MailCheck } from 'lucide-react-native'

import { useAuth } from '@/lib/AuthProvider'
import { useTheme } from '@/theme/useTheme'
import { GlassSurface } from '@/components/Glass'
import { BrandMark } from '@/components/BrandMark'
import { Body, Label } from '@/components/Text'
import { Button } from '@/components/Button'
import { Field } from '@/components/Layout'
import { Aurora } from '@/components/Aurora'
import { fonts, spacing } from '@/theme/tokens'

/**
 * GoTrue's own floor. Rejecting a short password here rather than at the server saves a
 * round-trip and phrases the rule before it is broken instead of after.
 */
const MIN_PASSWORD = 6

/** Matches the login screen's inline result line, which this screen is a sibling of. */
const Message: React.FC<{ text: string; kind: 'error' | 'notice' }> = ({ text, kind }) => {
  const theme = useTheme()
  const color = kind === 'error' ? theme.status.critical : theme.status.good
  const Icon = kind === 'error' ? AlertTriangle : MailCheck
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
      <Icon size={16} color={color} style={{ marginTop: 2 }} />
      <Body size={13} style={{ color, flex: 1 }}>
        {text}
      </Body>
    </View>
  )
}

/**
 * Choose a new password, at the end of a recovery link.
 *
 * WHY THIS SCREEN DID NOT EXIST UNTIL NOW: `updatePassword` has been on the auth context
 * since sign-in was added, and nothing ever called it. A reset link was understood to be a
 * sign-in link — the user got their data back and was expected to change the password later
 * from Profile, which no screen offered either. So "reset your password" reset nothing, and
 * the email's promise of choosing a new one was never kept by anything.
 *
 * ROUTING OWNS ENTRY, NOT THIS SCREEN. `recoveryPending` is set by the deep-link handler and
 * the root layout redirects here while it is true, which is what stops the session drifting
 * into the app behind the user's back. Clearing it is this screen's only exit, so the
 * decision cannot be skipped by a back gesture.
 *
 * There is deliberately no "skip". The session is already live — the account's data is
 * restored the moment the link is redeemed — so the only thing at stake is whether the old
 * password keeps working, and leaving that ambiguous after a reset is worse than one form.
 */
export default function ResetPasswordScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { user, updatePassword, clearRecoveryPending } = useAuth()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD
  const mismatch = confirm.length > 0 && confirm !== password
  const canSubmit =
    !working && password.length >= MIN_PASSWORD && confirm === password

  const submit = async () => {
    if (!canSubmit) return
    setWorking(true)
    setError(null)
    const result = await updatePassword(password)
    setWorking(false)
    if (result.error !== null) {
      setError(result.error)
      return
    }
    /*
      Clearing the flag is what releases routing, and routing is what navigates — this screen
      does not push anywhere itself. A `replace` from here would race the redirect the root
      layout is about to run and could land the user on a screen it then moves them off.
    */
    clearRecoveryPending()
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      {/* Absolutely filled, behind the form. An empty LiquidGlassScene used to sit here as a
          flex:1 sibling, which took half the screen and squeezed the form into the bottom. */}
      <Aurora />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            padding: spacing.lg,
            paddingTop: insets.top + spacing.xl,
            paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.xl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: 'center', gap: spacing.md, paddingBottom: spacing.xl }}>
            <BrandMark />
          </View>

          <GlassSurface style={{ padding: spacing.lg, gap: spacing.lg }}>
            <View style={{ gap: spacing.xs }}>
              <Body size={20} weight="semibold" style={{ fontFamily: fonts.display }}>
                Choose a new password
              </Body>
              <Body size={13} tone="secondary">
                {user?.email !== undefined && user.email !== null
                  ? `For ${user.email}. Your diary, weight log and workouts are untouched.`
                  : 'Your diary, weight log and workouts are untouched.'}
              </Body>
            </View>

            <View style={{ gap: spacing.md }}>
              <Field
                label="New password"
                value={password}
                onChangeText={setPassword}
                placeholder={`At least ${MIN_PASSWORD} characters`}
                accessibilityLabel="New password"
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                editable={!working}
              />
              <Field
                label="Confirm password"
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Type it again"
                accessibilityLabel="Confirm new password"
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                editable={!working}
                onSubmitEditing={() => void submit()}
                returnKeyType="done"
              />
            </View>

            {/* One message at a time, and the local rules before the server's: a mismatch the
                user can see for themselves must not be reported as a server error. */}
            {tooShort ? (
              <Message text={`Use at least ${MIN_PASSWORD} characters.`} kind="error" />
            ) : mismatch ? (
              <Message text="Those two do not match." kind="error" />
            ) : error !== null ? (
              <Message text={error} kind="error" />
            ) : null}

            <Button
              label="Save password"
              onPress={() => void submit()}
              disabled={!canSubmit}
              loading={working}
              full
              haptic
            />
          </GlassSurface>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}
