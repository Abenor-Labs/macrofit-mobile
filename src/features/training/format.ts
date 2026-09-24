import type { UserProfile, WorkoutSession } from '@core/types'

// ---------------------------------------------------------------------------
// Units
//
// WorkoutSet.weightKg is ALWAYS kilograms. These two functions are the only
// boundary; nothing else in Training touches a weight without going through
// them. `toKg` deliberately does NOT use lbsToKg from calculations.ts, which
// rounds to one decimal: 225 lb would land on 102.1 kg and read back as
// "225.1 lb" — a number the user never typed. Three decimals round-trips every
// practical plate weight exactly.
// ---------------------------------------------------------------------------

export type WeightUnit = UserProfile['weightUnit']

const LBS_PER_KG = 2.20462

export const weightUnitLabel = (unit: WeightUnit): string => (unit === 'lbs' ? 'lbs' : 'kg')

/** kg -> the user's unit. Display boundary only — never written back to state. */
export const fromKg = (kg: number, unit: WeightUnit): number =>
  unit === 'lbs' ? Math.round(kg * LBS_PER_KG * 10) / 10 : Math.round(kg * 10) / 10

/** The user's unit -> kg. Everything written to weightKg goes through here. */
export const toKg = (value: number, unit: WeightUnit): number =>
  unit === 'lbs' ? Math.round((value / LBS_PER_KG) * 1000) / 1000 : Math.round(value * 10) / 10

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Thousands separators without depending on Intl being present in the JS engine. */
export const groupDigits = (value: number): string =>
  String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

const pad = (value: number): string => String(value).padStart(2, '0')

/** H:MM:SS once past an hour, MM:SS before it. */
export const formatElapsed = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`
}

/** null while the session is still open — the caller renders words, not a figure. */
export const formatDuration = (session: WorkoutSession): string | null => {
  if (session.endedAt === undefined) return null
  const minutes = Math.max(0, Math.round((session.endedAt - session.startedAt) / 60000))
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export const defaultWorkoutName = (): string => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Morning workout'
  if (hour < 17) return 'Afternoon workout'
  return 'Evening workout'
}

export const parseNumber = (text: string): number | null => {
  const cleaned = text.replace(',', '.').trim()
  if (cleaned === '') return null
  const value = Number(cleaned)
  return Number.isFinite(value) && value >= 0 ? value : null
}

export const weightToText = (weightKg: number, unit: WeightUnit): string =>
  weightKg > 0 ? String(fromKg(weightKg, unit)) : ''

