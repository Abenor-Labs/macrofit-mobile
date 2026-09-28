import React, { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { useRouter } from 'expo-router'
import { AlertTriangle } from 'lucide-react-native'

import { useAuth } from '@/lib/AuthProvider'
import { landAt } from '@/lib/landAt'
import { useTheme } from '@/theme/useTheme'
import { Body, SectionTitle } from '@/components/Text'
import { Button } from '@/components/Button'
import { spacing } from '@/theme/tokens'

/**
 * Where confirmation and password-reset links land: `macrofit://auth/callback`.
 *
 * WHY A SCREEN EXISTS FOR A URL THAT CARRIES NO UI:
 * AuthProvider reads the link and exchanges it for a session, but expo-router also treats the
 * same URL as a navigation to /auth/callback. With no file here, that navigation showed
 * "Unmatched route" and stayed there: the root routing effect only moves people off the
 * screens it knows (login, welcome, onboarding, reset-password), and a guest never moves at
 * all. Worse, when the exchange failed, its error was set on the login screen, which nobody
 * was looking at. So a reset link either did nothing visible or stranded the user.
 *
 * This screen waits for the exchange, then gets out of the way:
 *   - a recovery link: routing sends the user to /reset-password (recoveryPending);
 *   - a confirmation or sign-in link: straight into the app;
 *   - a failure: the actual reason, and a way back to sign in.
 */

/** How long to wait for the exchange to start before calling the link a dud. */
const START_GRACE_MS = 4000

export default function AuthCallbackScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { user, confirming, confirmationError, recoveryPending, loading } = useAuth()
  const [gaveUp, setGaveUp] = useState(false)

  // The exchange starts a tick after this screen mounts (the URL listener fires separately),
  // so "not confirming and no user" is ambiguous at first. Only after a grace period does it
  // mean the link carried nothing usable, e.g. it was already used or opened twice.
  useEffect(() => {
    const timer = setTimeout(() => setGaveUp(true), START_GRACE_MS)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (loading || confirming || confirmationError) return
    // Recovery is the root layout's job: it holds the user on /reset-password.
    if (user && !recoveryPending) landAt('/(tabs)')
  }, [user, confirming, confirmationError, recoveryPending, loading])

  const failed = confirmationError !== null || (gaveUp && !confirming && !user)

  if (!failed) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, backgroundColor: theme.canvas }}>
        <ActivityIndicator color={theme.brandText} />
        <Body tone="secondary">Signing you in…</Body>
      </View>
    )
  }

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        padding: spacing.xl,
        gap: spacing.lg,
        backgroundColor: theme.canvas,
      }}
    >
      <AlertTriangle size={28} color={theme.status.warning} strokeWidth={2} />
      <SectionTitle>That link didn&apos;t sign you in</SectionTitle>
      <Body tone="secondary">
        {confirmationError ??
          'It may already have been used, or it was opened in a different app from the one that asked for it. Send yourself a new link from the sign-in screen.'}
      </Body>
      <Button label="Back to sign in" full onPress={() => router.replace('/login')} />
    </View>
  )
}
