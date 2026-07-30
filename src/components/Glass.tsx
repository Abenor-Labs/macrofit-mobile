import React from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '@/theme/useTheme'
import { radius as R } from '@/theme/tokens'

export interface GlassSurfaceProps {
  children?: React.ReactNode
  style?: StyleProp<ViewStyle>
  /** Corner radius. Defaults to the card radius. */
  radius?: number
  /** Override the blur strength. Higher is heavier; keep list content unblurred. */
  intensity?: number
  /**
   * A thin bright line along the top edge. Reads as light catching a real pane and is
   * what separates "glass" from "translucent rectangle". On by default.
   */
  highlight?: boolean
  bordered?: boolean
}

/**
 * A frosted surface.
 *
 * Use ONLY where something floats above content — tab bar, headers, sheets, the hero and
 * coach cards. See docs/MOBILE-DESIGN.md §1. Never nest one inside another: two blur
 * passes composite into mud and cost a second offscreen render.
 *
 * Android note: BlurView is genuinely more expensive there and, on older devices, can
 * fall back to a flat scrim. The overlay color below is therefore opaque enough to look
 * deliberate even when the blur does nothing, so the design degrades rather than breaks.
 */
export const GlassSurface: React.FC<GlassSurfaceProps> = ({
  children,
  style,
  radius = R.card,
  intensity,
  highlight = true,
  bordered = true,
}) => {
  const theme = useTheme()
  const g = theme.glass

  return (
    <View
      style={[
        { borderRadius: radius, overflow: 'hidden' },
        bordered && { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: g.border },
        style,
      ]}
    >
      {/*
        No blurMethod, so Android draws the flat scrim the overlay below is already tuned for.
        This used to ask for `dimezisBlurView`, which needs a `blurTarget` it was never given —
        the library warned on every render and fell back to exactly this scrim anyway.

        A real blur here would need these cards to sample the scroll content they sit inside, and
        a BlurView cannot be part of its own target. The chrome that floats *above* content — tab
        bar, headers — gets the real thing via ChromeBlur in ./BlurTarget.
      */}
      <BlurView
        tint={g.tint}
        intensity={intensity ?? g.intensity}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: g.overlay }]} />

      {highlight && (
        <LinearGradient
          colors={[g.highlight, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 1.5 }}
          pointerEvents="none"
        />
      )}

      {children}
    </View>
  )
}

/**
 * The default card: solid, cheap, legible. Reach for this first and only use
 * GlassSurface when the element genuinely floats.
 */
export const Surface: React.FC<{
  children?: React.ReactNode
  style?: StyleProp<ViewStyle>
  radius?: number
}> = ({ children, style, radius = R.card }) => {
  const theme = useTheme()
  return (
    <View
      style={[
        {
          backgroundColor: theme.surface,
          borderRadius: radius,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: theme.border,
        },
        // Shadows are invisible against a near-black canvas; on dark the border and the
        // lighter surface carry the separation instead.
        theme.mode === 'light' && {
          shadowColor: '#1C1917',
          shadowOpacity: 0.05,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 2,
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}
