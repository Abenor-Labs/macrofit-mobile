import React, { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { landAt } from '@/lib/landAt'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AlertTriangle, Clock, MailCheck } from 'lucide-react-native'

import { useAuth } from '@/lib/AuthProvider'
import { enterGuestMode } from '@/lib/welcomeSeen'
import { useStore } from '@/store/useStore'
import type { AuthResult } from '@core/utils/authErrors'
import { useTheme } from '@/theme/useTheme'
import { GlassSurface } from '@/components/Glass'
import { BrandMark } from '@/components/BrandMark'
import { Body, Label } from '@/components/Text'
import { Button } from '@/components/Button'
import { Field } from '@/components/Layout'
import { fonts, spacing } from '@/theme/tokens'
import { Aurora } from '@/components/Aurora'
import { LiquidGlassScene } from '@/components/LiquidGlass'
import { Segmented } from '@/components/Segmented'

/**
 * How long the resend button stays disabled after a send.
 *
 * Long enough that a second tap is a decision rather than impatience, short enough that
 * someone whose email genuinely did not arrive is not stuck waiting on the app instead of
 * on the mail. The server's own limit is the real one; this only stops the button being
 * treated as a "hurry up" control.
 */
const RESEND_COOLDOWN_SECONDS = 60

/** The two things this screen can be. Order is the order they appear in the control. */
const MODES = [
  { value: 'in' as const, label: 'Sign in' },
  { value: 'up' as const, label: 'Create account' },
]

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
  const onboardedAt = useStore(s => s.onboardedAt)
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
    requestPasswordReset,
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
    /*
      The jade wash that used to live here is now `Aurora`, and it is the scene's declared
      backdrop rather than a sibling gradient.

      The old comment was right about why it existed — "so the glass card has something worth
      refracting" — but a static top-to-bottom ramp is the one shape a lens cannot show,
      because magnifying a linear gradient about any point returns the same linear gradient.
      Aurora has orbs with edges, and edges are the thing that visibly fails to line up
      across a pane border.
    */
    <LiquidGlassScene backdrop={<Aurora />} style={{ backgroundColor: theme.canvas }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
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
            {/* `size`, not a fontSize override — Body derives lineHeight from the prop, so
                styling only fontSize crams a 34pt glyph into the 21.75pt box the default
                implies and Android shears the caps. Same fix as welcome.tsx. */}
            <Body size={30} style={{ fontFamily: fonts.displayBold, color: theme.text }}>
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

            {/*
              One control, not two buttons. The selection is a pane that travels between the
              options rather than being repainted in place — see Segmented.tsx for why that
              distinction is the whole effect.
            */}
            <Segmented
              options={MODES}
              value={mode}
              onChange={next => {
                setMode(next)
                setError(null)
                setNotice(null)
              }}
            />

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

            {/*
              Only on the sign-in tab. On "Create account" there is no password to have
              forgotten, and offering a reset there invites people to request a link for an
              address that has no account behind it.

              Same cooldown as the resend button, and for the same reason: every one of these
              spends the project's shared email quota, not the sender's.
            */}
            {mode === 'in' ? (
              <Button
                label={
                  resendCooldown > 0
                    ? `Email a sign-in link in ${resendCooldown}s`
                    : 'Forgot password? Email me a sign-in link'
                }
                variant="ghost"
                onPress={() => {
                  if (resendCooldown > 0) return
                  setResendCooldown(RESEND_COOLDOWN_SECONDS)
                  void run(() => requestPasswordReset(email), true)
                }}
                disabled={working || resendCooldown > 0 || email.trim().length < 4}
                full
              />
            ) : null}

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

          {/*
            THE WAY OUT. Without it this screen is still a wall.

            Every other route into the app now allows carrying on without an account, but a
            person can land here in states that have nothing to do with choosing to sign in —
            a device that was shown the introduction under an older build, a guest who tapped
            "Back up and sync" and changed their mind, a session that expired. Each of those
            would otherwise be stuck at a password field with no way past, which is exactly
            the friction the local-first change exists to remove.

            It routes by what the store already knows: someone who has never been through
            setup needs it, and someone who has goes straight to their diary. Both are local,
            so neither needs a session.
          */}
          <Button
            label="Continue without an account"
            variant="ghost"
            onPress={() => {
              // Synchronous, so the navigation below cannot race the flag and be undone by
              // the routing effect on the next render.
              enterGuestMode()
              landAt(onboardedAt === null ? '/onboarding' : '/(tabs)')
            }}
            full
            style={{ marginTop: spacing.md }}
          />

          <Label style={{ textAlign: 'center', marginTop: spacing.lg }}>
            Your data syncs privately across your devices
          </Label>
        </ScrollView>
      </KeyboardAvoidingView>
    </LiquidGlassScene>
  )
}
