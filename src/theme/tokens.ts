/**
 * Design tokens — see docs/MOBILE-DESIGN.md.
 *
 * Ported from the web app's design system. The macro palette values were produced by the
 * dataviz palette validator and pass, for ALL pairs in BOTH modes: lightness band, chroma
 * floor, CVD separation, normal-vision floor, and contrast against the mode's surface.
 * Substituting a "nicer looking" hex silently breaks that guarantee.
 */

export const jade = {
  50: '#EDFAF5',
  100: '#D3F3E6',
  200: '#A8E7CE',
  300: '#71D5AF',
  400: '#38BC8D',
  500: '#12A175',
  600: '#0C8261',
  700: '#0B674E',
  800: '#0B5240',
  900: '#0A4335',
} as const

export const stone = {
  50: '#FAFAF9',
  100: '#F5F5F4',
  200: '#E7E5E4',
  300: '#D6D3D1',
  400: '#A8A29E',
  500: '#78716C',
  600: '#57534E',
  700: '#44403C',
  800: '#292524',
  900: '#1C1917',
  950: '#0C0A09',
} as const

export interface Theme {
  mode: 'light' | 'dark'
  canvas: string
  surface: string
  surfaceRaised: string
  border: string
  /**
   * Unfilled portion of a progress track.
   *
   * Darker than `border` on purpose. `border` is tuned to sit against `surface`, and a
   * 5px bar in that colour vanishes on the tinted washes the setup and dashboard screens
   * use — the last segment of the onboarding bar disappeared entirely, so step 4 of 5
   * looked like the bar simply ended.
   */
  trackMuted: string
  hairline: string
  text: string
  textSecondary: string
  textMuted: string
  brand: string
  brandText: string
  brandOn: string
  macro: { protein: string; carbs: string; fat: string; fiber: string }
  status: { good: string; warning: string; critical: string }
  /** Blur tint + overlay colors for GlassSurface. */
  glass: {
    tint: 'light' | 'dark'
    intensity: number
    overlay: string
    border: string
    highlight: string
  }
}

export const lightTheme: Theme = {
  mode: 'light',
  canvas: stone[50],
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  border: stone[200],
  trackMuted: stone[400],
  hairline: 'rgba(28,25,23,0.08)',
  text: stone[900],
  textSecondary: stone[600],
  textMuted: stone[500],
  brand: jade[600],
  // jade-700 on a light canvas measures 6.56:1; jade-600 is 4.59:1. Both pass, 700 reads better.
  brandText: jade[700],
  brandOn: '#FFFFFF',
  macro: { protein: '#168BE1', carbs: '#C97004', fat: '#9B204A', fiber: '#924BAC' },
  status: { good: jade[600], warning: '#B45309', critical: '#B91C1C' },
  glass: {
    tint: 'light',
    intensity: 40,
    overlay: 'rgba(255,255,255,0.55)',
    border: 'rgba(28,25,23,0.10)',
    highlight: 'rgba(255,255,255,0.85)',
  },
}

export const darkTheme: Theme = {
  mode: 'dark',
  canvas: stone[950],
  surface: stone[900],
  surfaceRaised: '#221F1D',
  border: stone[800],
  trackMuted: stone[600],
  hairline: 'rgba(250,250,249,0.10)',
  text: stone[100],
  textSecondary: stone[400],
  textMuted: stone[500],
  brand: jade[600],
  brandText: jade[400],
  brandOn: '#FFFFFF',
  macro: { protein: '#2F9AF2', carbs: '#DD7610', fat: '#DA5F8B', fiber: '#9851B2' },
  status: { good: jade[400], warning: '#F59E0B', critical: '#F87171' },
  glass: {
    tint: 'dark',
    intensity: 50,
    overlay: 'rgba(28,25,23,0.55)',
    border: 'rgba(250,250,249,0.12)',
    highlight: 'rgba(250,250,249,0.16)',
  },
}

export const radius = { pill: 999, card: 24, control: 16, tight: 12 } as const

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const

export const fonts = {
  display: 'Fraunces_600SemiBold',
  displayBold: 'Fraunces_700Bold',
  body: 'Figtree_400Regular',
  medium: 'Figtree_500Medium',
  semibold: 'Figtree_600SemiBold',
} as const

/** Minimum touch target, per the design system. */
export const HIT_SIZE = 44
