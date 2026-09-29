import type { DiaryDay, MacroGoals, Recommendation, TrainingProgram, WeightEntry, WorkoutSession } from '@core/types'
import { getDayNutrition } from '@core/utils/calculations'
import { addDays } from '@core/utils/trainingProgram'
import {
  countsAsWorkout,
  ordinal,
  sessionPRs,
  weekStartOf,
  weeklyGoalFor,
  weeklyProgress,
  workoutMilestone,
} from '@core/utils/trainingStats'
import { formatNumber } from './formatNumber'

/**
 * The things worth telling someone about, derived from what they have already logged.
 *
 * Nothing here is stored: a PR is a PR because the log says so, a milestone is the tenth
 * finished workout because there are ten. Deriving it means the feed can never disagree with
 * the data, needs no sync field, and fills itself for someone who has been training for months
 * before this screen existed. The only state kept is "seen up to", per device.
 */

export type FeedKind = 'pr' | 'milestone' | 'goal' | 'coach' | 'recap'

export interface FeedItem {
  id: string
  kind: FeedKind
  /** When it happened, ms. */
  at: number
  title: string
  body: string
  url: string
}

export interface FeedInput {
  now: number
  today: string
  workoutLog: WorkoutSession[]
  diary: Record<string, DiaryDay>
  goals: MacroGoals
  weightLog: WeightEntry[]
  recommendation: Recommendation | null
  program: TrainingProgram | null
  weightUnit: 'kg' | 'lbs'
}

const DAY_MS = 86_400_000
/** Old news stops being news. */
const WINDOW_DAYS = 45

const toDisplay = (kg: number, unit: 'kg' | 'lbs'): string =>
  `${Math.round((unit === 'lbs' ? kg * 2.20462 : kg) * 10) / 10} ${unit}`

const noonOf = (date: string): number => new Date(`${date}T12:00:00`).getTime()

// --- Weekly recap --------------------------------------------------------------------------

export interface WeeklyRecap {
  /** Monday of the week being summarised. */
  weekStart: string
  workouts: number
  goal: number
  /** Average kcal over days with food logged, or null when nothing was logged. */
  avgCalories: number | null
  loggedDays: number
  proteinDaysHit: number
  /** Last weigh-in of the week minus the first, in the log's unit, or null. */
  weightChange: number | null
}

/** Last week in numbers — the Monday card and the Monday notification both read this. */
export const lastWeekRecap = (input: Omit<FeedInput, 'recommendation' | 'now'>): WeeklyRecap | null => {
  const weekStart = addDays(weekStartOf(input.today), -7)
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const workouts = new Set(
    input.workoutLog
      .filter(s => countsAsWorkout(s) && dates.includes(s.date))
      .map(s => s.date)
  ).size

  const logged = dates
    .map(date => input.diary[date])
    .filter((day): day is DiaryDay => day !== undefined && day.entries.length > 0)
  const nutrition = logged.map(getDayNutrition)

  const weighIns = input.weightLog
    .filter(entry => dates.includes(entry.date))
    .sort((a, b) => a.date.localeCompare(b.date))

  if (workouts === 0 && logged.length === 0 && weighIns.length === 0) return null

  return {
    weekStart,
    workouts,
    goal: weeklyGoalFor(input.program),
    avgCalories:
      nutrition.length > 0
        ? Math.round(nutrition.reduce((sum, n) => sum + n.calories, 0) / nutrition.length)
        : null,
    loggedDays: logged.length,
    proteinDaysHit: nutrition.filter(n => n.protein >= input.goals.protein * 0.9).length,
    weightChange:
      weighIns.length >= 2
        ? Math.round((weighIns[weighIns.length - 1].weight - weighIns[0].weight) * 10) / 10
        : null,
  }
}

/** One line for a notification or a feed row. */
export const recapLine = (recap: WeeklyRecap, unit: 'kg' | 'lbs'): string => {
  const parts = [`${recap.workouts} of ${recap.goal} workouts`]
  if (recap.avgCalories !== null) parts.push(`${formatNumber(recap.avgCalories)} kcal/day`)
  if (recap.weightChange !== null) {
    const sign = recap.weightChange > 0 ? '+' : recap.weightChange < 0 ? '−' : '±'
    parts.push(`${sign}${Math.abs(recap.weightChange)} ${unit}`)
  }
  return parts.join(' · ')
}

// --- Feed ---------------------------------------------------------------------------------

export const buildFeed = (input: FeedInput): FeedItem[] => {
  const since = input.now - WINDOW_DAYS * DAY_MS
  const items: FeedItem[] = []
  const finished = input.workoutLog.filter(countsAsWorkout)

  for (const session of finished) {
    const at = session.endedAt ?? session.startedAt
    if (at < since) continue

    for (const pr of sessionPRs(session, input.workoutLog)) {
      items.push({
        id: `pr:${session.id}:${pr.liftName}`,
        kind: 'pr',
        at,
        title: `New PR · ${pr.liftName}`,
        body: `${toDisplay(pr.weightKg, input.weightUnit)} × ${pr.reps}, in ${session.name}`,
        url: '/training/records',
      })
    }

    const milestone = workoutMilestone(session, input.workoutLog)
    if (milestone !== null) {
      items.push({
        id: `milestone:${session.id}`,
        kind: 'milestone',
        at: at + 1,
        title: milestone === 1 ? 'Your first workout' : `Your ${ordinal(milestone)} workout`,
        body: milestone === 1 ? 'The hardest one to start.' : 'That is a habit now, not an attempt.',
        url: '/training/history',
      })
    }
  }

  // Weekly goal hit, for each of the last six weeks it was met (this week included).
  const goal = weeklyGoalFor(input.program)
  for (let back = 0; back < 6; back++) {
    const weekStart = addDays(weekStartOf(input.today), -7 * back)
    const reference = back === 0 ? input.today : addDays(weekStart, 6)
    const week = weeklyProgress(input.workoutLog, goal, reference)
    if (week.done < week.goal) continue
    // Dated to the workout that hit it. The goal counts distinct days, so the day that hit it is the goal-th distinct date —
    // two sessions on one day must not date the item a workout early.
    const firstPerDay = new Map<string, WorkoutSession>()
    for (const s of finished
      .filter(s => s.date >= weekStart && s.date <= addDays(weekStart, 6))
      .sort((a, b) => a.startedAt - b.startedAt)) {
      if (!firstPerDay.has(s.date)) firstPerDay.set(s.date, s)
    }
    const hitOn = [...firstPerDay.values()][week.goal - 1]
    if (!hitOn) continue
    const at = (hitOn.endedAt ?? hitOn.startedAt) + 2
    if (at < since) continue
    items.push({
      id: `goal:${weekStart}`,
      kind: 'goal',
      at,
      title: 'Weekly goal hit',
      body:
        week.streakWeeks > 1
          ? `${week.goal} workouts, and a ${week.streakWeeks}-week streak.`
          : `${week.goal} workouts this week.`,
      url: '/training',
    })
  }

  if (input.recommendation && input.recommendation.createdAt >= since) {
    const rec = input.recommendation
    items.push({
      id: `coach:${rec.id}`,
      kind: 'coach',
      at: rec.createdAt,
      title: 'Coach plan updated',
      body: `${rec.headline} · ${formatNumber(rec.calories)} kcal/day`,
      url: '/goals',
    })
  }

  const recap = lastWeekRecap(input)
  if (recap) {
    items.push({
      id: `recap:${recap.weekStart}`,
      kind: 'recap',
      // Monday morning of this week.
      at: noonOf(addDays(recap.weekStart, 7)) - 3 * 3600_000,
      title: 'Your week in review',
      body: recapLine(recap, input.weightUnit),
      url: '/progress',
    })
  }

  return items.filter(item => item.at <= input.now).sort((a, b) => b.at - a.at)
}
