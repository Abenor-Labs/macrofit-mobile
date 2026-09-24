import { useStore } from '@/store/useStore'
import { useRestClock } from './restClock'

/**
 * Extra bottom padding for a Training tab while chrome rides on the tab bar: the rest timer
 * (any tab) and the live-session strip (every tab but Today). Without it the last card
 * scrolls to a stop underneath them.
 */
export const useLiveStripSpace = (onToday = false): number => {
  const active = useStore(s => s.activeWorkoutId !== null)
  const resting = useRestClock(state => state.key !== 0)
  if (!active) return 0
  return (onToday ? 0 : 64) + (resting ? 104 : 0)
}
