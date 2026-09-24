import React from 'react'
import {
  ActivityIndicator,
  Pressable,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useTheme } from '@/theme/useTheme'
import { HIT_SIZE, fonts, radius } from '@/theme/tokens'
import { LiquidGlassPane } from './LiquidGlass'
import { Body } from './Text'

type Variant = 'primary' | 'secondary' | 'ghost'

export interface ButtonProps {
  label: string
  onPress: () => void
  variant?: Variant
  disabled?: boolean
  loading?: boolean
  icon?: React.ReactNode
  full?: boolean
  /** Fire a haptic tap. Reserve for meaningful commits, never plain navigation. */
  haptic?: boolean
  style?: StyleProp<ViewStyle>
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * All three variants are glass now.
 *
 * THE PRIMARY IS TINTED, NOT CLEAR, AND THAT IS NOT A STYLE CHOICE.
 * A clear pane shows whatever the aurora is doing behind it, so the contrast under the label
 * changes as the field drifts — there is no floor at all, and MOBILE-DESIGN §2 fixes that
 * floor at 4.79:1 for `brandOn` text. The tint is the brand colour at 0.92, which leaves the
 * label sitting on effectively the same ground it had when this was a solid rectangle while
 * the rim and the edges of the lens still read as glass. Lowering that alpha is a contrast
 * regression, not a design tweak.
 *
 * `secondary` is regular glass and `ghost` is clear and borderless, which is the one place
 * a fully transparent pane is correct: a ghost button is meant to be barely there.
 */
export const Button: React.FC<ButtonProps> = ({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  full = false,
  haptic = false,
  style,
}) => {
  const theme = useTheme()
  const reduced = useReducedMotion()
  const scale = useSharedValue(1)
  /*
    A second value for the press highlight, separate from the scale.

    Glass responds to touch by brightening at the surface rather than by moving — that is
    what Apple's `isInteractive` does on iOS 26, and the fallback should not feel different.
    Scale alone reads as a plastic button being pushed; the two together read as a pane
    catching more light under a finger.
  */
  const press = useSharedValue(0)

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  const sheenStyle = useAnimatedStyle(() => ({ opacity: press.value }))

  const inactive = disabled || loading

  const tint =
    variant === 'primary'
      ? // 0.92, not 1: the last 8% is what keeps the lens visible at the pane's edges.
        `${theme.brand}EB`
      : undefined
  const textColor =
    variant === 'primary' ? theme.brandOn : variant === 'ghost' ? theme.textSecondary : theme.text

  return (
    <AnimatedPressable
      /*
        Required for the dimmed state to look dimmed rather than broken.

        React Native tells Android its views never overlap, so `opacity` is applied to every
        child separately instead of to the finished button. The label and icon were each drawn
        at half alpha over a pane that was itself at half alpha, which printed a lighter box
        around them — the disabled Send button in chat showed it plainly. This renders the
        button into one layer first and fades that. It costs a layer only while opacity < 1.
        Any Pressable that fades itself (pressed or disabled) needs the same prop.
      */
      needsOffscreenAlphaCompositing
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPressIn={() => {
        // Reduce Motion keeps the sheen (a light change, not movement) and drops the scale.
        if (!reduced) scale.value = withTiming(0.97, { duration: 120 })
        press.value = withTiming(1, { duration: 100 })
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 120 })
        // Slower out than in. The highlight fading is the pane settling, and a symmetric
        // fade makes it read as a flicker.
        press.value = withTiming(0, { duration: 220 })
      }}
      onPress={() => {
        if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        onPress()
      }}
      style={[
        animatedStyle,
        {
          opacity: inactive ? 0.5 : 1,
          alignSelf: full ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      <LiquidGlassPane
        radius={radius.control}
        variant={variant === 'ghost' ? 'clear' : 'regular'}
        tint={tint}
        bordered={variant !== 'ghost'}
        interactive
        style={{
          minHeight: HIT_SIZE,
          paddingHorizontal: 18,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
        }}
      >
        {/* The press highlight, inside the pane's clip so it takes the corner radius. */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              backgroundColor:
                variant === 'primary'
                  ? 'rgba(255,255,255,0.18)'
                  : theme.mode === 'dark'
                    ? 'rgba(238,241,239,0.10)'
                    : 'rgba(28,25,23,0.06)',
            },
            sheenStyle,
          ]}
        />

        {loading ? (
          <ActivityIndicator color={textColor} />
        ) : (
          <>
            {icon}
            <Body weight="semibold" style={{ color: textColor, fontFamily: fonts.semibold }}>
              {label}
            </Body>
          </>
        )}
      </LiquidGlassPane>
    </AnimatedPressable>
  )
}

export interface IconButtonProps {
  children: React.ReactNode
  onPress: () => void
  /** Required: an icon with no label is invisible to a screen reader. */
  accessibilityLabel: string
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}

/**
 * Clear glass, and only while pressed.
 *
 * An icon button sits in chrome — headers, rows — where a permanently visible pane would
 * add a box around every icon in the app. It stays invisible at rest and materialises under
 * the finger, which is the glass equivalent of the background highlight it used to draw.
 */
export const IconButton: React.FC<IconButtonProps> = ({
  children,
  onPress,
  accessibilityLabel,
  disabled = false,
  style,
}) => {
  const theme = useTheme()
  const press = useSharedValue(0)
  const paneStyle = useAnimatedStyle(() => ({ opacity: press.value }))

  return (
    <Pressable
      needsOffscreenAlphaCompositing
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => {
        press.value = withTiming(1, { duration: 100 })
      }}
      onPressOut={() => {
        press.value = withTiming(0, { duration: 220 })
      }}
      style={[
        {
          width: HIT_SIZE,
          height: HIT_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : 1,
        },
        style,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
          paneStyle,
        ]}
      >
        <LiquidGlassPane
          radius={radius.control}
          variant="clear"
          style={{ flex: 1 }}
        />
      </Animated.View>
      <View pointerEvents="none">{children}</View>
    </Pressable>
  )
}
