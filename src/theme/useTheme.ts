import { createContext, useContext } from 'react'
import { useStore } from '@/store/useStore'
import { darkTheme, lightTheme, type Theme } from './tokens'

/**
 * Set by ThemeScope to override the user's light/dark preference for one subtree.
 *
 * Undefined everywhere else, so a screen that does not opt in behaves exactly as before.
 */
export const ThemeOverride = createContext<Theme | undefined>(undefined)

/**
 * The active theme.
 *
 * Driven by the same persisted `darkMode` flag the web app uses, so the preference
 * follows the user across platforms through cloud sync. Deliberately does NOT read
 * `useColorScheme()`: that would silently disagree with the toggle in Settings and with
 * whatever the user last chose on the web.
 *
 * A ThemeScope above the caller wins. That is how workout mode repaints an entire screen —
 * header, surfaces, buttons, inputs, rest timer — without any of those components knowing
 * a second palette exists.
 */
export const useTheme = (): Theme => {
  const override = useContext(ThemeOverride)
  const darkMode = useStore(s => s.darkMode)
  return override ?? (darkMode ? darkTheme : lightTheme)
}

export type { Theme }
