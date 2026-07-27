import React from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useTheme } from '@/theme/useTheme'
import { HIT_SIZE, fonts, radius } from '@/theme/tokens'
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
  const scale = useSharedValue(1)
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  const inactive = disabled || loading

  // jade-600 is the floor for white text (4.79:1). jade-500 fails AA at 3.29:1.
  const background =
    variant === 'primary' ? theme.brand : variant === 'secondary' ? theme.surface : 'transparent'
  const textColor =
    variant === 'primary' ? theme.brandOn : variant === 'ghost' ? theme.textSecondary : theme.text

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPressIn={() => {
        scale.value = withTiming(0.97, { duration: 120 })
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 120 })
      }}
      onPress={() => {
        if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        onPress()
      }}
      style={[
        animatedStyle,
        {
          minHeight: HIT_SIZE,
          borderRadius: radius.control,
          backgroundColor: background,
          opacity: inactive ? 0.5 : 1,
          paddingHorizontal: 18,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          alignSelf: full ? 'stretch' : 'flex-start',
        },
        variant === 'secondary' && {
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: theme.border,
        },
        style,
      ]}
    >
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

export const IconButton: React.FC<IconButtonProps> = ({
  children,
  onPress,
  accessibilityLabel,
  disabled = false,
  style,
}) => {
  const theme = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: HIT_SIZE,
          height: HIT_SIZE,
          borderRadius: radius.control,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : 1,
          backgroundColor: pressed ? theme.border : 'transparent',
        },
        style,
      ]}
    >
      <View pointerEvents="none">{children}</View>
    </Pressable>
  )
}
