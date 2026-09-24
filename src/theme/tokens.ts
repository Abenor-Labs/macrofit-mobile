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

/**
 * The dark mode ladder, derived rather than picked.
 *
 * WHY IT IS NOT WARM STONE:
 * Dark mode used the same warm stone scale as light mode. Warm is right for a light canvas —
 * it reads as paper — but at near-black a hue around 50° reads as brown, and the ambient jade
 * wash `Backdrop` paints over it mixed to olive. That is what "not properly dark, and I didn't
 * like the colours" was describing: not a lack of darkness, a colour cast.
 *
 * These sit on the jade axis instead, at a chroma low enough to read as neutral (0.006–0.011,
 * where the eye stops seeing a hue) but high enough that the brand wash over them stays the
 * same colour it started as.
 *
 * WHY THE STEPS ARE WHAT THEY ARE:
 * Spaced in OKLab lightness, which is perceptually uniform, so a step means the same thing
 * everywhere on the ladder. WCAG contrast ratio is useless here — its +0.05 constant swamps
 * everything below about L 0.3, and it rates the old canvas→surface step and the new one as
 * identically 1.1:1 while they look nothing alike.
 *
 * The old ladder measured:  0.147 → 0.216 → 0.242 → 0.268
 *                                   +0.069  +0.026  +0.026
 *
 * The +0.026 steps are the bug. A card at 0.242 on a page at 0.216 is not a card, it is a
 * slightly different shade of the same field, and its border at 0.268 was doing all the work
 * of separating them. Three surfaces that look like one is why the screen read as flat.
 *
 * This ladder measures:     0.150 → 0.212 → 0.262 → 0.318
 *                                   +0.062  +0.050  +0.056
 *
 * Every step is now visible on its own, so elevation survives without a border and the border
 * is free to be a border.
 */
export const ink = {
  /** L 0.150 — the page. */
  canvas: '#090C0A',
  /** L 0.212 — cards and inputs. */
  surface: '#151A18',
  /** L 0.262 — something above a card: a tooltip, a menu, a sheet. */
  raised: '#212623',
  /** L 0.318 — hairlines and dividers that have to survive on either surface. */
  border: '#2E3431',
  /** L 0.431 — the unfilled half of a progress track. */
  track: '#4B524E',
  /**
   * L 0.640 — de-emphasised text. 4.6:1 on `raised`, 5.3:1 on `surface`, 5.9:1 on `canvas`.
   *
   * Solved against `raised`, the LIGHTEST surface it ever sits on, so the weakest case is the
   * one that passes and every other placement has headroom. The old stone-500 measured 3.4:1
   * there and 3.7:1 on the page — under the 4.5:1 body-text floor on every surface in the app,
   * which is the sort of thing that only shows up when someone runs the numbers. It carries
   * timestamps, units and captions, so it is small text failing AA, not decoration.
   */
  textMuted: '#888E8B',
  /** L 0.734 — secondary text. 7.5:1 on surface. */
  textSecondary: '#A6AAA8',
  /** L 0.955 — primary text. 15.5:1 on surface. */
  text: '#EEF1EF',
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
  /**
   * The glass material — floating chrome ONLY. See MOBILE-DESIGN §1 and §2.
   *
   * HEAVY TINT, MODEST BLUR. This is the inversion that mattered. The previous values ran a
   * 0.30 tint under a 40–50 intensity blur, which is the recipe for "washed out": at 0.30 the
   * tint cannot hold a tab label's contrast, and the expensive blur underneath it is doing
   * work nobody can see. Telegram's compact menu is `#FFFFFFBB` — 72.5% — over a 10px blur,
   * and its reaction picker goes to 92%. Their glass is nearly opaque. It reads as glass
   * because of the edge and the motion behind it, not because you can see through it.
   *
   * Nothing holding content uses any of this. Islands are solid.
   */
  glass: {
    /** BlurView's tint style, not a colour. */
    tint: 'light' | 'dark'
    /** expo-blur intensity. Deliberately modest — the overlays below carry legibility. */
    intensity: number
    /** Sheets, menus and the chat composer. Heavier, because they sit over live content. */
    overlay: string
    /** Tab bar and screen headers. */
    chromeOverlay: string
    /**
     * Laid over the blur before content, for glass sitting on imagery — meal photos,
     * progress photos. `BlurBehindDrawable` draws `0x1a000000` unconditionally for the same
     * reason: a bright photo otherwise eats white text.
     */
    scrim: string
    border: string
  }
}

/**
 * Elevation for light mode. Dark mode sets NO shadow and steps up the ink ladder instead —
 * a shadow is invisible at those lightnesses and only muddies the surface.
 *
 * Far softer than instinct suggests. Telegram's `--shadow-island` is `0 1px 4px 0 #0000000D`:
 * five percent. Its Android code reaches for `setShadowLayer(dp(6), 0, dp(1), 15% black)`.
 *
 * Both halves ship together or the shadow exists on one platform only — iOS reads
 * `shadowColor`/`shadowOffset`/`shadowOpacity`/`shadowRadius`, Android reads `elevation`.
 */
export const shadow = {
  /** Cards and rows. */
  island: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  /** The FAB, and anything lifted under the finger. */
  floating: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  /** Tab bar, headers, sheets. */
  chrome: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },
} as const

/**
 * The only durations in the app.
 *
 * Curves are Telegram's, read from `_variables.scss`: `--slide-transition` is
 * `300ms cubic-bezier(0.25, 1, 0.5, 1)`, `--select-transition` is `200ms ease-out`, and the
 * iOS layer transition is `350ms cubic-bezier(0.16, 1, 0.3, 1)`. `field` is what
 * `MotionBackgroundDrawable` advances its wallpaper on — `CubicBezierInterpolator(0.33, 0, 0, 1)`
 * over 500ms. `fade` is `BlurBehindDrawable` stepping its blur alpha by 0.09 a frame.
 *
 * `bezier` tuples feed `Easing.bezier(...)` from Reanimated.
 */
/**
 * The only text sizes in the app. Nine steps, from the 11pt label to the 40pt display figure.
 *
 * It used to be whatever each screen reached for — nineteen sizes, 14 next to 15 next to 16 —
 * which is how a set of screens stops looking like one app. 30 is the calorie ring's figure,
 * sized to what the ring can hold; 40 is for one hero number on a screen, never two.
 * `Body` and `StatValue` only accept these, so an off-ramp size is a compile error.
 */
export const TYPE_RAMP = [11, 12, 13, 15, 17, 20, 24, 30, 40] as const
export type TypeSize = (typeof TYPE_RAMP)[number]

export const motion = {
  press: { duration: 120, bezier: [0.33, 0, 0.67, 1] },
  select: { duration: 200, bezier: [0.33, 0, 0.67, 1] },
  fade: { duration: 185, bezier: [0, 0, 1, 1] },
  slide: { duration: 300, bezier: [0.25, 1, 0.5, 1] },
  layer: { duration: 350, bezier: [0.16, 1, 0.3, 1] },
  field: { duration: 500, bezier: [0.33, 0, 0, 1] },
  /**
   * Something arriving: sheets, the summary, the tab indicator, entrances. A strong ease-out
   * — the thing lands fast and settles — because the built-in curves are too weak to read as
   * deliberate, and an ease-in on an entrance reads as lag.
   */
  enter: { duration: 260, bezier: [0.23, 1, 0.32, 1] },
} as const

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
    intensity: 30,
    overlay: 'rgba(255,255,255,0.86)',
    chromeOverlay: 'rgba(255,255,255,0.72)',
    scrim: 'rgba(0,0,0,0.10)',
    border: 'rgba(28,25,23,0.10)',
  },
}

export const darkTheme: Theme = {
  mode: 'dark',
  canvas: ink.canvas,
  surface: ink.surface,
  surfaceRaised: ink.raised,
  border: ink.border,
  trackMuted: ink.track,
  hairline: 'rgba(238,241,239,0.10)',
  text: ink.text,
  textSecondary: ink.textSecondary,
  textMuted: ink.textMuted,
  /*
    The brand goes UP a step in dark mode, not down.

    `brand` is a fill that carries `brandOn` text — buttons, selected chips, the log button.
    It was jade-600, which measures 3.7:1 against the dark surface: a dark green block on a
    dark page, with white text on it at 4.1:1. Meanwhile `brandText` was the bright jade-400,
    so the same brand appeared as a murky fill and a vivid link on one screen.

    Both are bright now and differ only by step, which is the standard tonal pattern for dark
    surfaces: jade-400 fills at 7.3:1, jade-300 sets text at 9.9:1. Light mode is untouched —
    it has the opposite problem and already solved it the opposite way.
  */
  brand: jade[400],
  brandText: jade[300],
  // Near-black on jade-400, not white. White on jade-400 is 2.2:1 and unreadable; the canvas
  // ink measures 8.2:1 on it.
  brandOn: ink.canvas,
  /*
    Unchanged, and deliberately so. These four were produced by the dataviz palette validator
    and re-checked against the new surface: lightness band, chroma floor, CVD separation
    (worst adjacent pair fiber↔fat, ΔE 11.4 protan), normal-vision separation (ΔE 15.0), and
    contrast (all ≥ 3:1, the floor for graphical marks). Substituting a nicer-looking hex
    silently breaks that guarantee, and moving to a darker surface did not weaken any of it.
  */
  macro: { protein: '#2F9AF2', carbs: '#DD7610', fat: '#DA5F8B', fiber: '#9851B2' },
  // Reserved, never used as a series colour, and always paired with an icon and a word — so
  // proximity to the macro hues cannot be the only thing telling them apart.
  status: { good: jade[400], warning: '#F59E0B', critical: '#F87171' },
  /*
    Roughly half the previous alpha.

    `Backdrop` paints these as three 400px gradient circles, so between them they cover most
    of the viewport. At 0.20–0.22 over a warm near-black that was not ambient light, it was a
    colour cast over the whole app — and jade over warm brown mixes to olive, which is the
    part that looked wrong rather than merely strong.

    The counterweight is cool now rather than warm stone. It exists to stop the wash being one
    flat hue, and a warm grey was the other half of the brown.
  */
  bloom: {
    top: 'rgba(56,188,141,0.12)',
    counterweight: 'rgba(122,142,152,0.08)',
    bottom: 'rgba(18,161,117,0.10)',
  },
  glass: {
    tint: 'dark',
    intensity: 30,
    /*
      Keyed to `ink.raised` and `ink.surface` respectively, so a sheet still reads as a step
      above the card it opened from even while both are translucent. The old values tinted
      chrome at 0.34 over the canvas, which is where the dark tab bar lost its labels.
    */
    overlay: 'rgba(33,38,35,0.90)',
    chromeOverlay: 'rgba(21,26,24,0.86)',
    scrim: 'rgba(0,0,0,0.10)',
    border: 'rgba(238,241,239,0.12)',
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
    intensity: 30,
    overlay: 'rgba(27,31,35,0.90)',
    chromeOverlay: 'rgba(19,22,25,0.86)',
    scrim: 'rgba(0,0,0,0.10)',
    // A faint lime edge, so even the frosted chrome belongs to this mode.
    border: 'rgba(190,242,100,0.14)',
  },
}

/**
 * `sheet` and `tiny` are Telegram's `--border-radius-modal` (2rem) and
 * `--border-radius-default-tiny` (0.375rem). `card` and `control` already matched their
 * `--border-radius-island` (1.5rem) and `--border-radius-button` (1rem).
 */
export const radius = { pill: 999, sheet: 32, card: 24, control: 16, tight: 12, tiny: 6 } as const

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
