import React from 'react'
import { ActivityIndicator, View } from 'react-native'

import { useTheme } from '@/theme/useTheme'
import { spacing } from '@/theme/tokens'
import { BrandMark } from './BrandMark'

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
      <ActivityIndicator color={theme.brand} />
    </View>
  )
}
