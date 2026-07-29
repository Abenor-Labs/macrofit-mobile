import React from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Circle, G } from 'react-native-svg'

import { jade, radius, stone } from '@/theme/tokens'

/**
 * The launcher mark, redrawn as vector so it scales crisply and can be themed.
 *
 * The ring colours are fixed rather than themed on purpose: the mark always sits on the
 * jade tile below, so it is a single brand object in both light and dark rather than a
 * surface that changes with the canvas.
 */
export const RingMark: React.FC<{ size?: number }> = ({ size = 72 }) => {
  const c = size / 2
  // Proportions of the 72pt original, so the mark holds its shape at any size.
  const rings = [
    { r: c - size * 0.083, w: size * 0.097, dash: 0.78, color: stone[50] },
    { r: c - size * 0.236, w: size * 0.083, dash: 0.55, color: jade[100] },
    { r: c - size * 0.375, w: size * 0.069, dash: 0.35, color: jade[200] },
  ]
  // The unfilled portion of each ring: the tile's own jade, lightened rather than a new hue.
  const track = 'rgba(250,250,249,0.25)'
  return (
    <Svg width={size} height={size}>
      <G rotation={-90} origin={`${c}, ${c}`}>
        {rings.map(ring => {
          const circumference = 2 * Math.PI * ring.r
          return (
            <G key={ring.r}>
              <Circle
                cx={c}
                cy={c}
                r={ring.r}
                stroke={track}
                strokeWidth={ring.w}
                fill="none"
              />
              <Circle
                cx={c}
                cy={c}
                r={ring.r}
                stroke={ring.color}
                strokeWidth={ring.w}
                strokeLinecap="round"
                strokeDasharray={`${circumference * ring.dash} ${circumference}`}
                fill="none"
              />
            </G>
          )
        })}
      </G>
    </Svg>
  )
}

/** The mark on its jade tile — the app's identity wherever it needs to stand alone. */
export const BrandMark: React.FC<{ size?: number; style?: StyleProp<ViewStyle> }> = ({
  size = 96,
  style,
}) => (
  <View
    style={[
      {
        width: size,
        height: size,
        borderRadius: radius.card,
        backgroundColor: jade[600],
        alignItems: 'center',
        justifyContent: 'center',
      },
      style,
    ]}
  >
    <RingMark size={size * 0.75} />
  </View>
)
