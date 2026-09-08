import React, { useEffect } from 'react'
import { View } from 'react-native'
import Svg, { Circle, G } from 'react-native-svg'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'

import { useTheme } from '@/theme/useTheme'
import { fonts, jade, radius, spacing, stone } from '@/theme/tokens'
import { Aurora } from './Aurora'
import { LiquidGlassScene } from './LiquidGlass'
import { Body } from './Text'

/**
 * The branded launch moment.
 *
 * WHAT ANDROID ACTUALLY ALLOWS, because it decides the whole design:
 * The native splash — the frame drawn before React exists — is one solid colour and one
 * static icon. It cannot animate, it cannot be glass, and it cannot be skipped. Every app
 * with a memorable launch is doing the same thing: getting off that frame as fast as
 * possible and performing inside the app. This is that performance.
 *
 * THE SEAM IS THE WHOLE PROBLEM. A launch animation is judged on one thing — whether the
 * user notices the cut between the system's frame and ours. So:
 *
 *   1. The ground matches. `app.json` paints the native splash with the canvas token per
 *      theme; this screen paints the same colour. (It was hardcoded #FFFFFF, so dark-mode
 *      launches flashed white.)
 *   2. The mark matches. `assets/splash-icon.png` is the full mark centred with padding, and
 *      the rings below start at exactly the angles that image is frozen at.
 *   3. The motion is ROTATION, not a draw-on. Drawing the rings in would mean starting from
 *      nothing — but Android has just shown the finished mark, so frame one must already be
 *      the finished mark. Spinning keeps it whole at every instant, which is the only family
 *      of motion that can begin from a static logo without announcing the cut.
 *
 * The rings counter-rotate at different rates and decelerate into alignment, so the launcher
 * icon appears to come alive rather than be replaced. Everything else — wordmark, wash,
 * status line — arrives after the mark has settled, so nothing competes with it.
 */

/** Matches `BrandMark`'s proportions exactly, so the two are the same object. */
const RINGS = [
  { inset: 0.083, width: 0.097, dash: 0.78, color: stone[50], from: -140 },
  { inset: 0.236, width: 0.083, dash: 0.55, color: jade[100], from: 110 },
  { inset: 0.375, width: 0.069, dash: 0.35, color: jade[200], from: -95 },
] as const

/** The tile's own jade, lightened — not a new hue. Same value `BrandMark` uses. */
const TRACK = 'rgba(250,250,249,0.25)'

/*
  Each ring is its own layer, rotated as a view.

  The obvious shape — one <Svg> with three <G> groups and an animated transform on each — does
  not typecheck and does not work: react-native-svg's G takes SVG transform props, not a
  Reanimated style, so there is nothing for the animation to drive. Rotating a plain View that
  happens to contain an Svg sidesteps the problem entirely and runs on the native thread.
*/
const Ring: React.FC<{
  size: number
  spec: (typeof RINGS)[number]
  progress: SharedValue<number>
}> = ({ size, spec, progress }) => {
  const c = size / 2
  const r = c - size * spec.inset
  const circumference = 2 * Math.PI * r

  /*
    `progress` at 1 lands on exactly the artwork the native splash was showing, so the last
    frame of the animation is the launcher icon. The offset each ring travels from alternates
    direction on purpose: three rings turning the same way reads as one rigid disc, which is
    what makes a spinner look cheap.
  */
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spec.from * (1 - progress.value)}deg` }],
  }))

  return (
    <Animated.View style={[{ position: 'absolute', width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        {/* -90 is where BrandMark's rings sit at rest. Baked in here rather than animated, so
            the resting artwork is identical to the still mark used on six other screens. */}
        <G rotation={-90} origin={`${c}, ${c}`}>
          <Circle cx={c} cy={c} r={r} stroke={TRACK} strokeWidth={size * spec.width} fill="none" />
          <Circle
            cx={c}
            cy={c}
            r={r}
            stroke={spec.color}
            strokeWidth={size * spec.width}
            strokeLinecap="round"
            strokeDasharray={`${circumference * spec.dash} ${circumference}`}
            fill="none"
          />
        </G>
      </Svg>
    </Animated.View>
  )
}

/**
 * How long the whole sequence takes. `LaunchGate` holds the app here for at least this long
 * on a cold start, so a fast sign-in cannot truncate the animation half way through — a
 * launch animation that gets cut off looks like a bug, not like speed.
 */
export const LAUNCH_SEQUENCE_MS = 1150

export const LaunchScreen: React.FC = () => {
  const theme = useTheme()
  const reduced = useReducedMotion()
  const size = 112

  const settle = useSharedValue(reduced ? 1 : 0)
  const follow = useSharedValue(reduced ? 1 : 0)

  useEffect(() => {
    if (reduced) return
    /*
      A long, strongly decelerating curve. The rings carry real angular distance and have to
      arrive without a bounce — a spring here would overshoot the alignment and undo the one
      thing the motion exists to do, which is land on the launcher icon.
    */
    settle.value = withTiming(1, { duration: 900, easing: Easing.bezier(0.16, 1, 0.3, 1) })
    // After the mark has essentially arrived, not alongside it.
    follow.value = withDelay(
      420,
      withTiming(1, { duration: 420, easing: Easing.bezier(0.23, 1, 0.32, 1) })
    )
  }, [settle, follow, reduced])

  // The tile breathes out of the native splash's scale. Tiny on purpose.
  const tileStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + (1 - settle.value) * 0.06 }],
  }))

  const fieldStyle = useAnimatedStyle(() => ({ opacity: follow.value }))

  const belowStyle = useAnimatedStyle(() => ({
    opacity: follow.value,
    transform: [{ translateY: (1 - follow.value) * 12 }],
  }))

  return (
    <LiquidGlassScene
      backdrop={
        <Animated.View style={[{ flex: 1 }, fieldStyle]}>
          <Aurora />
        </Animated.View>
      }
      style={{ backgroundColor: theme.canvas }}
    >
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.xl,
          paddingHorizontal: spacing.xl,
        }}
        accessibilityRole="progressbar"
        accessibilityLabel="Loading your account"
      >
        {/*
          The tile is drawn here rather than by `BrandMark`, because the rings inside it have
          to animate independently and BrandMark is a still object used on six other screens.
          The jade, the radius and the 0.75 ring-to-tile ratio are copied from it verbatim, so
          the two stay the same mark.
        */}
        <Animated.View
          style={[
            {
              width: size,
              height: size,
              borderRadius: radius.card,
              backgroundColor: jade[600],
              alignItems: 'center',
              justifyContent: 'center',
            },
            tileStyle,
          ]}
        >
          <View
            style={{
              width: size * 0.75,
              height: size * 0.75,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {RINGS.map(spec => (
              <Ring key={spec.inset} size={size * 0.75} spec={spec} progress={settle} />
            ))}
          </View>
        </Animated.View>

        <Animated.View style={belowStyle}>
          <Body size={34} style={{ fontFamily: fonts.displayBold, color: theme.text }}>
            MacroFit
          </Body>
        </Animated.View>

        {/*
          No spinner.

          There was one, and it was fighting the mark: two things rotating at once, one of
          them a stock grey ActivityIndicator, reads as a loading screen that happens to have
          a logo on it. The rings ARE the spinner — they are already the app's own circular
          motion — so the status line only has to say the words.
        */}
        <Animated.View style={belowStyle}>
          <Body size={13} tone="muted">
            Loading your account…
          </Body>
        </Animated.View>
      </View>
    </LiquidGlassScene>
  )
}
