import { useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createAppState } from '@core/store/appState'
import type { AppState } from '@core/store/appState'

// Every action and every slice comes from the web app's creator, unchanged. Only the
// storage layer is native: AsyncStorage instead of localStorage.
export type { AppState }

// AsyncStorage is asynchronous, so zustand builds the store with defaults first and the
// persisted state arrives a tick later. `hydrated` tracks that moment for the UI.
let hydrated = false
const hydrationListeners = new Set<() => void>()

const markHydrated = () => {
  if (hydrated) return
  hydrated = true
  for (const listener of hydrationListeners) listener()
}

export const useStore = create<AppState>()(
  persist(immer(createAppState), {
    name: 'macrofit-storage',
    storage: createJSONStorage(() => AsyncStorage),
    // Runs on success *and* on failure. A corrupt or unreadable store must still release
    // the splash screen — the user then starts from defaults rather than a frozen app.
    onRehydrateStorage: () => () => markHydrated(),
  })
)

const subscribeHydration = (onStoreChange: () => void) => {
  hydrationListeners.add(onStoreChange)
  return () => {
    hydrationListeners.delete(onStoreChange)
  }
}

const getHydrated = () => hydrated

/**
 * `false` until the persisted state has been read back from AsyncStorage, `true` forever
 * after. Hold the splash screen (or a loader) while it is false — the very first frame
 * otherwise renders default goals and an empty diary, which then jump to the user's real
 * data a moment later.
 */
export const useStoreHydrated = (): boolean =>
  useSyncExternalStore(subscribeHydration, getHydrated, getHydrated)
