import type { DiaryDay, Food, MealType } from '@core/types'
import { getFoodById } from '@core/data/foodDatabase'
import { getDateString } from '@core/utils/calculations'

/**
 * "What should I eat next?", answered from what this person already eats.
 *
 * Pure and on-device: no model, no network, no wait. A suggestion built from someone's own
 * last two weeks is realistic by construction (it is food they cook and like), and its numbers
 * are the ones they already logged, so it cannot hallucinate a macro.
 *
 * The rule is small on purpose:
 *   1. Pick the next meal from the clock, skipping any meal already logged today.
 *   2. Give it a share of the calories left: all of it for dinner, a half for lunch, a third
 *      for breakfast, a small fixed slice for a snack. No main meal gets more than 40% of the
 *      day, so an empty day does not ask for a 2,000 kcal dinner.
 *   3. From foods eaten AT THIS MEAL in the last 14 days, at the portion usually eaten, find
 *      the one to three that fit that budget and carry the most protein. Only foods from this
 *      meal: a first version drew from every meal and suggested chicken curry for breakfast.
 */

/** A food at the portion this person usually eats it. */
export interface MealIdeaItem {
  food: Food
  servings: number
}

export interface MealIdea {
  meal: MealType
  items: MealIdeaItem[]
  calories: number
  protein: number
  /** Calories this meal was given out of what is left today. */
  budget: number
  /** Protein still to eat today after this meal, never negative. */
  proteinLeftAfter: number
}

const HISTORY_DAYS = 14
const SNACK_BUDGET = 250
/** The largest share of the day's calories one main meal is given. */
const MAX_MEAL_SHARE = 0.4
/** Below this many calories left, "eat something" is not advice worth a card. */
const MIN_BUDGET = 150
/** Only the most familiar foods are combined, which keeps the search under a thousand combos. */
const CANDIDATES = 14

/** Day-parts in eating order, with the hour each one ends. */
const SLOTS: { meal: MealType; until: number; share: number | 'snack' }[] = [
  { meal: 'Breakfast', until: 11, share: 1 / 3 },
  { meal: 'Lunch', until: 16, share: 1 / 2 },
  { meal: 'Snacks', until: 19, share: 'snack' },
  { meal: 'Dinner', until: 23, share: 1 },
]

/**
 * South Indian everyday foods for someone with no history yet, so a new user sees an idea on
 * day one rather than an empty card. Ids from the bundled catalog.
 */
const STARTERS: Record<MealType, string[]> = {
  Breakfast: ['in043', 'in137', 'in045', 'in050', 'in038', 'in053', 'in087', 'in139'],
  Lunch: ['in014', 'in038', 'in039', 'in070', 'in106', 'in074', 'in081', 'in029'],
  Snacks: ['in042', 'in087', 'in107', 'in111', 'in100', 'in155'],
  Dinner: ['in001', 'in045', 'in139', 'in074', 'in152', 'in029', 'in106', 'in145'],
  'Pre-Workout': [],
  'Post-Workout': [],
}

interface Candidate {
  food: Food
  servings: number
  /** Distinct days it was eaten in the window. */
  days: number
  /** Distinct days it was eaten at this meal. */
  daysAtMeal: number
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const dayOffset = (today: Date, back: number): string => {
  const date = new Date(today)
  date.setDate(date.getDate() - back)
  return getDateString(date)
}

/** Foods from the last 14 days (today excluded), keyed by food id. */
const gatherCandidates = (
  diary: Record<string, DiaryDay>,
  now: Date,
  meal: MealType,
): Candidate[] => {
  const byId = new Map<string, { food: Food; servings: number[]; days: Set<string>; mealDays: Set<string> }>()

  for (let back = 1; back <= HISTORY_DAYS; back += 1) {
    const date = dayOffset(now, back)
    for (const entry of diary[date]?.entries ?? []) {
      const food = entry?.food
      if (!food || !(food.calories > 0) || !(entry.servings > 0)) continue
      const row = byId.get(food.id) ?? { food, servings: [], days: new Set(), mealDays: new Set() }
      row.servings.push(entry.servings)
      row.days.add(date)
      if (entry.mealType === meal) row.mealDays.add(date)
      byId.set(food.id, row)
    }
  }

  return [...byId.values()].map(row => ({
    food: row.food,
    servings: Math.round(median(row.servings) * 4) / 4 || 1,
    days: row.days.size,
    daysAtMeal: row.mealDays.size,
  }))
}

const starterCandidates = (meal: MealType): Candidate[] =>
  STARTERS[meal]
    .map(id => getFoodById(id))
    .filter((food): food is Food => food !== undefined)
    .map((food, index) => ({ food, servings: 1, days: 0, daysAtMeal: STARTERS[meal].length - index }))

/**
 * Food roles a plate has one of. Protein-greedy scoring otherwise stacks mains: chicken curry
 * AND fish curry, roti AND egg dosa. Anything outside these (sambar, poriyal, curd, chutney)
 * can sit beside anything.
 */
const ROLE: Partial<Record<Food['category'], string>> = {
  'Grains & Cereals': 'base',
  'Meat & Poultry': 'main',
  'Fish & Seafood': 'main',
}

/** True when no two items share a base or main role. */
const isPlate = (items: Candidate[]): boolean => {
  const roles = items.map(c => ROLE[c.food.category]).filter(Boolean)
  return new Set(roles).size === roles.length
}

/** Calories and protein for a set of items at their usual portions. */
const totals = (items: Candidate[]) => ({
  calories: items.reduce((sum, c) => sum + c.food.calories * c.servings, 0),
  protein: items.reduce((sum, c) => sum + c.food.protein * c.servings, 0),
})

/**
 * Scores a combination. Protein toward what is still needed counts most, eating it at the
 * meal it is usually eaten at counts next, and missing the calorie budget costs points in
 * proportion to the miss.
 */
const score = (items: Candidate[], budget: number, proteinLeft: number): number => {
  const { calories, protein } = totals(items)
  const useful = Math.min(protein, Math.max(proteinLeft, 0) + 5)
  const familiarity = items.reduce((sum, c) => sum + Math.log1p(c.daysAtMeal * 2 + c.days), 0)
  const miss = Math.abs(calories - budget) / budget
  return useful * 1.5 + familiarity * 6 - miss * 40
}

/**
 * The next meal worth suggesting, or null when there is nothing honest to say: too late, every
 * meal already logged, or too few calories left to be worth a card.
 *
 * `offset` picks the next-best idea, for a "swap" button.
 */
export const suggestNextMeal = (
  diary: Record<string, DiaryDay>,
  goals: { calories: number; protein: number },
  now: Date = new Date(),
  offset = 0,
): MealIdea | null => {
  const today = diary[getDateString(now)]
  const entries = today?.entries ?? []
  const hour = now.getHours()

  const slotIndex = SLOTS.findIndex(slot => hour < slot.until)
  if (slotIndex === -1) return null
  // The first meal from now on that has not been logged yet.
  const slot = SLOTS.slice(slotIndex).find(s => !entries.some(e => e.mealType === s.meal))
  if (!slot) return null

  const eaten = entries.reduce(
    (sum, e) => ({
      calories: sum.calories + (e.food?.calories ?? 0) * e.servings,
      protein: sum.protein + (e.food?.protein ?? 0) * e.servings,
    }),
    { calories: 0, protein: 0 },
  )
  const caloriesLeft = goals.calories - eaten.calories
  const proteinLeft = goals.protein - eaten.protein

  const budget = Math.round(
    slot.share === 'snack'
      ? Math.min(SNACK_BUDGET, caloriesLeft)
      : Math.min(caloriesLeft * slot.share, goals.calories * MAX_MEAL_SHARE),
  )
  if (budget < MIN_BUDGET) return null

  // What they eat at this meal; a brand-new user gets everyday South Indian starters instead.
  const atThisMeal = gatherCandidates(diary, now, slot.meal).filter(c => c.daysAtMeal > 0)
  const pool = (atThisMeal.length >= 2 ? atThisMeal : [...atThisMeal, ...starterCandidates(slot.meal)])
    // A single item bigger than the whole meal can never be part of a fit.
    .filter(c => c.food.calories * c.servings <= budget * 1.15)
    .sort((a, b) => b.daysAtMeal - a.daysAtMeal || b.days - a.days)
    .slice(0, CANDIDATES)

  // Every set of one, two or three foods: a South Indian meal is usually a base, a gravy and
  // a side (rice, sambar, poriyal), so two was one short.
  const combos: Candidate[][] = []
  for (let i = 0; i < pool.length; i += 1) {
    combos.push([pool[i]])
    for (let j = i + 1; j < pool.length; j += 1) {
      combos.push([pool[i], pool[j]])
      for (let k = j + 1; k < pool.length; k += 1) combos.push([pool[i], pool[j], pool[k]])
    }
  }

  const ranked = combos
    .filter(items => {
      if (!isPlate(items)) return false
      const { calories } = totals(items)
      return calories >= budget * 0.5 && calories <= budget * 1.15
    })
    .map(items => ({ items, score: score(items, budget, proteinLeft) }))
    .sort((a, b) => b.score - a.score)

  if (ranked.length === 0) return null
  const pick = ranked[offset % ranked.length].items
  const { calories, protein } = totals(pick)

  return {
    meal: slot.meal,
    items: pick.map(c => ({ food: c.food, servings: c.servings })),
    calories: Math.round(calories),
    protein: Math.round(protein),
    budget,
    proteinLeftAfter: Math.max(0, Math.round(proteinLeft - protein)),
  }
}
