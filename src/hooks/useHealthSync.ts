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
import { useStore } from '@/store/useStore'
import {
  getAvailability,
  getGrants,
  isFullyGranted,
  openHealthSettings,
  readLatestHeightCm,
  readLatestWeightKg,
  readSteps,
  readTodaySteps,
  readWeightHistory,
  requestPermissions,
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
  const addWeightEntry = useStore(s => s.addWeightEntry)

  const [availability, setAvailability] = useState<HealthAvailability>('unavailable')
  const [grants, setGrants] = useState<HealthGrants>({
    readSteps: false,
    readWeight: false,
    readHeight: false,
    writeWeight: false,
    readHistory: false,
  })
  const [todaySteps, setTodaySteps] = useState<number | null>(null)
  const [weekSteps, setWeekSteps] = useState<StepDay[]>([])
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

  const refreshSteps = useCallback(async () => {
    lastRefreshRef.current = Date.now()
    const [today, week] = await Promise.all([readTodaySteps(), readSteps(7)])
    if (!mounted.current) return
    setTodaySteps(today)
    setWeekSteps(week)
  }, [])

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
      if (!next.readSteps) return

      const due = options?.force || Date.now() - lastRefreshRef.current > REFRESH_THROTTLE_MS
      if (due) await refreshSteps()
    },
    [refreshSteps],
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
      return next
    } finally {
      if (mounted.current) setBusy(false)
    }
  }, [refreshSteps])

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
      importedWeights,
      busy,
      connect,
      openSettings,
      importWeightHistory,
      refreshSteps,
      readBasics,
    }),
    [
      availability,
      grants,
      todaySteps,
      weekSteps,
      importedWeights,
      busy,
      connect,
      openSettings,
      importWeightHistory,
      refreshSteps,
      readBasics,
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
