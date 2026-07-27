import React from 'react'
import { View } from 'react-native'
import Svg, { Circle, G } from 'react-native-svg'
import { useTheme } from '@/theme/useTheme'

export interface RingSeries {
  /** 0..1. Values above 1 are clamped for the arc but reported honestly by the caller. */
  progress: number
  color: string
  label: string
}

export interface MacroRingProps {
  size?: number
  strokeWidth?: number
  series: RingSeries[]
  children?: React.ReactNode
}

/**
 * Concentric progress arcs — the app's signature mark, matching the launcher icon.
 *
 * Each series gets its own radius rather than stacking on one track, so three macros are
 * readable at a glance without relying on color alone (position encodes identity too).
 * Colors must come from theme.macro — never a hardcoded hex, since the light and dark
 * steps are independently validated and genuinely differ.
 */
export const MacroRing: React.FC<MacroRingProps> = ({
  size = 180,
  strokeWidth = 12,
  series,
  children,
}) => {
  const theme = useTheme()
  const center = size / 2
  const gap = strokeWidth + 6

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {/* Rotate so every arc starts at 12 o'clock. */}
        <G rotation={-90} origin={`${center}, ${center}`}>
          {series.map((s, i) => {
            const radius = center - strokeWidth / 2 - i * gap
            if (radius <= 0) return null
            const circumference = 2 * Math.PI * radius
            const clamped = Math.max(0, Math.min(1, s.progress))
            return (
              <G key={s.label}>
                <Circle
                  cx={center}
                  cy={center}
                  r={radius}
                  stroke={theme.border}
                  strokeWidth={strokeWidth}
                  fill="none"
                />
                <Circle
                  cx={center}
                  cy={center}
                  r={radius}
                  stroke={s.color}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={`${circumference * clamped} ${circumference}`}
                  fill="none"
                />
              </G>
            )
          })}
        </G>
      </Svg>
      <View style={{ alignItems: 'center' }}>{children}</View>
    </View>
  )
}

export interface ProgressTrackProps {
  progress: number
  color: string
  height?: number
  /** Renders the bar in the critical status color and is announced, not color-only. */
  over?: boolean
}

export const ProgressTrack: React.FC<ProgressTrackProps> = ({
  progress,
  color,
  height = 8,
  over = false,
}) => {
  const theme = useTheme()
  const clamped = Math.max(0, Math.min(1, progress))
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={{
        height,
        borderRadius: height / 2,
        backgroundColor: theme.border,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${clamped * 100}%`,
          height: '100%',
          borderRadius: height / 2,
          backgroundColor: over ? theme.status.critical : color,
        }}
      />
    </View>
  )
}
