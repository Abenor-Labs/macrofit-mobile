import React from 'react'
import { type StyleProp, type ViewStyle } from 'react-native'
import { LiquidGlassPane } from './LiquidGlass'
import { radius as R } from '@/theme/tokens'

export interface GlassSurfaceProps {
  children?: React.ReactNode
  style?: StyleProp<ViewStyle>
  /** Corner radius. Defaults to the card radius. */
  radius?: number
  /** Override the blur strength. Higher is heavier; keep list content unblurred. */
  intensity?: number
  /**
   * A thin bright line along the top edge. Reads as light catching a real pane and is
   * what separates "glass" from "translucent rectangle". On by default.
   */
  highlight?: boolean
  bordered?: boolean
}

/**
 * A glass surface.
 *
 * WHAT CHANGED, AND WHY IT IS NOW A THIN WRAPPER:
 * This used to compose the material itself — a BlurView, an overlay tuned per mode, a
 * hairline and a 1.5px top highlight — and it carried a long note explaining that in-content
 * cards cannot blur what is behind them, because a BlurView cannot be part of its own target.
 * That constraint is gone. `LiquidGlassPane` does not sample a target at all on the fallback
 * path; it re-draws the scene's backdrop magnified about the pane's own centre, which works
 * for a card sitting inside scroll content exactly as well as for floating chrome.
 *
 * So the two surfaces below are no longer "real glass" and "the cheap stand-in" — they are
 * one material at two weights, and every call site in the app gets refraction for free.
 *
 * THE ONE THING CALLERS STILL OWE IT: a `LiquidGlassScene` somewhere above. `Screen` in
 * Layout.tsx provides one for every routed screen. A pane outside a scene degrades to frost.
 */
export const GlassSurface: React.FC<GlassSurfaceProps> = ({
  children,
  style,
  radius = R.card,
  // `intensity` and `highlight` are accepted and ignored. The material owns both now, and
  // keeping the props means 29 call sites did not have to change in the same commit as the
  // material. They are deprecated; drop them when the sites are next touched.
  bordered = true,
}) => (
  <LiquidGlassPane radius={radius} variant="regular" bordered={bordered} style={style}>
    {children}
  </LiquidGlassPane>
)

/**
 * The everyday card.
 *
 * Was a solid stone rectangle with a border and, on light mode, a soft shadow. It is now the
 * same glass as above at a quieter weight — `clear` rather than `regular`, so more of the
 * field comes through and a screen of them does not read as a stack of identical frosted
 * slabs.
 *
 * This is the call that carries the most risk in the rollout: `Surface` wraps diary rows,
 * stat tables and list items, which is precisely what MOBILE-DESIGN §1 used to forbid glass
 * on. §1 has been rewritten to match. If dense screens turn out to cost frames, this
 * component — not the call sites — is where it gets turned back down.
 */
export const Surface: React.FC<{
  children?: React.ReactNode
  style?: StyleProp<ViewStyle>
  radius?: number
}> = ({ children, style, radius = R.card }) => (
  <LiquidGlassPane radius={radius} variant="clear" style={style}>
    {children}
  </LiquidGlassPane>
)
