import React, { useEffect, useState } from 'react'
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native'
import * as Haptics from 'expo-haptics'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

import { useTheme } from '@/theme/useTheme'
import { enterEasing } from '@/theme/motion'
import { HIT_SIZE, radius as R, spacing } from '@/theme/tokens'
import { LiquidGlassPane } from './LiquidGlass'
import { Body } from './Text'

/**
 * A segmented control whose selection is a pane of glass that travels between options.
 *
 * WHY THIS IS NOT TWO BUTTONS.
 * It used to be: a `primary` button for the active option and a `ghost` one for the other,
 * which meant the selection did not move — it was repainted in one place and un-painted in
 * another. That reads as two controls that happen to disagree, not as one control with a
 * position. A single thumb that slides is what makes it one object, and it is the thing
 * Apple's segmented control does.
 *
 * WHY THE THUMB IS GLASS AND THE SUBMIT BUTTON IS NOT.
 * A selection indicator and a call to action are different jobs. The thumb marks *where you
 * are* and can be a plain pane of material, because the label on it stays the ordinary label
 * colour and keeps the ordinary contrast against it. A CTA carries `brandOn` text and needs a
 * guaranteed floor under it, which clear glass over a drifting colour field cannot give — so
 * `Button`'s primary variant stays tinted. Making both glass would look consistent and fail
 * MOBILE-DESIGN §2 in one of the two places.
 *
 * THE STRETCH IS THE "LIQUID" PART.
 * Travel alone is a sliding rectangle. Real Liquid Glass leads with the edge nearest its
 * destination and catches up behind, so the thumb stretches along the direction of travel and
 * settles — a droplet, not a tile. That is one `scaleX` overshoot, and it is the whole
 * difference between "animated" and "liquid".
 */
export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

export interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  style?: StyleProp<ViewStyle>
}

/** Inset between the track's edge and the thumb, so the thumb reads as sitting *in* it. */
const TRACK_PADDING = 4

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: SegmentedProps<T>) {
  const theme = useTheme()
  const reduced = useReducedMotion()
  const [trackWidth, setTrackWidth] = useState(0)

  const index = Math.max(
    0,
    options.findIndex(option => option.value === value)
  )
  const thumbWidth =
    options.length > 0 ? (trackWidth - TRACK_PADDING * 2) / options.length : 0

  const offset = useSharedValue(0)
  const stretch = useSharedValue(1)

  useEffect(() => {
    if (thumbWidth === 0) return
    const target = index * thumbWidth
    if (reduced) {
      offset.value = target
      return
    }
    offset.value = withTiming(target, {
      // Short and strongly decelerated. The tap has already happened, so the thumb is
      // catching up to a decision the user has made rather than leading them to it.
      duration: 300,
      easing: enterEasing,
    })
    // Lead with the leading edge, then settle. Peaks while the thumb is mid-flight, which is
    // why the stretch is shorter than the travel.
    stretch.value = withSequence(
      withTiming(1.08, { duration: 130, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 220, easing: enterEasing })
    )
  }, [index, thumbWidth, offset, stretch, reduced])

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }, { scaleX: stretch.value }],
  }))

  return (
    <LiquidGlassPane
      radius={R.control}
      variant="clear"
      style={[{ padding: TRACK_PADDING, flexDirection: 'row' }, style]}
    >
      <View
        style={{ flex: 1, flexDirection: 'row' }}
        onLayout={event => setTrackWidth(event.nativeEvent.layout.width + TRACK_PADDING * 2)}
      >
        {thumbWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: thumbWidth,
              },
              thumbStyle,
            ]}
          >
            {/*
              Tinted, but lightly — this is material, not a fill. The tint exists so the thumb
              is a distinct object against the track it sits in; the label on top keeps the
              ordinary text colour, so contrast is the same as it would be on any card.
            */}
            <LiquidGlassPane
              radius={R.control - TRACK_PADDING / 2}
              variant="regular"
              tint={
                theme.mode === 'dark' ? 'rgba(238,241,239,0.14)' : 'rgba(255,255,255,0.62)'
              }
              style={{ flex: 1 }}
            />
          </Animated.View>
        ) : null}

        {options.map(option => {
          const selected = option.value === value
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              onPress={() => {
                if (selected) return
                // A selection tick, not an impact: this changes what is selected, it does
                // not commit anything.
                void Haptics.selectionAsync()
                onChange(option.value)
              }}
              style={{
                flex: 1,
                minHeight: HIT_SIZE - TRACK_PADDING * 2,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: spacing.sm,
              }}
            >
              <Body
                weight={selected ? 'semibold' : 'medium'}
                style={{ color: selected ? theme.text : theme.textSecondary }}
              >
                {option.label}
              </Body>
            </Pressable>
          )
        })}
      </View>
    </LiquidGlassPane>
  )
}
