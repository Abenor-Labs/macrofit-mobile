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

const STORAGE_KEY = 'macrofit-storage'

export const useStore = create<AppState>()(
  persist(immer(createAppState), {
    name: STORAGE_KEY,
    storage: createJSONStorage(() => AsyncStorage),
    // Runs on success *and* on failure. A corrupt or unreadable store must still release
    // the splash screen — the user then starts from defaults rather than a frozen app.
    onRehydrateStorage: () => () => markHydrated(),
  })
)

/**
 * The store's own defaults, captured as JSON the moment the store is built.
 *
 * `create()` runs the state creator synchronously while AsyncStorage's `getItem` is
 * asynchronous, so everything read on this line is a pristine default rather than the
 * previous session's data. Actions are dropped: they are re-created per store instance and
 * must survive a reset untouched. Every remaining value in `createAppState` is plain JSON,
 * so a string round-trip is a sound deep clone and hands out a fresh object each time —
 * important, because immer freezes what it stores and a shared reference would then be
 * frozen for every later reset.
 */
const PRISTINE_STATE = JSON.stringify(
  Object.fromEntries(
    Object.entries(useStore.getState() as unknown as Record<string, unknown>).filter(
      ([, value]) => typeof value !== 'function'
    )
  )
)

/**
 * Return every persisted field to its default and erase the on-device copy.
 *
 * This is what makes an account switch safe. Without it the next person to sign in on the
 * device inherits the previous user's diary, weigh-ins and profile — and because
 * `onboardedAt` survives too, they are routed straight past setup into someone else's data,
 * which the auto-save then uploads to *their* account.
 *
 * Callers must clear the active user first: the store subscription in AuthProvider saves on
 * any change, and a reset is a change.
 */
const EPOCH_KEY = 'macrofit-store-epoch'

/**
 * A counter identifying the current contents of the store, bumped by every reset.
 *
 * Anything that records "this device holds edits worth publishing over the server" must
 * record the epoch it was true at, and re-check it before acting. Otherwise a reset that
 * lands between the two — a failed sign-out, an interrupted account switch — leaves a
 * licence pointing at a store that is now pristine defaults, and the next sign-in uploads
 * those defaults over the account.
 */
export const getStoreEpoch = async (): Promise<string> => {
  const value = await AsyncStorage.getItem(EPOCH_KEY)
  if (value) return value
  await AsyncStorage.setItem(EPOCH_KEY, '1')
  return '1'
}

export const resetStore = async (): Promise<void> => {
  // Bumped BEFORE the data is touched, so an interruption invalidates outstanding licences
  // rather than leaving one attached to a half-cleared store. Invalidating too eagerly only
  // costs a re-download; invalidating too late costs the account.
  const current = Number(await AsyncStorage.getItem(EPOCH_KEY)) || 0
  await AsyncStorage.setItem(EPOCH_KEY, String(current + 1))
  // Assigning the parsed snapshot is a shallow merge, so the action closures stay in place.
  useStore.setState(JSON.parse(PRISTINE_STATE) as Partial<AppState>)
  // persist.clearStorage() is typed `() => void` and gives us nothing to await, so the key
  // goes directly. Either interleaving is safe: if persist's write for the setState above
  // lands after this, it writes the defaults we just installed.
  await AsyncStorage.removeItem(STORAGE_KEY)
}

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
