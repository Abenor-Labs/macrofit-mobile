export interface Food {
  id: string
  name: string
  brand?: string
  category: FoodCategory
  servingSize: number
  servingUnit: string
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  sugar: number
  sodium: number
  potassium: number
  cholesterol: number
  saturatedFat: number
  transFat: number
  vitaminA: number    // % DV
  vitaminC: number    // % DV
  calcium: number     // % DV
  iron: number        // % DV
  isCustom?: boolean
  barcode?: string
}

export type FoodCategory =
  | 'Fruits'
  | 'Vegetables'
  | 'Grains & Cereals'
  | 'Dairy'
  | 'Meat & Poultry'
  | 'Fish & Seafood'
  | 'Legumes'
  | 'Nuts & Seeds'
  | 'Beverages'
  | 'Snacks'
  | 'Fast Food'
  | 'Condiments'
  | 'Oils & Fats'
  | 'Sweets & Desserts'
  | 'Custom'

export type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks' | 'Pre-Workout' | 'Post-Workout'

export interface FoodEntry {
  id: string
  foodId: string
  food: Food
  servings: number
  mealType: MealType
  timestamp: number
}

export interface DiaryDay {
  date: string   // 'YYYY-MM-DD'
  entries: FoodEntry[]
  waterIntake: number  // ml
  exercises: ExerciseEntry[]
  notes?: string
}

export interface Exercise {
  id: string
  name: string
  category: ExerciseCategory
  metValue: number   // MET for calorie calculation
}

export type ExerciseCategory =
  | 'Cardio'
  | 'Strength'
  | 'Flexibility'
  | 'Sports'
  | 'Other'

export interface ExerciseEntry {
  id: string
  exerciseId: string
  exercise: Exercise
  durationMinutes: number
  caloriesBurned: number
  notes?: string
}

export interface WeightEntry {
  id: string
  date: string   // 'YYYY-MM-DD'
  weight: number  // in user's preferred unit
  bodyFat?: number  // %
  notes?: string
}

export interface UserProfile {
  name: string
  age: number
  gender: 'male' | 'female' | 'other'
  heightCm: number
  activityLevel: ActivityLevel
  weightUnit: 'lbs' | 'kg'
  heightUnit: 'cm' | 'ft'
  goal: WeightGoal
  avatar?: string
  /** Goal bodyweight in kg. Undefined until the user sets one. */
  targetWeightKg?: number
  /**
   * Intended rate of change in kg/week: negative to lose, positive to gain.
   * Undefined means "no explicit pace" and progress is judged on direction only.
   */
  targetRateKgPerWeek?: number
  /** Daily step goal, used when step data is available from the platform. */
  stepGoal?: number
}

export type ActivityLevel =
  | 'sedentary'
  | 'lightly_active'
  | 'moderately_active'
  | 'very_active'
  | 'extra_active'

export type WeightGoal = 'lose' | 'maintain' | 'gain'

export interface MacroGoals {
  calories: number
  protein: number    // grams
  carbs: number      // grams
  fat: number        // grams
  fiber: number      // grams
  sugar: number      // grams
  sodium: number     // mg
  water: number      // ml
  proteinPct: number   // %
  carbsPct: number     // %
  fatPct: number       // %
}

export interface NutritionSummary {
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  sugar: number
  sodium: number
  potassium: number
  cholesterol: number
  saturatedFat: number
  vitaminA: number
  vitaminC: number
  calcium: number
  iron: number
  caloriesBurned: number
  netCalories: number
}

export interface MealTemplate {
  id: string
  name: string
  entries: Omit<FoodEntry, 'id' | 'timestamp'>[]
  createdAt: number
}

export interface DailyStreak {
  current: number
  longest: number
  lastLoggedDate: string
}

export interface BodyMeasurement {
  id: string
  date: string
  neck?: number
  shoulders?: number
  chest?: number
  waist?: number
  hips?: number
  leftArm?: number
  rightArm?: number
  leftThigh?: number
  notes?: string
}

export type PhotoPose = 'front' | 'side' | 'back'

export interface ProgressPhoto {
  id: string
  date: string
  dataUrl: string   // base64 compressed JPEG
  pose: PhotoPose
  notes?: string
}

export interface FastingSession {
  startTime: number   // Date.now()
  targetHours: number
}

// --- Coach ---

export type PhaseType = 'cut' | 'lean_bulk' | 'maintain' | 'recomp'

export interface BodyComposition {
  bodyFatPct: number
  leanMassKg: number
  method: 'navy'          // Navy tape method from body measurements
  measuredOn: string      // 'YYYY-MM-DD' of the measurement used
}

export interface TdeeEstimate {
  predicted: number                 // Mifflin-St Jeor, or Katch-McArdle when LBM known
  basis: 'mifflin' | 'katch'
  measured: number | null           // from logged intake vs weight trend; null below threshold
  confidence: 'none' | 'low' | 'medium' | 'high'
  daysOfData: number                // days with BOTH intake and weight in the window
  weightTrendKgPerWeek: number | null
}

export interface Recommendation {
  id: string
  createdAt: number
  phase: PhaseType
  calories: number
  protein: number                   // grams
  carbs: number
  fat: number
  targetRateKgPerWeek: number       // negative for a cut
  durationWeeks: number
  headline: string                  // one short line, e.g. "Lean bulk for 12 weeks"
  rationale: string                 // 2-4 sentences, plain language, cites the user's data
  tdeeUsed: number
  source: 'ai' | 'local'            // 'local' = deterministic fallback was used
  clamped: boolean                  // true if AI numbers were pulled back into bounds
}

export type CoachAlertKind =
  | 'stalled' | 'bulk_too_long' | 'cut_too_long' | 'rate_too_fast'
  | 'rate_too_slow' | 'low_protein' | 'insufficient_data' | 'stale_recommendation'

export interface CoachAlert {
  id: string
  kind: CoachAlertKind
  severity: 'info' | 'warning'
  title: string
  detail: string
}

// --- Workout ---

export type MuscleGroup =
  | 'Chest' | 'Back' | 'Shoulders' | 'Biceps' | 'Triceps'
  | 'Quads' | 'Hamstrings' | 'Glutes' | 'Calves' | 'Core' | 'Full Body'

export type LiftEquipment =
  | 'Barbell' | 'Dumbbell' | 'Machine' | 'Cable' | 'Bodyweight' | 'Kettlebell' | 'Band'

export interface Lift {
  id: string
  name: string
  muscleGroup: MuscleGroup
  equipment: LiftEquipment
  isCompound: boolean
  isCustom?: boolean
}

export interface WorkoutSet {
  id: string
  weightKg: number        // always stored in kg; convert at the UI edge only
  reps: number
  rpe?: number            // 5-10
  isWarmup: boolean
  completed: boolean
}

export interface WorkoutExercise {
  id: string
  liftId: string
  lift: Lift              // denormalized, same pattern as FoodEntry.food
  sets: WorkoutSet[]
  notes?: string
}

export interface WorkoutSession {
  id: string
  date: string            // 'YYYY-MM-DD'
  name: string
  startedAt: number
  endedAt?: number        // undefined while in progress
  exercises: WorkoutExercise[]
  notes?: string
}

export interface WorkoutTemplate {
  id: string
  name: string
  liftIds: string[]
  createdAt: number
}

export interface PersonalRecord {
  liftId: string
  liftName: string
  bestWeightKg: number
  bestEstimated1RM: number
  bestSessionVolume: number
  achievedOn: string
}
