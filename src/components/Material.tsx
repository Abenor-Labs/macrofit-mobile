import React, { useEffect, useState } from 'react'
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'

import { ChromeBlur } from './BlurTarget'
import { useTheme } from '@/theme/useTheme'
import { radius as R, shadow, spacing } from '@/theme/tokens'

/**
 * The three materials, and the rule about which is allowed where.
 *
 * See MOBILE-DESIGN §1. The short version, because getting this wrong is what produced the
 * screen this file replaces:
 *
 *   Ground  — the page. Solid `canvas`. `Screen` draws it.
 *   Island  — anything holding content. Solid `surface`. NEVER blurs.
 *   Glass   — layers content passes *under*. Blur + heavy tint. Chrome only.
 *
 * The previous system made every surface glass, including diary rows and stat tables. Four
 * things went wrong at once and only one of them was a tuning error.
 *
 * WHY ISLANDS ARE SOLID:
 * A card inside scroll content has nothing meaningful behind it. Blurring there costs a
 * frame budget and a contrast ratio and buys an effect nobody can perceive, because the
 * thing being blurred is the flat canvas the card is already sitting on. Telegram reaches
 * the same conclusion from the other direction: it ships an AGSL refraction shader and
 * still draws its chat rows and settings rows with a flat `key_windowBackgroundWhite`.
 *
 * WHY THERE IS NO REFRACTION HERE:
 * There was, and it magnified the backdrop 1.14x about each pane's centre. That displaces
 * the whole pane uniformly, which the eye reads as a smudge. Real refraction does the
 * opposite — `liquid_glass_shader.agsl` builds a signed distance field and scales
 * displacement to zero as soon as a sample is deeper than `thickness` from the edge, so the
 * centre of the pane stays sharp and only the rim bends. That contrast IS the optical
 * signal, and it needs a shader we do not have outside iOS. A bad approximation of it is
 * worse than an honest frosted pane, so below iOS 26 we draw the honest one.
 */

/** Whether the OS can draw Apple's Liquid Glass itself. Fixed for the process. */
const HAS_LIQUID_GLASS = isLiquidGlassAvailable()

/**
 * `true` while the user has Reduce Transparency enabled.
 *
 * Checked continuously rather than once at mount: it is a Settings toggle, and someone who
 * turns it on because a screen is illegible expects the screen in front of them to change.
 * Android always reports `false`, so the listener is inert there.
 */
const useReduceTransparency = (): boolean => {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    let alive = true
    void AccessibilityInfo.isReduceTransparencyEnabled().then(value => {
      if (alive) setReduced(value)
    })
    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      setReduced
    )
    return () => {
      alive = false
      subscription.remove()
    }
  }, [])

  return reduced
}

/**
 * When every glass surface should fall back to something solid.
 *
 * Telegram ships this as a first-class feature — `LiteMode` flags, `SharedConfig.chatBlurEnabled()`,
 * a device performance class, and a settings sheet letting the user set blur radius by hand.
 * This is the cheap version of the same idea, built from what the app can already see.
 *
 * Android below SDK 31 is included deliberately. `ChromeBlur` explains why: the cheaper
 * Dimezis path only exists from 31, and below it the blur costs frames on exactly the
 * handsets least able to spare them.
 *
 * NOT yet covered: battery saver, and a real device performance class. Both need a
 * dependency the app does not carry, and claiming them here would be a lie in a boolean.
 */
export const useLiteMode = (): boolean => {
  const reduceTransparency = useReduceTransparency()
  return reduceTransparency || (Platform.OS === 'android' && Platform.Version < 31)
}

/**
 * A solid content surface. The default for everything that holds something.
 *
 * `elevated` is light-mode-only by construction — see the note on `shadow` in tokens. In
 * dark mode a card is a card because it is lighter than the page, and a shadow at those
 * lightnesses is both invisible and, once it is drawn under a translucent surface, muddy.
 */
export const Island: React.FC<{
  children?: React.ReactNode
  style?: StyleProp<ViewStyle>
  radius?: number
  /** Step up the ladder — for a surface sitting on another island. */
  raised?: boolean
  /** Draw the hairline. Off for an island that is already bounded by something else. */
  bordered?: boolean
  elevated?: boolean
}> = ({ children, style, radius = R.card, raised = false, bordered = true, elevated = true }) => {
  const theme = useTheme()

  return (
    <View
      style={[
        {
          borderRadius: radius,
          backgroundColor: raised ? theme.surfaceRaised : theme.surface,
          borderWidth: bordered ? StyleSheet.hairlineWidth : 0,
          borderColor: theme.border,
        },
        elevated && theme.mode === 'light' && shadow.island,
        style,
      ]}
    >
      {children}
    </View>
  )
}

/**
 * One island holding many rows, with an inset hairline between them.
 *
 * THIS IS THE FIX FOR "EVERYTHING LOOKS THE SAME". A list rendered as one card per row is a
 * stack of identical slabs whatever material the slabs are made of — the eye gets a rhythm
 * of edges and no grouping. Telegram builds every settings screen the other way
 * (`@mixin side-panel-section`): rows are flat inside a single surface, and it is the *band
 * of canvas between groups* that does the separating.
 *
 * The hairline is inset from the left so it reads as a separator inside one object rather
 * than as the boundary between two.
 */
export const SectionGroup: React.FC<{
  children?: React.ReactNode
  style?: StyleProp<ViewStyle>
  /** Where the hairline starts. Line it up with the row's text, not its icon. */
  inset?: number
}> = ({ children, style, inset = spacing.lg }) => {
  const theme = useTheme()
  const rows = React.Children.toArray(children).filter(Boolean)

  return (
    <Island style={style} bordered={theme.mode === 'light'}>
      {rows.map((row, i) => (
        <View key={i}>
          {i > 0 && (
            <View
              style={{
                height: StyleSheet.hairlineWidth,
                marginLeft: inset,
                backgroundColor: theme.hairline,
              }}
            />
          )}
          {row}
        </View>
      ))}
    </Island>
  )
}

/** A row inside a `SectionGroup`. Carries the touch-target floor so call sites cannot forget it. */
export const Row: React.FC<{
  children?: React.ReactNode
  style?: StyleProp<ViewStyle>
}> = ({ children, style }) => (
  <View
    style={[
      {
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
      },
      style,
    ]}
  >
    {children}
  </View>
)

export interface GlassProps {
  children?: React.ReactNode
  style?: StyleProp<ViewStyle>
  radius?: number
  /**
   * `chrome` for the tab bar and screen headers, `raised` for sheets, menus and the chat
   * composer. Raised is the heavier tint, because it sits over live content rather than
   * over the edge of a scroll view.
   */
  variant?: 'chrome' | 'raised'
  /**
   * Draw the edge on all four sides.
   *
   * Off by default, because the two most common callers — the screen header and the tab bar
   * — are full-bleed and want an edge on exactly one side, which they set themselves. A
   * four-sided hairline on those reads as a stray box rather than as a material.
   */
  bordered?: boolean
  /**
   * Set when the glass sits on photography. Adds a scrim between the blur and the content,
   * because a bright photo otherwise eats white text — `BlurBehindDrawable` draws
   * `0x1a000000` over every blurred bitmap for exactly this reason.
   */
  onImagery?: boolean
}

/**
 * The floating-chrome material. Blur, then a heavy tint, then an edge.
 *
 * DO NOT PUT CONTENT IN THIS. It holds chrome — tab labels, a title, sheet controls. A
 * paragraph or a table of figures on top of a blur is the thing §1 forbids, and it is what
 * made the last version illegible.
 *
 * The tint is doing most of the work and that is deliberate. Telegram's compact menu is
 * `#FFFFFFBB` over `blur(10px)`; the reaction picker is `#FFFFFFEB`. Nearly opaque. Glass
 * reads as glass from its edge and from things moving behind it, not from transparency, and
 * a light tint over a heavy blur is how the previous system arrived at "washed out".
 *
 * Three paths, and the caller does not choose:
 *   iOS 26+   — `GlassView`, where the OS refracts properly.
 *   otherwise — `ChromeBlur` (one blur per screen region, see BlurTarget.tsx) plus the tint.
 *   lite mode — solid `surfaceRaised`. Someone who asked the system to stop layering
 *               translucency has asked for exactly that.
 */
export const Glass: React.FC<GlassProps> = ({
  children,
  style,
  radius = R.card,
  variant = 'chrome',
  bordered = false,
  onImagery = false,
}) => {
  const theme = useTheme()
  const lite = useLiteMode()

  const edge = bordered ? (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          borderRadius: radius,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.glass.border,
        },
      ]}
    />
  ) : null

  if (lite) {
    return (
      <View
        style={[
          { borderRadius: radius, backgroundColor: theme.surfaceRaised, overflow: 'hidden' },
          theme.mode === 'light' && shadow.chrome,
          style,
        ]}
      >
        {children}
        {edge}
      </View>
    )
  }

  if (HAS_LIQUID_GLASS) {
    return (
      <GlassView
        glassEffectStyle={variant === 'raised' ? 'regular' : 'clear'}
        style={[{ borderRadius: radius, overflow: 'hidden' }, style]}
      >
        {children}
        {edge}
      </GlassView>
    )
  }

  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden' }, style]}>
      <ChromeBlur tint={theme.glass.tint} intensity={theme.glass.intensity} />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor:
              variant === 'raised' ? theme.glass.overlay : theme.glass.chromeOverlay,
          },
        ]}
      />
      {onImagery && (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.glass.scrim }]}
        />
      )}
      {children}
      {edge}
    </View>
  )
}
