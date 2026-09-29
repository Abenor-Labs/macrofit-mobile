import type { AppState } from '@core/store/appState'
import { getDayNutrition } from '@core/utils/calculations'
import { projectSchedule, resolveUpNext } from '@core/utils/trainingProgram'
import { countsAsWorkout, weeklyGoalFor, weeklyProgress } from '@core/utils/trainingStats'
import { programDayLabel } from '@/lib/programDayLabel'
import { findLiftById } from '@/features/training/liftNames'

/*
  What the home-screen widgets show, worked out from the store alone.

  Pure on purpose: the same function runs inside the app (to redraw the widgets after an edit)
  and inside the widget's background task, where no React tree exists and "today" has to be
  worked out fresh — the widget may be redrawn on a new day by nothing but the clock.
*/

/** One tap on the widget's water button. The same step as the log button's water item. */
export const WIDGET_WATER_ML = 250

export interface MacroLine {
  key: 'Protein' | 'Carbs' | 'Fat'
  grams: number
  goal: number
}

export type TodayModel =
  /** No setup yet (or no data readable): targets would belong to nobody. */
  | { kind: 'empty' }
  | {
      kind: 'day'
      eaten: number
      goal: number
      macros: MacroLine[]
      waterMl: number
      waterGoalMl: number
    }

export const todayModel = (state: AppState, today: string): TodayModel => {
  if (state.onboardedAt === null) return { kind: 'empty' }
  const day = state.diary[today]
  const nutrition = day
    ? getDayNutrition(day)
    : { calories: 0, protein: 0, carbs: 0, fat: 0 }
  const { goals } = state
  return {
    kind: 'day',
    eaten: nutrition.calories,
    goal: goals.calories,
    macros: [
      { key: 'Protein', grams: nutrition.protein, goal: goals.protein },
      { key: 'Carbs', grams: nutrition.carbs, goal: goals.carbs },
      { key: 'Fat', grams: nutrition.fat, goal: goals.fat },
    ],
    waterMl: day?.waterIntake ?? 0,
    waterGoalMl: goals.water,
  }
}

export interface WeekDots {
  done: number
  goal: number
  /** Monday to Sunday. */
  days: boolean[]
  todayIndex: number
}

export type TrainingModel =
  | { kind: 'empty' }
  /** Onboarded, but no plan: the widget offers to make one. */
  | { kind: 'no-plan'; week: WeekDots }
  | { kind: 'active'; name: string; setsDone: number; week: WeekDots }
  | { kind: 'train'; label: string; lifts: string | null; dayId: string; week: WeekDots }
  /** A rest day, or today's session is done: says what is next and when. */
  | { kind: 'rest' | 'done'; nextLabel: string | null; nextWhen: string | null; week: WeekDots }

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** "tomorrow", or the weekday for anything later. */
const whenLabel = (date: string, today: string, tomorrow: string): string => {
  if (date === tomorrow) return 'tomorrow'
  if (date === today) return 'today'
  const [y, m, d] = date.split('-').map(Number)
  return WEEKDAY[new Date(y, m - 1, d).getDay()]
}

/** "Bench, Row and 3 more" — short enough for one widget line. */
const liftSummary = (names: string[]): string | null => {
  if (names.length === 0) return null
  if (names.length <= 2) return names.join(' and ')
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
}

export const trainingModel = (state: AppState, today: string, tomorrow: string): TrainingModel => {
  if (state.onboardedAt === null) return { kind: 'empty' }

  const program = state.trainingPrograms.find(p => p.id === state.activeProgramId) ?? null
  const progress = weeklyProgress(state.workoutLog, weeklyGoalFor(program), today)
  const week: WeekDots = {
    done: progress.done,
    goal: progress.goal,
    days: progress.days,
    todayIndex: progress.todayIndex,
  }

  const active = state.workoutLog.find(s => s.id === state.activeWorkoutId) ?? null
  if (active) {
    const setsDone = (active.exercises ?? []).reduce(
      (sum, ex) => sum + (ex.sets ?? []).filter(set => set.completed).length,
      0
    )
    return { kind: 'active', name: active.name, setsDone, week }
  }

  if (!program) return { kind: 'no-plan', week }
  const upNext = resolveUpNext(program, today)
  if (!upNext) return { kind: 'no-plan', week }

  // A session already finished today closes the day even when the plan's cursor has not
  // moved — a workout logged outside the plan still counts as today's training.
  const trainedToday = state.workoutLog.some(s => s.date === today && countsAsWorkout(s))

  if (upNext.status === 'train' && !trainedToday) {
    const names = upNext.day.liftIds
      .map(id => findLiftById(id, state.customLifts)?.name)
      .filter((name): name is string => name !== undefined)
    return {
      kind: 'train',
      label: programDayLabel(upNext.day, upNext.index),
      lifts: liftSummary(names),
      dayId: upNext.day.id,
      week,
    }
  }

  // The next training day after today, however many rest days stand in between.
  const next = projectSchedule(program, today, program.days.length * 2 + 1).find(
    entry => !entry.done && !entry.day.rest && entry.date > today
  )
  return {
    kind: upNext.status === 'rest' ? 'rest' : 'done',
    nextLabel: next ? programDayLabel(next.day, next.index) : null,
    nextWhen: next ? whenLabel(next.date, today, tomorrow) : null,
    week,
  }
}
