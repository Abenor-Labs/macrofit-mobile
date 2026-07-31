import { Linking, Platform } from 'react-native'
import type { DiaryDay, MealType, UserProfile, WeightEntry, WorkoutSession } from '@core/types'
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
  // --- Core. These four define "Connected". ---
  readSteps: boolean
  readWeight: boolean
  readHeight: boolean
  /** Lets a weight logged here reach Health Connect, and through it Google Fit. */
  writeWeight: boolean
  /** Android 14+: without this, every read is capped at the last 30 days. */
  readHistory: boolean

  // --- Optional. Each gates exactly one feature and nothing else. ---
  /** Measured total energy expenditure: active plus basal. The app's TDEE is a formula. */
  readTotalCalories: boolean
  /** Measured activity energy only. Useful where the provider writes one and not the other. */
  readActiveCalories: boolean
  /** A scale's measured BMR, against the app's calculated one. */
  readBasalRate: boolean
  readBodyFat: boolean
  writeBodyFat: boolean
  /** Sends logged meals out to Health Connect, and through it every other app. */
  writeNutrition: boolean
  writeHydration: boolean
  /** Sends finished workouts out. Logged sessions were app-only until this. */
  writeExercise: boolean
}

/**
 * Nothing granted.
 *
 * Exported so consumers seed their state from it rather than writing the literal out again.
 * The provider used to keep its own copy, which stopped compiling the moment a permission was
 * added — a cheap failure, but one that invites the fix of pasting the new fields in rather
 * than the fix of not having a second list.
 */
export const NO_GRANTS: HealthGrants = {
  readSteps: false,
  readWeight: false,
  readHeight: false,
  writeWeight: false,
  readHistory: false,
  readTotalCalories: false,
  readActiveCalories: false,
  readBasalRate: false,
  readBodyFat: false,
  writeBodyFat: false,
  writeNutrition: false,
  writeHydration: false,
  writeExercise: false,
}

/**
 * True when everything the app needs to function is granted.
 *
 * Deliberately still the four core permissions, and not the eleven the app now requests.
 * Health Connect draws one switch per permission and people flip the ones whose names they
 * recognise, so defining "Connected" as the full set would leave almost everyone reading
 * "Partly connected" forever — which tells them something is broken when nothing is. Each
 * optional grant gates its own feature and says so where that feature lives.
 *
 * History is a bonus rather than a need: without it an import is shorter, not broken.
 */
export const isFullyGranted = (grants: HealthGrants): boolean =>
  grants.readSteps && grants.readWeight && grants.readHeight && grants.writeWeight

/**
 * True when nothing at all was granted, which is a refusal rather than a partial answer.
 *
 * Checks every permission, not just the core four. The distinction drives which button the UI
 * offers, and Health Connect will not re-prompt for anything already refused — so someone who
 * allowed only meal writing must be sent to settings, not shown a "Connect" button that would
 * open a sheet and immediately close it again.
 */
export const isFullyDenied = (grants: HealthGrants): boolean =>
  !Object.values(grants).some(Boolean)

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
    readTotalCalories: has('read', 'TotalCaloriesBurned'),
    readActiveCalories: has('read', 'ActiveCaloriesBurned'),
    readBasalRate: has('read', 'BasalMetabolicRate'),
    readBodyFat: has('read', 'BodyFat'),
    writeBodyFat: has('write', 'BodyFat'),
    writeNutrition: has('write', 'Nutrition'),
    writeHydration: has('write', 'Hydration'),
    writeExercise: has('write', 'ExerciseSession'),
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

// --- Energy expenditure ------------------------------------------------------------------

/**
 * What the phone measured the user burning, against which the app's TDEE is only a formula.
 *
 * Every field is independently nullable because every one of them is independently absent in
 * practice. Health Connect is a store, not a source: it holds what some other app wrote, and
 * the apps disagree about which of these they write. Samsung Health, Fitbit and Garmin write
 * total; Google Fit largely does not. A phone can therefore grant every permission here and
 * still answer null to all three, which is not an error and must never be rendered as zero.
 */
export interface EnergyBurned {
  /** Active plus basal — directly comparable to the app's TDEE. */
  totalKcal: number | null
  /** Activity only, above resting. */
  activeKcal: number | null
  /** Resting expenditure across the day. */
  basalKcal: number | null
}

const NO_ENERGY: EnergyBurned = { totalKcal: null, activeKcal: null, basalKcal: null }

/** Whole kilocalories, rejecting the implausible rather than passing it on. */
const asKcal = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  // A day above 20000 kcal is a unit error upstream, not an athlete.
  return value > 20000 ? null : Math.round(value)
}

/** Midnight-to-midnight for a 'YYYY-MM-DD', in the phone's own timezone. */
const localDayRange = (date: string): { startTime: string; endTime: string } => {
  const start = noonOn(date)
  start.setHours(0, 0, 0, 0)
  return {
    startTime: start.toISOString(),
    endTime: new Date(start.getTime() + 86_400_000).toISOString(),
  }
}

/**
 * Measured energy burned across one local day.
 *
 * Each aggregate gets its own try/catch rather than sharing one. They are separate permissions
 * filled by separate providers, so a phone holding active calories but not total is ordinary —
 * and a shared catch would discard the reading it did have because of the one it did not.
 */
export const readEnergyBurned = async (date: string): Promise<EnergyBurned> => {
  const hc = await loadModule()
  if (!hc) return NO_ENERGY
  try {
    await hc.initialize()
    const timeRangeFilter = { operator: 'between' as const, ...localDayRange(date) }

    let totalKcal: number | null = null
    let activeKcal: number | null = null
    let basalKcal: number | null = null

    try {
      const r = await hc.aggregateRecord({ recordType: 'TotalCaloriesBurned', timeRangeFilter })
      totalKcal = asKcal(r.ENERGY_TOTAL?.inKilocalories)
    } catch {
      // Permission refused, or nothing on file. Both mean "no answer".
    }
    try {
      const r = await hc.aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter })
      activeKcal = asKcal(r.ACTIVE_CALORIES_TOTAL?.inKilocalories)
    } catch {
      // As above.
    }
    try {
      const r = await hc.aggregateRecord({ recordType: 'BasalMetabolicRate', timeRangeFilter })
      basalKcal = asKcal(r.BASAL_CALORIES_TOTAL?.inKilocalories)
    } catch {
      // As above.
    }

    /*
      Total is the number the app wants and the one most often missing. Active plus basal is the
      same quantity by definition, so it is reconstructed when both halves are present: a phone
      whose fitness app writes active calories and whose scale writes a BMR yields a measured
      total that neither of them wrote.
    */
    if (totalKcal === null && activeKcal !== null && basalKcal !== null) {
      totalKcal = asKcal(activeKcal + basalKcal)
    }

    return { totalKcal, activeKcal, basalKcal }
  } catch {
    return NO_ENERGY
  }
}

// --- Body fat ----------------------------------------------------------------------------

/**
 * Latest measured body-fat percentage, or null.
 *
 * The app estimates this from tape measurements. A smart scale measures it. Where both exist
 * the measurement wins, which is the entire reason for reading it.
 */
export const readLatestBodyFatPct = async (): Promise<number | null> => {
  const hc = await loadModule()
  if (!hc) return null
  try {
    await hc.initialize()
    const end = new Date()
    const start = new Date(end.getTime() - 365 * 86_400_000)
    const result = await hc.readRecords('BodyFat', {
      timeRangeFilter: {
        operator: 'between',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    })
    const pct = latestOf(result.records, r => r.time, r => r.percentage)
    if (pct === null) return null
    // Health Connect stores a percentage, but writing 0.18 for 18% is a common upstream mistake
    // and would otherwise reach the profile as a 0.18% body-fat reading.
    return pct >= 3 && pct <= 70 ? Math.round(pct * 10) / 10 : null
  } catch {
    return null
  }
}

/** Writes an estimated body-fat percentage. One record per day, upserted like a weigh-in. */
export const writeBodyFatPct = async (pct: number, date: string): Promise<boolean> => {
  const hc = await loadModule()
  if (!hc) return false
  if (!Number.isFinite(pct) || pct < 3 || pct > 70) return false
  try {
    await hc.initialize()
    await hc.insertRecords([
      {
        recordType: 'BodyFat',
        time: noonOn(date).toISOString(),
        percentage: Math.round(pct * 10) / 10,
        metadata: {
          clientRecordId: `macrofit-bodyfat-${date}`,
          clientRecordVersion: Date.now(),
        },
      },
    ])
    return true
  } catch {
    return false
  }
}

// --- Nutrition ---------------------------------------------------------------------------

/**
 * Health Connect's meal types, which are fewer than the app's.
 *
 * Pre- and post-workout both fold into SNACK. Health Connect offers nothing richer, and
 * UNKNOWN would throw away something the user actually told us — a snack is at least true.
 */
const MEAL_TYPE_CODES: Record<MealType, number> = {
  Breakfast: 1,
  Lunch: 2,
  Dinner: 3,
  Snacks: 4,
  'Pre-Workout': 4,
  'Post-Workout': 4,
}

/**
 * One record per meal per day, so an edit updates rather than duplicates.
 *
 * Keyed by meal rather than by day because Health Connect demands a mealType on every record
 * and one record cannot be two meals. Keyed by meal rather than by entry because adding a
 * second coffee to breakfast should update breakfast, not append a second breakfast.
 */
const nutritionRecordId = (date: string, meal: MealType): string =>
  `macrofit-nutrition-${date}-${meal.toLowerCase().replace(/[^a-z]/g, '')}`

/**
 * Sends a day's logged meals to Health Connect, one record per meal type.
 *
 * Returns how many records were written, so a caller can tell "nothing to write" from "the
 * write failed" — a distinction a boolean cannot carry.
 *
 * Sodium, potassium and cholesterol go out in milligrams because Health Connect takes a unit
 * beside the value and the app already stores them that way. Converting to grams first would
 * round 140 mg of sodium to 0.1 g and lose a digit for no reason.
 */
export const writeNutritionForDay = async (day: DiaryDay): Promise<number> => {
  const hc = await loadModule()
  if (!hc) return 0
  if (day.entries.length === 0) return 0
  try {
    await hc.initialize()

    interface MealTotals {
      from: number
      to: number
      calories: number
      protein: number
      carbs: number
      fat: number
      fiber: number
      sugar: number
      sodium: number
      potassium: number
      cholesterol: number
      saturatedFat: number
    }

    const byMeal = new Map<MealType, MealTotals>()

    for (const entry of day.entries) {
      const n = entry.servings
      const f = entry.food
      const at = entry.timestamp
      const acc: MealTotals = byMeal.get(entry.mealType) ?? {
        from: at,
        to: at,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
        sugar: 0,
        sodium: 0,
        potassium: 0,
        cholesterol: 0,
        saturatedFat: 0,
      }
      acc.from = Math.min(acc.from, at)
      acc.to = Math.max(acc.to, at)
      acc.calories += f.calories * n
      acc.protein += f.protein * n
      acc.carbs += f.carbs * n
      acc.fat += f.fat * n
      acc.fiber += f.fiber * n
      acc.sugar += f.sugar * n
      acc.sodium += f.sodium * n
      acc.potassium += f.potassium * n
      acc.cholesterol += f.cholesterol * n
      acc.saturatedFat += f.saturatedFat * n
      byMeal.set(entry.mealType, acc)
    }

    const grams = (value: number) => ({
      unit: 'grams' as const,
      value: Math.round(value * 10) / 10,
    })
    const mg = (value: number) => ({
      unit: 'milligrams' as const,
      value: Math.round(value * 10) / 10,
    })

    const records = [...byMeal.entries()].map(([meal, acc]) => ({
      recordType: 'Nutrition' as const,
      startTime: new Date(acc.from).toISOString(),
      /*
        A meal logged in one tap has from === to, and Health Connect rejects a zero-length
        interval. A minute is long enough to be accepted and short enough not to claim the user
        spent an hour on it.
      */
      endTime: new Date(Math.max(acc.to, acc.from + 60_000)).toISOString(),
      mealType: MEAL_TYPE_CODES[meal],
      name: meal,
      energy: { unit: 'kilocalories' as const, value: Math.round(acc.calories) },
      protein: grams(acc.protein),
      totalCarbohydrate: grams(acc.carbs),
      totalFat: grams(acc.fat),
      dietaryFiber: grams(acc.fiber),
      sugar: grams(acc.sugar),
      saturatedFat: grams(acc.saturatedFat),
      sodium: mg(acc.sodium),
      potassium: mg(acc.potassium),
      cholesterol: mg(acc.cholesterol),
      metadata: {
        clientRecordId: nutritionRecordId(day.date, meal),
        clientRecordVersion: Date.now(),
      },
    }))

    if (records.length === 0) return 0
    await hc.insertRecords(records as Parameters<typeof hc.insertRecords>[0])
    return records.length
  } catch {
    return 0
  }
}

/** Writes a day's water intake. Skipped at zero: an empty record says nothing worth storing. */
export const writeHydrationMl = async (date: string, ml: number): Promise<boolean> => {
  const hc = await loadModule()
  if (!hc) return false
  if (!Number.isFinite(ml) || ml <= 0) return false
  try {
    await hc.initialize()
    const { startTime, endTime } = localDayRange(date)
    await hc.insertRecords([
      {
        recordType: 'Hydration',
        startTime,
        // A second inside the day, so the record cannot spill into tomorrow when read back.
        endTime: new Date(new Date(endTime).getTime() - 1000).toISOString(),
        volume: { unit: 'milliliters', value: Math.round(ml) },
        metadata: {
          clientRecordId: `macrofit-hydration-${date}`,
          clientRecordVersion: Date.now(),
        },
      },
    ])
    return true
  } catch {
    return false
  }
}

// --- Workouts ----------------------------------------------------------------------------

/** Health Connect's code for weightlifting. The app logs lifts, so this is not a guess. */
const EXERCISE_TYPE_WEIGHTLIFTING = 81

/**
 * Sends a finished workout to Health Connect.
 *
 * Finished ones only. A session with no `endedAt` is still running, and Health Connect has no
 * open-ended session — writing one would need an end time invented here, which becomes wrong
 * the moment the user starts another set.
 */
export const writeExerciseSession = async (session: WorkoutSession): Promise<boolean> => {
  const hc = await loadModule()
  if (!hc) return false
  if (session.endedAt === undefined || session.endedAt <= session.startedAt) return false
  try {
    await hc.initialize()
    await hc.insertRecords([
      {
        recordType: 'ExerciseSession',
        startTime: new Date(session.startedAt).toISOString(),
        endTime: new Date(session.endedAt).toISOString(),
        exerciseType: EXERCISE_TYPE_WEIGHTLIFTING,
        title: session.name,
        ...(session.notes === undefined ? {} : { notes: session.notes }),
        metadata: {
          clientRecordId: `macrofit-workout-${session.id}`,
          clientRecordVersion: Date.now(),
        },
      },
    ] as Parameters<typeof hc.insertRecords>[0])
    return true
  } catch {
    return false
  }
}
