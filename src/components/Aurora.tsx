import React, { createContext, useContext, useEffect, useMemo } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'

import { useTheme } from '@/theme/useTheme'
import { jade } from '@/theme/tokens'

/**
 * A slow field of coloured light. The thing liquid glass is put in front of.
 *
 * WHY IT MOVES:
 * Refraction is only visible as a *difference* — the backdrop seen through the pane against
 * the backdrop seen beside it. Over a still, even field there is nothing to compare, and the
 * most expensive glass Apple can draw looks exactly like a tinted rectangle. Something has
 * to cross the pane's edge for the material to announce itself, and on a screen with no
 * scrolling content the backdrop is the only candidate.
 *
 * So this is not decoration that happens to be animated; the animation is the reason the
 * screen above it reads as glass at all. That also fixes its budget: three layers, transforms
 * only, no blur of its own, durations long enough that no frame is doing much work.
 *
 * Every refracting pane mounts one of these as its lens image, so a list of glass rows can
 * hold dozens at once. Two things keep that affordable: the drift clocks are shared app-wide
 * (see `AuroraDriftProvider` below), and the component is memoised — it takes no props, so a
 * parent re-render must never cost a re-render of the field.
 *
 * `Backdrop` is the still, two-stop version this replaced. It is no longer mounted anywhere:
 * a lens over a linear ramp displaces nothing visible.
 */

/**
 * One set of drift clocks for every Aurora in the app.
 *
 * WHY THIS EXISTS:
 * A refracting pane renders its own copy of the backdrop (see `LiquidGlass.tsx`), so a
 * screen with a dozen glass cards mounts a dozen Auroras. Left to itself each one would
 * create three shared values and three infinite `withRepeat` timings — thirty-six clocks
 * driving what the user reads as a single field of light, and on a mid-range phone that is
 * measurable.
 *
 * Sharing the clocks costs nothing and buys two things: three animations no matter how many
 * copies exist, and — more visibly — every copy stays in lockstep. Copies drifting out of
 * phase with the field they are supposed to be refracting is exactly the artefact that would
 * give the illusion away.
 */
interface AuroraDrift {
  values: [SharedValue<number>, SharedValue<number>, SharedValue<number>]
}

const AuroraDriftContext = createContext<AuroraDrift | null>(null)

/** Seconds for one there-and-back, per orb. Co-prime-ish so the loop never repeats. */
const PERIODS = [17, 23, 29] as const

/**
 * Mount once, above everything that can render an `Aurora` — including the panes that copy
 * it. `app/_layout.tsx` is the only correct place.
 */
export const AuroraDriftProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const still = useReducedMotion()
  const a = useSharedValue(0)
  const b = useSharedValue(0)
  const c = useSharedValue(0)

  useEffect(() => {
    if (still) return
    const drivers = [a, b, c]
    drivers.forEach((value, index) => {
      value.value = withRepeat(
        withTiming(1, {
          duration: PERIODS[index] * 1000,
          easing: Easing.inOut(Easing.sin),
        }),
        -1,
        true
      )
    })
  }, [a, b, c, still])

  const value = useMemo<AuroraDrift>(() => ({ values: [a, b, c] }), [a, b, c])

  return <AuroraDriftContext.Provider value={value}>{children}</AuroraDriftContext.Provider>
}

/** Each orb's colour comes off the jade ramp, per mode, the way the login wash does. */
const useOrbColors = () => {
  const theme = useTheme()
  const dark = theme.mode === 'dark'
  /*
    DARK MODE NEEDS A BRIGHTER FIELD, NOT A DARKER ONE.

    The instinct is that a dark theme wants a subtle wash, and following it broke the glass:
    jade-700 and jade-800 over a near-black canvas is dark green on black, a field with
    almost no luminance range in it. Blur that and you get dark. Magnify it and you get the
    same dark. The panes on the dashboard read as flat translucent panels not because the
    material was wrong but because there was nothing behind them worth bending.

    Refraction is only ever visible as a difference, so the backdrop has to carry real
    contrast against the page. Light mode is untouched — it already had the range, which is
    why it looked like glass first.

    Two steps up, not four. jade-500 made the glass unmistakable and turned the app into a
    green screen: the accent became the dominant surface, which is the opposite of what an
    accent is for, and muted text over the bright half started to struggle. jade-600 keeps
    enough luminance range for the displacement to read while leaving the page reading as a
    dark app with a jade wash. The pane's own tint carries the rest of the text contrast.
  */
  return {
    lead: dark ? jade[600] : jade[300],
    trail: dark ? jade[700] : jade[200],
    counterweight: theme.bloom.counterweight,
    opacity: dark ? 0.68 : 0.85,
  }
}

interface OrbProps {
  color: string
  size: number
  /** Resting position, in points from the top-left of the field. */
  left: number
  top: number
  /** How far it wanders, in points. Kept well under `size` so no edge ever enters frame. */
  travel: { x: number; y: number }
  /** Which of the three shared drift clocks this orb rides. */
  index: 0 | 1 | 2
  still: boolean
}

const Orb: React.FC<OrbProps> = ({ color, size, left, top, travel, index, still }) => {
  /*
    The clock is 0 → 1 → 0 forever and position is derived from it.

    `Easing.inOut(Easing.sin)` rather than the app's usual ease-out: this has no beginning
    and no end to emphasise, and a curve that decelerates into each extreme is what stops
    the turn reading as a bounce. It is also the one place in the app where a long duration
    is correct — anything under about 10s starts to look like a loading state.

    Always calls `useSharedValue`, because hooks cannot be conditional — but the local value
    is only animated when there is no provider above, which is the standalone case. Under a
    provider the local one is inert and the shared clock drives everything.
  */
  const shared = useContext(AuroraDriftContext)
  const local = useSharedValue(0)
  const drift = shared ? shared.values[index] : local

  useEffect(() => {
    if (still || shared) return
    local.value = withRepeat(
      withTiming(1, { duration: PERIODS[index] * 1000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    )
  }, [local, index, still, shared])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [0, travel.x]) },
      { translateY: interpolate(drift.value, [0, 1], [0, travel.y]) },
      // A little breathing on top of the drift, so two orbs crossing do not look like one
      // rigid object sliding. Small enough that it never reads as a pulse.
      { scale: interpolate(drift.value, [0, 1], [1, 1.12]) },
    ],
  }))

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left,
          top,
          width: size,
          height: size,
          borderRadius: size / 2,
          // Load-bearing. The gradient below is a rectangular child, and a borderRadius on
          // the parent does not clip it on its own — without this the orb draws as a hard
          // grey slab with visible corners, which is worse than no wash at all and gives the
          // glass a straight edge to refract that has no business being there.
          overflow: 'hidden',
        },
        animatedStyle,
      ]}
    >
      {/*
        Three stops, not two.

        A plain colour-to-transparent ramp across the whole orb is exactly the shape a blur
        leaves unchanged — every neighbourhood looks like every other, so a pane laid over it
        shows the same wash as the page beside it and the material disappears. Holding the
        colour solid for the first third and falling off after gives the field an actual
        boundary, which is the feature the glass has something to do with.
      */}
      <LinearGradient
        colors={[color, color, 'transparent']}
        locations={[0, 0.35, 1]}
        start={{ x: 0.3, y: 0.1 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  )
}

/**
 * Mount as the `backdrop` of a `LiquidGlassScene` — never as a sibling of the panes, which
 * is what makes it the thing the blur samples on Android.
 */
const AuroraField: React.FC = () => {
  const theme = useTheme()
  const { width, height } = useWindowDimensions()
  const colors = useOrbColors()
  /*
    Reduce Motion turns the drift off and leaves the composition exactly where it starts.

    The screen keeps working: the orbs still give the glass something with a gradient and a
    boundary to sit over, so the panes read as material rather than as grey boxes. What is
    lost is the moving edge that makes the refraction obvious — which is the honest trade,
    and better than the usual "collapse to a cross-fade" because there is no state change
    here to cross-fade between.
  */
  const still = useReducedMotion()

  // Sized off the viewport rather than fixed, so the field fills a tablet and does not
  // overwhelm a small phone. `useWindowDimensions` over `Dimensions.get` — it updates.
  const large = Math.max(width, height * 0.55)

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: theme.canvas, overflow: 'hidden' }]}
    >
      <View style={[StyleSheet.absoluteFill, { opacity: colors.opacity }]}>
        <Orb
          color={colors.lead}
          size={large}
          left={-large * 0.35}
          top={-large * 0.28}
          travel={{ x: large * 0.18, y: large * 0.1 }}
          index={0}
          still={still}
        />
        <Orb
          color={colors.counterweight}
          size={large * 0.9}
          left={width - large * 0.5}
          top={height * 0.18}
          travel={{ x: -large * 0.14, y: large * 0.16 }}
          index={1}
          still={still}
        />
        <Orb
          color={colors.trail}
          size={large * 1.1}
          left={-large * 0.15}
          top={height * 0.52}
          travel={{ x: large * 0.2, y: -large * 0.12 }}
          index={2}
          still={still}
        />
      </View>
    </View>
  )
}

export const Aurora = React.memo(AuroraField)
Aurora.displayName = 'Aurora'
