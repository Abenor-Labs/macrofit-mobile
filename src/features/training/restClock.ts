import { create } from 'zustand'

/**
 * The rest countdown's trigger, shared between the set rows that start it and the tab bar
 * that shows it.
 *
 * It lives outside the persisted store on purpose: a rest period is seconds long and
 * meaningless after a restart, and syncing it to the cloud would be absurd.
 */
interface RestClock {
  /** Bumped by every completed working set; 0 means no rest is running. */
  key: number
  start: () => void
  dismiss: () => void
}

export const useRestClock = create<RestClock>(set => ({
  key: 0,
  start: () => set(state => ({ key: state.key + 1 })),
  dismiss: () => set({ key: 0 }),
}))
