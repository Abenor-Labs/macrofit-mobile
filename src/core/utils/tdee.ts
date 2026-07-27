import { BodyComposition, DiaryDay, TdeeEstimate, UserProfile, WeightEntry } from '../types'
import { calculateBMR, calculateTDEE, getDayNutrition, getTodayString, lbsToKg } from './calculations'
import { katchMcArdleBMR } from './bodyComposition'

/** Energy density of bodyweight change — ~7700 kcal per kg (Wishnofsky, 3500 kcal/lb). */
const KCAL_PER_KG = 7700

/** Milliseconds in a day; safe here because parsed dates are pinned to local noon. */
const MS_PER_DAY = 86_400_000

/** A day below this many logged calories means the user forgot to log, not that they fasted. */
const MIN_QUALIFYING_CALORIES = 500

/** Minimum number of weight entries inside the window before a trend is meaningful. */
const MIN_WEIGHT_ENTRIES = 2

/** Minimum days the weight entries must span before a least-squares trend is meaningful. */
const MIN_WEIGHT_SPAN_DAYS = 10

/**
 * Parses a 'YYYY-MM-DD' string into a local Date pinned to noon.
 * Returns null when the string is not a well-formed calendar date.
 * Noon avoids day-boundary drift across DST transitions.
 */
const parseDateString = (dateStr: string): Date | null => {
  const parts = dateStr.split('-')
  if (parts.length !== 3) return null
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  const date = new Date(year, month - 1, day, 12, 0, 0, 0)
  if (Number.isNaN(date.getTime())) return null
  // Reject rolled-over values like '2026-02-31'
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

/** Returns the whole-day distance from `from` to `to` (negative when `to` is earlier). */
const dayOffset = (from: Date, to: Date): number => Math.round((to.getTime() - from.getTime()) / MS_PER_DAY)

/** Returns the date string `n` days before `dateStr`, or null when `dateStr` is unparseable. */
const shiftDateString = (dateStr: string, n: number): string | null => {
  const date = parseDateString(dateStr)
  if (!date) return null
  date.setDate(date.getDate() - n)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Returns a weight entry's value in kg, converting from lbs when that is the user's unit. */
const entryWeightKg = (entry: WeightEntry, profile: UserProfile): number =>
  profile.weightUnit === 'lbs' ? lbsToKg(entry.weight) : entry.weight

/**
 * Returns the least-squares slope of y over x (units of y per unit of x),
 * or null when there are fewer than 2 points or x has no variance.
 * Ordinary least squares: slope = (n*Sxy - Sx*Sy) / (n*Sxx - Sx^2).
 */
const leastSquaresSlope = (points: { x: number; y: number }[]): number | null => {
  const n = points.length
  if (n < 2) return null
  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumXX = 0
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null
    sumX += p.x
    sumY += p.y
    sumXY += p.x * p.y
    sumXX += p.x * p.x
  }
  const denominator = n * sumXX - sumX * sumX
  if (denominator === 0) return null
  const slope = (n * sumXY - sumX * sumY) / denominator
  return Number.isFinite(slope) ? slope : null
}

/**
 * Returns the predicted daily energy expenditure and which BMR formula produced it:
 * Katch-McArdle when lean mass is known (more accurate once body fat is measured),
 * otherwise Mifflin-St Jeor. Both are scaled by the profile's activity multiplier.
 */
export const predictedTDEE = (
  profile: UserProfile,
  weightKg: number,
  bodyComp: BodyComposition | null
): { value: number; basis: TdeeEstimate['basis'] } => {
  if (bodyComp && Number.isFinite(bodyComp.leanMassKg) && bodyComp.leanMassKg > 0) {
    return {
      value: calculateTDEE(katchMcArdleBMR(bodyComp.leanMassKg), profile.activityLevel),
      basis: 'katch',
    }
  }
  return {
    value: calculateTDEE(calculateBMR(profile, weightKg), profile.activityLevel),
    basis: 'mifflin',
  }
}

/**
 * Returns the full TDEE estimate for the last `days` days ending on `today`:
 * the formula-based prediction plus a measured value derived from logged intake
 * against the least-squares weight trend.
 *
 * `measured` is null (and confidence 'none') when the window has fewer than 10
 * qualifying food days, or fewer than 2 weight entries spanning at least 10 days,
 * or when the arithmetic does not produce a finite number.
 */
export const buildTdeeEstimate = (
  profile: UserProfile,
  weightKg: number,
  bodyComp: BodyComposition | null,
  diary: Record<string, DiaryDay>,
  weightLog: WeightEntry[],
  days = 28,
  today: string = getTodayString()
): TdeeEstimate => {
  const { value: predicted, basis } = predictedTDEE(profile, weightKg, bodyComp)
  const empty: TdeeEstimate = {
    predicted,
    basis,
    measured: null,
    confidence: 'none',
    daysOfData: 0,
    weightTrendKgPerWeek: null,
  }

  const windowDays = Math.max(1, Math.floor(days))
  const end = parseDateString(today)
  const startStr = shiftDateString(today, windowDays - 1)
  if (!end || !startStr) return empty
  const start = parseDateString(startStr)
  if (!start) return empty

  // --- Qualifying food days: >= 1 entry and >= 500 kcal logged ---
  let qualifyingDays = 0
  let totalIntake = 0
  for (let i = 0; i < windowDays; i += 1) {
    const dateStr = shiftDateString(today, i)
    if (!dateStr) continue
    const day: DiaryDay | undefined = diary[dateStr]
    if (!day || !day.entries || day.entries.length === 0) continue
    const calories = getDayNutrition(day).calories
    if (!Number.isFinite(calories) || calories < MIN_QUALIFYING_CALORIES) continue
    qualifyingDays += 1
    totalIntake += calories
  }

  // --- Weight trend across the same window ---
  const points: { x: number; y: number }[] = []
  for (const entry of weightLog) {
    const entryDate = parseDateString(entry.date)
    if (!entryDate) continue
    const x = dayOffset(start, entryDate)
    if (x < 0 || x > dayOffset(start, end)) continue
    const y = entryWeightKg(entry, profile)
    if (!Number.isFinite(y) || y <= 0) continue
    points.push({ x, y })
  }
  points.sort((a, b) => a.x - b.x)

  const spanDays = points.length > 0 ? points[points.length - 1].x - points[0].x : 0
  const hasUsableWeight = points.length >= MIN_WEIGHT_ENTRIES && spanDays >= MIN_WEIGHT_SPAN_DAYS
  // Least squares, not first-vs-last: day-to-day scale weight is noisy.
  const slopeKgPerDay = hasUsableWeight ? leastSquaresSlope(points) : null
  const weightTrendKgPerWeek =
    slopeKgPerDay === null ? null : parseFloat((slopeKgPerDay * 7).toFixed(3))

  const confidence: TdeeEstimate['confidence'] =
    qualifyingDays >= 21 ? 'high' : qualifyingDays >= 14 ? 'medium' : qualifyingDays >= 10 ? 'low' : 'none'

  if (confidence === 'none' || weightTrendKgPerWeek === null || qualifyingDays === 0) {
    return { predicted, basis, measured: null, confidence: 'none', daysOfData: qualifyingDays, weightTrendKgPerWeek }
  }

  const avgIntake = totalIntake / qualifyingDays
  // Intake minus the energy the weight change accounts for: a 1 kg/week gain
  // implies ~7700 kcal/week of surplus, i.e. ~1100 kcal/day above expenditure.
  const measuredRaw = avgIntake - (weightTrendKgPerWeek / 7) * KCAL_PER_KG
  if (!Number.isFinite(measuredRaw) || measuredRaw <= 0) {
    return { predicted, basis, measured: null, confidence: 'none', daysOfData: qualifyingDays, weightTrendKgPerWeek }
  }

  return {
    predicted,
    basis,
    measured: Math.round(measuredRaw),
    confidence,
    daysOfData: qualifyingDays,
    weightTrendKgPerWeek,
  }
}
