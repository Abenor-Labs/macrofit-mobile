import type { Food, MealType } from '@core/types'
import type { AnalyzedFood } from './api'

/**
 * Turns model-analyzed food into the shape the diary stores.
 *
 * WHY THE DIVISION. Both AI endpoints report TOTALS for what they saw: two eggs at 140 kcal
 * arrives as `{ servings: 2, calories: 140 }`. A `FoodEntry`, though, holds a per-serving
 * `Food` and multiplies it by its own `servings` — so handing the totals straight through
 * logs 280 kcal for the same two eggs. Dividing here is what keeps those two conventions
 * from silently doubling every entry.
 *
 * This lived inline in `app/chat.tsx` until the photo flow needed the identical arithmetic.
 * Two copies of it is how the diary and the assistant end up disagreeing about a meal, so
 * there is one copy and both callers use it.
 *
 * `servings` is guaranteed positive by `parseAnalyzedFood`, which drops any item lacking a
 * usable count precisely so these divisions cannot write `Infinity` into a day.
 */
export const analyzedFoodToFood = (input: AnalyzedFood, id: string): Food => ({
  id,
  name: input.name,
  category: input.category,
  servingSize: input.servingSize,
  servingUnit: input.servingUnit,
  calories: input.calories / input.servings,
  protein: input.protein / input.servings,
  carbs: input.carbs / input.servings,
  fat: input.fat / input.servings,
  fiber: input.fiber / input.servings,
  sugar: input.sugar / input.servings,
  /*
    Everything below zero is not a guess at zero — neither model is asked for micronutrients,
    so there is no value to carry. The diary treats a missing micro as 0 already; writing an
    invented number here would put it on the nutrition breakdown as though it were measured.
  */
  sodium: input.sodium / input.servings,
  potassium: 0,
  cholesterol: 0,
  saturatedFat: 0,
  transFat: 0,
  vitaminA: 0,
  vitaminC: 0,
  calcium: 0,
  iron: 0,
  isCustom: true,
})

/**
 * The meal a log started right now most likely belongs to.
 *
 * Only ever a starting position for a picker the user can move. A photo carries no meal of
 * its own, and making someone choose one before they can see what was even detected puts a
 * decision in front of the information needed to make it.
 */
export const mealForNow = (now: Date = new Date()): MealType => {
  const hour = now.getHours()
  if (hour < 11) return 'Breakfast'
  if (hour < 16) return 'Lunch'
  if (hour < 21) return 'Dinner'
  return 'Snacks'
}
