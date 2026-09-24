import type { ProgramDay, TrainingProgram } from '../types'

/**
 * Where a repeating program stands on a given date.
 *
 * Pure, so the screens can ask "what is today?" without writing to the store on render.
 * The stored cursor only moves on real events (a day trained or skipped); the one thing
 * that moves by the calendar alone — a rest day being used up — is worked out here.
 */

/** 'YYYY-MM-DD' plus `days`, in local calendar days. */
export const addDays = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number)
  const next = new Date(y, m - 1, d + days)
  const mm = String(next.getMonth() + 1).padStart(2, '0')
  const dd = String(next.getDate()).padStart(2, '0')
  return `${next.getFullYear()}-${mm}-${dd}`
}

export type UpNextStatus =
  /** A training day, due today (or overdue — a cycle waits for you). */
  | 'train'
  /** Today is a rest day. */
  | 'rest'
  /** Today's day is done; `day` is what comes next, from `date`. */
  | 'done'

export interface UpNext {
  status: UpNextStatus
  day: ProgramDay
  index: number
  /** The date `day` is for. */
  date: string
}

/**
 * The day that is up next on `today`.
 *
 * A rest day is used up by the calendar: once its date is behind us, the cursor steps past
 * it. Training days are never skipped by the calendar — missing Tuesday's legs means legs
 * on Wednesday, not no legs this week.
 */
export const resolveUpNext = (program: TrainingProgram, today: string): UpNext | null => {
  const count = program.days.length
  if (count === 0) return null

  let index = ((program.cursor % count) + count) % count
  let date = program.cursorDate

  // Bounded: a program of nothing but rest days must not loop forever.
  for (let step = 0; step < count * 2; step++) {
    const day = program.days[index]
    if (!day.rest || date >= today) break
    index = (index + 1) % count
    date = addDays(date, 1)
  }

  const day = program.days[index]
  if (date > today) return { status: 'done', day, index, date }
  return { status: day.rest ? 'rest' : 'train', day, index, date: today }
}

/** The cursor after `dayIndex` was trained or skipped on `date`: the next day, from tomorrow. */
export const cursorAfter = (
  program: TrainingProgram,
  dayIndex: number,
  date: string
): { cursor: number; cursorDate: string } => ({
  cursor: program.days.length === 0 ? 0 : (dayIndex + 1) % program.days.length,
  cursorDate: addDays(date, 1),
})

export interface ScheduledDay {
  date: string
  day: ProgramDay
  index: number
  /** Already trained today. */
  done: boolean
}

/**
 * The next `count` calendar days as the program would run them if each day is trained on
 * its date. A forecast, not a promise: the cycle waits for a missed day, so the strip simply
 * shifts along the next time it is drawn.
 */
export const projectSchedule = (
  program: TrainingProgram,
  today: string,
  count: number
): ScheduledDay[] => {
  const upNext = resolveUpNext(program, today)
  if (!upNext) return []
  const total = program.days.length
  const out: ScheduledDay[] = []

  let index = upNext.index
  let date = today
  if (upNext.status === 'done') {
    const trained = (upNext.index - 1 + total) % total
    out.push({ date: today, day: program.days[trained], index: trained, done: true })
    date = upNext.date
  }
  while (out.length < count) {
    out.push({ date, day: program.days[index], index, done: false })
    index = (index + 1) % total
    date = addDays(date, 1)
  }
  return out
}
