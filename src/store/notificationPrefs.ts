import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/**
 * Which notifications this phone gets, and when.
 *
 * Deliberately NOT part of the synced app state: someone who trains with one phone and logs
 * food on a tablet wants the rest alert on one and the meal nudges on the other. These are a
 * property of the device, the way the system notification switch is.
 *
 * Times are 'HH:MM', 24-hour, local.
 */
export interface NotificationPrefs {
  restOver: boolean
  workoutOpen: boolean
  trainingDay: boolean
  trainingDayTime: string
  streakRisk: boolean
  meals: boolean
  breakfastTime: string
  lunchTime: string
  dinnerTime: string
  eveningCheck: boolean
  eveningCheckTime: string
  weighIn: boolean
  weighInTime: string
  water: boolean
  weeklyRecap: boolean
  updates: boolean
}

/*
  Defaults: the workout alerts are on, because they answer something the user just did (a
  rest they started, a session they left open) or a plan they chose. Food and body nudges are
  off until asked for — a meal reminder nobody requested is the notification that gets the
  whole app muted.
*/
export const DEFAULT_PREFS: NotificationPrefs = {
  restOver: true,
  workoutOpen: true,
  trainingDay: true,
  trainingDayTime: '18:00',
  streakRisk: true,
  meals: false,
  breakfastTime: '09:30',
  lunchTime: '13:30',
  dinnerTime: '20:30',
  eveningCheck: false,
  eveningCheckTime: '21:00',
  weighIn: false,
  weighInTime: '08:00',
  water: false,
  // On by default: one message a week, about what the user did, not what they didn't.
  weeklyRecap: true,
  updates: true,
}

interface PrefsState extends NotificationPrefs {
  set: (patch: Partial<NotificationPrefs>) => void
}

export const useNotificationPrefs = create<PrefsState>()(
  persist(
    set => ({
      ...DEFAULT_PREFS,
      set: patch => set(patch),
    }),
    {
      name: 'macrofit-notification-prefs',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ set: _set, ...prefs }) => prefs,
    }
  )
)

/** A plain snapshot, for code outside React (the scheduler, the background task). */
export const getNotificationPrefs = (): NotificationPrefs => {
  const { set: _set, ...prefs } = useNotificationPrefs.getState()
  return prefs
}

/**
 * Resolves `true` once the saved choices have been read back, `false` if that has not
 * happened within `timeoutMs`.
 *
 * For code that runs with nothing mounted (the widget task, the background task). Until the
 * read lands the store holds DEFAULT_PREFS, and a reminder plan made from those cancels every
 * reminder the user turned on. zustand never reports a failed read, hence the timeout.
 */
export const whenPrefsHydrated = (timeoutMs = 5000): Promise<boolean> =>
  new Promise(resolve => {
    if (useNotificationPrefs.persist.hasHydrated()) {
      resolve(true)
      return
    }
    const timer = setTimeout(() => {
      off()
      resolve(false)
    }, timeoutMs)
    const off = useNotificationPrefs.persist.onFinishHydration(() => {
      clearTimeout(timer)
      off()
      resolve(true)
    })
  })
