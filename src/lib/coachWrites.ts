import { v4 as uuidv4 } from 'uuid'
import type { Food, FoodEntry, MealType } from '@core/types'
import { getFoodById } from '@core/data/foodDatabase'
import { useStore } from '@/store/useStore'
import type { AnalyzedFood } from './api'
import { analyzedFoodToFood } from './analyzedFood'

/**
 * Diary writes made on the coach's behalf, shared by chat replies, meal offers and photos.
 */

/**
 * The Food a coach or photo item should be logged as.
 *
 * A catalog match is logged AS the catalog food, so the entry is the same row search would
 * have written: it counts toward "usual foods", the next-meal card can suggest it back, and
 * its numbers match everywhere. Anything else becomes a one-off food from the model's figures.
 */
export const foodForItem = (item: AnalyzedFood, prefix: 'chat' | 'photo'): { food: Food; servings: number } => {
  const catalog = item.foodId ? getFoodById(item.foodId) : undefined
  if (catalog) return { food: catalog, servings: item.servings }
  return { food: analyzedFoodToFood(item, `${prefix}_${uuidv4()}`), servings: item.servings }
}

/**
 * Adds entries to a day and returns the ids the store minted for them.
 *
 * `addFoodEntry` returns nothing, so the ids are found as the entries that were not there
 * before. Undo needs them: a catalog food can appear in a day more than once, so "the entry
 * with this food id" is no longer a safe way to find what a reply wrote.
 */
export const addEntriesTracked = (
  date: string,
  entries: { food: Food; servings: number; mealType: MealType }[],
): string[] => {
  const { addFoodEntry } = useStore.getState()
  const before = new Set((useStore.getState().diary[date]?.entries ?? []).map((e: FoodEntry) => e.id))
  for (const entry of entries) {
    addFoodEntry(date, { foodId: entry.food.id, food: entry.food, servings: entry.servings, mealType: entry.mealType })
  }
  return (useStore.getState().diary[date]?.entries ?? []).map(e => e.id).filter(id => !before.has(id))
}

/** A catalog food scaled to `servings`, in the totals shape offers and photo results use. */
export const itemFromFood = (food: Food, servings: number): AnalyzedFood & { foodId: string } => ({
  foodId: food.id,
  name: food.name,
  servings,
  servingSize: food.servingSize,
  servingUnit: food.servingUnit,
  calories: Math.round(food.calories * servings),
  protein: Math.round(food.protein * servings * 10) / 10,
  carbs: Math.round(food.carbs * servings * 10) / 10,
  fat: Math.round(food.fat * servings * 10) / 10,
  fiber: Math.round(food.fiber * servings * 10) / 10,
  sugar: Math.round(food.sugar * servings * 10) / 10,
  sodium: Math.round(food.sodium * servings),
  category: food.category,
})
