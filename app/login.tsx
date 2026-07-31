import React, { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AlertTriangle, Clock, MailCheck } from 'lucide-react-native'

import { useAuth } from '@/lib/AuthProvider'
import type { AuthResult } from '@core/utils/authErrors'
import { useTheme } from '@/theme/useTheme'
import { GlassSurface } from '@/components/Glass'
import { BrandMark } from '@/components/BrandMark'
import { Body, Label } from '@/components/Text'
import { Button } from '@/components/Button'
import { Field } from '@/components/Layout'
import { fonts, jade, spacing } from '@/theme/tokens'

/**
 * How long the resend button stays disabled after a send.
 *
 * Long enough that a second tap is a decision rather than impatience, short enough that
 * someone whose email genuinely did not arrive is not stuck waiting on the app instead of
 * on the mail. The server's own limit is the real one; this only stops the button being
 * treated as a "hurry up" control.
 */
const RESEND_COOLDOWN_SECONDS = 60

/** An inline result line. Errors read critical, confirmations positive, context neutral. */
const Message: React.FC<{ text: string; kind: 'error' | 'notice' | 'info' }> = ({
  text,
  kind,
}) => {
  const theme = useTheme()
  const color =
    kind === 'error'
      ? theme.status.critical
      : kind === 'notice'
        ? theme.status.good
        : theme.textSecondary
  const Icon = kind === 'error' ? AlertTriangle : kind === 'notice' ? MailCheck : Clock
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
      <Icon size={16} color={color} style={{ marginTop: 2 }} />
      <Body size={13} style={{ color, flex: 1 }}>
        {text}
      </Body>
    </View>
  )
}

export default function LoginScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const {
    signIn,
    signUp,
    resendConfirmation,
    hydrating,
    sessionEndedReason,
    clearSessionEndedReason,
    confirming,
    confirmationError,
    clearConfirmationError,
  } = useAuth()

  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // The address is registered but unverified, so offer another confirmation email.
  const [awaiting, setAwaiting] = useState(false)
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<AuthResult>, keepAwaiting = false) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await action()
      setError(result.error)
      setNotice(result.notice)
      if (!keepAwaiting) setAwaiting(result.awaitingConfirmation === true)
      return result
    } catch {
      // A rejection here — a network layer throwing rather than resolving with an error —
      // would otherwise skip setBusy(false) and leave the form permanently disabled, with
      // nothing on screen explaining why.
      setError('Something went wrong. Check your connection and try again.')
      return { error: null, notice: null } as AuthResult
    } finally {
      setBusy(false)
    }
  }

  const submit = async () => {
    clearSessionEndedReason()
    clearConfirmationError()
    const result = await run(() =>
      mode === 'in' ? signIn(email, password) : signUp(email, password),
    )
    // A brand new account cannot sign in until it is confirmed, so leave the user on the
    // form they will need next rather than on the one they just used.
    if (mode === 'up' && result.notice) setMode('in')
  }

  /*
    Every send burns quota that belongs to the whole project, not to this user.

    Supabase's outbound auth email is rate-limited per PROJECT — two an hour on the built-in
    sender, and still a finite number on custom SMTP. So one impatient person tapping "Resend"
    four times does not slow themselves down, they lock out the next three people who try to
    sign up. Nothing on screen said so, and the button gave no feedback between taps, which is
    exactly the shape that invites hammering.

    The countdown is client-side and therefore not a security control — it is the honest
    affordance for a limit that is real but invisible. The server enforces the actual cap and
    `over_email_send_rate_limit` reports it.
  */
  const [resendCooldown, setResendCooldown] = useState(0)

  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setTimeout(() => setResendCooldown(seconds => seconds - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendCooldown])

  const resend = () => {
    if (resendCooldown > 0) return
    setResendCooldown(RESEND_COOLDOWN_SECONDS)
    void run(() => resendConfirmation(email), true)
  }

  /*
    A successful sign-in does not end here: AuthProvider then fetches the account's saved
    data, and the router deliberately holds the user on this screen until it lands. Leaving
    the button idle for that window invited a second tap, which fires another
    signInWithPassword and can trip GoTrue's rate limiter right after a sign-in that
    actually worked. `hydrating` keeps the button busy through the whole journey.
  */
  const working = busy || hydrating || confirming
  const canSubmit = email.trim().length > 3 && password.length >= 6 && !working

  /*
    A bad confirmation link is recoverable by sending a new one, so the resend button is
    offered for that too — not only after a sign-up in this session. Without it the user is
    told the link expired and given nothing but a password field they do not have a password
    for yet.
  */
  const canResend = (awaiting || confirmationError !== null) && email.trim().length > 3

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      {/* Layered jade wash so the glass card has something worth refracting. A flat
          background makes blur invisible and the material read as a grey box. */}
      <LinearGradient
        colors={
          theme.mode === 'dark'
            ? [jade[900], theme.canvas, theme.canvas]
            : [jade[100], jade[50], theme.canvas]
        }
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '70%' }}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            paddingTop: insets.top + spacing.xl,
            paddingBottom: insets.bottom + spacing.xl,
            paddingHorizontal: spacing.lg,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ alignItems: 'center', marginBottom: spacing.xl, gap: spacing.md }}>
            <BrandMark />
            <Body style={{ fontFamily: fonts.displayBold, fontSize: 34, color: theme.text }}>
              MacroFit
            </Body>
            <Body tone="secondary" style={{ textAlign: 'center' }}>
              Nutrition, training and coaching that adapts to your own data.
            </Body>
          </View>

          <GlassSurface style={{ padding: spacing.lg, gap: spacing.lg }}>
            {/*
              First thing in the card, above the controls. The whole screen just replaced
              whatever the user was doing — possibly a live workout — so the explanation
              cannot sit under the password field as the last thing they read.
            */}
            {sessionEndedReason ? <Message text={sessionEndedReason} kind="info" /> : null}

            {/*
              The user tapped a link in their email and is watching the app open. Showing a
              password field first reads as the confirmation having failed, so the exchange
              gets said out loud while it runs.
            */}
            {confirming ? <Message text="Confirming your email…" kind="info" /> : null}

            {/*
              Its own state, not `sessionEndedReason`. That one says "Your session expired…
              everything you logged is still on this device", which after a stale confirmation
              link is false in every clause and sends the user looking for data loss that never
              happened. The resend button below stays on screen for every branch, so a bad link
              is never a dead end.
            */}
            {confirmationError ? <Message text={confirmationError} kind="error" /> : null}

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {(['in', 'up'] as const).map(m => {
                const active = mode === m
                return (
                  <Button
                    key={m}
                    label={m === 'in' ? 'Sign in' : 'Create account'}
                    variant={active ? 'primary' : 'ghost'}
                    onPress={() => {
                      setMode(m)
                      setError(null)
                      setNotice(null)
                    }}
                    style={{ flex: 1 }}
                  />
                )
              })}
            </View>

            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              inputMode="email"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              secureTextEntry
              autoCapitalize="none"
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            />

            {error ? <Message text={error} kind="error" /> : null}
            {notice ? <Message text={notice} kind="notice" /> : null}
            {hydrating ? <Message text="Restoring your data…" kind="info" /> : null}

            <Button
              label={mode === 'in' ? 'Sign in' : 'Create account'}
              onPress={submit}
              disabled={!canSubmit}
              loading={working}
              full
              haptic
            />

            {canResend ? (
              <Button
                label={
                  resendCooldown > 0
                    ? `Resend in ${resendCooldown}s`
                    : 'Resend confirmation email'
                }
                variant="ghost"
                onPress={resend}
                disabled={working || resendCooldown > 0}
                full
              />
            ) : null}
          </GlassSurface>

          <Label style={{ textAlign: 'center', marginTop: spacing.lg }}>
            Your data syncs privately across your devices
          </Label>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}
