import React from 'react'
import { View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '@/theme/useTheme'
import { jade } from '@/theme/tokens'

/**
 * Ambient colour behind the whole screen.
 *
 * Blur only reads as glass when there is something underneath worth refracting. Over a
 * flat canvas a BlurView is indistinguishable from a plain translucent rectangle, which
 * is why frosted surfaces on the non-gradient screens looked like grey boxes.
 *
 * These are soft, very low-opacity colour fields placed where the important glass sits
 * (top header, hero area, bottom tab bar). They are deliberately cheap: plain Views with
 * a large border radius and a gradient wash — no blur, no shadows, no animation — so the
 * cost is a couple of extra layers rather than another offscreen render pass.
 */
export const Backdrop: React.FC = () => {
  const theme = useTheme()
  const dark = theme.mode === 'dark'

  // Dark mode needs more opacity to register at all; light mode needs less or it muddies
  // the warm stone canvas.
  const warm = dark ? 'rgba(120,113,108,0.16)' : 'rgba(214,211,209,0.55)'

  return (
    <View pointerEvents="none" style={{ ...StyleSheetAbsolute, overflow: 'hidden' }}>
      {/* Top-left jade bloom, sits behind the glass header. */}
      <LinearGradient
        colors={[dark ? 'rgba(18,161,117,0.22)' : 'rgba(56,188,141,0.30)', 'transparent']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{
          position: 'absolute',
          top: -160,
          left: -120,
          width: 420,
          height: 420,
          borderRadius: 210,
        }}
      />

      {/* Warm counterweight on the right so the wash is not uniformly green. */}
      <LinearGradient
        colors={[warm, 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{
          position: 'absolute',
          top: 60,
          right: -180,
          width: 380,
          height: 380,
          borderRadius: 190,
        }}
      />

      {/* Low bloom behind the floating tab bar, so it has colour to pick up. */}
      <LinearGradient
        colors={['transparent', dark ? 'rgba(12,130,97,0.20)' : 'rgba(113,213,175,0.28)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{
          position: 'absolute',
          bottom: -220,
          left: -60,
          width: 520,
          height: 420,
          borderRadius: 260,
        }}
      />
    </View>
  )
}

/** Inlined to avoid importing StyleSheet just for absoluteFillObject. */
const StyleSheetAbsolute = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
}
