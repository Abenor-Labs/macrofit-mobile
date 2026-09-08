import React from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'

import { Island } from './Material'
import { radius as R } from '@/theme/tokens'

/**
 * COMPATIBILITY SHIM. Delete once the screen sweep is finished.
 *
 * This file used to be a 693-line refracting material that every surface in the app went
 * through. It is gone — see the note at the top of `Material.tsx` for why, and MOBILE-DESIGN
 * §3 for the optics it got wrong. Commit `d9992dc` has the original if it is ever wanted.
 *
 * What survives here are the three names 24 files still import, mapped onto the new
 * materials, so the material layer could be replaced without a 24-file commit. Each call
 * site should move to `Island`, `SectionGroup` or `Glass` as its screen is converted, and
 * this file should disappear when the last one does.
 */

/**
 * Was: a scene publishing a backdrop for panes to sample and refract.
 * Now: a plain container that draws the backdrop behind its children.
 *
 * Nothing samples it any more, so it is only doing what its name suggests. Screens that
 * still pass an `Aurora` keep it as ordinary decoration; per MOBILE-DESIGN §8 most of them
 * should stop passing one at all, and only Welcome, Login, Onboarding and Chat should keep it.
 */
export const LiquidGlassScene: React.FC<{
  children?: React.ReactNode
  backdrop?: React.ReactNode
  style?: StyleProp<ViewStyle>
}> = ({ children, backdrop, style }) => (
  <View style={[{ flex: 1 }, style]}>
    {backdrop !== undefined && (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {backdrop}
      </View>
    )}
    {children}
  </View>
)

/** Was: refracting glass at two weights. Now: a solid island, which is what all of these were holding. */
export const LiquidGlassPane: React.FC<{
  children?: React.ReactNode
  style?: StyleProp<ViewStyle>
  radius?: number
  variant?: 'regular' | 'clear'
  bordered?: boolean
  /** A colour the surface carries — a macro pill, a status chip. Kept as a flat fill. */
  tint?: string
  /** Was: iOS 26 interactive glass, which responded to touch. Accepted and ignored. */
  interactive?: boolean
}> = ({ children, style, radius = R.card, bordered = true, tint }) => (
  <Island
    radius={radius}
    bordered={bordered}
    style={tint ? [{ backgroundColor: tint }, style] : style}
  >
    {children}
  </Island>
)

/**
 * Was: a group whose neighbouring panes could morph into each other on iOS 26.
 * Now: a passthrough. Only Welcome used it, and only for three stacked cards.
 */
export const LiquidGlassGroup: React.FC<{
  children?: React.ReactNode
  style?: StyleProp<ViewStyle>
  spacing?: number
}> = ({ children, style }) => <View style={style}>{children}</View>
