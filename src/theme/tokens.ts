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

/**
 * Workout mode's accent. Nothing else in the app uses it, which is the point — it cannot
 * collide with a status colour, and landing on it says "different room" before a word is
 * read. Only used against the near-black workout surfaces, where lime-300 sits at about
 * 15:1 and carries near-black text back at the same ratio.
 */
export const lime = {
  300: '#BEF264',
  400: '#A3E635',
  500: '#84CC16',
  600: '#65A30D',
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
  /**
   * The three ambient colour fields Backdrop paints behind every screen, in draw order:
   * behind the glass header, a counterweight on the right so the wash is not one flat hue,
   * and a low bloom behind the tab bar. Lives on the theme because workout mode swaps them
   * for lime — a jade bloom under a lime accent reads as a rendering fault.
   */
  bloom: { top: string; counterweight: string; bottom: string }
  /** Blur tint + overlay colors for GlassSurface. */
  glass: {
    tint: 'light' | 'dark'
    intensity: number
    /**
     * Tint for surfaces that cannot blur what is behind them — the in-content cards in
     * Glass.tsx, which sit inside the very view the chrome samples. Opaque enough to read as
     * deliberate material on its own, because for those it is the only material there is.
     */
    overlay: string
    /**
     * Tint for the floating chrome — tab bar, screen headers — which does blur real content
     * via ChromeBlur. Much lighter than `overlay`: at 0.55 the tint is doing the work and the
     * blur is wasted underneath it. Kept at or above 0.28 so tab labels hold their contrast.
     */
    chromeOverlay: string
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
  bloom: {
    top: 'rgba(56,188,141,0.30)',
    counterweight: 'rgba(214,211,209,0.55)',
    bottom: 'rgba(113,213,175,0.28)',
  },
  glass: {
    tint: 'light',
    intensity: 40,
    overlay: 'rgba(255,255,255,0.55)',
    chromeOverlay: 'rgba(255,255,255,0.30)',
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
  bloom: {
    top: 'rgba(18,161,117,0.22)',
    counterweight: 'rgba(120,113,108,0.16)',
    bottom: 'rgba(12,130,97,0.20)',
  },
  glass: {
    tint: 'dark',
    intensity: 50,
    overlay: 'rgba(28,25,23,0.55)',
    chromeOverlay: 'rgba(28,25,23,0.32)',
    border: 'rgba(250,250,249,0.12)',
    highlight: 'rgba(250,250,249,0.16)',
  },
}

/**
 * Workout mode.
 *
 * Same type, same spacing, same components — only the surface and the accent change. The
 * point is that walking into the workout tab feels like walking into a different room of
 * the same building, the way Instamart does inside Swiggy. Not a different building:
 * training and eating are one loop here, the sets drive the calorie target, and a full
 * sub-brand would quietly claim they are unrelated products.
 *
 * The greys are deliberately COOL where the rest of the app is warm stone. Warm reads as
 * kitchen; cool reads as equipment. That difference registers before the accent does, and
 * it is what stops a dark-mode user from seeing no change at all when they switch tabs.
 *
 * `good` is lime rather than jade because a completed set tints its whole row with it, and
 * that tint is the main thing a person sees while training. Warning and critical keep their
 * amber and red: they are a different hue family from lime, so the row still says which of
 * the three it is.
 */
export const workoutTheme: Theme = {
  mode: 'dark',
  canvas: '#08090A',
  surface: '#131619',
  surfaceRaised: '#1B1F23',
  border: '#262B31',
  trackMuted: '#3F474F',
  hairline: 'rgba(236,244,250,0.10)',
  text: '#F3F6F8',
  textSecondary: '#A6B0B9',
  textMuted: '#79848D',
  brand: lime[300],
  brandText: lime[300],
  // Near-black on lime, not white. White on lime-300 is 1.2:1 and unreadable.
  brandOn: '#08090A',
  macro: { protein: '#2F9AF2', carbs: '#DD7610', fat: '#DA5F8B', fiber: '#9851B2' },
  status: { good: lime[300], warning: '#F59E0B', critical: '#F87171' },
  bloom: {
    top: 'rgba(163,230,53,0.16)',
    counterweight: 'rgba(120,140,160,0.14)',
    bottom: 'rgba(190,242,100,0.12)',
  },
  glass: {
    tint: 'dark',
    intensity: 50,
    overlay: 'rgba(8,9,10,0.62)',
    chromeOverlay: 'rgba(8,9,10,0.36)',
    // A faint lime edge, so even the frosted chrome belongs to this mode.
    border: 'rgba(190,242,100,0.14)',
    highlight: 'rgba(243,246,248,0.14)',
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
