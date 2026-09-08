import React from 'react'
import { View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '@/theme/useTheme'

/**
 * UNUSED as of the 2026-09-06 glass rollout. Kept, not deleted, on purpose.
 *
 * Every screen now mounts `Aurora` inside a `LiquidGlassScene` instead — a lens needs a
 * backdrop with edges, and this one is a pair of smooth two-stop ramps that magnify to
 * themselves. But the rollout has an open performance question (MOBILE-DESIGN §1), and if it
 * has to be turned back down this is the cheap ambient wash to return to. Deleting it would
 * make that a rewrite rather than an import change.
 *
 * ---
 *
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

  /*
    The three washes come off the theme rather than being picked from `mode` here. Workout
    mode is dark but lime, and a hardcoded jade bloom under a lime accent does not read as
    a second brand colour — it reads as a bug. Per-mode opacity is baked into the token:
    dark surfaces need more of it to register, light ones need less or the warm stone
    canvas turns muddy.
  */
  return (
    <View pointerEvents="none" style={{ ...StyleSheetAbsolute, overflow: 'hidden' }}>
      {/* Top-left bloom, sits behind the glass header. */}
      <LinearGradient
        colors={[theme.bloom.top, 'transparent']}
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

      {/* Counterweight on the right so the wash is not uniformly one hue. */}
      <LinearGradient
        colors={[theme.bloom.counterweight, 'transparent']}
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
        colors={['transparent', theme.bloom.bottom]}
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
