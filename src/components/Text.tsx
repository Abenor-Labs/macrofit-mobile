import React from 'react'
import { Text, type StyleProp, type TextStyle } from 'react-native'
import { useTheme } from '@/theme/useTheme'
import { fonts, type TypeSize } from '@/theme/tokens'

type Tone = 'primary' | 'secondary' | 'muted' | 'brand' | 'inverse'

const useToneColor = (tone: Tone): string => {
  const theme = useTheme()
  if (tone === 'secondary') return theme.textSecondary
  if (tone === 'muted') return theme.textMuted
  if (tone === 'brand') return theme.brandText
  if (tone === 'inverse') return theme.brandOn
  return theme.text
}

export interface StatValueProps {
  children: React.ReactNode
  size?: TypeSize
  tone?: Tone
  /** Overrides the tone entirely — used for macro-colored figures. */
  color?: string
  style?: StyleProp<TextStyle>
  accessibilityLabel?: string
  numberOfLines?: number
}

/**
 * Every number the user reads as data goes through here.
 *
 * Fraunces + tabular figures is the app's visual signature, and tabular figures also stop
 * digits jittering as live values (timers, running volume) tick.
 */
export const StatValue: React.FC<StatValueProps> = ({
  children,
  size = 28,
  tone = 'primary',
  color,
  style,
  accessibilityLabel,
  numberOfLines,
}) => {
  const toneColor = useToneColor(tone)
  return (
    <Text
      accessibilityLabel={accessibilityLabel}
      numberOfLines={numberOfLines}
      style={[
        {
          fontFamily: fonts.display,
          fontSize: size,
          lineHeight: size * 1.1,
          color: color ?? toneColor,
          fontVariant: ['tabular-nums'],
        },
        style,
      ]}
    >
      {children}
    </Text>
  )
}

export interface BodyProps {
  children: React.ReactNode
  size?: TypeSize
  tone?: Tone
  weight?: 'regular' | 'medium' | 'semibold'
  style?: StyleProp<TextStyle>
  numberOfLines?: number
}

export const Body: React.FC<BodyProps> = ({
  children,
  size = 15,
  tone = 'primary',
  weight = 'regular',
  style,
  numberOfLines,
}) => {
  const color = useToneColor(tone)
  const family =
    weight === 'semibold' ? fonts.semibold : weight === 'medium' ? fonts.medium : fonts.body
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{ fontFamily: family, fontSize: size, lineHeight: size * 1.45, color }, style]}
    >
      {children}
    </Text>
  )
}

/** Small uppercase caption above a figure. */
export const Label: React.FC<{ children: React.ReactNode; style?: StyleProp<TextStyle> }> = ({
  children,
  style,
}) => {
  const theme = useTheme()
  return (
    <Text
      style={[
        {
          fontFamily: fonts.semibold,
          fontSize: 11,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: theme.textMuted,
        },
        style,
      ]}
    >
      {children}
    </Text>
  )
}

export const SectionTitle: React.FC<{
  children: React.ReactNode
  style?: StyleProp<TextStyle>
}> = ({ children, style }) => {
  const theme = useTheme()
  return (
    <Text style={[{ fontFamily: fonts.displayBold, fontSize: 20, color: theme.text }, style]}>
      {children}
    </Text>
  )
}
