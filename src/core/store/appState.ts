import type { StateCreator } from 'zustand'
// Type-only, erased at build time. It registers the 'zustand/immer' mutator with the same
// copy of zustand this file resolves to, which is what makes the annotation on
// createAppState below legal in the Expo app as well as the web app.
import type {} from 'zustand/middleware/immer'
import { v4 as uuidv4 } from 'uuid'
import {
  DiaryDay, FoodEntry, Food, MealType, ExerciseEntry, Exercise,
  WeightEntry, UserProfile, MacroGoals, MealTemplate, DailyStreak,
  BodyMeasurement, ProgressPhoto, FastingSession, Recommendation,
  Lift, WorkoutSet, WorkoutSession, WorkoutTemplate,
} from '../types'
import { getTodayString, calculateBMR, calculateTDEE, calculateCalorieGoal, calculateMacroGoals, lbsToKg } from '../utils/calculations'

export interface AppState {
  // User
  profile: UserProfile
  currentWeightKg: number

  // Goals
  goals: MacroGoals

  // Diary
  diary: Record<string, DiaryDay>  // date -> DiaryDay

  // Weight log
  weightLog: WeightEntry[]

  // Meal templates
  mealTemplates: MealTemplate[]

  // Custom foods
  customFoods: Food[]

  // Recent foods (ids)
  recentFoodIds: string[]

  // Streak
  streak: DailyStreak

  // Theme
  darkMode: boolean

  // Actions
  updateProfile: (profile: Partial<UserProfile>) => void
  setCurrentWeight: (weight: number) => void
  updateGoals: (goals: Partial<MacroGoals>) => void
  recalculateGoals: () => void

  addFoodEntry: (date: string, entry: Omit<FoodEntry, 'id' | 'timestamp'>) => void
  removeFoodEntry: (date: string, entryId: string) => void
  updateFoodEntry: (date: string, entryId: string, servings: number) => void
  copyDayEntries: (fromDate: string, toDate: string) => void

  addExerciseEntry: (date: string, exercise: Exercise, durationMinutes: number, weightKg: number) => void
  removeExerciseEntry: (date: string, entryId: string) => void

  setWaterIntake: (date: string, ml: number) => void
  addWater: (date: string, ml: number) => void

  addWeightEntry: (entry: Omit<WeightEntry, 'id'>) => void
  removeWeightEntry: (id: string) => void

  addCustomFood: (food: Omit<Food, 'id' | 'isCustom'>) => Food
  removeCustomFood: (id: string) => void

  saveMealTemplate: (name: string, date: string, mealType?: MealType) => void
  deleteMealTemplate: (id: string) => void
  applyMealTemplate: (templateId: string, date: string) => void

  addRecentFood: (foodId: string) => void
  updateStreak: () => void
  toggleDarkMode: () => void
  copyMealEntries: (fromDate: string, toDate: string, mealType: MealType) => void

  // Body measurements
  bodyMeasurements: BodyMeasurement[]
  addBodyMeasurement: (m: Omit<BodyMeasurement, 'id'>) => void
  removeBodyMeasurement: (id: string) => void

  // Progress photos
  progressPhotos: ProgressPhoto[]
  addProgressPhoto: (p: Omit<ProgressPhoto, 'id'> & { id?: string }) => void
  removeProgressPhoto: (id: string) => void

  // Fasting
  fastingSession: FastingSession | null
  startFasting: (targetHours: number) => void
  stopFasting: () => void

  // Coach
  recommendation: Recommendation | null
  recommendationSeenAt: number | null
  setRecommendation: (rec: Recommendation) => void
  acceptRecommendation: () => void
  dismissRecommendation: () => void

  // Workout
  workoutLog: WorkoutSession[]        // newest first
  customLifts: Lift[]
  workoutTemplates: WorkoutTemplate[]
  activeWorkoutId: string | null

  startWorkout: (name: string, date: string) => string
  endWorkout: () => void
  cancelWorkout: () => void
  addExerciseToWorkout: (sessionId: string, lift: Lift) => void
  removeExerciseFromWorkout: (sessionId: string, exerciseId: string) => void
  addSet: (sessionId: string, exerciseId: string, set: Omit<WorkoutSet, 'id'>) => void
  updateSet: (sessionId: string, exerciseId: string, setId: string, patch: Partial<WorkoutSet>) => void
  removeSet: (sessionId: string, exerciseId: string, setId: string) => void
  deleteWorkout: (sessionId: string) => void
  addCustomLift: (lift: Omit<Lift, 'id' | 'isCustom'>) => Lift
  saveWorkoutTemplate: (name: string, sessionId: string) => void
  applyWorkoutTemplate: (templateId: string, date: string) => string

  getDayOrCreate: (date: string) => DiaryDay

  // Bulk hydrate from cloud (used by AuthContext after login)
  hydrateStore: (data: Partial<AppState>) => void
}

const DEFAULT_PROFILE: UserProfile = {
  name: 'User',
  age: 30,
  gender: 'male',
  heightCm: 175,
  activityLevel: 'moderately_active',
  weightUnit: 'lbs',
  heightUnit: 'cm',
  goal: 'maintain',
}

const DEFAULT_GOALS: MacroGoals = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fat: 67,
  fiber: 30,
  sugar: 50,
  sodium: 2300,
  water: 2500,
  proteinPct: 30,
  carbsPct: 40,
  fatPct: 30,
}

/** Newest first: most recent date wins, then the later start time within a day. */
const byNewestFirst = (
  a: { date: string; startedAt: number },
  b: { date: string; startedAt: number }
) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt

/**
 * Resolve a lift using only data the store already owns — custom lifts first, then the
 * most recent denormalized copy in the workout log (which is newest first). Templates
 * are always built from logged sessions, so this covers preset lifts too and keeps the
 * store independent of the preset lift database.
 */
const findLift = (customLifts: Lift[], workoutLog: WorkoutSession[], liftId: string): Lift | null => {
  const custom = customLifts.find(l => l.id === liftId)
  if (custom) return custom
  for (const session of workoutLog) {
    const exercise = session.exercises.find(e => e.liftId === liftId)
    if (exercise) return exercise.lift
  }
  return null
}

/**
 * Every line of app state, shared verbatim by the web app and the Expo app. It is a bare
 * immer state creator on purpose: persistence is the only thing the two platforms differ
 * on (localStorage vs AsyncStorage), so each wrapper supplies its own storage and nothing
 * else. Never import a browser or native API from this file.
 */
export const createAppState: StateCreator<AppState, [['zustand/immer', never]], [], AppState> = (set, get) => ({
  profile: DEFAULT_PROFILE,
  currentWeightKg: 75,
  goals: DEFAULT_GOALS,
  diary: {},
  weightLog: [],
  mealTemplates: [],
  customFoods: [],
  recentFoodIds: [],
  darkMode: false,
  streak: { current: 0, longest: 0, lastLoggedDate: '' },
  bodyMeasurements: [],
  progressPhotos: [],
  fastingSession: null,
  recommendation: null,
  recommendationSeenAt: null,
  workoutLog: [],
  customLifts: [],
  workoutTemplates: [],
  activeWorkoutId: null,

  getDayOrCreate: (date: string): DiaryDay => {
    const existing = get().diary[date]
    if (existing) return existing
    return { date, entries: [], waterIntake: 0, exercises: [] }
  },

  updateProfile: (updates) => set((state) => {
    Object.assign(state.profile, updates)
  }),

  setCurrentWeight: (weight) => set((state) => {
    state.currentWeightKg = weight
  }),

  updateGoals: (updates) => set((state) => {
    Object.assign(state.goals, updates)
  }),

  recalculateGoals: () => set((state) => {
    const { profile, currentWeightKg } = state
    const bmr = calculateBMR(profile, currentWeightKg)
    const tdee = calculateTDEE(bmr, profile.activityLevel)
    const calories = calculateCalorieGoal(tdee, profile.goal)
    const macros = calculateMacroGoals(
      calories,
      state.goals.proteinPct,
      state.goals.carbsPct,
      state.goals.fatPct,
      currentWeightKg
    )
    Object.assign(state.goals, macros)
  }),

  addFoodEntry: (date, entryData) => set((state) => {
    if (!state.diary[date]) {
      state.diary[date] = { date, entries: [], waterIntake: 0, exercises: [] }
    }
    const entry: FoodEntry = {
      ...entryData,
      id: uuidv4(),
      timestamp: Date.now(),
    }
    state.diary[date].entries.push(entry)

    // Update recent foods
    const { id } = entryData.food
    state.recentFoodIds = [id, ...state.recentFoodIds.filter(fid => fid !== id)].slice(0, 20)
  }),

  removeFoodEntry: (date, entryId) => set((state) => {
    if (state.diary[date]) {
      state.diary[date].entries = state.diary[date].entries.filter(e => e.id !== entryId)
    }
  }),

  updateFoodEntry: (date, entryId, servings) => set((state) => {
    if (state.diary[date]) {
      const entry = state.diary[date].entries.find(e => e.id === entryId)
      if (entry) entry.servings = servings
    }
  }),

  copyDayEntries: (fromDate, toDate) => set((state) => {
    const fromDay = state.diary[fromDate]
    if (!fromDay) return
    if (!state.diary[toDate]) {
      state.diary[toDate] = { date: toDate, entries: [], waterIntake: 0, exercises: [] }
    }
    const newEntries = fromDay.entries.map(e => ({
      ...e,
      id: uuidv4(),
      timestamp: Date.now(),
    }))
    state.diary[toDate].entries.push(...newEntries)
  }),

  addExerciseEntry: (date, exercise, durationMinutes, weightKg) => set((state) => {
    if (!state.diary[date]) {
      state.diary[date] = { date, entries: [], waterIntake: 0, exercises: [] }
    }
    const caloriesBurned = Math.round((exercise.metValue * weightKg * durationMinutes) / 60)
    const entry: ExerciseEntry = {
      id: uuidv4(),
      exerciseId: exercise.id,
      exercise,
      durationMinutes,
      caloriesBurned,
    }
    state.diary[date].exercises.push(entry)
  }),

  removeExerciseEntry: (date, entryId) => set((state) => {
    if (state.diary[date]) {
      state.diary[date].exercises = state.diary[date].exercises.filter(e => e.id !== entryId)
    }
  }),

  setWaterIntake: (date, ml) => set((state) => {
    if (!state.diary[date]) {
      state.diary[date] = { date, entries: [], waterIntake: 0, exercises: [] }
    }
    state.diary[date].waterIntake = Math.max(0, ml)
  }),

  addWater: (date, ml) => set((state) => {
    if (!state.diary[date]) {
      state.diary[date] = { date, entries: [], waterIntake: 0, exercises: [] }
    }
    state.diary[date].waterIntake = Math.max(0, (state.diary[date].waterIntake || 0) + ml)
  }),

  addWeightEntry: (entryData) => set((state) => {
    const entry: WeightEntry = { ...entryData, id: uuidv4() }
    state.weightLog = [entry, ...state.weightLog.filter(w => w.date !== entryData.date)]
    state.weightLog.sort((a, b) => b.date.localeCompare(a.date))
    // Update current weight
    if (state.weightLog.length > 0) {
      const latestKg = state.profile.weightUnit === 'lbs'
        ? entryData.weight / 2.20462
        : entryData.weight
      state.currentWeightKg = latestKg
    }
  }),

  removeWeightEntry: (id) => set((state) => {
    state.weightLog = state.weightLog.filter(w => w.id !== id)
  }),

  addCustomFood: (foodData) => {
    const food: Food = { ...foodData, id: `custom_${uuidv4()}`, isCustom: true }
    set((state) => { state.customFoods.push(food) })
    return food
  },

  removeCustomFood: (id) => set((state) => {
    state.customFoods = state.customFoods.filter(f => f.id !== id)
  }),

  saveMealTemplate: (name, date, mealType) => set((state) => {
    const day = state.diary[date]
    if (!day) return
    const entries = mealType
      ? day.entries.filter(e => e.mealType === mealType)
      : day.entries
    const template: MealTemplate = {
      id: uuidv4(),
      name,
      entries: entries.map(({ id: _id, timestamp: _ts, ...rest }) => rest),
      createdAt: Date.now(),
    }
    state.mealTemplates.push(template)
  }),

  deleteMealTemplate: (id) => set((state) => {
    state.mealTemplates = state.mealTemplates.filter(t => t.id !== id)
  }),

  applyMealTemplate: (templateId, date) => set((state) => {
    const template = state.mealTemplates.find(t => t.id === templateId)
    if (!template) return
    if (!state.diary[date]) {
      state.diary[date] = { date, entries: [], waterIntake: 0, exercises: [] }
    }
    const newEntries = template.entries.map(e => ({
      ...e,
      id: uuidv4(),
      timestamp: Date.now(),
    }))
    state.diary[date].entries.push(...newEntries)
  }),

  addRecentFood: (foodId) => set((state) => {
    state.recentFoodIds = [foodId, ...state.recentFoodIds.filter(id => id !== foodId)].slice(0, 20)
  }),

  updateStreak: () => set((state) => {
    const today = getTodayString()
    if (state.streak.lastLoggedDate === today) return

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]

    const newCurrent = state.streak.lastLoggedDate === yesterdayStr
      ? state.streak.current + 1
      : 1

    state.streak = {
      current: newCurrent,
      longest: Math.max(state.streak.longest, newCurrent),
      lastLoggedDate: today,
    }
  }),

  toggleDarkMode: () => set((state) => {
    state.darkMode = !state.darkMode
  }),

  copyMealEntries: (fromDate, toDate, mealType) => set((state) => {
    const fromDay = state.diary[fromDate]
    if (!fromDay) return
    if (!state.diary[toDate]) {
      state.diary[toDate] = { date: toDate, entries: [], waterIntake: 0, exercises: [] }
    }
    const mealEntries = fromDay.entries
      .filter(e => e.mealType === mealType)
      .map(e => ({ ...e, id: uuidv4(), timestamp: Date.now() }))
    state.diary[toDate].entries.push(...mealEntries)
  }),

  addBodyMeasurement: (m) => set((state) => {
    state.bodyMeasurements.unshift({ ...m, id: uuidv4() })
  }),
  removeBodyMeasurement: (id) => set((state) => {
    state.bodyMeasurements = state.bodyMeasurements.filter(m => m.id !== id)
  }),

  addProgressPhoto: (p) => set((state) => {
    if (state.progressPhotos.length >= 20) state.progressPhotos.pop()
    state.progressPhotos.unshift({ ...p, id: p.id ?? uuidv4() })
  }),
  removeProgressPhoto: (id) => set((state) => {
    state.progressPhotos = state.progressPhotos.filter(p => p.id !== id)
  }),

  startFasting: (targetHours) => set((state) => {
    state.fastingSession = { startTime: Date.now(), targetHours }
  }),
  stopFasting: () => set((state) => { state.fastingSession = null }),

  // --- Coach ---

  setRecommendation: (rec) => set((state) => {
    state.recommendation = rec
    state.recommendationSeenAt = null
  }),

  acceptRecommendation: () => set((state) => {
    const rec = state.recommendation
    if (!rec) return
    // Only calories and the three macros move. Water, sodium, fiber, sugar and the
    // user's units are theirs to control and must survive an accepted plan.
    state.goals.calories = rec.calories
    state.goals.protein = rec.protein
    state.goals.carbs = rec.carbs
    state.goals.fat = rec.fat
    // Keep the Goals sliders consistent with the accepted macros.
    const macroCalories = rec.protein * 4 + rec.carbs * 4 + rec.fat * 9
    if (macroCalories > 0) {
      const proteinPct = Math.round((rec.protein * 4 * 100) / macroCalories)
      const fatPct = Math.round((rec.fat * 9 * 100) / macroCalories)
      state.goals.proteinPct = proteinPct
      state.goals.fatPct = fatPct
      // Carbs take the remainder so the three always sum to exactly 100.
      state.goals.carbsPct = Math.max(0, 100 - proteinPct - fatPct)
    }
  }),

  dismissRecommendation: () => set((state) => {
    state.recommendationSeenAt = Date.now()
  }),

  // --- Workout ---

  startWorkout: (name, date) => {
    const session: WorkoutSession = {
      id: uuidv4(),
      date,
      name,
      startedAt: Date.now(),
      exercises: [],
    }
    set((state) => {
      // Only one session can be active — close out any session left open.
      const previous = state.workoutLog.find(w => w.id === state.activeWorkoutId)
      if (previous && previous.endedAt === undefined) previous.endedAt = Date.now()

      state.workoutLog.unshift(session)
      state.workoutLog.sort(byNewestFirst)
      state.activeWorkoutId = session.id
    })
    return session.id
  },

  endWorkout: () => set((state) => {
    const session = state.workoutLog.find(w => w.id === state.activeWorkoutId)
    if (session) session.endedAt = Date.now()
    state.activeWorkoutId = null
  }),

  cancelWorkout: () => set((state) => {
    const session = state.workoutLog.find(w => w.id === state.activeWorkoutId)
    if (session) {
      const hasCompletedSets = session.exercises.some(ex => ex.sets.some(s => s.completed))
      if (hasCompletedSets) {
        // Real work was logged — keep it, same as finishing normally.
        session.endedAt = Date.now()
      } else {
        state.workoutLog = state.workoutLog.filter(w => w.id !== session.id)
      }
    }
    state.activeWorkoutId = null
  }),

  addExerciseToWorkout: (sessionId, lift) => set((state) => {
    const session = state.workoutLog.find(w => w.id === sessionId)
    if (!session) return
    session.exercises.push({ id: uuidv4(), liftId: lift.id, lift, sets: [] })
  }),

  removeExerciseFromWorkout: (sessionId, exerciseId) => set((state) => {
    const session = state.workoutLog.find(w => w.id === sessionId)
    if (!session) return
    session.exercises = session.exercises.filter(e => e.id !== exerciseId)
  }),

  addSet: (sessionId, exerciseId, setData) => set((state) => {
    const session = state.workoutLog.find(w => w.id === sessionId)
    const exercise = session?.exercises.find(e => e.id === exerciseId)
    if (!exercise) return
    exercise.sets.push({ ...setData, id: uuidv4() })
  }),

  updateSet: (sessionId, exerciseId, setId, patch) => set((state) => {
    const session = state.workoutLog.find(w => w.id === sessionId)
    const exercise = session?.exercises.find(e => e.id === exerciseId)
    const target = exercise?.sets.find(s => s.id === setId)
    if (!target) return
    const { id: _id, ...rest } = patch
    Object.assign(target, rest)
  }),

  removeSet: (sessionId, exerciseId, setId) => set((state) => {
    const session = state.workoutLog.find(w => w.id === sessionId)
    const exercise = session?.exercises.find(e => e.id === exerciseId)
    if (!exercise) return
    exercise.sets = exercise.sets.filter(s => s.id !== setId)
  }),

  deleteWorkout: (sessionId) => set((state) => {
    state.workoutLog = state.workoutLog.filter(w => w.id !== sessionId)
    if (state.activeWorkoutId === sessionId) state.activeWorkoutId = null
  }),

  addCustomLift: (liftData) => {
    const lift: Lift = { ...liftData, id: `lift_custom_${uuidv4()}`, isCustom: true }
    set((state) => { state.customLifts.push(lift) })
    return lift
  },

  saveWorkoutTemplate: (name, sessionId) => set((state) => {
    const session = state.workoutLog.find(w => w.id === sessionId)
    if (!session) return
    const liftIds: string[] = []
    for (const exercise of session.exercises) {
      if (!liftIds.includes(exercise.liftId)) liftIds.push(exercise.liftId)
    }
    if (liftIds.length === 0) return
    const template: WorkoutTemplate = { id: uuidv4(), name, liftIds, createdAt: Date.now() }
    state.workoutTemplates.push(template)
  }),

  applyWorkoutTemplate: (templateId, date) => {
    const { workoutTemplates, customLifts, workoutLog } = get()
    const template = workoutTemplates.find(t => t.id === templateId)
    const session: WorkoutSession = {
      id: uuidv4(),
      date,
      name: template?.name ?? 'Workout',
      startedAt: Date.now(),
      exercises: [],
    }
    if (template) {
      for (const liftId of template.liftIds) {
        const lift = findLift(customLifts, workoutLog, liftId)
        if (lift) session.exercises.push({ id: uuidv4(), liftId, lift, sets: [] })
      }
    }
    set((state) => {
      const previous = state.workoutLog.find(w => w.id === state.activeWorkoutId)
      if (previous && previous.endedAt === undefined) previous.endedAt = Date.now()

      state.workoutLog.unshift(session)
      state.workoutLog.sort(byNewestFirst)
      state.activeWorkoutId = session.id
    })
    return session.id
  },

  hydrateStore: (data) => set((state) => {
    // Must stay identical to SYNC_FIELDS in AuthContext.tsx — a key that is saved
    // but not hydrated silently never comes back on a new device.
    const syncFields = [
      'profile', 'currentWeightKg', 'goals', 'diary', 'weightLog',
      'mealTemplates', 'customFoods', 'recentFoodIds', 'streak',
      'darkMode', 'bodyMeasurements', 'fastingSession', 'progressPhotos',
      'recommendation', 'recommendationSeenAt',
      'workoutLog', 'customLifts', 'workoutTemplates', 'activeWorkoutId',
    ] as const
    for (const key of syncFields) {
      if (key in data && data[key] !== undefined) {
        (state as Record<string, unknown>)[key] = data[key]
      }
    }
  }),
})
