import type { AppState } from '@core/store/appState'
import type { DiaryDay } from '@core/types'
import { getDayNutrition, getDateString, getTodayString, kgToLbs } from '@core/utils/calculations'
import { estimateBodyComposition, latestUsableMeasurement } from '@core/utils/bodyComposition'
import { buildTdeeEstimate } from '@core/utils/tdee'
import { getCoachAlerts } from '@core/utils/coachAlerts'
import { suggestNextMeal } from './nextMeal'
import type { ChatContext } from './api'

/**
 * Everything the coach is shown with a message, built from the store on the phone.
 *
 * The chat used to send today and nothing else, so "why am I not losing weight?" was
 * answered without the two weeks of diary and the weight trend that hold the answer. This is
 * that evidence, summarised to what a coach would read: a line per day, the weigh-ins, the
 * energy estimate, the plan, the alerts, the foods this person actually eats, and what they
 * asked to be remembered.
 */

const HISTORY_DAYS = 14
const WEIGHT_DAYS = 30
const USUAL_FOODS = 25
const LBS_PER_KG = 2.20462

const dayOffset = (now: Date, back: number): string => {
  const date = new Date(now)
  date.setDate(date.getDate() - back)
  return getDateString(date)
}

const baseName = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '')

/** "Breakfast: Idli ×3, Sambar; Lunch: …" */
const describeFoods = (day: DiaryDay): string => {
  const byMeal = new Map<string, string[]>()
  for (const entry of day.entries) {
    if (!entry?.food) continue
    const label = entry.servings === 1 ? baseName(entry.food.name) : `${baseName(entry.food.name)} ×${Math.round(entry.servings * 100) / 100}`
    byMeal.set(entry.mealType, [...(byMeal.get(entry.mealType) ?? []), label])
  }
  return [...byMeal.entries()].map(([meal, foods]) => `${meal}: ${foods.join(', ')}`).join('; ')
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

type CoachSource = Pick<
  AppState,
  'profile' | 'goals' | 'diary' | 'weightLog' | 'bodyMeasurements' | 'currentWeightKg' | 'recommendation'
>

export const buildChatContext = (
  state: CoachSource,
  memory: string[],
  mode: 'chat' | 'checkin' = 'chat',
  now: Date = new Date(),
): ChatContext => {
  const { profile, goals, diary, currentWeightKg, recommendation } = state
  const weightLog = state.weightLog ?? []
  const today = getTodayString()
  const day = diary[today] ?? { date: today, entries: [], waterIntake: 0, exercises: [] }
  const totals = getDayNutrition(day)

  // --- The last two weeks, a line per logged day, oldest first
  const days: NonNullable<NonNullable<ChatContext['coach']>['days']> = []
  interface UsualRow {
    id: string
    name: string
    meals: Map<string, number>
    servings: number[]
    days: number
  }
  const usual = new Map<string, UsualRow>()
  for (let back = HISTORY_DAYS; back >= 1; back -= 1) {
    const date = dayOffset(now, back)
    const past = diary[date]
    if (!past || past.entries.length === 0) continue
    const n = getDayNutrition(past)
    days.push({
      date,
      calories: Math.round(n.calories),
      protein: Math.round(n.protein),
      carbs: Math.round(n.carbs),
      fat: Math.round(n.fat),
      foods: describeFoods(past),
    })
    const seenToday = new Set<string>()
    for (const entry of past.entries) {
      if (!entry?.food) continue
      const row: UsualRow = usual.get(entry.food.id) ?? {
        id: entry.food.id,
        name: entry.food.name,
        meals: new Map<string, number>(),
        servings: [],
        days: 0,
      }
      row.meals.set(entry.mealType, (row.meals.get(entry.mealType) ?? 0) + 1)
      row.servings.push(entry.servings)
      if (!seenToday.has(entry.food.id)) row.days += 1
      seenToday.add(entry.food.id)
      usual.set(entry.food.id, row)
    }
  }

  // Only catalog foods can be offered back as one-tap meals, so chat- and photo-made foods
  // (ids like chat_…, photo_…) are left out of the list the coach suggests from.
  const usualFoods = [...usual.values()]
    .filter(row => /^[a-z]{1,2}\d{3}$/.test(row.id))
    .sort((a, b) => b.days - a.days)
    .slice(0, USUAL_FOODS)
    .map(row => ({
      id: row.id,
      name: row.name,
      meal: [...row.meals.entries()].sort((a, b) => b[1] - a[1])[0][0],
      servings: Math.round(median(row.servings) * 4) / 4,
    }))

  // --- Weigh-ins, in kg whatever the display unit
  const since = dayOffset(now, WEIGHT_DAYS)
  const weights = weightLog
    .filter(entry => entry.date >= since && Number.isFinite(entry.weight) && entry.weight > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map(entry => ({
      date: entry.date,
      kg: Math.round((profile.weightUnit === 'lbs' ? entry.weight / LBS_PER_KG : entry.weight) * 10) / 10,
    }))

  // --- Energy: the same derivation the Goals screen and the plan use
  const measurement = latestUsableMeasurement(state.bodyMeasurements ?? [], profile, currentWeightKg)
  const bodyComp = measurement ? estimateBodyComposition(profile, currentWeightKg, measurement) : null
  const tdee = buildTdeeEstimate(profile, currentWeightKg, bodyComp, diary, weightLog)

  const alerts = getCoachAlerts({ profile, currentWeightKg, goals, diary, weightLog, recommendation }).map(
    alert => `${alert.title}: ${alert.detail}`,
  )

  const plan = recommendation
    ? {
        phase: recommendation.phase,
        calories: recommendation.calories,
        protein: recommendation.protein,
        carbs: recommendation.carbs,
        fat: recommendation.fat,
        accepted:
          goals.calories === recommendation.calories &&
          goals.protein === recommendation.protein &&
          goals.carbs === recommendation.carbs &&
          goals.fat === recommendation.fat,
        ageDays: Math.max(0, Math.floor((now.getTime() - recommendation.createdAt) / 86_400_000)),
      }
    : null

  const idea = suggestNextMeal(diary, goals, now)
  const nextMealIdea = idea
    ? `${idea.meal}: ${idea.items.map(i => `${baseName(i.food.name)} ×${i.servings}`).join(' + ')} (${idea.calories} kcal, ${idea.protein} g protein)`
    : undefined

  const displayWeight = profile.weightUnit === 'lbs' ? kgToLbs(currentWeightKg) : currentWeightKg

  return {
    goals: { calories: goals.calories, protein: goals.protein, carbs: goals.carbs, fat: goals.fat },
    todayCalories: Math.round(totals.calories),
    consumed: {
      calories: Math.round(totals.calories),
      protein: Math.round(totals.protein),
      carbs: Math.round(totals.carbs),
      fat: Math.round(totals.fat),
      fiber: Math.round(totals.fiber),
    },
    todayEntries: day.entries.map(e => ({
      id: e.id,
      name: e.food.name,
      meal: e.mealType,
      calories: Math.round(e.food.calories * e.servings),
      protein: Math.round(e.food.protein * e.servings),
      carbs: Math.round(e.food.carbs * e.servings),
      fat: Math.round(e.food.fat * e.servings),
    })),
    currentWeight: `${displayWeight.toFixed(1)} ${profile.weightUnit}`,
    weightUnit: profile.weightUnit,
    mode,
    coach: {
      now: now.toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }),
      profile: {
        name: profile.name || undefined,
        goal: profile.goal,
        age: profile.age,
        gender: profile.gender,
        heightCm: profile.heightCm,
        activityLevel: profile.activityLevel,
      },
      days,
      weights,
      energy: {
        predictedTdee: Math.round(tdee.predicted),
        measuredTdee: tdee.measured === null ? null : Math.round(tdee.measured),
        confidence: tdee.confidence,
        trendKgPerWeek: tdee.weightTrendKgPerWeek,
        daysOfData: tdee.daysOfData,
      },
      plan,
      alerts,
      usualFoods,
      memory,
      nextMealIdea,
    },
  }
}

/** Logged days in the last week, for deciding whether a check-in has anything to review. */
export const loggedDaysLastWeek = (diary: Record<string, DiaryDay>, now: Date = new Date()): number => {
  let count = 0
  for (let back = 1; back <= 7; back += 1) {
    if ((diary[dayOffset(now, back)]?.entries.length ?? 0) > 0) count += 1
  }
  return count
}
