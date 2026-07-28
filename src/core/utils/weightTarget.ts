import type { UserProfile, WeightEntry } from '../types'
import { getTodayString, lbsToKg } from './calculations'

/**
 * Progress toward a goal bodyweight, and whether the recent trend is actually moving
 * that way. Pure: no store, no network, and time enters only through `today`.
 */

/** Pounds in one kilogram. Full precision — rounding here would bias every slope. */
const LBS_PER_KG = 2.20462

/** Below this, week-to-week movement is indistinguishable from water weight. */
const FLAT_KG_PER_WEEK = 0.1

/** A trend fitted over fewer days than this is noise, not a direction. */
const MIN_TREND_DAYS = 10
const MIN_TREND_POINTS = 2

export type TrackStatus =
  | 'no_target'
  | 'insufficient_data'
  | 'reached'
  | 'on_track'
  | 'ahead'
  | 'slow'
  | 'wrong_way'

export interface WeightTargetProgress {
  targetKg: number | null
  currentKg: number
  /** First weigh-in on record — the baseline progress is measured from. */
  startKg: number | null
  /** Signed: negative when the user still needs to lose. */
  remainingKg: number | null
  /** 0..1 of the journey from startKg to targetKg. Null without a baseline. */
  fraction: number | null
  /** Least-squares trend over the window, kg/week. Negative is losing. */
  trendKgPerWeek: number | null
  daysOfTrend: number
  status: TrackStatus
  /** Weeks to reach the target at the current trend. Null when it never would. */
  etaWeeks: number | null
  /** Plain-language summary. Never states a number that was not computed. */
  message: string
}

const toKg = (entry: WeightEntry, profile: UserProfile): number =>
  profile.weightUnit === 'lbs' ? entry.weight / LBS_PER_KG : entry.weight

/** Days between two 'YYYY-MM-DD' strings. Noon-pinned so DST cannot shift the count. */
const dayDiff = (from: string, to: string): number => {
  const a = new Date(`${from}T12:00:00`).getTime()
  const b = new Date(`${to}T12:00:00`).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

/**
 * Ordinary least-squares slope of weight against time, in kg/week.
 *
 * Deliberately not first-minus-last: daily bodyweight swings by a kilo on hydration
 * alone, so two endpoints can report a "trend" that is pure noise.
 */
export const weightTrendKgPerWeek = (
  weightLog: WeightEntry[],
  profile: UserProfile,
  days = 28,
  today: string = getTodayString(),
): { kgPerWeek: number; spanDays: number; points: number } | null => {
  const cutoff = -Math.abs(days)
  const points = weightLog
    .filter(e => typeof e?.date === 'string' && Number.isFinite(e.weight))
    .map(e => ({ day: dayDiff(today, e.date), kg: toKg(e, profile) }))
    .filter(p => p.day <= 0 && p.day >= cutoff)
    .sort((a, b) => a.day - b.day)

  if (points.length < MIN_TREND_POINTS) return null
  const spanDays = points[points.length - 1].day - points[0].day
  if (spanDays < MIN_TREND_DAYS) return null

  const n = points.length
  const sx = points.reduce((s, p) => s + p.day, 0)
  const sy = points.reduce((s, p) => s + p.kg, 0)
  const sxy = points.reduce((s, p) => s + p.day * p.kg, 0)
  const sxx = points.reduce((s, p) => s + p.day * p.day, 0)
  const denominator = n * sxx - sx * sx
  if (denominator === 0) return null

  const perDay = (n * sxy - sx * sy) / denominator
  if (!Number.isFinite(perDay)) return null
  return { kgPerWeek: perDay * 7, spanDays, points: n }
}

const round1 = (n: number): number => Math.round(n * 10) / 10

export const getWeightTargetProgress = (
  weightLog: WeightEntry[],
  profile: UserProfile,
  currentWeightKg: number,
  today: string = getTodayString(),
): WeightTargetProgress => {
  const targetKg = Number.isFinite(profile.targetWeightKg) ? (profile.targetWeightKg as number) : null
  const trend = weightTrendKgPerWeek(weightLog, profile, 28, today)
  const trendKgPerWeek = trend ? round1(trend.kgPerWeek) : null

  const sorted = [...weightLog]
    .filter(e => typeof e?.date === 'string' && Number.isFinite(e.weight))
    .sort((a, b) => a.date.localeCompare(b.date))
  const startKg = sorted.length > 0 ? toKg(sorted[0], profile) : null

  const base: WeightTargetProgress = {
    targetKg,
    currentKg: currentWeightKg,
    startKg: startKg === null ? null : round1(startKg),
    remainingKg: null,
    fraction: null,
    trendKgPerWeek,
    daysOfTrend: trend?.spanDays ?? 0,
    status: 'no_target',
    etaWeeks: null,
    message: 'Set a goal weight to track whether you are heading the right way.',
  }

  if (targetKg === null) return base

  const remainingKg = round1(targetKg - currentWeightKg)
  const needsToLose = remainingKg < 0

  // Progress is measured from the first weigh-in, so it is meaningless without one.
  const fraction =
    startKg !== null && Math.abs(targetKg - startKg) > 0.01
      ? Math.max(0, Math.min(1, (startKg - currentWeightKg) / (startKg - targetKg)))
      : null

  const withTarget: WeightTargetProgress = { ...base, remainingKg, fraction }

  if (Math.abs(remainingKg) <= 0.5) {
    return {
      ...withTarget,
      status: 'reached',
      message: `You are at your goal weight of ${round1(targetKg)} kg. Hold steady.`,
    }
  }

  if (trendKgPerWeek === null) {
    return {
      ...withTarget,
      status: 'insufficient_data',
      message: `${Math.abs(remainingKg)} kg to go. Weigh in a few more times across at least ${MIN_TREND_DAYS} days and this will show whether you are on track.`,
    }
  }

  const movingRightWay = needsToLose ? trendKgPerWeek < -FLAT_KG_PER_WEEK : trendKgPerWeek > FLAT_KG_PER_WEEK
  const movingWrongWay = needsToLose ? trendKgPerWeek > FLAT_KG_PER_WEEK : trendKgPerWeek < -FLAT_KG_PER_WEEK

  const etaWeeks =
    movingRightWay && trendKgPerWeek !== 0
      ? Math.max(1, Math.round(Math.abs(remainingKg / trendKgPerWeek)))
      : null

  const direction = trendKgPerWeek < 0 ? 'losing' : 'gaining'
  const rate = Math.abs(trendKgPerWeek)

  if (movingWrongWay) {
    return {
      ...withTarget,
      status: 'wrong_way',
      etaWeeks: null,
      message: `You are ${direction} ${rate} kg per week, which is away from your goal. Adjust intake or revisit the target.`,
    }
  }

  if (!movingRightWay) {
    return {
      ...withTarget,
      status: 'slow',
      etaWeeks: null,
      message: `Weight has been flat for ${trend?.spanDays ?? 0} days with ${Math.abs(remainingKg)} kg to go. A change in intake is needed to start moving.`,
    }
  }

  // Compare against the intended pace when the user set one.
  const desired = Number.isFinite(profile.targetRateKgPerWeek)
    ? Math.abs(profile.targetRateKgPerWeek as number)
    : null

  const status: TrackStatus =
    desired !== null && rate > desired * 1.5 ? 'ahead' : 'on_track'

  const etaText = etaWeeks === null ? '' : ` About ${etaWeeks} week${etaWeeks === 1 ? '' : 's'} at this rate.`

  return {
    ...withTarget,
    status,
    etaWeeks,
    message:
      status === 'ahead'
        ? `${direction === 'losing' ? 'Losing' : 'Gaining'} ${rate} kg per week — faster than your ${desired} kg target.${etaText}`
        : `On track: ${direction} ${rate} kg per week, ${Math.abs(remainingKg)} kg to go.${etaText}`,
  }
}
