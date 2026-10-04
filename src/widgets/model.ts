import type { AppState } from '@core/store/appState'
import { getDayNutrition } from '@core/utils/calculations'
import { projectSchedule, resolveUpNext } from '@core/utils/trainingProgram'
import type { WorkoutSession } from '@core/types'
import { countsAsWorkout, sessionPRs, summarize, weeklyGoalFor, weeklyProgress } from '@core/utils/trainingStats'
import { programDayLabel } from '@/lib/programDayLabel'
import { findLiftById } from '@/features/training/liftNames'
import { fromKg, groupDigits, weightUnitLabel, type WeightUnit } from '@/features/training/format'

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

/*
  The MacroFit widget: food and training on one card.

  It shows one half at a time. `home` is the half the moment calls for; a tap on the other
  half's button shows that half instead for a while (see half.ts), then the card comes back.
*/

export type Half = 'food' | 'train'

/** A lift in the plan, with the heaviest set from the last time it was done. */
export interface PlanLift {
  name: string
  last: string | null
}

export type TrainFace =
  | { kind: 'no-plan'; week: WeekDots }
  | { kind: 'plan'; label: string; dayId: string; lifts: PlanLift[]; week: WeekDots }
  | {
      kind: 'live'
      name: string
      /** The lift with the next open set; null once every set is ticked. */
      lift: string | null
      setNo: number
      liftSets: number
      /**
       * The next set's weight and reps as the app shows them: its own numbers, or the set above
       * it when it has none yet (the app shows those as the placeholder), or last time's top set.
       */
      prefill: string | null
      done: number
      total: number
      lifts: number
      minutes: number
    }
  | { kind: 'done'; name: string; sets: number; volume: string | null; pr: string | null; next: string | null; week: WeekDots }
  | { kind: 'rest'; next: string | null; week: WeekDots }

export type OneModel =
  | { kind: 'empty' }
  | {
      kind: 'day'
      home: Half
      food: Extract<TodayModel, { kind: 'day' }>
      /** Protein still to eat, while a workout finished under two hours ago. */
      afterWorkout: number | null
      train: TrainFace
    }

/** Training is the card's face from this hour on a day a session is due. */
export const TRAIN_FROM_HOUR = 15
/** How long after a workout the card asks for protein. */
const AFTER_WORKOUT_MS = 2 * 60 * 60 * 1000

const loadLabel = (kg: number, reps: number, unit: WeightUnit): string =>
  kg > 0 ? `${fromKg(kg, unit)} ${weightUnitLabel(unit)} × ${reps}` : `${reps} reps`

/** The heaviest working set of a lift in its most recent finished session. */
const lastTopSet = (liftId: string, log: WorkoutSession[], unit: WeightUnit): string | null => {
  const sessions = log.filter(s => s.endedAt !== undefined).sort((a, b) => b.startedAt - a.startedAt)
  for (const session of sessions) {
    const sets = (session.exercises ?? [])
      .filter(ex => ex.liftId === liftId)
      .flatMap(ex => ex.sets ?? [])
      .filter(set => set.completed && !set.isWarmup && set.reps > 0)
    if (sets.length === 0) continue
    const top = sets.reduce((best, set) =>
      set.weightKg > best.weightKg || (set.weightKg === best.weightKg && set.reps > best.reps) ? set : best
    )
    return loadLabel(top.weightKg, top.reps, unit)
  }
  return null
}

export const oneModel = (state: AppState, today: string, tomorrow: string, now: Date): OneModel => {
  const food = todayModel(state, today)
  const training = trainingModel(state, today, tomorrow)
  if (food.kind === 'empty' || training.kind === 'empty') return { kind: 'empty' }
  const unit = state.profile.weightUnit

  let train: TrainFace
  switch (training.kind) {
    case 'no-plan':
      train = { kind: 'no-plan', week: training.week }
      break
    case 'active': {
      const session = state.workoutLog.find(s => s.id === state.activeWorkoutId)
      const exercises = session?.exercises ?? []
      const sets = exercises.flatMap(ex => ex.sets ?? [])
      // The first lift with a set still open, or failing that one with no sets yet: a session
      // just started from the plan holds its lifts before any set is added.
      const current =
        exercises.find(ex => (ex.sets ?? []).some(set => !set.completed)) ??
        exercises.find(ex => (ex.sets ?? []).length === 0) ??
        null
      const open = current ? (current.sets ?? []).findIndex(set => !set.completed) : -1
      const next = current && open >= 0 ? current.sets[open] : null
      const filled = (set: { weightKg: number; reps: number } | undefined) =>
        set && (set.weightKg > 0 || set.reps > 0) ? loadLabel(set.weightKg, set.reps, unit) : null
      const prefill =
        current && next
          ? filled(next) ??
            filled([...current.sets.slice(0, open)].reverse().find(set => set.weightKg > 0 || set.reps > 0)) ??
            lastTopSet(current.liftId, state.workoutLog, unit)
          : null
      train = {
        kind: 'live',
        name: training.name,
        lift: current?.lift.name ?? null,
        setNo: open >= 0 ? open + 1 : 1,
        liftSets: current?.sets?.length ?? 0,
        prefill,
        done: sets.filter(set => set.completed).length,
        total: sets.length,
        lifts: exercises.length,
        minutes: session ? Math.max(0, Math.round((now.getTime() - session.startedAt) / 60000)) : 0,
      }
      break
    }
    case 'train': {
      const program = state.trainingPrograms.find(p => p.id === state.activeProgramId)
      const day = program?.days.find(d => d.id === training.dayId)
      const lifts = (day?.liftIds ?? [])
        .map(id => {
          const lift = findLiftById(id, state.customLifts)
          return lift ? { name: lift.name, last: lastTopSet(id, state.workoutLog, unit) } : null
        })
        .filter((lift): lift is PlanLift => lift !== null)
      train = { kind: 'plan', label: training.label, dayId: training.dayId, lifts, week: training.week }
      break
    }
    case 'done': {
      const session = state.workoutLog
        .filter(s => s.date === today && s.endedAt !== undefined && countsAsWorkout(s))
        .sort((a, b) => b.startedAt - a.startedAt)[0]
      const summary = session ? summarize(session) : null
      const pr = session ? sessionPRs(session, state.workoutLog)[0] : undefined
      train = {
        kind: 'done',
        name: session?.name ?? 'Done for today',
        sets: summary?.sets ?? 0,
        volume: summary && summary.volumeKg > 0 ? `${groupDigits(fromKg(summary.volumeKg, unit))} ${weightUnitLabel(unit)}` : null,
        pr: pr ? `${pr.liftName} ${loadLabel(pr.weightKg, pr.reps, unit)}` : null,
        next: training.nextLabel && training.nextWhen ? `${training.nextLabel}, ${training.nextWhen}` : null,
        week: training.week,
      }
      break
    }
    case 'rest':
      train = {
        kind: 'rest',
        next: training.nextLabel && training.nextWhen ? `${training.nextLabel}, ${training.nextWhen}` : null,
        week: training.week,
      }
      break
  }

  const protein = food.macros.find(m => m.key === 'Protein')
  const proteinLeft = protein ? Math.max(0, Math.round(protein.goal - protein.grams)) : 0
  const justTrained = state.workoutLog.some(
    s => s.date === today && s.endedAt !== undefined && now.getTime() - s.endedAt < AFTER_WORKOUT_MS && countsAsWorkout(s)
  )
  const afterWorkout = justTrained && proteinLeft > 0 ? proteinLeft : null

  const home: Half =
    train.kind === 'live' || (train.kind === 'plan' && now.getHours() >= TRAIN_FROM_HOUR) ? 'train' : 'food'

  return { kind: 'day', home, food, afterWorkout, train }
}
