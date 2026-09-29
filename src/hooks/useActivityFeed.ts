import { useEffect, useMemo, useState } from 'react'
import { AppState } from 'react-native'

import { getTodayString } from '@core/utils/calculations'
import { useStore } from '@/store/useStore'
import { useActivitySeen } from '@/store/activitySeen'
import { buildFeed, lastWeekRecap, type FeedItem, type WeeklyRecap } from '@/lib/activityFeed'

/**
 * The Activity feed and last week's recap, recomputed only when the data they read changes.
 */
export const useActivityFeed = (): {
  items: FeedItem[]
  unread: number
  recap: WeeklyRecap | null
} => {
  const workoutLog = useStore(s => s.workoutLog)
  const diary = useStore(s => s.diary)
  const goals = useStore(s => s.goals)
  const weightLog = useStore(s => s.weightLog)
  const recommendation = useStore(s => s.recommendation)
  const program = useStore(s => s.trainingPrograms.find(p => p.id === s.activeProgramId) ?? null)
  const weightUnit = useStore(s => s.profile.weightUnit)
  const seenUpTo = useActivitySeen(s => s.seenUpTo)
  const today = getTodayString()

  /*
    A coarse clock. The feed hides anything dated in the future (Monday's recap is dated 9 am),
    and Today stays mounted for days — so without a tick, an app left open overnight never
    showed Monday's recap or lit the bell until some data happened to change.
  */
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 15 * 60_000)
    const sub = AppState.addEventListener('change', s => s === 'active' && setTick(t => t + 1))
    return () => {
      clearInterval(timer)
      sub.remove()
    }
  }, [])

  const items = useMemo(
    () =>
      buildFeed({
        now: Date.now(),
        today,
        workoutLog,
        diary,
        goals,
        weightLog,
        recommendation,
        program,
        weightUnit,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick is the clock
    [today, tick, workoutLog, diary, goals, weightLog, recommendation, program, weightUnit]
  )

  const recap = useMemo(
    () => lastWeekRecap({ today, workoutLog, diary, goals, weightLog, program, weightUnit }),
    [today, workoutLog, diary, goals, weightLog, program, weightUnit]
  )

  return { items, unread: items.filter(item => item.at > seenUpTo).length, recap }
}
