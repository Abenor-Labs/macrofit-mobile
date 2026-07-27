import { useStore } from '@/store/useStore'
import { darkTheme, lightTheme, type Theme } from './tokens'

/**
 * The active theme.
 *
 * Driven by the same persisted `darkMode` flag the web app uses, so the preference
 * follows the user across platforms through cloud sync. Deliberately does NOT read
 * `useColorScheme()`: that would silently disagree with the toggle in Settings and with
 * whatever the user last chose on the web.
 */
export const useTheme = (): Theme => {
  const darkMode = useStore(s => s.darkMode)
  return darkMode ? darkTheme : lightTheme
}

export type { Theme }
