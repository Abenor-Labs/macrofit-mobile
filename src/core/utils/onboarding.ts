import type { ActivityLevel, UserProfile, WeightGoal } from '../types'

/**
 * Content and arithmetic for the setup flow, shared by the website and the mobile app so
 * the two ask the same questions in the same words.
 *
 * The wording here is the point. Every option describes a day someone can recognise
 * ("desk job, a walk now and then") rather than the term the formula uses
 * ("lightly active"), because the person answering has no way to know what the multiplier
 * 1.375 means for them.
 */

export interface Choice<T> {
  value: T
  label: string
  detail: string
}

export const ACTIVITY_CHOICES: readonly Choice<ActivityLevel>[] = [
  {
    value: 'sedentary',
    label: 'Mostly sitting',
    detail: 'Desk job, driving, little walking. No regular exercise.',
  },
  {
    value: 'lightly_active',
    label: 'Lightly active',
    detail: 'On your feet some of the day, or exercise 1–3 days a week.',
  },
  {
    value: 'moderately_active',
    label: 'Moderately active',
    detail: 'Exercise 3–5 days a week, or a job with steady walking.',
  },
  {
    value: 'very_active',
    label: 'Very active',
    detail: 'Hard training 6–7 days a week, or physical work all day.',
  },
  {
    value: 'extra_active',
    label: 'Extremely active',
    detail: 'Physical job plus daily training, or two sessions a day.',
  },
] as const

export const GOAL_CHOICES: readonly Choice<WeightGoal>[] = [
  {
    value: 'lose',
    label: 'Lose fat',
    detail: 'Eat a little under what you burn. Weight comes down week by week.',
  },
  {
    value: 'maintain',
    label: 'Stay where I am',
    detail: 'Match what you burn. Useful for holding a weight or building habits.',
  },
  {
    value: 'gain',
    label: 'Build muscle',
    detail: 'Eat a little over what you burn, so training has something to work with.',
  },
] as const

/** Sign-free pace magnitudes; the direction comes from the goal. */
export interface PaceChoice {
  /** Magnitude in kg per week. */
  kgPerWeek: number
  label: string
  detail: string
}

const LOSE_PACES: readonly PaceChoice[] = [
  { kgPerWeek: 0.25, label: 'Gentle', detail: 'Barely noticeable day to day. Easiest to stick to.' },
  { kgPerWeek: 0.5, label: 'Steady', detail: 'The usual choice. Fast enough to see, slow enough to keep muscle.' },
  { kgPerWeek: 0.75, label: 'Quick', detail: 'Hungrier days. Best for a short push, not for months.' },
] as const

const GAIN_PACES: readonly PaceChoice[] = [
  { kgPerWeek: 0.125, label: 'Lean', detail: 'Slow gain, very little of it fat. Best if you already train.' },
  { kgPerWeek: 0.25, label: 'Steady', detail: 'The usual choice for putting on muscle without much fat.' },
  { kgPerWeek: 0.5, label: 'Fast', detail: 'Quicker scale movement, more of it fat. Short phases only.' },
] as const

/** Pace options for a goal. Empty for `maintain`, which has no direction to set. */
export const pacesFor = (goal: WeightGoal): readonly PaceChoice[] =>
  goal === 'lose' ? LOSE_PACES : goal === 'gain' ? GAIN_PACES : []

/** The pace preselected for a goal, so the flow always has a sensible default. */
export const defaultPaceFor = (goal: WeightGoal): number | undefined =>
  goal === 'lose' ? 0.5 : goal === 'gain' ? 0.25 : undefined

/** Signed rate in kg/week: negative to lose, positive to gain, undefined to maintain. */
export const signedRate = (goal: WeightGoal, kgPerWeek: number | undefined): number | undefined => {
  if (goal === 'maintain' || kgPerWeek === undefined) return undefined
  return goal === 'lose' ? -Math.abs(kgPerWeek) : Math.abs(kgPerWeek)
}

// --- Units -------------------------------------------------------------------
// Conversions are kept at full precision here and rounded only for display. The store
// rounds weights to one decimal, which is why a value entered in pounds must never be
// converted, stored and converted back for the field the user is still looking at.

export const LBS_PER_KG = 2.20462
export const CM_PER_INCH = 2.54
export const INCHES_PER_FOOT = 12

export const kgFromLbs = (lbs: number): number => lbs / LBS_PER_KG
export const lbsFromKg = (kg: number): number => kg * LBS_PER_KG

export const cmFromFeetInches = (feet: number, inches: number): number =>
  (feet * INCHES_PER_FOOT + inches) * CM_PER_INCH

export const feetInchesFromCm = (cm: number): { feet: number; inches: number } => {
  const totalInches = Math.round(cm / CM_PER_INCH)
  return { feet: Math.floor(totalInches / INCHES_PER_FOOT), inches: totalInches % INCHES_PER_FOOT }
}

// --- Validation --------------------------------------------------------------
// Bounds are deliberately wide: they exist to catch a slipped decimal point or a height
// typed in the weight field, not to tell anyone their body is out of range.

export const AGE_RANGE = { min: 13, max: 100 } as const
export const HEIGHT_CM_RANGE = { min: 120, max: 230 } as const
export const WEIGHT_KG_RANGE = { min: 30, max: 300 } as const

const within = (value: number, range: { min: number; max: number }): boolean =>
  Number.isFinite(value) && value >= range.min && value <= range.max

/**
 * Returns the problem with the "about you" answers, or null when they are usable.
 *
 * One message at a time, naming the field: a list of everything wrong at once reads as
 * failure, and the person only has to fix the first thing anyway.
 */
export const validateBasics = (input: {
  age: number
  heightCm: number
  weightKg: number
}): string | null => {
  if (!within(input.age, AGE_RANGE)) {
    return `Age should be between ${AGE_RANGE.min} and ${AGE_RANGE.max}.`
  }
  if (!within(input.heightCm, HEIGHT_CM_RANGE)) {
    return 'That height looks off. Check the number and the unit.'
  }
  if (!within(input.weightKg, WEIGHT_KG_RANGE)) {
    return 'That weight looks off. Check the number and the unit.'
  }
  return null
}

/**
 * Returns the problem with a target weight against the chosen goal, or null.
 *
 * A target on the wrong side of the current weight is the mistake worth catching: it makes
 * every "you are on track" reading afterwards meaningless, and it is easy to make by
 * typing into the wrong unit.
 */
export const validateTarget = (
  goal: WeightGoal,
  currentKg: number,
  targetKg: number | undefined,
): string | null => {
  if (targetKg === undefined) return null
  if (!within(targetKg, WEIGHT_KG_RANGE)) return 'That target looks off. Check the number and the unit.'
  if (goal === 'lose' && targetKg >= currentKg) {
    return 'To lose weight the target has to be below where you are now.'
  }
  if (goal === 'gain' && targetKg <= currentKg) {
    return 'To gain weight the target has to be above where you are now.'
  }
  return null
}

/**
 * Energy in a kilogram of body mass. The round 7700 is the conventional figure for fat;
 * real tissue change is messier, which is why the coach re-fits this against measured
 * weight later instead of trusting it forever.
 */
export const KCAL_PER_KG = 7700

/** Never prescribe less than this, whatever the arithmetic says. */
export const MIN_DAILY_CALORIES = 1200

/**
 * Daily calories for a pace, rather than the flat ±500 the shared helper applies.
 *
 * Without this the pace question is decoration: picking "gentle, 0.25 kg a week" and
 * "quick, 0.75 kg a week" would produce the same target, and the app would then report the
 * user as off-pace for a plan it never actually wrote.
 *
 * The floor matters as much as the rate. A large deficit on a small person can compute
 * below what anyone should eat, and a number that low is the kind of thing an app should
 * refuse to print rather than round down to.
 */
export const caloriesForPace = (
  tdee: number,
  goal: WeightGoal,
  kgPerWeek: number | undefined,
): number => {
  if (goal === 'maintain' || kgPerWeek === undefined || !Number.isFinite(tdee)) {
    return Math.round(tdee)
  }
  const dailyDelta = (Math.abs(kgPerWeek) * KCAL_PER_KG) / 7
  const raw = goal === 'lose' ? tdee - dailyDelta : tdee + dailyDelta
  return Math.round(Math.max(MIN_DAILY_CALORIES, raw))
}

/**
 * Weeks to reach the target at the chosen pace, or null when it cannot be worked out.
 * Used to answer the only question people actually ask of a target: how long.
 */
export const weeksToTarget = (
  currentKg: number,
  targetKg: number | undefined,
  kgPerWeek: number | undefined,
): number | null => {
  if (targetKg === undefined || kgPerWeek === undefined || kgPerWeek <= 0) return null
  const distance = Math.abs(targetKg - currentKg)
  if (distance < 0.1) return 0
  return Math.ceil(distance / kgPerWeek)
}

/** "about 7 weeks" / "about 4 months" — a horizon, not a promise of a date. */
export const describeHorizon = (weeks: number | null): string | null => {
  if (weeks === null) return null
  if (weeks === 0) return 'You are already there.'
  if (weeks < 9) return `About ${weeks} week${weeks === 1 ? '' : 's'} at this pace.`
  const months = Math.round(weeks / 4.345)
  return `About ${months} month${months === 1 ? '' : 's'} at this pace.`
}

/** The answers the flow collects, before they become a profile. */
export interface OnboardingAnswers {
  name: string
  gender: UserProfile['gender']
  age: number
  heightCm: number
  weightKg: number
  weightUnit: UserProfile['weightUnit']
  heightUnit: UserProfile['heightUnit']
  activityLevel: ActivityLevel
  goal: WeightGoal
  paceKgPerWeek?: number
  targetWeightKg?: number
}

/** Folds the answers into the profile patch the store expects. */
export const answersToProfile = (a: OnboardingAnswers): Partial<UserProfile> => ({
  name: a.name.trim() || 'You',
  gender: a.gender,
  age: Math.round(a.age),
  heightCm: Math.round(a.heightCm),
  weightUnit: a.weightUnit,
  heightUnit: a.heightUnit,
  activityLevel: a.activityLevel,
  goal: a.goal,
  targetWeightKg: a.targetWeightKg,
  targetRateKgPerWeek: signedRate(a.goal, a.paceKgPerWeek),
})
