import { Platform } from 'react-native'
import type { UserProfile, WeightEntry } from '@core/types'
import { getDateString } from '@core/utils/calculations'

/**
 * Android Health Connect: reads step counts and historical bodyweight so the user does
 * not have to retype data their phone already holds.
 *
 * Everything here is defensive by design. Health Connect is Android-only, is absent on
 * older devices, can be present but not installed, and every read requires a permission
 * the user may refuse. None of those are errors worth surfacing as failures — they just
 * mean "no platform data", and the app must work exactly as before.
 *
 * The native module is imported lazily so that iOS, and any Expo Go session without the
 * native code, never touch it.
 */

export type HealthAvailability = 'available' | 'unsupported' | 'not_installed' | 'unavailable'

export interface StepDay {
  /** 'YYYY-MM-DD' local date. */
  date: string
  steps: number
}

const PERMISSIONS = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'Weight' },
  // Height is asked for so setup can prefill it. Health Connect has no record type for age
  // or sex, which is why setup still has to ask for those two by hand.
  { accessType: 'read', recordType: 'Height' },
] as const

/** Health Connect exists only on Android 8+ (API 26). */
const supported = (): boolean => Platform.OS === 'android'

type HealthConnectModule = typeof import('react-native-health-connect')

const loadModule = async (): Promise<HealthConnectModule | null> => {
  if (!supported()) return null
  try {
    return await import('react-native-health-connect')
  } catch {
    // Not linked into this binary — e.g. running in Expo Go.
    return null
  }
}

export const getAvailability = async (): Promise<HealthAvailability> => {
  if (!supported()) return 'unsupported'
  const hc = await loadModule()
  if (!hc) return 'unavailable'
  try {
    const ok = await hc.initialize()
    if (!ok) return 'not_installed'
    const status = await hc.getSdkStatus()
    if (status === hc.SdkAvailabilityStatus.SDK_AVAILABLE) return 'available'
    if (status === hc.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
      return 'not_installed'
    }
    return 'unavailable'
  } catch {
    return 'unavailable'
  }
}

/** Returns true when the user granted both reads. Never throws. */
export const requestPermissions = async (): Promise<boolean> => {
  const hc = await loadModule()
  if (!hc) return false
  try {
    await hc.initialize()
    const granted = await hc.requestPermission([...PERMISSIONS])
    return Array.isArray(granted) && granted.length > 0
  } catch {
    return false
  }
}

export const hasPermissions = async (): Promise<boolean> => {
  const hc = await loadModule()
  if (!hc) return false
  try {
    await hc.initialize()
    const granted = await hc.getGrantedPermissions()
    return Array.isArray(granted) && granted.length > 0
  } catch {
    return false
  }
}

const startOfLocalDay = (d: Date): Date => {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

/**
 * Daily step totals for the last `days` days, oldest first.
 *
 * Health Connect returns individual records, often several per day and sometimes from
 * more than one source, so they are bucketed by local calendar day and summed.
 */
export const readSteps = async (days = 7): Promise<StepDay[]> => {
  const hc = await loadModule()
  if (!hc) return []
  try {
    await hc.initialize()
    const end = new Date()
    const start = startOfLocalDay(new Date(end.getTime() - (days - 1) * 86_400_000))

    const result = await hc.readRecords('Steps', {
      timeRangeFilter: {
        operator: 'between',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    })

    const buckets = new Map<string, number>()
    for (const record of result.records) {
      const at = new Date(record.startTime)
      if (Number.isNaN(at.getTime())) continue
      const key = getDateString(at)
      const count = typeof record.count === 'number' && Number.isFinite(record.count) ? record.count : 0
      buckets.set(key, (buckets.get(key) ?? 0) + count)
    }

    return [...buckets.entries()]
      .map(([date, steps]) => ({ date, steps: Math.round(steps) }))
      .sort((a, b) => a.date.localeCompare(b.date))
  } catch {
    return []
  }
}

/** Today's step total, or null when there is no data or no permission. */
export const readTodaySteps = async (): Promise<number | null> => {
  const today = getDateString(new Date())
  const days = await readSteps(2)
  const match = days.find(d => d.date === today)
  return match ? match.steps : null
}

/** The most recent record in a window, or null. Health Connect returns them unsorted. */
const latestOf = <T>(records: T[], at: (record: T) => string, value: (record: T) => number | undefined): number | null => {
  let best: { at: number; value: number } | null = null
  for (const record of records) {
    const when = new Date(at(record)).getTime()
    const measurement = value(record)
    if (Number.isNaN(when)) continue
    if (typeof measurement !== 'number' || !Number.isFinite(measurement) || measurement <= 0) continue
    if (best === null || when > best.at) best = { at: when, value: measurement }
  }
  return best === null ? null : best.value
}

/**
 * Latest recorded height in centimetres, or null when nothing is on file.
 *
 * Height is the record people are least likely to have: nothing measures it automatically,
 * so it is only there if they typed it into some other app. Null is the normal answer and
 * means "ask them", not "something failed".
 */
export const readLatestHeightCm = async (): Promise<number | null> => {
  const hc = await loadModule()
  if (!hc) return null
  try {
    await hc.initialize()
    const end = new Date()
    const start = new Date(end.getTime() - 3650 * 86_400_000)
    const result = await hc.readRecords('Height', {
      timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() },
    })
    const metres = latestOf(result.records, r => r.time, r => r.height?.inMeters)
    if (metres === null) return null
    const cm = Math.round(metres * 1000) / 10
    // A stray unit on the other side would sail through as a plausible number otherwise.
    return cm >= 120 && cm <= 230 ? cm : null
  } catch {
    return null
  }
}

/** Latest recorded bodyweight in kilograms, or null. */
export const readLatestWeightKg = async (): Promise<number | null> => {
  const hc = await loadModule()
  if (!hc) return null
  try {
    await hc.initialize()
    const end = new Date()
    const start = new Date(end.getTime() - 365 * 86_400_000)
    const result = await hc.readRecords('Weight', {
      timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() },
    })
    const kg = latestOf(result.records, r => r.time, r => r.weight?.inKilograms)
    if (kg === null) return null
    return kg >= 30 && kg <= 300 ? Math.round(kg * 10) / 10 : null
  } catch {
    return null
  }
}

/**
 * Historical bodyweight, converted into the app's own WeightEntry shape.
 *
 * Health Connect stores mass in kilograms. `WeightEntry.weight` is in the user's DISPLAY
 * unit, so it is converted here — writing a kilogram value into a pounds profile would
 * silently corrupt every trend, TDEE estimate and goal calculation downstream.
 *
 * At most one entry per day is kept (the last of that day), matching how the app's own
 * weight log behaves.
 */
export const readWeightHistory = async (
  profile: UserProfile,
  days = 365,
): Promise<Omit<WeightEntry, 'id'>[]> => {
  const hc = await loadModule()
  if (!hc) return []
  try {
    await hc.initialize()
    const end = new Date()
    const start = startOfLocalDay(new Date(end.getTime() - days * 86_400_000))

    const result = await hc.readRecords('Weight', {
      timeRangeFilter: {
        operator: 'between',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    })

    const perDay = new Map<string, { at: number; kg: number }>()
    for (const record of result.records) {
      const at = new Date(record.time)
      if (Number.isNaN(at.getTime())) continue
      const kg = record.weight?.inKilograms
      if (typeof kg !== 'number' || !Number.isFinite(kg) || kg <= 0) continue
      const key = getDateString(at)
      const existing = perDay.get(key)
      if (!existing || at.getTime() > existing.at) perDay.set(key, { at: at.getTime(), kg })
    }

    const toDisplay = (kg: number): number =>
      profile.weightUnit === 'lbs' ? kg * 2.20462 : kg

    return [...perDay.entries()]
      .map(([date, { kg }]) => ({
        date,
        weight: Math.round(toDisplay(kg) * 10) / 10,
        notes: 'Imported from Health Connect',
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  } catch {
    return []
  }
}
