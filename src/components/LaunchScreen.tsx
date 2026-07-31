import React from 'react'
import { ActivityIndicator, View } from 'react-native'

import { useTheme } from '@/theme/useTheme'
import { fonts, spacing } from '@/theme/tokens'
import { BrandMark } from './BrandMark'
import { Body } from './Text'

/**
 * Shown while the session and the account's saved data are still resolving.
 *
 * The native splash is released as soon as fonts and local state are ready, which is fast;
 * auth can take seconds on a bad connection. Rendering `null` for that window — the
 * previous behaviour in both `app/_layout.tsx` and `app/index.tsx` — left an empty
 * canvas-coloured screen with no logo and no spinner for as long as the fetch took, which
 * reads as a crash rather than as loading.
 */
export const LaunchScreen: React.FC = () => {
  const theme = useTheme()
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.canvas,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xl,
      }}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading your account"
    >
      <BrandMark />
      {/* The mark alone is wordless, and on a slow connection this is the first thing a new
          user sees for several seconds — long enough to read as a hang. The name says what
          they opened; the line below says the app is working, not stuck. */}
      <Body style={{ fontFamily: fonts.displayBold, fontSize: 28, color: theme.text }}>
        MacroFit
      </Body>
      <ActivityIndicator color={theme.brand} />
      <Body size={13} tone="muted">
        Loading your account…
      </Body>
    </View>
  )
}
