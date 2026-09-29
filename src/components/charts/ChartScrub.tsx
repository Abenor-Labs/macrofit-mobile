import React, { useRef, useState } from 'react'
import { PanResponder, StyleSheet, View, type GestureResponderHandlers } from 'react-native'
import * as Haptics from 'expo-haptics'

import { useTheme } from '@/theme/useTheme'
import { radius } from '@/theme/tokens'

/**
 * Press-and-drag reading for any chart whose marks sit along an x axis.
 *
 * The chart owns the geometry, so it assigns `nearestRef.current` on every render with a
 * function that maps a finger's x to the slot it should report. The responder itself is built
 * once: a handler that closed over the chart's data directly would keep reading the first
 * render's values long after they changed, whereas the ref is reassigned every render and the
 * handlers always call through it.
 *
 * A selection tick fires when the reported slot changes, never on the first touch. Grabbing
 * the chart is not a change — and because a vertical drag that starts on a chart still hands
 * the finger back to the page's ScrollView, buzzing on touch-down would buzz on every scroll
 * that happened to begin over a chart.
 */
export function useChartScrub(): {
  active: number | null
  nearestRef: React.MutableRefObject<(x: number) => number | null>
  panHandlers: GestureResponderHandlers
} {
  const [active, setActive] = useState<number | null>(null)
  const nearestRef = useRef<(x: number) => number | null>(() => null)
  const lastRef = useRef<number | null>(null)

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // The charts live inside a ScrollView. Granting termination lets a vertical drag that
      // started on a chart still scroll the page instead of trapping the finger.
      onPanResponderTerminationRequest: () => true,
      onPanResponderGrant: event => {
        const next = nearestRef.current(event.nativeEvent.locationX)
        lastRef.current = next
        setActive(next)
      },
      onPanResponderMove: event => {
        const next = nearestRef.current(event.nativeEvent.locationX)
        if (next === lastRef.current) return
        lastRef.current = next
        if (next !== null) void Haptics.selectionAsync()
        setActive(next)
      },
      onPanResponderRelease: () => {
        lastRef.current = null
        setActive(null)
      },
      onPanResponderTerminate: () => {
        lastRef.current = null
        setActive(null)
      },
    })
  ).current

  return { active, nearestRef, panHandlers: responder.panHandlers }
}

/**
 * The floating card that names what the finger is on.
 *
 * It sits over the top of the plot rather than beside the finger, because a readout under the
 * thumb is a readout nobody can see. `left` is the x of the scrubbed mark measured from the
 * chart's own left edge; the card centres on it and is clamped so a reading at either end stays
 * on screen instead of hanging off it.
 */
export const ScrubReadout: React.FC<{
  left: number
  /** The width the card may occupy, so the clamp knows where the right edge is. */
  bounds: number
  width: number
  children: React.ReactNode
}> = ({ left, bounds, width, children }) => {
  const theme = useTheme()
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: Math.max(Math.min(left - width / 2, bounds - width), 0),
        width,
        zIndex: 2,
        alignItems: 'center',
        gap: 1,
        paddingVertical: 6,
        borderRadius: radius.control,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: theme.border,
        backgroundColor: theme.surfaceRaised,
      }}
    >
      {children}
    </View>
  )
}
