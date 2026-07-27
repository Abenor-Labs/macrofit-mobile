import { Food, FoodCategory } from '../types'

// Free API key from https://fdc.nal.usda.gov/api-key-signup.html
// DEMO_KEY: 30 req/min, 1000 req/day per IP — sufficient for personal use
const API_KEY = (import.meta as any).env?.VITE_USDA_API_KEY ?? 'DEMO_KEY'
const BASE_URL = 'https://api.nal.usda.gov/fdc/v1'

// USDA nutrient IDs (consistent across all data types)
const NUTRIENT = {
  CALORIES: 1008,
  PROTEIN: 1003,
  FAT: 1004,
  CARBS: 1005,
  FIBER: 1079,
  SUGAR: 2000,
  SODIUM: 1093,
  POTASSIUM: 1092,
  CHOLESTEROL: 1253,
  SAT_FAT: 1258,
}

const getNutrient = (nutrients: any[], id: number): number => {
  const n = nutrients?.find((n: any) => n.nutrientId === id || n.nutrient?.id === id)
  return +(n?.value ?? n?.amount ?? 0).toFixed(1)
}

const guessCategory = (description: string): FoodCategory => {
  const d = description.toLowerCase()
  if (d.includes('chicken') || d.includes('beef') || d.includes('pork') || d.includes('turkey')) return 'Meat & Poultry'
  if (d.includes('fish') || d.includes('salmon') || d.includes('tuna') || d.includes('shrimp')) return 'Fish & Seafood'
  if (d.includes('milk') || d.includes('cheese') || d.includes('yogurt') || d.includes('egg')) return 'Dairy'
  if (d.includes('apple') || d.includes('banana') || d.includes('orange') || d.includes('fruit') || d.includes('berry')) return 'Fruits'
  if (d.includes('broccoli') || d.includes('spinach') || d.includes('carrot') || d.includes('vegetable') || d.includes('lettuce')) return 'Vegetables'
  if (d.includes('rice') || d.includes('bread') || d.includes('pasta') || d.includes('oat') || d.includes('grain') || d.includes('cereal')) return 'Grains & Cereals'
  if (d.includes('almond') || d.includes('walnut') || d.includes('peanut') || d.includes('nut') || d.includes('seed')) return 'Nuts & Seeds'
  if (d.includes('oil') || d.includes('butter') || d.includes('lard')) return 'Oils & Fats'
  return 'Custom'
}

export interface USDAFood extends Food {
  fdcId: number
  dataType: string
}

export const searchUSDA = async (query: string, limit = 15): Promise<USDAFood[]> => {
  if (!query.trim()) return []

  const params = new URLSearchParams({
    query,
    api_key: API_KEY,
    pageSize: String(limit),
    // Prefer real food over branded (more reliable macros)
    dataType: 'Foundation,SR Legacy,Survey (FNDDS),Branded',
  })

  const res = await fetch(`${BASE_URL}/foods/search?${params}`)
  if (!res.ok) throw new Error(`USDA API error: ${res.status}`)
  const json = await res.json()

  return (json.foods ?? []).map((f: any): USDAFood => {
    const nutrients = f.foodNutrients ?? []
    const calories = Math.round(getNutrient(nutrients, NUTRIENT.CALORIES))
    // Skip foods with no calorie data
    if (calories === 0) return null as any

    return {
      id: `usda-${f.fdcId}`,
      fdcId: f.fdcId,
      dataType: f.dataType ?? '',
      name: f.description
        ? f.description.charAt(0).toUpperCase() + f.description.slice(1).toLowerCase()
        : 'Unknown',
      brand: f.brandOwner || f.brandName || undefined,
      category: guessCategory(f.description ?? ''),
      servingSize: 100,
      servingUnit: 'g',
      calories,
      protein: getNutrient(nutrients, NUTRIENT.PROTEIN),
      carbs: getNutrient(nutrients, NUTRIENT.CARBS),
      fat: getNutrient(nutrients, NUTRIENT.FAT),
      fiber: getNutrient(nutrients, NUTRIENT.FIBER),
      sugar: getNutrient(nutrients, NUTRIENT.SUGAR),
      sodium: Math.round(getNutrient(nutrients, NUTRIENT.SODIUM)),
      potassium: Math.round(getNutrient(nutrients, NUTRIENT.POTASSIUM)),
      cholesterol: Math.round(getNutrient(nutrients, NUTRIENT.CHOLESTEROL)),
      saturatedFat: getNutrient(nutrients, NUTRIENT.SAT_FAT),
      transFat: 0,
      vitaminA: 0, vitaminC: 0, calcium: 0, iron: 0,
      isCustom: false,
    }
  }).filter(Boolean)
}
