import type { BodyComposition, BodyMeasurement, UserProfile } from '../types'

/**
 * Plausible body-fat window for the Navy tape method. A result outside this range
 * means the tape measurements are wrong (transposed, in inches, or mistyped),
 * not that the person is a 1% or 80% body-fat outlier.
 */
const MIN_BODY_FAT_PCT = 3
const MAX_BODY_FAT_PCT = 60

/** True only for a real, finite, strictly positive measurement. */
const isPositiveNumber = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

const round1 = (value: number): number => Math.round(value * 10) / 10

/**
 * Estimates body fat and lean mass from tape measurements using the US Navy
 * circumference method (metric, log base 10). Returns null when a required
 * measurement is missing, the height/weight are unusable, the logarithm is
 * undefined, or the result is non-finite or outside 3-60% body fat.
 *
 * Source: US Navy / Hodgdon & Beckett (1984) circumference equations.
 * All circumferences in `measurement` are centimetres, as is `profile.heightCm`.
 */
export const estimateBodyComposition = (
  profile: UserProfile,
  weightKg: number,
  measurement: BodyMeasurement
): BodyComposition | null => {
  const heightCm = profile.heightCm
  if (!isPositiveNumber(heightCm) || !isPositiveNumber(weightKg)) return null

  const { neck, waist, hips } = measurement
  // Both formulas need neck and waist; only the female one adds hips.
  if (!isPositiveNumber(neck) || !isPositiveNumber(waist)) return null

  // Gender 'other' uses the male formula: the female equation requires a hip
  // measurement, so falling back to male keeps the estimate available with the
  // two circumferences every profile is asked for.
  const useFemaleFormula = profile.gender === 'female'

  let bodyFatPct: number

  if (useFemaleFormula) {
    if (!isPositiveNumber(hips)) return null
    const girth = waist + hips - neck
    // log10 is undefined at or below zero — impossible tape numbers.
    if (girth <= 0) return null
    bodyFatPct =
      495 / (1.29579 - 0.35004 * Math.log10(girth) + 0.22100 * Math.log10(heightCm)) - 450
  } else {
    const girth = waist - neck
    // A waist at or under the neck cannot happen; the log would be undefined.
    if (girth <= 0) return null
    bodyFatPct =
      495 / (1.0324 - 0.19077 * Math.log10(girth) + 0.15456 * Math.log10(heightCm)) - 450
  }

  // The denominator can approach zero for absurd inputs, producing Infinity.
  if (!Number.isFinite(bodyFatPct)) return null
  if (bodyFatPct < MIN_BODY_FAT_PCT || bodyFatPct > MAX_BODY_FAT_PCT) return null

  const rounded = round1(bodyFatPct)
  // Derived from the rounded percentage so the two reported numbers agree.
  const leanMassKg = weightKg * (1 - rounded / 100)
  if (!Number.isFinite(leanMassKg) || leanMassKg <= 0) return null

  return {
    bodyFatPct: rounded,
    leanMassKg: round1(leanMassKg),
    method: 'navy',
    measuredOn: measurement.date,
  }
}

/**
 * Returns the Katch-McArdle basal metabolic rate in kcal/day for a known lean
 * body mass. Caller must pass a positive lean mass (as produced by
 * estimateBodyComposition); the formula is `370 + 21.6 * leanMassKg`.
 */
export const katchMcArdleBMR = (leanMassKg: number): number => 370 + 21.6 * leanMassKg

/**
 * Returns the most recent measurement that actually yields a valid body
 * composition for this profile and weight, or null when none of them do.
 * Input order is irrelevant and the array is not mutated.
 */
export const latestUsableMeasurement = (
  measurements: BodyMeasurement[],
  profile: UserProfile,
  weightKg: number
): BodyMeasurement | null => {
  let latest: BodyMeasurement | null = null

  for (const measurement of measurements) {
    if (estimateBodyComposition(profile, weightKg, measurement) === null) continue
    // Dates are 'YYYY-MM-DD', so a string compare is a correct chronological compare.
    if (latest === null || measurement.date > latest.date) latest = measurement
  }

  return latest
}
