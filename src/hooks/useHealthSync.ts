import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import {
  getAvailability,
  hasPermissions,
  readSteps,
  readTodaySteps,
  readWeightHistory,
  requestPermissions,
  type HealthAvailability,
  type StepDay,
} from '@/lib/healthConnect'

export interface HealthSyncState {
  availability: HealthAvailability
  granted: boolean
  todaySteps: number | null
  weekSteps: StepDay[]
  /** Number of weigh-ins pulled in by the last import. Null until one has run. */
  importedWeights: number | null
  busy: boolean
  connect: () => Promise<void>
  importWeightHistory: () => Promise<void>
  refreshSteps: () => Promise<void>
}

/**
 * Bridges Android Health Connect into the store.
 *
 * Reads are best-effort: an unsupported device, a missing Health Connect app or a refused
 * permission all resolve to "no data" rather than an error, because none of them are
 * something the user did wrong.
 */
export const useHealthSync = (): HealthSyncState => {
  const profile = useStore(s => s.profile)
  const weightLog = useStore(s => s.weightLog)
  const addWeightEntry = useStore(s => s.addWeightEntry)

  const [availability, setAvailability] = useState<HealthAvailability>('unavailable')
  const [granted, setGranted] = useState(false)
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

  const refreshSteps = useCallback(async () => {
    const [today, week] = await Promise.all([readTodaySteps(), readSteps(7)])
    if (!mounted.current) return
    setTodaySteps(today)
    setWeekSteps(week)
  }, [])

  // Probe once on mount. Cheap, and silent when unsupported.
  useEffect(() => {
    void (async () => {
      const status = await getAvailability()
      if (!mounted.current) return
      setAvailability(status)
      if (status !== 'available') return
      const ok = await hasPermissions()
      if (!mounted.current) return
      setGranted(ok)
      if (ok) void refreshSteps()
    })()
  }, [refreshSteps])

  const connect = useCallback(async () => {
    setBusy(true)
    try {
      const ok = await requestPermissions()
      if (!mounted.current) return
      setGranted(ok)
      if (ok) await refreshSteps()
    } finally {
      if (mounted.current) setBusy(false)
    }
  }, [refreshSteps])

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

  return {
    availability,
    granted,
    todaySteps,
    weekSteps,
    importedWeights,
    busy,
    connect,
    importWeightHistory,
    refreshSteps,
  }
}
