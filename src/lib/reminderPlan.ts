import type { DiaryDay, MacroGoals, TrainingProgram, WeightEntry, WorkoutSession } from '@core/types'
import { getDayNutrition } from '@core/utils/calculations'
import { addDays, projectSchedule } from '@core/utils/trainingProgram'
import {
  countsAsWorkout,
  previousComparable,
  summarize,
  weekStartOf,
  weeklyGoalFor,
  weeklyProgress,
} from '@core/utils/trainingStats'
import type { NotificationPrefs } from '@/store/notificationPrefs'
import { formatNumber } from './formatNumber'
import { lastWeekRecap, recapLine } from './activityFeed'

/**
 * Every reminder that should exist over the next week, worked out from the app's own data.
 *
 * Pure on purpose: given the same diary, log and settings it returns the same plan, so the
 * rules can be reasoned about (and tested) without a phone. The scheduler replaces whatever
 * is pending with this plan every time the data changes — which is what makes each reminder
 * disappear the moment it stops being true. Log lunch, and lunch's nudge is gone.
 */

export type ReminderKind =
  | 'training'
  | 'streak'
  | 'weigh-in'
  | 'meal'
  | 'evening'
  | 'water'
  | 'recap'

export interface PlannedReminder {
  id: string
  kind: ReminderKind
  at: Date
  title: string
  body: string
  url: string
  sound: 'reminder.wav' | 'water.wav'
}

export interface PlanInput {
  now: Date
  today: string
  diary: Record<string, DiaryDay>
  goals: MacroGoals
  weightLog: WeightEntry[]
  workoutLog: WorkoutSession[]
  activeWorkoutId: string | null
  program: TrainingProgram | null
  weightUnit: 'kg' | 'lbs'
  prefs: NotificationPrefs
}

const HORIZON_DAYS = 7
/** Nothing between 22:00 and 07:00. A reminder that wakes someone up gets the app muted. */
const QUIET_START = 22
const QUIET_END = 7
/** At most this many reminders on any one day, highest priority first. */
export const DAILY_CAP = 4

/** Earlier in this list wins when a day is over the cap. */
const PRIORITY: ReminderKind[] = ['training', 'streak', 'recap', 'weigh-in', 'meal', 'evening', 'water']

const at = (date: string, time: string): Date => {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm, 0, 0)
}

const inQuietHours = (when: Date): boolean =>
  when.getHours() >= QUIET_START || when.getHours() < QUIET_END

const WATER_TIMES = ['11:00', '15:00', '19:00']
const MEALS: { meal: 'Breakfast' | 'Lunch' | 'Dinner'; key: keyof NotificationPrefs }[] = [
  { meal: 'Breakfast', key: 'breakfastTime' },
  { meal: 'Lunch', key: 'lunchTime' },
  { meal: 'Dinner', key: 'dinnerTime' },
]

export const planReminders = (input: PlanInput): PlannedReminder[] => {
  const { now, today, diary, goals, weightLog, workoutLog, program, prefs } = input
  const out: PlannedReminder[] = []
  const add = (reminder: PlannedReminder) => {
    if (reminder.at.getTime() <= now.getTime() + 60_000) return
    if (inQuietHours(reminder.at)) return
    out.push(reminder)
  }

  const trainedToday = workoutLog.some(s => s.date === today && countsAsWorkout(s))
  const dates = Array.from({ length: HORIZON_DAYS }, (_, i) => addDays(today, i))

  // --- Training day: the plan's day, with last time's numbers to beat ---------------------
  if (prefs.trainingDay && program && program.days.length > 0) {
    for (const entry of projectSchedule(program, today, HORIZON_DAYS)) {
      if (entry.done || entry.day.rest) continue
      if (entry.date === today && (trainedToday || input.activeWorkoutId !== null)) continue
      const last = previousComparable(
        {
          id: '',
          date: entry.date,
          name: entry.day.name,
          startedAt: Date.now(),
          exercises: [],
          programDayId: entry.day.id,
        },
        workoutLog
      )
      const stats = last ? summarize(last) : null
      const volume =
        stats && stats.volumeKg > 0
          ? `${formatNumber(input.weightUnit === 'lbs' ? stats.volumeKg * 2.20462 : stats.volumeKg)} ${input.weightUnit}`
          : null
      add({
        id: `rem:training:${entry.date}`,
        kind: 'training',
        at: at(entry.date, prefs.trainingDayTime),
        title: `${entry.day.name} is up`,
        body:
          stats && volume
            ? `Last time: ${volume} in ${Math.max(1, Math.round(stats.durationMs / 60000))} min. Beat it.`
            : 'Your plan has it on for today. Tap to start.',
        url: '/training',
        sound: 'reminder.wav',
      })
    }
  }

  // --- Streak at risk: exactly one workout short, with the weekend left ---------------------
  if (prefs.streakRisk && workoutLog.some(countsAsWorkout)) {
    const week = weeklyProgress(workoutLog, weeklyGoalFor(program), today)
    if (week.done < week.goal && week.goal - week.done === 1) {
      const monday = weekStartOf(today)
      const saturday = addDays(monday, 5)
      const sunday = addDays(monday, 6)
      const when = today <= saturday ? at(saturday, '17:00') : at(sunday, '16:00')
      add({
        id: `rem:streak:${monday}`,
        kind: 'streak',
        at: when,
        title: 'One more workout this week',
        body:
          week.streakWeeks > 0
            ? `It keeps your ${week.streakWeeks}-week streak going.`
            : 'It hits your weekly goal.',
        url: '/training',
        sound: 'reminder.wav',
      })
    }
  }

  // --- Weekly recap: Monday morning, once a week -------------------------------------------
  if (prefs.weeklyRecap) {
    const monday = weekStartOf(today)
    const next = today === monday ? monday : addDays(monday, 7)
    // Only this Monday's is known now; next week's body is written when that week is over, by
    // the reconcile that runs when the app is next opened — until then a plain line stands in.
    const recap = next === today ? lastWeekRecap({ ...input, program }) : null
    if (next !== today || recap !== null) {
      add({
        id: `rem:recap:${next}`,
        kind: 'recap',
        at: at(next, '09:00'),
        title: 'Your week in review',
        body: recap ? recapLine(recap, input.weightUnit) : 'See how last week went: workouts, food and weight.',
        url: '/activity',
        sound: 'reminder.wav',
      })
    }
  }

  for (const date of dates) {
    const day = diary[date]

    // --- Weigh-in: only on a day without one ----------------------------------------------
    if (prefs.weighIn && !weightLog.some(entry => entry.date === date)) {
      add({
        id: `rem:weigh-in:${date}`,
        kind: 'weigh-in',
        at: at(date, prefs.weighInTime),
        title: 'Morning weigh-in',
        body: 'Before breakfast is the most consistent reading. The trend line needs it.',
        url: '/weigh-in',
        sound: 'reminder.wav',
      })
    }

    // --- Meals: only a meal that is still empty ---------------------------------------------
    if (prefs.meals) {
      for (const { meal, key } of MEALS) {
        if (day?.entries.some(entry => entry.mealType === meal)) continue
        add({
          id: `rem:meal:${meal}:${date}`,
          kind: 'meal',
          at: at(date, prefs[key] as string),
          title: `${meal} not logged yet`,
          body: 'Snap a photo or search for it. It takes ten seconds.',
          url: `/food-search?meal=${meal}&date=${date}`,
          sound: 'reminder.wav',
        })
      }
    }

    // --- Evening check: today's real numbers, or nothing if the day is on target -----------
    if (prefs.eveningCheck) {
      let body = 'See how today stacks up against your targets.'
      let onTarget = false
      if (date === today) {
        const n = day ? getDayNutrition(day) : null
        onTarget =
          n !== null &&
          Math.abs(n.calories - goals.calories) <= goals.calories * 0.1 &&
          n.protein >= goals.protein * 0.9
        body =
          n === null || day?.entries.length === 0
            ? 'Nothing logged today yet. A quick log keeps the week honest.'
            : `${formatNumber(n.calories)} of ${formatNumber(goals.calories)} kcal · protein ${Math.round(n.protein)}/${goals.protein} g`
      }
      if (!onTarget) add({
        id: `rem:evening:${date}`,
        kind: 'evening',
        at: at(date, prefs.eveningCheckTime),
        title: 'How today went',
        body,
        url: `/diary?date=${date}`,
        sound: 'reminder.wav',
      })
    }

    // --- Water: only when behind the pace the goal needs -----------------------------------
    if (prefs.water && goals.water > 0) {
      for (const time of WATER_TIMES) {
        const when = at(date, time)
        // The goal spread across the waking day, 07:00 to 21:00.
        const expected = Math.round(
          goals.water * Math.min(1, Math.max(0, (when.getHours() - 7) / 14))
        )
        const intake = day?.waterIntake ?? 0
        if (date === today && intake >= expected * 0.8) continue
        add({
          id: `rem:water:${time}:${date}`,
          kind: 'water',
          at: when,
          title: 'Time for some water',
          body:
            date === today
              ? `${formatNumber(intake)} ml so far. About ${formatNumber(expected)} by now keeps you on track.`
              : 'A glass now keeps you on pace for the day.',
          url: '/(tabs)',
          sound: 'water.wav',
        })
      }
    }
  }

  // --- Daily cap ------------------------------------------------------------------------------
  const byDay = new Map<string, PlannedReminder[]>()
  for (const reminder of out) {
    const key = reminder.at.toDateString()
    byDay.set(key, [...(byDay.get(key) ?? []), reminder])
  }
  const kept: PlannedReminder[] = []
  for (const reminders of byDay.values()) {
    reminders
      .sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind) || a.at.getTime() - b.at.getTime())
      .slice(0, DAILY_CAP)
      .forEach(reminder => kept.push(reminder))
  }
  return kept.sort((a, b) => a.at.getTime() - b.at.getTime())
}
