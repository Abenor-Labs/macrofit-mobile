import type { HexColor } from 'react-native-android-widget'
import { darkTheme, jade, lightTheme, workoutTheme, type Theme } from '@/theme/tokens'

/*
  The app's tokens, narrowed to what a widget draws with.

  The widget library only takes `#rrggbb` (or `rgba(r, g, b, a)` with spaces), so every colour
  is picked from an opaque token rather than the translucent hairlines and glass fills.
  Type-only import from the library: this file is safe to load on a build without widgets.
*/

export interface WidgetPalette {
  surface: HexColor
  text: HexColor
  textSecondary: HexColor
  textMuted: HexColor
  track: HexColor
  /** A quiet button: a tint of the accent, not a second card. */
  chip: HexColor
  chipText: HexColor
  accent: HexColor
  accentOn: HexColor
  critical: HexColor
  macro: { protein: HexColor; carbs: HexColor; fat: HexColor }
}

const hex = (value: string) => value as HexColor

const from = (theme: Theme, chip: string, chipText: string): WidgetPalette => ({
  surface: hex(theme.surface),
  text: hex(theme.text),
  textSecondary: hex(theme.textSecondary),
  textMuted: hex(theme.textMuted),
  track: hex(theme.border),
  chip: hex(chip),
  chipText: hex(chipText),
  accent: hex(theme.brand),
  accentOn: hex(theme.brandOn),
  critical: hex(theme.status.critical),
  macro: {
    protein: hex(theme.macro.protein),
    carbs: hex(theme.macro.carbs),
    fat: hex(theme.macro.fat),
  },
})

/** Today follows the phone's light or dark mode, like the rest of the home screen. */
export const todayPalettes = {
  light: from(lightTheme, jade[50], lightTheme.brandText),
  dark: from(darkTheme, '#1C2B25', darkTheme.brandText),
}

/**
 * Training is always workout mode's near-black and lime, in either system mode: in the app,
 * landing on lime says "different room" before a word is read, and the widget is the door
 * to that room.
 */
export const trainingPalette = from(workoutTheme, workoutTheme.surfaceRaised, workoutTheme.text)

export const FONT = {
  display: 'Fraunces_600SemiBold',
  medium: 'Figtree_500Medium',
  semibold: 'Figtree_600SemiBold',
} as const
