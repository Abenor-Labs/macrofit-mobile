import type {
  CoachAlert,
  CoachAlertKind,
  DiaryDay,
  MacroGoals,
  Recommendation,
  UserProfile,
  WeightEntry,
} from '../types'
import { getTodayString } from './calculations'

/** Everything getCoachAlerts needs, passed in explicitly so the module stays pure and testable. */
export interface CoachAlertInput {
  profile: UserProfile
  currentWeightKg: number
  goals: MacroGoals
  diary: Record<string, DiaryDay>
  weightLog: WeightEntry[]
  recommendation: Recommendation | null
  today?: string
}

const MS_PER_DAY = 86_400_000
const KG_PER_LB = 0.45359237

const MAX_ALERTS = 3

// A day only counts as "logged" above this many calories — below it the user forgot to
// finish logging rather than actually fasted. Same threshold the TDEE spec uses.
const MIN_QUALIFYING_CALORIES = 500
const QUALIFYING_DAYS_REQUIRED = 10
const DATA_WINDOW_DAYS = 28

const STALL_WINDOW_DAYS = 28
const STALL_MIN_SPAN_DAYS = 21
const STALL_MAX_KG_PER_WEEK = 0.1

const SHORT_WINDOW_DAYS = 14
const SHORT_MIN_SPAN_DAYS = 7
const LONG_WINDOW_DAYS = 28
const LONG_MIN_SPAN_DAYS = 14
const MIN_TREND_POINTS = 3

const FAST_LOSS_PCT_PER_WEEK = 1
const FAST_GAIN_KG_PER_WEEK = 0.5

const PHASE_MAX_DAYS = 112 // 16 weeks
const PROTEIN_WINDOW_DAYS = 7
const PROTEIN_MIN_DAYS = 3
const MIN_PROTEIN_G_PER_KG = 1.6
const STALE_RECOMMENDATION_DAYS = 14

interface WeightPoint {
  day: number
  kg: number
}

interface TrendResult {
  kgPerWeek: number
  spanDays: number
  points: number
}

interface DaySummary {
  calories: number
  protein: number
}

/** Whole-day index (days since the Unix epoch) for a 'YYYY-MM-DD' string; null if it is not a real date. */
const dayIndex = (dateStr: string): number | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const ms = Date.UTC(year, month - 1, day)
  if (!Number.isFinite(ms)) return null
  const round = new Date(ms)
  // Date.UTC silently rolls over impossible dates (2025-02-31 -> March), so verify the round trip.
  if (round.getUTCFullYear() !== year || round.getUTCMonth() !== month - 1 || round.getUTCDate() !== day) {
    return null
  }
  return Math.round(ms / MS_PER_DAY)
}

const dateStringFromDayIndex = (day: number): string => {
  const d = new Date(day * MS_PER_DAY)
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const date = String(d.getUTCDate()).padStart(2, '0')
  return `${d.getUTCFullYear()}-${month}-${date}`
}

/** Day index of a millisecond timestamp, read in local time to match how the app writes diary dates. */
const dayIndexFromTimestamp = (ms: number): number | null => {
  if (!Number.isFinite(ms)) return null
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return null
  return dayIndex(
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  )
}

const toKg = (weight: number, unit: UserProfile['weightUnit']): number =>
  unit === 'lbs' ? weight * KG_PER_LB : weight

const round1 = (n: number): number => Math.round(n * 10) / 10

const fmt1 = (n: number): string => round1(n).toFixed(1)

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many)

/**
 * Least-squares slope of weight against time, in kg/week; null with fewer than 2 points
 * or when every point falls on the same day (no spread on x to fit a line through).
 * Least squares rather than first-vs-last because daily scale weight is very noisy.
 */
const leastSquaresKgPerWeek = (points: WeightPoint[]): number | null => {
  if (points.length < 2) return null
  let sumX = 0
  let sumY = 0
  for (const p of points) {
    sumX += p.day
    sumY += p.kg
  }
  const meanX = sumX / points.length
  const meanY = sumY / points.length
  let numerator = 0
  let denominator = 0
  for (const p of points) {
    const dx = p.day - meanX
    numerator += dx * (p.kg - meanY)
    denominator += dx * dx
  }
  if (denominator === 0) return null
  const perDay = numerator / denominator
  if (!Number.isFinite(perDay)) return null
  return perDay * 7
}

/** Sorted, de-noised weight series in kg; entries with unparseable dates or weights are dropped. */
const buildSeries = (weightLog: WeightEntry[], unit: UserProfile['weightUnit']): WeightPoint[] => {
  const points: WeightPoint[] = []
  if (!Array.isArray(weightLog)) return points
  for (const entry of weightLog) {
    if (!entry) continue
    const day = dayIndex(entry.date)
    if (day === null) continue
    const kg = toKg(entry.weight, unit)
    if (!Number.isFinite(kg) || kg <= 0) continue
    points.push({ day, kg })
  }
  return points.sort((a, b) => a.day - b.day)
}

/**
 * Weight trend over the last `windowDays`; null when the window holds fewer than
 * `minPoints` weigh-ins or spans fewer than `minSpanDays` (too little to fit a line).
 */
const trendOver = (
  series: WeightPoint[],
  todayDay: number,
  windowDays: number,
  minSpanDays: number,
  minPoints: number
): TrendResult | null => {
  const window = series.filter((p) => p.day <= todayDay && todayDay - p.day <= windowDays)
  if (window.length < minPoints) return null
  const spanDays = window[window.length - 1].day - window[0].day
  if (spanDays < minSpanDays) return null
  const kgPerWeek = leastSquaresKgPerWeek(window)
  if (kgPerWeek === null) return null
  return { kgPerWeek, spanDays, points: window.length }
}

/** Calorie and protein totals for one diary day; null when the day is missing or has no food entries. */
const summariseDay = (day: DiaryDay | undefined): DaySummary | null => {
  if (!day) return null
  const entries = day.entries
  if (!Array.isArray(entries) || entries.length === 0) return null
  let calories = 0
  let protein = 0
  for (const entry of entries) {
    if (!entry) continue
    const food = entry.food
    if (!food) continue
    const servings = Number.isFinite(entry.servings) ? entry.servings : 0
    if (Number.isFinite(food.calories)) calories += food.calories * servings
    if (Number.isFinite(food.protein)) protein += food.protein * servings
  }
  return { calories, protein }
}

const makeAlert = (
  kind: CoachAlertKind,
  severity: CoachAlert['severity'],
  title: string,
  detail: string
): CoachAlert => ({
  // Stable id derived from the kind: this list re-renders constantly and a random key would remount it.
  id: `coach-alert-${kind}`,
  kind,
  severity,
  title,
  detail,
})

const SEVERITY_RANK: Record<CoachAlert['severity'], number> = { warning: 0, info: 1 }

/**
 * Returns up to 3 plain-language coaching alerts for the given state, most severe first
 * (warnings before info). Returns an empty array when `today` cannot be parsed or when
 * nothing in the data crosses a threshold. Every number quoted in the text is computed
 * here — nothing is estimated or invented.
 */
export const getCoachAlerts = (input: CoachAlertInput): CoachAlert[] => {
  const { profile, currentWeightKg, goals, diary, weightLog, recommendation } = input

  const todayDay =
    (input.today !== undefined ? dayIndex(input.today) : null) ?? dayIndex(getTodayString())
  if (todayDay === null) return []

  const hasWeight = Number.isFinite(currentWeightKg) && currentWeightKg > 0
  const goal = profile.goal
  const series = buildSeries(weightLog, profile.weightUnit)

  const shortTrend = trendOver(series, todayDay, SHORT_WINDOW_DAYS, SHORT_MIN_SPAN_DAYS, MIN_TREND_POINTS)
  const longTrend = trendOver(series, todayDay, LONG_WINDOW_DAYS, LONG_MIN_SPAN_DAYS, MIN_TREND_POINTS)
  // The stall check needs a genuinely long look-back, so it demands a >= 21 day span.
  const stallTrend = trendOver(series, todayDay, STALL_WINDOW_DAYS, STALL_MIN_SPAN_DAYS, MIN_TREND_POINTS)
  const rateTrend = shortTrend ?? longTrend

  // --- Diary windows -------------------------------------------------------
  let qualifyingDays = 0
  for (let back = 0; back < DATA_WINDOW_DAYS; back++) {
    const summary = summariseDay(diary[dateStringFromDayIndex(todayDay - back)])
    if (summary && summary.calories >= MIN_QUALIFYING_CALORIES) qualifyingDays++
  }
  const weighInsInWindow = series.filter((p) => p.day <= todayDay && todayDay - p.day <= DATA_WINDOW_DAYS).length

  // Protein looks at the last 7 *complete* days: a half-logged today would drag the
  // average down and fire a false warning.
  let proteinDays = 0
  let proteinTotal = 0
  for (let back = 1; back <= PROTEIN_WINDOW_DAYS; back++) {
    const summary = summariseDay(diary[dateStringFromDayIndex(todayDay - back)])
    if (!summary || summary.calories < MIN_QUALIFYING_CALORIES) continue
    proteinDays++
    proteinTotal += summary.protein
  }

  // Alerts are pushed in priority order, then re-sorted so warnings come first.
  const alerts: CoachAlert[] = []

  // --- rate_too_fast -------------------------------------------------------
  if (rateTrend) {
    const rate = rateTrend.kgPerWeek
    const lossPctPerWeek = hasWeight ? (Math.abs(rate) / currentWeightKg) * 100 : null
    if (rate < 0 && lossPctPerWeek !== null && lossPctPerWeek > FAST_LOSS_PCT_PER_WEEK) {
      alerts.push(
        makeAlert(
          'rate_too_fast',
          'warning',
          'You are losing weight fast',
          `Over the last ${rateTrend.spanDays} days you are down about ${fmt1(Math.abs(rate))} kg a week, which is ${fmt1(lossPctPerWeek)}% of your body weight. Past roughly 1% a week more of the loss tends to come from muscle. Eating a little more would slow it down.`
        )
      )
    } else if (rate > FAST_GAIN_KG_PER_WEEK) {
      alerts.push(
        makeAlert(
          'rate_too_fast',
          'warning',
          'You are gaining weight fast',
          `Over the last ${rateTrend.spanDays} days you are up about ${fmt1(rate)} kg a week. Above ${fmt1(FAST_GAIN_KG_PER_WEEK)} kg a week most of the extra is usually fat rather than muscle. Trimming calories slightly would even it out.`
        )
      )
    }
  }

  // --- stalled -------------------------------------------------------------
  const stalled =
    (goal === 'lose' || goal === 'gain') &&
    stallTrend !== null &&
    Math.abs(stallTrend.kgPerWeek) <= STALL_MAX_KG_PER_WEEK
  if (stalled && stallTrend) {
    alerts.push(
      makeAlert(
        'stalled',
        'warning',
        'Your weight has stopped moving',
        `Across the last ${stallTrend.spanDays} days (${stallTrend.points} weigh-ins) your weight has changed about ${fmt1(stallTrend.kgPerWeek)} kg a week, which is flat. To keep ${goal === 'lose' ? 'losing' : 'gaining'} your calorie target probably needs to change.`
      )
    )
  }

  // --- low_protein ---------------------------------------------------------
  if (hasWeight && proteinDays >= PROTEIN_MIN_DAYS) {
    const avgProtein = proteinTotal / proteinDays
    const gPerKg = avgProtein / currentWeightKg
    if (gPerKg < MIN_PROTEIN_G_PER_KG) {
      const target = MIN_PROTEIN_G_PER_KG * currentWeightKg
      const goalNote =
        Number.isFinite(goals.protein) && goals.protein > 0
          ? ` Your current goal is set to ${Math.round(goals.protein)} g.`
          : ''
      alerts.push(
        makeAlert(
          'low_protein',
          'warning',
          'Protein is running low',
          `You averaged ${fmt1(avgProtein)} g of protein over your last ${proteinDays} logged ${plural(proteinDays, 'day', 'days')}, about ${fmt1(gPerKg)} g per kg of body weight. Aim for at least ${fmt1(MIN_PROTEIN_G_PER_KG)} g per kg, which is ${Math.round(target)} g a day for you.${goalNote}`
        )
      )
    }
  }

  // --- rate_too_slow -------------------------------------------------------
  // Skipped when 'stalled' already fired — same story, and the warning says it better.
  if (!stalled && goal === 'lose' && shortTrend && shortTrend.kgPerWeek >= 0) {
    const direction =
      shortTrend.kgPerWeek > 0.05
        ? `up about ${fmt1(shortTrend.kgPerWeek)} kg a week`
        : 'flat'
    alerts.push(
      makeAlert(
        'rate_too_slow',
        'info',
        'Your cut is not moving',
        `You are aiming to lose, but over the last ${shortTrend.spanDays} days your weight is ${direction}. Give it another week if you have just started, otherwise the calorie target needs to come down.`
      )
    )
  }

  // --- insufficient_data ---------------------------------------------------
  // Ranked above the phase-length alerts: thin data is what blocks every other number
  // the coach can give, so it is the more useful thing to say first.
  if (qualifyingDays < QUALIFYING_DAYS_REQUIRED) {
    const needed = QUALIFYING_DAYS_REQUIRED - qualifyingDays
    alerts.push(
      makeAlert(
        'insufficient_data',
        'info',
        'Not enough logged data yet',
        `In the last ${DATA_WINDOW_DAYS} days you have ${qualifyingDays} fully logged ${plural(qualifyingDays, 'day', 'days')} and ${weighInsInWindow} weigh-${plural(weighInsInWindow, 'in', 'ins')}. Log everything you eat on ${needed} more ${plural(needed, 'day', 'days')} and weigh yourself at least twice a week — then your calorie burn can be measured from your own data instead of estimated from a formula.`
      )
    )
  }

  // --- bulk_too_long / cut_too_long ---------------------------------------
  // The app does not record goal history, so the phase length is inferred from how long
  // the weight log has run while the goal has been set to lose/gain.
  if ((goal === 'lose' || goal === 'gain') && series.length >= 2) {
    const first = series[0]
    const last = series[series.length - 1]
    const logSpanDays = last.day - first.day
    if (logSpanDays > PHASE_MAX_DAYS) {
      const weeks = round1(logSpanDays / 7)
      const change = last.kg - first.kg
      const changeText =
        Math.abs(change) < 0.05
          ? 'with no net change'
          : `with a net change of ${fmt1(change)} kg`
      const cutting = goal === 'lose'
      alerts.push(
        makeAlert(
          cutting ? 'cut_too_long' : 'bulk_too_long',
          'info',
          cutting ? 'You have been cutting a long time' : 'You have been bulking a long time',
          `Your weight log runs ${fmt1(weeks)} weeks and your goal is still set to ${cutting ? 'lose' : 'gain'}, ${changeText}. Past about 16 weeks ${cutting ? 'a cut' : 'a bulk'} usually stalls — a few weeks at maintenance often makes the next block work better.`
        )
      )
    }
  }

  // --- stale_recommendation ------------------------------------------------
  if (recommendation) {
    const createdDay = dayIndexFromTimestamp(recommendation.createdAt)
    if (createdDay !== null) {
      const ageDays = todayDay - createdDay
      if (ageDays > STALE_RECOMMENDATION_DAYS) {
        alerts.push(
          makeAlert(
            'stale_recommendation',
            'info',
            `Your plan is ${ageDays} days old`,
            `This plan was built ${ageDays} days ago, so it uses the weight and intake you had back then. Refresh it to get targets that match where you are now.`
          )
        )
      }
    }
  }

  return alerts
    .map((alert, index) => ({ alert, index }))
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.alert.severity] - SEVERITY_RANK[b.alert.severity] || a.index - b.index
    )
    .slice(0, MAX_ALERTS)
    .map((ranked) => ranked.alert)
}
