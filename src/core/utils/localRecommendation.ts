import type { PhaseType, Recommendation, WeightGoal } from '../types'

// Atwater general factors: energy yield per gram of each macronutrient.
const KCAL_PER_G_PROTEIN = 4
const KCAL_PER_G_CARB = 4
const KCAL_PER_G_FAT = 9

// Share of total calories allocated to fat in the local plan.
const FAT_SHARE_OF_CALORIES = 0.25

// Used only when the caller hands us a TDEE we cannot use (non-finite or <= 0).
// 2000 kcal/day is the generic adult reference intake used on FDA and EU nutrition
// labels — a neutral placeholder, not a personalised estimate.
const FALLBACK_ANCHOR_TDEE = 2000

// Validation bounds from SPEC-COACH-AND-WORKOUT.md section 1.3, steps 2-5.
const CALORIE_TOLERANCE = 0.25
const PROTEIN_MIN_G_PER_KG = 1.4
const PROTEIN_MAX_G_PER_KG = 3.0
const FAT_MIN_G_PER_KG = 0.5
const FAT_MAX_SHARE_OF_CALORIES = 0.45

// Sub-gram / sub-calorie differences are rounding, not clamping.
const CLAMP_EPSILON = 0.5

/** The three phases the deterministic fallback can produce ('recomp' needs a judgement call). */
type LocalPhase = Extract<PhaseType, 'cut' | 'lean_bulk' | 'maintain'>

interface PhaseConfig {
  calorieMultiplier: number
  proteinGPerKg: number
  targetRateKgPerWeek: number
  durationWeeks: number
  label: string
}

const PHASE_CONFIG: Record<LocalPhase, PhaseConfig> = {
  cut: {
    calorieMultiplier: 0.8,
    proteinGPerKg: 2.4,
    targetRateKgPerWeek: -0.5,
    durationWeeks: 12,
    label: 'Cut',
  },
  lean_bulk: {
    calorieMultiplier: 1.1,
    proteinGPerKg: 2.0,
    targetRateKgPerWeek: 0.25,
    durationWeeks: 16,
    label: 'Lean bulk',
  },
  maintain: {
    calorieMultiplier: 1,
    proteinGPerKg: 2.0,
    targetRateKgPerWeek: 0,
    durationWeeks: 8,
    label: 'Maintain',
  },
}

const GOAL_TO_PHASE: Record<WeightGoal, LocalPhase> = {
  lose: 'cut',
  gain: 'lean_bulk',
  maintain: 'maintain',
}

/** Monotonic suffix so two calls inside the same millisecond still get distinct ids. */
let idSequence = 0

/** Returns value rounded to a whole number, or 0 when it is negative or non-finite. */
const roundNonNegative = (value: number): number =>
  Number.isFinite(value) && value > 0 ? Math.round(value) : 0

/** Returns value if usable, otherwise the supplied fallback. */
const usableOr = (value: number, fallback: number): number =>
  Number.isFinite(value) && value > 0 ? value : fallback

/** Returns the 3-sentence plain-language explanation for a locally computed plan. */
const buildRationale = (
  phase: LocalPhase,
  config: PhaseConfig,
  anchorTdee: number,
  calories: number,
): string => {
  const opening =
    'This plan was calculated on your device from your own numbers, without AI, so it is a plain formula rather than a coached judgement.'

  const middle =
    phase === 'maintain'
      ? `It holds calories at your estimated maintenance of ${anchorTdee} kcal, with protein at ${config.proteinGPerKg} g per kg of bodyweight.`
      : `It sets ${calories} kcal, ${phase === 'cut' ? '20% below' : '10% above'} your estimated maintenance of ${anchorTdee} kcal, with protein at ${config.proteinGPerKg} g per kg of bodyweight.`

  const closing =
    'Fat is 25% of calories and carbs take the remainder; revisit it once you have two to three more weeks of weight and intake data.'

  return `${opening} ${middle} ${closing}`
}

export interface LocalRecInput {
  goal: WeightGoal
  weightKg: number
  anchorTdee: number
  /** Epoch ms used for `createdAt` and the id. Defaults to `Date.now()`; pass it in tests. */
  now?: number
}

/**
 * Returns the deterministic, AI-free recommendation for a goal + TDEE anchor.
 * Always returns a usable Recommendation (never null): unusable inputs fall back to
 * neutral defaults rather than emitting negative or non-finite numbers.
 */
export const buildLocalRecommendation = (input: LocalRecInput): Recommendation => {
  const now = input.now !== undefined && Number.isFinite(input.now) ? input.now : Date.now()
  const phase = GOAL_TO_PHASE[input.goal] ?? 'maintain'
  const config = PHASE_CONFIG[phase]

  const anchorTdee = usableOr(input.anchorTdee, FALLBACK_ANCHOR_TDEE)
  // No sensible substitute exists for a missing bodyweight, so protein simply drops to 0
  // rather than inventing a mass the user never entered.
  const weightKg = Number.isFinite(input.weightKg) && input.weightKg > 0 ? input.weightKg : 0

  const calories = roundNonNegative(anchorTdee * config.calorieMultiplier)
  const protein = roundNonNegative(weightKg * config.proteinGPerKg)
  const fat = roundNonNegative((calories * FAT_SHARE_OF_CALORIES) / KCAL_PER_G_FAT)
  // Carbs take whatever energy is left after protein and fat are paid for.
  const carbs = roundNonNegative(
    (calories - protein * KCAL_PER_G_PROTEIN - fat * KCAL_PER_G_FAT) / KCAL_PER_G_CARB,
  )

  idSequence += 1

  return {
    id: `rec_local_${now}_${idSequence.toString(36)}`,
    createdAt: now,
    phase,
    calories,
    protein,
    carbs,
    fat,
    targetRateKgPerWeek: config.targetRateKgPerWeek,
    durationWeeks: config.durationWeeks,
    headline: `${config.label} for ${config.durationWeeks} weeks`,
    rationale: buildRationale(phase, config, roundNonNegative(anchorTdee), calories),
    tdeeUsed: roundNonNegative(anchorTdee),
    source: 'local',
    clamped: false,
  }
}

/**
 * Returns model-proposed macros pulled back inside the spec 1.3 safety bounds, plus
 * `clamped: true` when any value had to move (including a non-finite value being replaced).
 * Carbs are always recomputed as the leftover energy, floored at 0.
 */
export const clampRecommendationNumbers = (
  raw: { calories: number; protein: number; fat: number; carbs: number },
  ctx: { anchorTdee: number; weightKg: number },
): { calories: number; protein: number; fat: number; carbs: number; clamped: boolean } => {
  const anchorTdee = usableOr(ctx.anchorTdee, FALLBACK_ANCHOR_TDEE)
  const weightKg = Number.isFinite(ctx.weightKg) && ctx.weightKg > 0 ? ctx.weightKg : 0

  // Step 2 — calories within +/-25% of the anchor.
  const calorieMin = anchorTdee * (1 - CALORIE_TOLERANCE)
  const calorieMax = anchorTdee * (1 + CALORIE_TOLERANCE)
  const rawCalories = Number.isFinite(raw.calories) ? raw.calories : anchorTdee
  const boundedCalories = Math.min(Math.max(rawCalories, calorieMin), calorieMax)

  // Step 3 — protein 1.4-3.0 g/kg bodyweight.
  const proteinMin = weightKg * PROTEIN_MIN_G_PER_KG
  const proteinMax = weightKg * PROTEIN_MAX_G_PER_KG
  const rawProtein = Number.isFinite(raw.protein) ? raw.protein : proteinMin
  const boundedProtein = Math.min(Math.max(rawProtein, proteinMin), proteinMax)

  // Step 4 — fat floor of 0.5 g/kg (hormone health), ceiling of 45% of calories.
  // The ceiling is applied last so fat can never eat more of the energy budget than
  // allowed, even when the g/kg floor would push it past the ceiling on very low calories.
  const fatFloor = weightKg * FAT_MIN_G_PER_KG
  const fatCeiling = (boundedCalories * FAT_MAX_SHARE_OF_CALORIES) / KCAL_PER_G_FAT
  const rawFat = Number.isFinite(raw.fat) ? raw.fat : fatFloor
  const boundedFat = Math.min(Math.max(rawFat, fatFloor), fatCeiling)

  const calories = roundNonNegative(boundedCalories)
  const protein = roundNonNegative(boundedProtein)
  const fat = roundNonNegative(boundedFat)

  // Step 5 — carbs are always the remainder, floored at 0.
  const carbs = roundNonNegative(
    (calories - protein * KCAL_PER_G_PROTEIN - fat * KCAL_PER_G_FAT) / KCAL_PER_G_CARB,
  )

  // `clamped` means "a value was pulled back to a safe bound" — it is surfaced to the
  // user as a warning that the plan was adjusted. Carbs are ALWAYS recomputed as the
  // remainder (step 5) and rounding always shifts values a little, so neither of those
  // counts; treating them as clamping would raise the warning on virtually every plan
  // and train the user to ignore it.
  const pulledToBound = (rawValue: number, bounded: number): boolean =>
    !Number.isFinite(rawValue) || Math.abs(bounded - rawValue) > CLAMP_EPSILON

  const clamped =
    pulledToBound(raw.calories, boundedCalories) ||
    pulledToBound(raw.protein, boundedProtein) ||
    pulledToBound(raw.fat, boundedFat)

  return { calories, protein, fat, carbs, clamped }
}
