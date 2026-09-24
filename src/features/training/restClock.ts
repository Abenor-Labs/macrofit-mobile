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
  /**
   * What comes after this rest, e.g. "Next: Bench Press · 80 kg × 8". Carried here because
   * the set rows know it and the timer that schedules the notification does not.
   */
  nextLabel: string
  start: (nextLabel?: string) => void
  dismiss: () => void
}

export const useRestClock = create<RestClock>(set => ({
  key: 0,
  nextLabel: '',
  start: (nextLabel = '') => set(state => ({ key: state.key + 1, nextLabel })),
  dismiss: () => set({ key: 0, nextLabel: '' }),
}))
