import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useStore, whenStoreHydrated } from '@/store/useStore'
import { useAuth } from '@/lib/AuthProvider'
import type { DiaryDay } from '@core/types'
import { getDateString } from '@core/utils/calculations'
import {
  getAvailability,
  getGrants,
  IMPORTED_WEIGHT_NOTE,
  isFullyGranted,
  NO_GRANTS,
  openHealthSettings,
  readEnergyBurned,
  readLatestBodyFatPct,
  readLatestHeightCm,
  readLatestWeightKg,
  readSteps,
  readTodaySteps,
  readWeighInsChangedSince,
  readWeightHistory,
  requestPermissions,
  writeBodyFatPct,
  writeExerciseSession,
  writeHydrationMl,
  writeNutritionForDay,
  writeWeightsKg,
  type EnergyBurned,
  type HealthAvailability,
  type HealthGrants,
  type StepDay,
} from '@/lib/healthConnect'

/** What setup can fill in for someone. Either field is null when nothing is on file. */
export interface HealthBasics {
  heightCm: number | null
  weightKg: number | null
}

export interface HealthSyncState {
  availability: HealthAvailability
  /** Per-permission truth. See `HealthGrants` for why this is not a boolean. */
  grants: HealthGrants
  /** True when everything the app needs is granted. Partial access is not "connected". */
  granted: boolean
  todaySteps: number | null
  weekSteps: StepDay[]
  /**
   * Measured energy burned today. Every field is separately null — see `EnergyBurned`.
   *
   * This is the phone's answer to the question the app otherwise answers with a formula. It is
   * frequently absent, so a consumer must branch on null rather than treating it as a number.
   */
  energy: EnergyBurned
  /** Body-fat percentage measured by a scale, or null. Beats the app's own estimate. */
  measuredBodyFatPct: number | null
  /** Sends an estimated body-fat percentage out, for users with no scale. */
  pushBodyFat: (pct: number, date: string) => Promise<boolean>
  /** Number of weigh-ins pulled in by the last import. Null until one has run. */
  importedWeights: number | null
  busy: boolean
  /**
   * Shows the permission sheet and returns what came back.
   *
   * Returns rather than only setting state because the caller needs the answer in the same
   * tick. Setup used to call this and return, leaving its own closure holding the grants from
   * before the sheet opened — so a user who granted everything saw nothing happen and had to
   * press the button a second time, and a user who refused saw nothing happen ever.
   */
  connect: () => Promise<HealthGrants>
  /** Opens Health Connect's own settings, the only route back after a refusal. */
  openSettings: () => Promise<void>
  importWeightHistory: () => Promise<void>
  refreshSteps: () => Promise<void>
  /**
   * Latest height and weight on file, returned rather than written to the store.
   *
   * Setup prefills its own fields with these and only commits when the user presses on, so
   * a reading they disagree with can be typed over before it becomes their profile.
   */
  readBasics: () => Promise<HealthBasics>
}

/**
 * Steps are read at most this often. Tab focus fires on every switch, and the dashboard is one
 * tap from four other tabs, so without a floor a user flicking between them queries the
 * provider continuously for a number that changes a few times an hour.
 */
const REFRESH_THROTTLE_MS = 60_000

/**
 * Epoch ms up to which other apps' weigh-ins have been pulled in. Per device, not per account:
 * it records what this phone's Health Connect has already been read for.
 */
const WEIGHT_PULLED_THROUGH_KEY = 'health.weightPulledThrough'

/**
 * How far back the automatic weight sync looks, in both directions.
 *
 * Thirty days because Android 14+ allows that much without the history permission, so the sync
 * behaves the same whether or not it was granted. Anything older is what "Import weight
 * history" is for.
 */
const WEIGHT_SYNC_DAYS = 30

const LBS_PER_KG = 2.20462

const HealthContext = createContext<HealthSyncState | null>(null)

/**
 * Bridges Android Health Connect into the store.
 *
 * Reads are best-effort: an unsupported device, a missing Health Connect app or a refused
 * permission all resolve to "no data" rather than an error, because none of them are
 * something the user did wrong.
 *
 * WHY THIS IS A PROVIDER AND NOT A PLAIN HOOK:
 * `useHealthSync()` was called independently by StepsCard, Profile and onboarding, and each
 * call built its own state — its own availability probe, its own permission read, its own step
 * cache. Connecting from Profile therefore left the dashboard card still showing "Not
 * connected", because that copy of the hook had no idea anything had happened and nothing ever
 * made it re-check. One provider, one answer, every consumer in step.
 */
export const HealthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const profile = useStore(s => s.profile)
  const weightLog = useStore(s => s.weightLog)
  const weightUnit = useStore(s => s.profile.weightUnit)
  const addWeightEntry = useStore(s => s.addWeightEntry)
  const setCurrentWeight = useStore(s => s.setCurrentWeight)
  const diary = useStore(s => s.diary)
  const workoutLog = useStore(s => s.workoutLog)

  const [availability, setAvailability] = useState<HealthAvailability>('unavailable')
  const [grants, setGrants] = useState<HealthGrants>(NO_GRANTS)
  const [todaySteps, setTodaySteps] = useState<number | null>(null)
  const [weekSteps, setWeekSteps] = useState<StepDay[]>([])
  const [energy, setEnergy] = useState<EnergyBurned>({
    totalKcal: null,
    activeKcal: null,
    basalKcal: null,
  })
  const [measuredBodyFatPct, setMeasuredBodyFatPct] = useState<number | null>(null)
  const [importedWeights, setImportedWeights] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const lastRefreshRef = useRef(0)

  /*
    Steps, measured energy and body fat move together because they refresh together: all three
    are read-only platform facts on the same throttle, and splitting them would mean three
    round trips to the provider where one does.
  */
  const refreshSteps = useCallback(async () => {
    lastRefreshRef.current = Date.now()
    const today = getDateString(new Date())
    const [steps, week, burned, fat] = await Promise.all([
      readTodaySteps(),
      readSteps(7),
      readEnergyBurned(today),
      readLatestBodyFatPct(),
    ])
    if (!mounted.current) return
    setTodaySteps(steps)
    setWeekSteps(week)
    setEnergy(burned)
    setMeasuredBodyFatPct(fat)
  }, [])

  const lastWeightPullRef = useRef(0)

  /*
    Account data still loading means the log is about to be replaced by the server's copy. A
    pull merged into the local copy first would be overwritten, and with the watermark already
    advanced it would never be fetched again — so the pull waits for both loads to settle.
  */
  const { loading: authLoading, hydrating: authHydrating } = useAuth()
  const accountSettled = !authLoading && !authHydrating
  const accountSettledRef = useRef(accountSettled)
  accountSettledRef.current = accountSettled

  /*
    INBOUND WEIGHT SYNC

    Without this, a weight typed into Google Fit reached MacroFit only if the user found
    "Import weight history" in Profile and pressed it — which nobody does daily, so the two apps
    simply disagreed. It now runs wherever steps refresh: on launch and on every return to the
    foreground, which is exactly when someone who just weighed in elsewhere comes back.

    Rules, in order:
     - Only changes since the last pull (see readWeighInsChangedSince), so an imported day the
       user deleted here stays deleted.
     - A day the user logged in MacroFit is theirs and is never overwritten, matching what the
       manual import has always promised.
     - A day that was itself imported is replaced when the other app corrects it.
  */
  const pullWeightsOnce = useCallback(async () => {
    lastWeightPullRef.current = Date.now()
    if (!(await whenStoreHydrated())) return
    let since = 0
    try {
      since = Number(await AsyncStorage.getItem(WEIGHT_PULLED_THROUGH_KEY)) || 0
    } catch {
      // Unreadable storage means a full 30-day pull. Idempotent, so merely slower.
    }
    // Taken before the read, so a weigh-in saved while the read is in flight is caught next time.
    const startedAt = Date.now()
    const changed = await readWeighInsChangedSince(useStore.getState().profile, since, WEIGHT_SYNC_DAYS)
    if (changed === null) return

    const state = useStore.getState()
    const byDate = new Map(state.weightLog.map(entry => [entry.date, entry]))
    let applied = 0
    for (const entry of changed) {
      const mine = byDate.get(entry.date)
      if (mine && mine.notes !== IMPORTED_WEIGHT_NOTE) continue
      if (mine && mine.weight === entry.weight) continue
      addWeightEntry(entry)
      applied++
    }

    /*
      addWeightEntry sets the current weight to whatever it was last handed, even an older day,
      so a pull that fills in last Tuesday would otherwise make last Tuesday "current". Re-derive
      it from the newest entry in the log.
    */
    if (applied > 0) {
      const { weightLog: log, profile: p } = useStore.getState()
      const newest = log[0]
      if (newest) setCurrentWeight(p.weightUnit === 'lbs' ? newest.weight / LBS_PER_KG : newest.weight)
    }

    void AsyncStorage.setItem(WEIGHT_PULLED_THROUGH_KEY, String(startedAt)).catch(() => {})
  }, [addWeightEntry, setCurrentWeight])

  const pullingWeightsRef = useRef(false)

  const pullWeights = useCallback(async () => {
    // Launch fires this from the probe and from the settle effect at once; one is enough.
    if (pullingWeightsRef.current) return
    pullingWeightsRef.current = true
    try {
      await pullWeightsOnce()
    } finally {
      pullingWeightsRef.current = false
    }
  }, [pullWeightsOnce])

  // The launch probe usually lands before account data does; this is the pull it deferred.
  useEffect(() => {
    if (accountSettled && grants.readWeight) void pullWeights()
  }, [accountSettled, grants.readWeight, pullWeights])

  /** Re-reads permissions and, if steps are allowed, the step counts. Cheap and silent. */
  const probe = useCallback(
    async (options?: { force?: boolean }) => {
      const status = await getAvailability()
      if (!mounted.current) return
      setAvailability(status)
      if (status !== 'available') return

      const next = await getGrants()
      if (!mounted.current) return
      setGrants(next)

      if (
        next.readWeight &&
        accountSettledRef.current &&
        (options?.force || Date.now() - lastWeightPullRef.current > REFRESH_THROTTLE_MS)
      ) {
        void pullWeights()
      }

      /*
        Any read at all, not steps specifically.

        This used to bail unless steps were granted, which was fine while steps were the only
        thing read. It is not any more: someone who allows energy and refuses steps would get
        no calories, no body fat and no explanation, because the one permission the gate
        happened to name was the one they said no to.
      */
      const readsAnything =
        next.readSteps ||
        next.readTotalCalories ||
        next.readActiveCalories ||
        next.readBasalRate ||
        next.readBodyFat
      if (!readsAnything) return

      const due = options?.force || Date.now() - lastRefreshRef.current > REFRESH_THROTTLE_MS
      if (due) await refreshSteps()
    },
    [refreshSteps, pullWeights],
  )

  // Probe once on mount. Cheap, and silent when unsupported.
  useEffect(() => {
    void probe({ force: true })
  }, [probe])

  /*
    Re-probe when the app comes back to the foreground.

    Two things happen while MacroFit is backgrounded that it otherwise never learns about: the
    user walks, and the user changes permissions in Health Connect's own settings — which is
    the only place a refused permission can be granted, and which necessarily happens outside
    this app. Without this, "Steps today" was frozen at whatever it read on the cold start,
    because the dashboard tab never unmounts and the mount effect never runs twice.
  */
  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next === 'active') void probe()
    }
    const sub = AppState.addEventListener('change', onChange)
    return () => sub.remove()
  }, [probe])

  const connect = useCallback(async (): Promise<HealthGrants> => {
    setBusy(true)
    try {
      const next = await requestPermissions()
      if (!mounted.current) return next
      setGrants(next)
      if (next.readSteps) await refreshSteps()
      if (next.readWeight && accountSettledRef.current) void pullWeights()
      return next
    } finally {
      if (mounted.current) setBusy(false)
    }
  }, [refreshSteps, pullWeights])

  const openSettings = useCallback(async () => {
    await openHealthSettings()
    // The user is leaving for another app and will come back having possibly changed
    // something. The foreground listener above picks that up; nothing to do here.
  }, [])

  const importWeightHistory = useCallback(async () => {
    setBusy(true)
    try {
      const history = await readWeightHistory(profile)
      // The store keys weigh-ins by date, so importing a day the user already logged
      // would overwrite their own entry with a device reading. Existing days win.
      const existing = new Set(weightLog.map(e => e.date))
      const fresh = history.filter(e => !existing.has(e.date))
      for (const entry of fresh) addWeightEntry(entry)
      if (mounted.current) setImportedWeights(fresh.length)
    } finally {
      if (mounted.current) setBusy(false)
    }
  }, [profile, weightLog, addWeightEntry])

  const pushBodyFat = useCallback(
    async (pct: number, date: string): Promise<boolean> => writeBodyFatPct(pct, date),
    [],
  )

  /*
    OUTBOUND SYNC

    Both effects below watch store state rather than being called from the screens that change
    it. That is deliberate: food reaches the diary from search, from the barcode scanner, from
    a photo, from a meal template and from the chat assistant, and a workout can end from the
    workout screen or by being abandoned. Hooking each of those sites means the sync works
    until someone adds a seventh, and then silently does not.

    The cost is that this runs on every store change, so both are debounced and both remember
    what they last sent.
  */

  /** Cheap identity of a day's loggable content. Changes exactly when a write is warranted. */
  const diaryFingerprint = (day: DiaryDay): string =>
    `${day.waterIntake}|${day.entries.map(e => `${e.id}:${e.servings}`).join(',')}`

  const syncedDaysRef = useRef<Record<string, string>>({})

  useEffect(() => {
    if (!grants.writeNutrition && !grants.writeHydration) return

    /*
      Every changed day, not just today. Logging yesterday's dinner from the diary's date
      picker is ordinary, and a today-only sync would drop it without saying so.
    */
    const stale = Object.values(diary).filter(
      day => syncedDaysRef.current[day.date] !== diaryFingerprint(day),
    )
    if (stale.length === 0) return

    // Long enough that typing a serving size sends one record rather than four.
    const timer = setTimeout(() => {
      void (async () => {
        for (const day of stale) {
          if (grants.writeNutrition) await writeNutritionForDay(day)
          if (grants.writeHydration && day.waterIntake > 0) {
            await writeHydrationMl(day.date, day.waterIntake)
          }
          // Recorded after the write, so a failure is retried on the next change rather than
          // being marked done and never attempted again.
          syncedDaysRef.current[day.date] = diaryFingerprint(day)
        }
      })()
    }, 3000)

    return () => clearTimeout(timer)
  }, [diary, grants.writeNutrition, grants.writeHydration])

  const syncedWorkoutsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!grants.writeExercise) return
    void (async () => {
      for (const session of workoutLog) {
        // Still running: Health Connect has no open-ended session to write.
        if (session.endedAt === undefined) continue
        if (syncedWorkoutsRef.current.has(session.id)) continue
        const ok = await writeExerciseSession(session)
        if (ok) syncedWorkoutsRef.current.add(session.id)
      }
    })()
  }, [workoutLog, grants.writeExercise])

  /*
    OUTBOUND WEIGHT SYNC

    useLogWeight writes the moment a weigh-in is saved, but it is not the only way one is saved:
    the Coach logs weight straight into the store, setup records the starting weight, and any
    weigh-in made before Write weight was granted was never sent at all. Watching the log covers
    all of them, including the next path someone adds.

    Imported days are skipped — they came from Health Connect, and sending them back would give
    Google Fit a duplicate under this app's name. The write is an upsert keyed by date, so the
    overlap with useLogWeight's own write costs a redundant call, never a duplicate record.
  */
  const pushedWeightsRef = useRef<Record<string, number>>({})

  useEffect(() => {
    if (!grants.writeWeight) return
    const cutoff = getDateString(new Date(Date.now() - WEIGHT_SYNC_DAYS * 86_400_000))
    const pending = weightLog.filter(
      entry =>
        entry.date >= cutoff &&
        entry.notes !== IMPORTED_WEIGHT_NOTE &&
        pushedWeightsRef.current[entry.date] !== entry.weight,
    )
    if (pending.length === 0) return

    const timer = setTimeout(() => {
      void (async () => {
        const ok = await writeWeightsKg(
          pending.map(entry => ({
            date: entry.date,
            kg: weightUnit === 'lbs' ? entry.weight / LBS_PER_KG : entry.weight,
          })),
        )
        // Only on success, so a failed write is retried on the next change or launch.
        if (ok) for (const entry of pending) pushedWeightsRef.current[entry.date] = entry.weight
      })()
    }, 3000)

    return () => clearTimeout(timer)
  }, [weightLog, weightUnit, grants.writeWeight])

  const readBasics = useCallback(async (): Promise<HealthBasics> => {
    setBusy(true)
    try {
      const [heightCm, weightKg] = await Promise.all([readLatestHeightCm(), readLatestWeightKg()])
      return { heightCm, weightKg }
    } finally {
      if (mounted.current) setBusy(false)
    }
  }, [])

  const value = useMemo<HealthSyncState>(
    () => ({
      availability,
      grants,
      granted: isFullyGranted(grants),
      todaySteps,
      weekSteps,
      energy,
      measuredBodyFatPct,
      importedWeights,
      busy,
      connect,
      openSettings,
      importWeightHistory,
      refreshSteps,
      readBasics,
      pushBodyFat,
    }),
    [
      availability,
      grants,
      todaySteps,
      weekSteps,
      energy,
      measuredBodyFatPct,
      importedWeights,
      busy,
      connect,
      openSettings,
      importWeightHistory,
      refreshSteps,
      readBasics,
      pushBodyFat,
    ],
  )

  return React.createElement(HealthContext.Provider, { value }, children)
}

/**
 * The shared Health Connect state.
 *
 * Throws outside the provider rather than silently returning defaults: a component reading
 * "not available" because it was mounted in the wrong place is the exact failure this
 * provider exists to remove, and it is invisible on iOS and on any device without Health
 * Connect — which is to say, in most of testing.
 */
export const useHealthSync = (): HealthSyncState => {
  const value = useContext(HealthContext)
  if (value === null) {
    throw new Error('useHealthSync must be used inside <HealthProvider> (see app/_layout.tsx).')
  }
  return value
}
