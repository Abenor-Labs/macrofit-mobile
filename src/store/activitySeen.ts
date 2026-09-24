import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/**
 * How far this phone has read the Activity feed, and which weekly recap it has put away.
 *
 * Device-local, like the notification settings: reading your PRs on the phone does not mean
 * you have seen them on the tablet. The feed itself is derived from the log, so this is the
 * only thing about it that is stored anywhere.
 */
interface ActivitySeen {
  /** Items at or before this moment count as read. 0 = never opened. */
  seenUpTo: number
  /** Monday of the recap week that was dismissed from Today. */
  recapDismissed: string | null
  markSeen: (at: number) => void
  dismissRecap: (weekStart: string) => void
}

export const useActivitySeen = create<ActivitySeen>()(
  persist(
    set => ({
      seenUpTo: 0,
      recapDismissed: null,
      markSeen: at => set(state => ({ seenUpTo: Math.max(state.seenUpTo, at) })),
      dismissRecap: weekStart => set({ recapDismissed: weekStart }),
    }),
    {
      name: 'macrofit-activity-seen',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ seenUpTo, recapDismissed }) => ({ seenUpTo, recapDismissed }),
    }
  )
)
