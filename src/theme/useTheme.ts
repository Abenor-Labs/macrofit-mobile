import { createContext, useContext } from 'react'
import { useColorScheme } from 'react-native'
import { useStore } from '@/store/useStore'
import { useAppearance } from '@/store/appearance'
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
 * Follows the device's Appearance choice: Light and Dark are explicit, System tracks
 * `useColorScheme()` so the app turns dark with the phone's own schedule. Until that choice
 * has been read back from storage it falls back to the synced `darkMode` flag, which is what
 * the theme used to be and what every choice still writes.
 *
 * A ThemeScope above the caller wins. That is how workout mode repaints an entire screen —
 * header, surfaces, buttons, inputs, rest timer — without any of those components knowing
 * a second palette exists.
 */
export const useTheme = (): Theme => {
  const override = useContext(ThemeOverride)
  const darkMode = useStore(s => s.darkMode)
  const mode = useAppearance(s => s.mode)
  const hydrated = useAppearance(s => s.hydrated)
  const scheme = useColorScheme()

  if (override) return override
  const dark = !hydrated
    ? darkMode
    : mode === 'system'
      ? scheme === 'dark'
      : mode === 'dark'
  return dark ? darkTheme : lightTheme
}

export type { Theme }
