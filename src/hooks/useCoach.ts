import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  BodyComposition,
  CoachAlert,
  DiaryDay,
  MacroGoals,
  Recommendation,
  TdeeEstimate,
  UserProfile,
  WeightEntry,
} from '@core/types'
import { estimateBodyComposition, latestUsableMeasurement } from '@core/utils/bodyComposition'
import { buildTdeeEstimate } from '@core/utils/tdee'
import { getCoachAlerts } from '@core/utils/coachAlerts'
import { buildLocalRecommendation } from '@core/utils/localRecommendation'
import { getDateString } from '@core/utils/calculations'
import { useStore } from '@/store/useStore'
import { postRecommend, type RecentMacros, type RecommendRequest } from '@/lib/api'

/**
 * The coach, ported from the web app's `src/hooks/useCoach.ts`.
 *
 * Same derivation, same auto-refresh gate, same offline fallback. The only difference is
 * transport: the web hook hand-rolls `fetch('/api/recommend')`, while native goes through
 * `postRecommend`, which already owns the absolute URL, the timeout and the validation.
 */

/** Window the rolling intake average is taken over, in days. */
const RECENT_WINDOW_DAYS = 14

/** A day below this many logged calories was abandoned mid-log, not fasted. Matches tdee.ts. */
const MIN_QUALIFYING_CALORIES = 500

/** A cached plan older than this is eligible for the automatic refresh. Spec 1.5. */
const STALE_PLAN_MS = 7 * 86_400_000

/**
 * Appended to whatever `postRecommend` threw. The thrown message names the real cause
 * (offline, timed out, misconfigured API URL); this half tells the user what they are
 * looking at instead, because a plan is still on screen either way.
 */
const OFFLINE_SUFFIX =
  'The plan below was calculated on your device instead, so it is a plain formula rather than a coached judgement.'

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/** Returns the 'YYYY-MM-DD' string for `back` days before today, in local time. */
const dateDaysAgo = (back: number): string => {
  const date = new Date()
  date.setDate(date.getDate() - back)
  return getDateString(date)
}

/**
 * Returns the per-day mean intake over the last 14 days, or null when no day in that
 * window clears the 500 kcal bar. The mean is taken over the days that actually qualify —
 * a half-logged day would drag it down and mislead the model.
 */
const buildRecentMacros = (diary: Record<string, DiaryDay>): RecentMacros | null => {
  let days = 0
  let calories = 0
  let protein = 0
  let carbs = 0
  let fat = 0

  for (let back = 0; back < RECENT_WINDOW_DAYS; back += 1) {
    const day = diary[dateDaysAgo(back)]
    if (!day || !Array.isArray(day.entries) || day.entries.length === 0) continue

    let dayCalories = 0
    let dayProtein = 0
    let dayCarbs = 0
    let dayFat = 0
    for (const entry of day.entries) {
      if (!entry || !entry.food) continue
      const servings = isFiniteNumber(entry.servings) ? entry.servings : 0
      if (isFiniteNumber(entry.food.calories)) dayCalories += entry.food.calories * servings
      if (isFiniteNumber(entry.food.protein)) dayProtein += entry.food.protein * servings
      if (isFiniteNumber(entry.food.carbs)) dayCarbs += entry.food.carbs * servings
      if (isFiniteNumber(entry.food.fat)) dayFat += entry.food.fat * servings
    }
    if (dayCalories < MIN_QUALIFYING_CALORIES) continue

    days += 1
    calories += dayCalories
    protein += dayProtein
    carbs += dayCarbs
    fat += dayFat
  }

  if (days === 0) return null
  return {
    days,
    calories: Math.round(calories / days),
    protein: Math.round(protein / days),
    carbs: Math.round(carbs / days),
    fat: Math.round(fat / days),
  }
}

/**
 * Auto-refresh gate from spec 1.5: the cached plan must be at least 7 days old AND a
 * weigh-in must have landed since it was built. Anything else — no plan at all, a fresh
 * plan, or a stale plan with no new weight — means the network is never touched on mount.
 */
const isAutoRefreshDue = (
  recommendation: Recommendation | null,
  weightLog: WeightEntry[],
  now: number,
): boolean => {
  if (!recommendation || !isFiniteNumber(recommendation.createdAt)) return false
  if (now - recommendation.createdAt < STALE_PLAN_MS) return false
  if (!Array.isArray(weightLog) || weightLog.length === 0) return false

  const createdOn = getDateString(new Date(recommendation.createdAt))
  // Weight entries carry a date but no timestamp, so a strictly later calendar day is the
  // only defensible reading of "newer than the recommendation".
  return weightLog.some(entry => typeof entry?.date === 'string' && entry.date > createdOn)
}

/**
 * Shared across every mounted instance so a Goals screen that mounts two consumers — or a
 * remount as the user navigates back — can only ever trigger one automatic call per plan.
 */
const autoRefreshLatch = { firedForPlanId: null as string | null }

/** Everything the coach derives from the store. Pure: no effects, no network. */
export interface CoachData {
  profile: UserProfile
  goals: MacroGoals
  currentWeightKg: number
  /** Navy-tape body composition from the most recent usable measurement, or null. */
  bodyComp: BodyComposition | null
  tdee: TdeeEstimate
  /** The TDEE the plan is built around: measured when it is trustworthy, else predicted. */
  anchorTdee: number
  anchorSource: 'measured' | 'predicted'
  alerts: CoachAlert[]
  recommendation: Recommendation | null
  /** True when the saved goals still match the plan exactly — i.e. it has been accepted. */
  accepted: boolean
  recentMacros: RecentMacros | null
}

/**
 * Derives body composition, the TDEE estimate and the coach alerts from the store.
 * Read-only and side-effect free, so any number of components can call it.
 */
export const useCoachData = (): CoachData => {
  const profile = useStore(s => s.profile)
  const goals = useStore(s => s.goals)
  const currentWeightKg = useStore(s => s.currentWeightKg)
  const diary = useStore(s => s.diary)
  const weightLog = useStore(s => s.weightLog)
  const bodyMeasurements = useStore(s => s.bodyMeasurements)
  const recommendation = useStore(s => s.recommendation)

  const bodyComp = useMemo(() => {
    const measurement = latestUsableMeasurement(bodyMeasurements ?? [], profile, currentWeightKg)
    if (!measurement) return null
    return estimateBodyComposition(profile, currentWeightKg, measurement)
  }, [bodyMeasurements, profile, currentWeightKg])

  const tdee = useMemo(
    () => buildTdeeEstimate(profile, currentWeightKg, bodyComp, diary, weightLog ?? []),
    [profile, currentWeightKg, bodyComp, diary, weightLog],
  )

  // A measured TDEE only beats a population formula once enough paired days sit behind it.
  // This mirrors readContext() in api/recommend.ts so the offline fallback and the AI plan
  // are anchored to the same number.
  const trustMeasured =
    tdee.measured !== null &&
    tdee.measured > 0 &&
    (tdee.confidence === 'medium' || tdee.confidence === 'high')
  const anchorTdee = trustMeasured && tdee.measured !== null ? tdee.measured : tdee.predicted
  const anchorSource: CoachData['anchorSource'] = trustMeasured ? 'measured' : 'predicted'

  const alerts = useMemo(
    () =>
      getCoachAlerts({
        profile,
        currentWeightKg,
        goals,
        diary,
        weightLog: weightLog ?? [],
        recommendation,
      }),
    [profile, currentWeightKg, goals, diary, weightLog, recommendation],
  )

  const recentMacros = useMemo(() => buildRecentMacros(diary), [diary])

  const accepted =
    recommendation !== null &&
    goals.calories === recommendation.calories &&
    goals.protein === recommendation.protein &&
    goals.carbs === recommendation.carbs &&
    goals.fat === recommendation.fat

  return {
    profile,
    goals,
    currentWeightKg,
    bodyComp,
    tdee,
    anchorTdee,
    anchorSource,
    alerts,
    recommendation,
    accepted,
    recentMacros,
  }
}

export interface CoachState extends CoachData {
  loading: boolean
  /** Set only when the network plan could not be used; the local plan is showing instead. */
  error: string | null
  /** Always calls the API. Falls back to the local plan rather than leaving the user empty. */
  refresh: () => void
  /** Writes the plan's calories and macros into the goals. */
  accept: () => void
  /** Marks the plan as seen without deleting it. */
  dismiss: () => void
}

/**
 * The coach: derived data plus the network refresh and its offline fallback.
 *
 * The API is called automatically only when the cached plan is at least a week old and a
 * weigh-in has landed since — never unconditionally on mount. `refresh()` always calls.
 */
export const useCoach = (): CoachState => {
  const data = useCoachData()
  const setRecommendation = useStore(s => s.setRecommendation)
  const acceptRecommendation = useStore(s => s.acceptRecommendation)
  const dismissRecommendation = useStore(s => s.dismissRecommendation)
  const weightLog = useStore(s => s.weightLog)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The request payload is read from a ref so `refresh` keeps a stable identity and the
  // auto-refresh effect below cannot re-fire every time a diary entry changes.
  const payloadRef = useRef<RecommendRequest | null>(null)
  payloadRef.current = {
    profile: data.profile,
    currentWeightKg: data.currentWeightKg,
    goals: data.goals,
    bodyComp: data.bodyComp,
    tdee: data.tdee,
    recentMacros: data.recentMacros,
    alerts: data.alerts,
  }

  const fallbackRef = useRef({
    goal: data.profile.goal,
    weightKg: data.currentWeightKg,
    anchorTdee: data.anchorTdee,
  })
  fallbackRef.current = {
    goal: data.profile.goal,
    weightKg: data.currentWeightKg,
    anchorTdee: data.anchorTdee,
  }

  const inFlightRef = useRef(false)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refresh = useCallback(() => {
    if (inFlightRef.current) return
    const payload = payloadRef.current
    if (!payload) return

    inFlightRef.current = true
    setLoading(true)
    setError(null)

    const run = async (): Promise<void> => {
      try {
        // postRecommend already caps the request and validates every field of the reply,
        // so anything that comes back here is safe to write into the store.
        const plan = await postRecommend(payload)
        setRecommendation(plan)
        if (mountedRef.current) setError(null)
      } catch (err: unknown) {
        // Offline, timed out, misconfigured, or the reply was unusable. The user still
        // gets numbers: the same deterministic plan the server would have fallen back to.
        setRecommendation(
          buildLocalRecommendation({
            goal: fallbackRef.current.goal,
            weightKg: fallbackRef.current.weightKg,
            anchorTdee: fallbackRef.current.anchorTdee,
          }),
        )
        const message = err instanceof Error ? err.message : 'Could not reach the coach.'
        if (mountedRef.current) setError(`${message} ${OFFLINE_SUFFIX}`)
      } finally {
        inFlightRef.current = false
        if (mountedRef.current) setLoading(false)
      }
    }

    void run()
  }, [setRecommendation])

  const planId = data.recommendation?.id ?? null

  useEffect(() => {
    if (!isAutoRefreshDue(data.recommendation, weightLog ?? [], Date.now())) return
    if (planId === null || autoRefreshLatch.firedForPlanId === planId) return
    // Latched synchronously, before the call, so a second mounted consumer sees it as
    // already fired.
    autoRefreshLatch.firedForPlanId = planId
    refresh()
  }, [data.recommendation, weightLog, planId, refresh])

  const accept = useCallback(() => {
    acceptRecommendation()
  }, [acceptRecommendation])

  const dismiss = useCallback(() => {
    dismissRecommendation()
  }, [dismissRecommendation])

  return { ...data, loading, error, refresh, accept, dismiss }
}
