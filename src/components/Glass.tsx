import React from 'react'
import { type StyleProp, type ViewStyle } from 'react-native'
import { Island } from './Material'
import { radius as R } from '@/theme/tokens'

/**
 * COMPATIBILITY SHIM. Delete once the screen sweep is finished.
 *
 * Both names now render the same solid `Island`, because both were always holding content
 * and content does not go on glass (MOBILE-DESIGN §1). The material that used to be behind
 * them is described in `Material.tsx`; the version that shipped and failed is in `d9992dc`.
 *
 * Convert call sites as their screens are touched:
 *   a card                  → `Island`
 *   a list of related rows  → `SectionGroup` + `Row`  ← this is the one that matters
 *   floating chrome         → `Glass` from `Material.tsx`
 *
 * The middle case is the point of the exercise. Most `Surface` call sites in this app are
 * one-card-per-row lists, which is what makes a screen read as a stack of identical slabs.
 */

export interface GlassSurfaceProps {
  children?: React.ReactNode
  style?: StyleProp<ViewStyle>
  radius?: number
  /** Accepted and ignored. The material no longer blurs; see the note above. */
  intensity?: number
  /** Accepted and ignored. */
  highlight?: boolean
  bordered?: boolean
}

/** @deprecated Use `Island`, or `Glass` if it is genuinely floating chrome. */
export const GlassSurface: React.FC<GlassSurfaceProps> = ({
  children,
  style,
  radius = R.card,
  bordered = true,
}) => (
  <Island radius={radius} bordered={bordered} style={style}>
    {children}
  </Island>
)

/** @deprecated Use `Island`, or `SectionGroup` + `Row` if it is one of a list. */
export const Surface: React.FC<{
  children?: React.ReactNode
  style?: StyleProp<ViewStyle>
  radius?: number
}> = ({ children, style, radius = R.card }) => (
  <Island radius={radius} style={style}>
    {children}
  </Island>
)
