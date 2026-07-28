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
  /** Weeks to reach the target. Null when nothing supports a projection. */
  etaWeeks: number | null
  /** The same horizon in days, for the countdown people actually read. */
  etaDays: number | null
  /** 'YYYY-MM-DD' the target is projected to be reached. */
  etaDate: string | null
  /**
   * The ETA comes from the pace the user chose, not from their weigh-ins.
   *
   * Every account is in this state on day one — one weigh-in cannot produce a trend — and
   * an ETA is the single most motivating number here. Showing the planned one keeps the
   * screen useful immediately, but the UI has to say which it is: a projection from a plan
   * and a measurement of a body are not the same claim.
   */
  etaIsProjected: boolean
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

/**
 * A weight in the unit the user reads, with the unit attached.
 *
 * Every sentence below used to end in "kg" regardless of the setting, so someone tracking
 * in pounds saw a card headed "160 lbs" explaining they had "6.6 kg to go".
 */
const inDisplayUnit = (kg: number, profile: UserProfile): string => {
  const value = profile.weightUnit === 'lbs' ? kg * LBS_PER_KG : kg
  return `${round1(Math.abs(value))} ${profile.weightUnit}`
}

/** 'YYYY-MM-DD', `days` after `from`. Noon-pinned so DST cannot shift the date. */
const addDays = (from: string, days: number): string | null => {
  const base = new Date(`${from}T12:00:00`)
  if (!Number.isFinite(base.getTime())) return null
  base.setDate(base.getDate() + days)
  return base.toISOString().slice(0, 10)
}

/** Weeks, days and calendar date for a remaining distance at a signed weekly rate. */
const horizonFrom = (
  remainingKg: number,
  kgPerWeek: number,
  today: string,
): { etaWeeks: number; etaDays: number; etaDate: string | null } => {
  const weeksExact = Math.abs(remainingKg / kgPerWeek)
  const etaDays = Math.max(1, Math.round(weeksExact * 7))
  return { etaWeeks: Math.max(1, Math.round(weeksExact)), etaDays, etaDate: addDays(today, etaDays) }
}

/** "3 weeks (21 days), around 18 Aug" — the countdown, not just the rate. */
const describeEta = (
  eta: { etaWeeks: number; etaDays: number; etaDate: string | null } | null,
): string => {
  if (eta === null) return ''
  const weeks = `${eta.etaWeeks} week${eta.etaWeeks === 1 ? '' : 's'}`
  const days = `${eta.etaDays} day${eta.etaDays === 1 ? '' : 's'}`
  if (eta.etaDate === null) return ` About ${weeks} (${days}) to go.`
  const when = new Date(`${eta.etaDate}T12:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  })
  return ` About ${weeks} (${days}) to go — around ${when}.`
}

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
    etaDays: null,
    etaDate: null,
    etaIsProjected: false,
    message: 'Set a goal weight to track whether you are heading the right way.',
  }

  if (targetKg === null) return base

  const remainingKg = round1(targetKg - currentWeightKg)
  const needsToLose = remainingKg < 0
  const remainingText = inDisplayUnit(remainingKg, profile)

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
      message: `You are at your goal weight of ${inDisplayUnit(targetKg, profile)}. Hold steady.`,
    }
  }

  /** The pace chosen during setup, as a positive magnitude. */
  const plannedRate = Number.isFinite(profile.targetRateKgPerWeek)
    ? Math.abs(profile.targetRateKgPerWeek as number)
    : null

  if (trendKgPerWeek === null) {
    // No measured trend yet — but the plan already implies a date, and withholding it
    // until day ten would leave every new account staring at an empty card.
    const projected =
      plannedRate !== null && plannedRate > 0
        ? horizonFrom(remainingKg, plannedRate, today)
        : null

    return {
      ...withTarget,
      ...(projected ?? {}),
      status: 'insufficient_data',
      etaIsProjected: projected !== null,
      message:
        projected === null
          ? `${remainingText} to go. Weigh in a few more times across at least ${MIN_TREND_DAYS} days and this will show whether you are on track.`
          : `${remainingText} to go at your planned ${inDisplayUnit(plannedRate as number, profile)} a week.${describeEta(projected)} Weigh in daily and this switches to your own measured rate within ${MIN_TREND_DAYS} days.`,
    }
  }

  const movingRightWay = needsToLose ? trendKgPerWeek < -FLAT_KG_PER_WEEK : trendKgPerWeek > FLAT_KG_PER_WEEK
  const movingWrongWay = needsToLose ? trendKgPerWeek > FLAT_KG_PER_WEEK : trendKgPerWeek < -FLAT_KG_PER_WEEK

  const eta =
    movingRightWay && trendKgPerWeek !== 0
      ? horizonFrom(remainingKg, trendKgPerWeek, today)
      : null

  const direction = trendKgPerWeek < 0 ? 'losing' : 'gaining'
  const rate = Math.abs(trendKgPerWeek)
  const rateText = `${inDisplayUnit(rate, profile)} per week`

  if (movingWrongWay) {
    return {
      ...withTarget,
      status: 'wrong_way',
      message: `You are ${direction} ${rateText}, which is away from your goal. Adjust intake or revisit the target.`,
    }
  }

  if (!movingRightWay) {
    return {
      ...withTarget,
      status: 'slow',
      message: `Weight has been flat for ${trend?.spanDays ?? 0} days with ${remainingText} to go. A change in intake is needed to start moving.`,
    }
  }

  const status: TrackStatus =
    plannedRate !== null && rate > plannedRate * 1.5 ? 'ahead' : 'on_track'

  return {
    ...withTarget,
    ...(eta ?? {}),
    status,
    message:
      status === 'ahead'
        ? `${direction === 'losing' ? 'Losing' : 'Gaining'} ${rateText} — faster than your planned ${inDisplayUnit(plannedRate as number, profile)} a week.${describeEta(eta)}`
        : `On track: ${direction} ${rateText}, ${remainingText} to go.${describeEta(eta)}`,
  }
}
