import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import { useStore } from './useStore'

/**
 * Light, dark, or whatever the phone is set to.
 *
 * Kept on the device rather than in the synced state, because "follow the system" only means
 * something per device: a phone on a dark schedule and a laptop that is always light can both
 * be following it. The synced `darkMode` flag is still written on every choice, so the web app
 * — which has no System option — keeps receiving a value it understands.
 */
export type AppearanceMode = 'light' | 'dark' | 'system'

interface AppearanceState {
  mode: AppearanceMode
  /**
   * False until the saved choice has been read back.
   *
   * useTheme falls back to the synced `darkMode` until then, so someone who picked Light is not
   * shown one frame of the phone's dark theme while AsyncStorage answers.
   */
  hydrated: boolean
  setMode: (mode: AppearanceMode) => void
}

const STORAGE_KEY = 'macrofit-appearance'

export const useAppearance = create<AppearanceState>()(
  persist(
    set => ({
      mode: 'system',
      hydrated: false,
      setMode: mode => set({ mode }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ mode }) => ({ mode }),
      onRehydrateStorage: () => () => {
        void seedFirstLaunch()
      },
    }
  )
)

const mainStoreHydrated = (): Promise<void> =>
  useStore.persist.hasHydrated()
    ? Promise.resolve()
    : new Promise(resolve => {
        const unsubscribe = useStore.persist.onFinishHydration(() => {
          unsubscribe()
          resolve()
        })
      })

/*
  Before this preference existed the theme was the synced `darkMode` flag and nothing else. An
  install that already went through setup has therefore already made a choice — even if that
  choice was leaving the default alone — and switching them to System on update would repaint
  the app under them. Only a genuinely new install starts on System.

  Whether the key is present has to be asked of AsyncStorage directly: persist hands back the
  defaults when nothing was saved, which is indistinguishable from someone who picked System.
*/
const seedFirstLaunch = async (): Promise<void> => {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY)
    if (saved === null) {
      await mainStoreHydrated()
      const { onboardedAt, darkMode } = useStore.getState()
      if (onboardedAt !== null) {
        useAppearance.setState({ mode: darkMode ? 'dark' : 'light' })
      }
    }
  } finally {
    // Always released, and it writes the key, so the seeding above runs exactly once.
    useAppearance.setState({ hydrated: true })
  }
}
