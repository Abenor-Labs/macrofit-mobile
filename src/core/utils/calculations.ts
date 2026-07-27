import { UserProfile, MacroGoals, ActivityLevel, WeightGoal, NutritionSummary, DiaryDay } from '../types'

export function calculateBMR(profile: UserProfile, weightKg: number): number {
  // Mifflin-St Jeor Equation
  const { age, gender, heightCm } = profile
  if (gender === 'male') {
    return 10 * weightKg + 6.25 * heightCm - 5 * age + 5
  }
  return 10 * weightKg + 6.25 * heightCm - 5 * age - 161
}

export function calculateTDEE(bmr: number, activityLevel: ActivityLevel): number {
  const multipliers: Record<ActivityLevel, number> = {
    sedentary: 1.2,
    lightly_active: 1.375,
    moderately_active: 1.55,
    very_active: 1.725,
    extra_active: 1.9,
  }
  return Math.round(bmr * multipliers[activityLevel])
}

export function calculateCalorieGoal(tdee: number, goal: WeightGoal): number {
  if (goal === 'lose') return Math.round(tdee - 500)
  if (goal === 'gain') return Math.round(tdee + 300)
  return tdee
}

export function calculateMacroGoals(
  calories: number,
  proteinPct: number,
  carbsPct: number,
  fatPct: number,
  weightKg: number
): Partial<MacroGoals> {
  return {
    calories,
    protein: Math.round((calories * proteinPct) / 400),   // 4 cal/g
    carbs: Math.round((calories * carbsPct) / 400),       // 4 cal/g
    fat: Math.round((calories * fatPct) / 900),           // 9 cal/g
    fiber: Math.round(weightKg * 0.38),
    sugar: Math.round(calories * 0.05 / 4),
    sodium: 2300,
    water: Math.round(weightKg * 35),
  }
}

export function calculateBMI(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100
  return parseFloat((weightKg / (heightM * heightM)).toFixed(1))
}

export function getBMICategory(bmi: number): { label: string; color: string } {
  if (bmi < 18.5) return { label: 'Underweight', color: 'text-blue-500' }
  if (bmi < 25) return { label: 'Normal weight', color: 'text-green-500' }
  if (bmi < 30) return { label: 'Overweight', color: 'text-yellow-500' }
  return { label: 'Obese', color: 'text-red-500' }
}

export function calculateCaloriesBurned(
  metValue: number,
  durationMinutes: number,
  weightKg: number
): number {
  return Math.round((metValue * weightKg * durationMinutes) / 60)
}

export function getDayNutrition(day: DiaryDay): NutritionSummary {
  const base: NutritionSummary = {
    calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0,
    sugar: 0, sodium: 0, potassium: 0, cholesterol: 0, saturatedFat: 0,
    vitaminA: 0, vitaminC: 0, calcium: 0, iron: 0,
    caloriesBurned: 0, netCalories: 0,
  }

  for (const entry of day.entries) {
    const mult = entry.servings
    base.calories += entry.food.calories * mult
    base.protein += entry.food.protein * mult
    base.carbs += entry.food.carbs * mult
    base.fat += entry.food.fat * mult
    base.fiber += entry.food.fiber * mult
    base.sugar += entry.food.sugar * mult
    base.sodium += entry.food.sodium * mult
    base.potassium += entry.food.potassium * mult
    base.cholesterol += entry.food.cholesterol * mult
    base.saturatedFat += entry.food.saturatedFat * mult
    base.vitaminA += entry.food.vitaminA * mult
    base.vitaminC += entry.food.vitaminC * mult
    base.calcium += entry.food.calcium * mult
    base.iron += entry.food.iron * mult
  }

  for (const ex of day.exercises) {
    base.caloriesBurned += ex.caloriesBurned
  }

  base.netCalories = Math.round(base.calories - base.caloriesBurned)

  return {
    ...base,
    calories: Math.round(base.calories),
    protein: parseFloat(base.protein.toFixed(1)),
    carbs: parseFloat(base.carbs.toFixed(1)),
    fat: parseFloat(base.fat.toFixed(1)),
    fiber: parseFloat(base.fiber.toFixed(1)),
    sugar: parseFloat(base.sugar.toFixed(1)),
    sodium: Math.round(base.sodium),
    potassium: Math.round(base.potassium),
  }
}

/*
  getProgressColor / getProgressColorHex were removed in the design-system migration.
  They returned the pre-redesign neon palette (#22c55e / #f59e0b / #ef4444), had no
  remaining callers, and would have quietly reintroduced off-token colors.
  Progress and status colors now come from docs/DESIGN-SYSTEM.md §2:
  good = jade-600 / jade-400, warning = #B45309 / #F59E0B, critical = #B91C1C / #F87171 —
  always paired with an icon and a label, never carried by color alone.
*/

export function lbsToKg(lbs: number): number {
  return parseFloat((lbs / 2.20462).toFixed(1))
}

export function kgToLbs(kg: number): number {
  return parseFloat((kg * 2.20462).toFixed(1))
}

export function cmToFeetInches(cm: number): string {
  const inches = cm / 2.54
  const feet = Math.floor(inches / 12)
  const remainingInches = Math.round(inches % 12)
  return `${feet}'${remainingInches}"`
}

export function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function getTodayString(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function getDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function getLast7Days(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return getDateString(d)
  })
}

export function getLast30Days(): string[] {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (29 - i))
    return getDateString(d)
  })
}
