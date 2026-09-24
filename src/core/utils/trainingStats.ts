import type { TrainingProgram, WorkoutSession } from '../types'
import { epley1RM, getPersonalRecords, sessionSetCount, sessionVolume } from './workoutMath'
import { addDays } from './trainingProgram'

/**
 * The numbers that make someone come back: this week against a goal, how many weeks in a row
 * they have kept it, how today compared with last time, and what was a first.
 *
 * WHY A WEEK STREAK AND NOT A DAY STREAK:
 * A daily streak punishes rest days, which a training plan has on purpose — the app would be
 * telling someone who followed their plan perfectly that they broke their streak on Sunday.
 * Hevy and Strava both count weeks for this reason.
 */

/** A session that logged real work. An opened-and-abandoned session is not a workout. */
export const countsAsWorkout = (session: WorkoutSession): boolean =>
  session.endedAt !== undefined &&
  (session.exercises ?? []).some(ex => (ex.sets ?? []).some(set => set.completed))

/** The Monday on or before `date`, as 'YYYY-MM-DD'. */
export const weekStartOf = (date: string): string => {
  const [y, m, d] = date.split('-').map(Number)
  const weekday = new Date(y, m - 1, d).getDay() // 0 = Sunday
  return addDays(date, -((weekday + 6) % 7))
}

/**
 * Workouts a week the active plan asks for: its training days, spread over seven days.
 * Push / Pull / Legs / Rest is 3 in 4 days, which is 5 a week; clamped to 2–6 so a plan of
 * nothing but training days does not ask for a workout every single day.
 */
export const weeklyGoalFor = (program: TrainingProgram | null): number => {
  if (!program || program.days.length === 0) return 3
  const training = program.days.filter(day => !day.rest).length
  return Math.min(6, Math.max(2, Math.round((training * 7) / program.days.length)))
}

export interface WeeklyProgress {
  goal: number
  /** Distinct days trained this week. */
  done: number
  /** Monday to Sunday: was there a workout on that day. */
  days: boolean[]
  /** Index 0–6 of today in `days`. */
  todayIndex: number
  /**
   * Weeks in a row the goal was met. This week counts once it is met; until then it does not
   * break anything — the week is not over.
   */
  streakWeeks: number
}

export const weeklyProgress = (
  workoutLog: WorkoutSession[],
  goal: number,
  today: string
): WeeklyProgress => {
  const trainedDates = new Set(workoutLog.filter(countsAsWorkout).map(session => session.date))
  const monday = weekStartOf(today)

  const days = Array.from({ length: 7 }, (_, i) => trainedDates.has(addDays(monday, i)))
  const todayIndex = Math.round(
    (new Date(`${today}T12:00:00`).getTime() - new Date(`${monday}T12:00:00`).getTime()) /
      86_400_000
  )
  const done = days.filter(Boolean).length

  const metIn = (weekStart: string): boolean => {
    let count = 0
    for (let i = 0; i < 7; i++) if (trainedDates.has(addDays(weekStart, i))) count++
    return count >= goal
  }

  let streakWeeks = done >= goal ? 1 : 0
  // Bounded at five years of weeks; nobody's log needs more and it keeps this O(1)-ish.
  for (let week = 1; week < 260; week++) {
    if (!metIn(addDays(monday, -7 * week))) break
    streakWeeks++
  }

  return { goal, done, days, todayIndex, streakWeeks }
}

/** The most recent earlier finished session of the same program day, else of the same name. */
export const previousComparable = (
  session: WorkoutSession,
  workoutLog: WorkoutSession[]
): WorkoutSession | null =>
  workoutLog
    .filter(
      other =>
        other.id !== session.id &&
        other.startedAt < session.startedAt &&
        countsAsWorkout(other) &&
        (session.programDayId
          ? other.programDayId === session.programDayId
          : other.name.trim().toLowerCase() === session.name.trim().toLowerCase())
    )
    .sort((a, b) => b.startedAt - a.startedAt)[0] ?? null

export interface SessionPR {
  liftName: string
  weightKg: number
  reps: number
}

/**
 * Sets in `session` that beat the lift's best estimated 1RM from every earlier session.
 * A lift's first ever session sets a baseline rather than a record — otherwise every new
 * exercise would announce a PR and the word would stop meaning anything.
 */
export const sessionPRs = (session: WorkoutSession, workoutLog: WorkoutSession[]): SessionPR[] => {
  const prior = new Map(
    getPersonalRecords(workoutLog.filter(other => other.startedAt < session.startedAt)).map(
      record => [record.liftId, record.bestEstimated1RM]
    )
  )
  const out: SessionPR[] = []
  for (const exercise of session.exercises ?? []) {
    const best = prior.get(exercise.liftId)
    if (best === undefined) continue
    let winner: { weightKg: number; reps: number; oneRM: number } | null = null
    for (const set of exercise.sets ?? []) {
      if (!set.completed || set.isWarmup || set.weightKg <= 0 || set.reps <= 0) continue
      const oneRM = epley1RM(set.weightKg, set.reps)
      if (oneRM > best && (winner === null || oneRM > winner.oneRM)) {
        winner = { weightKg: set.weightKg, reps: set.reps, oneRM }
      }
    }
    if (winner) out.push({ liftName: exercise.lift.name, weightKg: winner.weightKg, reps: winner.reps })
  }
  return out
}

const MILESTONES = [1, 5, 10, 25, 50, 75, 100, 150, 200, 250, 300, 365, 500, 750, 1000]

/** "Your 10th workout" when this session's number lands on a milestone, else null. */
export const workoutMilestone = (
  session: WorkoutSession,
  workoutLog: WorkoutSession[]
): number | null => {
  const number = workoutLog.filter(
    other => countsAsWorkout(other) && other.startedAt <= session.startedAt
  ).length
  return MILESTONES.includes(number) ? number : null
}

export const ordinal = (n: number): string => {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

export interface SessionSummary {
  durationMs: number
  volumeKg: number
  sets: number
}

export const summarize = (session: WorkoutSession): SessionSummary => ({
  durationMs: Math.max(0, (session.endedAt ?? Date.now()) - session.startedAt),
  volumeKg: sessionVolume(session),
  sets: sessionSetCount(session),
})
