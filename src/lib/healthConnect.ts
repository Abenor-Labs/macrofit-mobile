import { Linking, Platform } from 'react-native'
import type { UserProfile, WeightEntry } from '@core/types'
import { getDateString } from '@core/utils/calculations'
import { healthRuntimePermissions } from './healthPermissions'

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

/** The Health Connect provider, as it is listed on the Play Store. */
const PROVIDER_PACKAGE = 'com.google.android.apps.healthdata'

export interface StepDay {
  /** 'YYYY-MM-DD' local date. */
  date: string
  steps: number
}

/*
  Derived from the same list the manifest is generated from, so a read can never be requested
  that AndroidManifest.xml does not declare — that combination fails inside the Health Connect
  permission Activity, below the bridge, where the try/catch below cannot reach it.
*/
const PERMISSIONS = healthRuntimePermissions()

/**
 * What the user actually granted, permission by permission.
 *
 * WHY THIS IS NOT A BOOLEAN:
 * `requestPermissions` and `hasPermissions` both used to return `granted.length > 0`. Health
 * Connect presents each permission as its own switch, so a user who allowed weight and refused
 * steps — a completely ordinary thing to do — satisfied that test. The app reported
 * "Connected", `readSteps` returned an empty array forever, and the dashboard showed a step
 * goal next to a permanent zero with nothing anywhere explaining why.
 *
 * Every field is answered independently because every one of them can be.
 */
export interface HealthGrants {
  readSteps: boolean
  readWeight: boolean
  readHeight: boolean
  /** Lets a weight logged here reach Health Connect, and through it Google Fit. */
  writeWeight: boolean
  /** Android 14+: without this, every read is capped at the last 30 days. */
  readHistory: boolean
}

const NO_GRANTS: HealthGrants = {
  readSteps: false,
  readWeight: false,
  readHeight: false,
  writeWeight: false,
  readHistory: false,
}

/** True when everything the app needs to function is granted. History is a bonus, not a need. */
export const isFullyGranted = (grants: HealthGrants): boolean =>
  grants.readSteps && grants.readWeight && grants.readHeight && grants.writeWeight

/** True when nothing at all was granted, which is a refusal rather than a partial answer. */
export const isFullyDenied = (grants: HealthGrants): boolean =>
  !grants.readSteps && !grants.readWeight && !grants.readHeight && !grants.writeWeight

/** Names the missing pieces, for a UI that has to say what is wrong rather than that it is. */
export const missingGrantLabels = (grants: HealthGrants): string[] => {
  const missing: string[] = []
  if (!grants.readSteps) missing.push('Steps')
  if (!grants.readWeight) missing.push('Weight (read)')
  if (!grants.writeWeight) missing.push('Weight (write)')
  if (!grants.readHeight) missing.push('Height')
  return missing
}

/** Reads a granted-permission list into the structured answer above. */
const toGrants = (granted: unknown): HealthGrants => {
  if (!Array.isArray(granted)) return NO_GRANTS

  const has = (accessType: 'read' | 'write', recordType: string): boolean =>
    granted.some(
      (entry: unknown) =>
        typeof entry === 'object' &&
        entry !== null &&
        (entry as { accessType?: string }).accessType === accessType &&
        (entry as { recordType?: string }).recordType === recordType
    )

  return {
    readSteps: has('read', 'Steps'),
    readWeight: has('read', 'Weight'),
    readHeight: has('read', 'Height'),
    writeWeight: has('write', 'Weight'),
    readHistory: has('read', 'ReadHealthDataHistory'),
  }
}

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

/**
 * Shows the permission sheet and reports, per permission, what came back. Never throws.
 *
 * Health Connect only prompts once per permission per install: a refusal is remembered, and a
 * second `requestPermission` for something already denied returns immediately without showing
 * anything. That is why the caller needs `openHealthSettings` as well — after the first
 * refusal, the settings app is the only route left.
 */
export const requestPermissions = async (): Promise<HealthGrants> => {
  const hc = await loadModule()
  if (!hc) return NO_GRANTS
  try {
    await hc.initialize()
    // The sheet's own return value covers only this interaction. Re-reading afterwards also
    // picks up anything granted in a previous session, which is what the UI has to reflect.
    await hc.requestPermission([...PERMISSIONS] as Parameters<typeof hc.requestPermission>[0])
    return toGrants(await hc.getGrantedPermissions())
  } catch {
    return NO_GRANTS
  }
}

/** What is granted right now, without prompting. Never throws. */
export const getGrants = async (): Promise<HealthGrants> => {
  const hc = await loadModule()
  if (!hc) return NO_GRANTS
  try {
    await hc.initialize()
    return toGrants(await hc.getGrantedPermissions())
  } catch {
    return NO_GRANTS
  }
}

/**
 * Opens the Health Connect settings screen for this app.
 *
 * The only recovery path once a permission has been refused, because Health Connect will not
 * prompt for it again. Without this, "Connect" is a button that does nothing on the second
 * press and the user has no way to discover why.
 */
export const openHealthSettings = async (): Promise<void> => {
  const hc = await loadModule()
  if (!hc) return
  try {
    hc.openHealthConnectSettings()
  } catch {
    // Nothing to recover from: the caller already told the user what to do.
  }
}

/**
 * Opens the Play Store on the Health Connect provider.
 *
 * `getAvailability` returns 'not_installed' for two different phones: one running an Android
 * old enough that Health Connect is a separate download, and one whose installed provider is
 * too old for this SDK. Both are fixed in the same place, in under a minute, by the user.
 *
 * Until this existed there was no way to say so. Every surface gated itself on
 * `availability === 'available'`, so the phones one tap away from the feature were the only
 * ones never told it exists — the exact opposite of who should hear about it.
 */
export const openHealthConnectInstall = async (): Promise<void> => {
  if (!supported()) return
  try {
    await Linking.openURL(`market://details?id=${PROVIDER_PACKAGE}`)
  } catch {
    // No Play Store app resolves the market: scheme — some OEM builds, and any device where
    // it has been disabled. The https listing opens the same page in a browser.
    try {
      await Linking.openURL(`https://play.google.com/store/apps/details?id=${PROVIDER_PACKAGE}`)
    } catch {
      // Nothing left to try. The caller's copy already names what to install.
    }
  }
}

const startOfLocalDay = (d: Date): Date => {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

/**
 * Daily step totals by summing raw records. The fallback, not the primary path.
 *
 * Kept only for providers that reject aggregation. It is wrong in two ways that aggregation is
 * not, which is why it is no longer what runs first:
 *
 *  - It DOUBLE COUNTS. A phone and a watch both writing the same walk produce two sets of
 *    records, and adding them says the user walked twice as far as they did.
 *  - It TRUNCATES. `readRecords` pages at 1000 records and nothing here follows `pageToken`,
 *    so a device writing a record a minute silently loses most of a week.
 */
const readStepsByRecords = async (
  hc: NonNullable<Awaited<ReturnType<typeof loadModule>>>,
  start: Date,
  end: Date,
): Promise<StepDay[]> => {
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
}

/**
 * Daily step totals for the last `days` days, oldest first.
 *
 * WHY AGGREGATION RATHER THAN RAW RECORDS:
 * Health Connect's `aggregateGroupByPeriod` is the only API that answers "how many steps did
 * this person take" rather than "what did each app write". It resolves overlapping data from
 * multiple sources using the user's own app priority list, so a phone and a watch recording the
 * same walk count once. Summing raw records counts it twice, and that is what Google Fit and
 * every other well-behaved client avoid by using exactly this call.
 *
 * It also sidesteps the 1000-record page cap that silently truncated a week of data.
 *
 * `aggregateGroupByPeriod`, `aggregateRecord` and `aggregateGroupByDuration` were all already
 * exported by the library and none of them were used.
 */
export const readSteps = async (days = 7): Promise<StepDay[]> => {
  const hc = await loadModule()
  if (!hc) return []
  try {
    await hc.initialize()
    const end = new Date()
    const start = startOfLocalDay(new Date(end.getTime() - (days - 1) * 86_400_000))

    const groups = await hc.aggregateGroupByPeriod({
      recordType: 'Steps',
      timeRangeFilter: {
        operator: 'between',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
      timeRangeSlicer: { period: 'DAYS', length: 1 },
    })

    const out: StepDay[] = []
    for (const group of groups) {
      const at = new Date(group.startTime)
      if (Number.isNaN(at.getTime())) continue
      const total = group.result.COUNT_TOTAL
      if (typeof total !== 'number' || !Number.isFinite(total)) continue
      out.push({ date: getDateString(at), steps: Math.round(total) })
    }
    // A day with no steps is omitted by the aggregator rather than returned as zero, which is
    // the right shape: callers distinguish "no data" from "no movement".
    return out.sort((a, b) => a.date.localeCompare(b.date))
  } catch {
    // A provider that cannot aggregate should degrade to an approximate answer rather than to
    // no answer. Both are inside the same try because either can fail.
    try {
      const end = new Date()
      const start = startOfLocalDay(new Date(end.getTime() - (days - 1) * 86_400_000))
      return await readStepsByRecords(hc, start, end)
    } catch {
      return []
    }
  }
}

/**
 * Today's step total, or null when there is no data or no permission.
 *
 * Aggregated directly over today rather than derived from `readSteps`, so the dashboard's
 * headline number costs one narrow query instead of a week's worth of buckets.
 */
export const readTodaySteps = async (): Promise<number | null> => {
  const hc = await loadModule()
  if (!hc) return null
  try {
    await hc.initialize()
    const now = new Date()
    const result = await hc.aggregateRecord({
      recordType: 'Steps',
      timeRangeFilter: {
        operator: 'between',
        startTime: startOfLocalDay(now).toISOString(),
        endTime: now.toISOString(),
      },
    })
    const total = result.COUNT_TOTAL
    return typeof total === 'number' && Number.isFinite(total) ? Math.round(total) : null
  } catch {
    const today = getDateString(new Date())
    const days = await readSteps(2)
    const match = days.find(d => d.date === today)
    return match ? match.steps : null
  }
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
 * The stable identity of a MacroFit weigh-in inside Health Connect.
 *
 * One record per calendar day, keyed by the date the user logged it for. This is what makes
 * the write an upsert instead of an append: Health Connect replaces a record whose
 * `clientRecordId` it has already seen, and appends anything else.
 *
 * Without it, editing today's weight three times leaves three Weight records at the same
 * instant. Google Fit then shows whichever one it likes, and `readWeightHistory` re-imports
 * the pile on the next sync — the sync feature corrupting the data it was added to share.
 */
const weightRecordId = (date: string): string => `macrofit-weight-${date}`

/**
 * Noon local, so a weigh-in sits unambiguously inside the day it belongs to.
 *
 * Health Connect stores an instant, the app stores a calendar date, and the conversion has to
 * survive both timezones and edits. Midnight would put a weigh-in on the previous day for
 * anyone east of UTC once it is read back; "now" would move the record every time the user
 * corrected a typo, which defeats the point of a stable id.
 */
const noonOn = (date: string): Date => {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0)
}

/**
 * Writes a weigh-in to Health Connect. Returns false rather than throwing.
 *
 * The caller treats this as an enhancement: the local log is already saved by the time this
 * runs, and a failure here must never fail the thing the user actually asked for. It does have
 * to be *reported*, though — a sync that silently does nothing is worse than one that says it
 * could not, because the user goes looking for the number in Google Fit and concludes the app
 * is broken.
 */
export const writeWeightKg = async (kg: number, date: string): Promise<boolean> => {
  const hc = await loadModule()
  if (!hc) return false
  if (!Number.isFinite(kg) || kg <= 0) return false
  try {
    await hc.initialize()
    await hc.insertRecords([
      {
        recordType: 'Weight',
        time: noonOn(date).toISOString(),
        weight: { unit: 'kilograms', value: kg },
        metadata: {
          clientRecordId: weightRecordId(date),
          // Health Connect keeps the highest version it has seen for an id, so a later edit
          // has to claim a larger number or it is discarded as stale.
          clientRecordVersion: Date.now(),
        },
      },
    ])
    return true
  } catch {
    return false
  }
}

/**
 * Removes a weigh-in this app wrote.
 *
 * Deleting locally without this leaves the record in Health Connect, and therefore in every
 * other app reading from it — the user deletes a mistyped 172 kg and it stays visible in Fit
 * forever. Records written by other apps are untouched: the id namespace is ours alone, so a
 * scale's own reading for the same day cannot be caught by this.
 */
export const deleteWeightForDate = async (date: string): Promise<void> => {
  const hc = await loadModule()
  if (!hc) return
  try {
    await hc.initialize()
    await hc.deleteRecordsByUuids('Weight', [], [weightRecordId(date)])
  } catch {
    // Already gone, never written, or no permission. None of those need reporting: the local
    // entry is deleted either way, which is what the user asked for.
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
