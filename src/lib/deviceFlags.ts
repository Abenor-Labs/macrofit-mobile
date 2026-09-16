import { useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Small booleans that belong to a phone rather than to an account.
 *
 * WHY THESE ARE NOT IN THE STORE:
 * Everything in `useStore` is account data — it syncs to the server and comes back on the
 * user's other devices. That is exactly wrong for facts about *this handset*: "has been shown
 * the introduction" and "is being used without an account" are properties of the install, and
 * syncing them would mean a new phone inherits decisions made on an old one.
 *
 * They also deliberately survive `resetStore`. A reset is an account switch on a device that
 * is already familiar; the second person to sign in here does not need the app introduced to
 * them again.
 *
 * A flag reads `null` until its value has been read back from disk. Route on it only once it
 * is non-null — `LaunchGate` holds the splash until every flag has resolved, so by the time
 * any navigator renders they all have real answers.
 */
export interface DeviceFlag {
  /** Read the stored value. Never rejects. */
  load: () => Promise<void>
  /** Set it, in memory first so navigation cannot race the disk write. */
  set: () => void
  /** Clear it. */
  clear: () => void
  /** `null` while unread, then the value for the rest of the session. */
  use: () => boolean | null
  /** Non-reactive read, for callers outside React. */
  peek: () => boolean | null
}

/**
 * @param key      AsyncStorage key.
 * @param fallback What an unreadable disk should resolve to.
 *
 * `fallback` is a real decision, not a default. For the welcome flag it is `true`: a device
 * whose storage we cannot read would otherwise be shown the introduction on every launch,
 * which is worse than a first-time user missing it once. For guest mode it is `false`, because
 * wrongly believing someone chose to skip sign-in would drop them into an empty local app
 * instead of the account they actually have.
 */
export const createDeviceFlag = (key: string, fallback: boolean): DeviceFlag => {
  let value: boolean | null = null
  const listeners = new Set<() => void>()

  const publish = (next: boolean) => {
    if (value === next) return
    value = next
    for (const listener of listeners) listener()
  }

  const subscribe = (onStoreChange: () => void) => {
    listeners.add(onStoreChange)
    return () => {
      listeners.delete(onStoreChange)
    }
  }

  const getSnapshot = () => value

  return {
    load: async () => {
      try {
        publish((await AsyncStorage.getItem(key)) !== null)
      } catch {
        publish(fallback)
      }
    },
    /*
      The in-memory flag flips first and synchronously, so a `router.replace` on the next line
      cannot race the disk write and bounce the user straight back. The write is
      fire-and-forget: if it fails the flag is simply unset on the next cold start, which is a
      cosmetic cost rather than a broken session.
    */
    set: () => {
      publish(true)
      void AsyncStorage.setItem(key, new Date().toISOString()).catch(() => {})
    },
    clear: () => {
      publish(false)
      void AsyncStorage.removeItem(key).catch(() => {})
    },
    use: () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot),
    peek: getSnapshot,
  }
}
