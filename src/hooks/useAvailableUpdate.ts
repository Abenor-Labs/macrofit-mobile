import { useEffect, useSyncExternalStore } from 'react'
import { Platform } from 'react-native'

import { checkForUpdate, type AvailableRelease } from '@/lib/appUpdate'

/*
  One check per app process, shared by every screen that asks.

  The Today header mounts on every cold start and remounts on tab switches; checking each time
  would spend GitHub's 60-requests-an-hour allowance for the whole device on a question whose
  answer changes a few times a month. A module-level result survives remounts and dies with the
  process, which is exactly the lifetime of "is there something newer than what is running".
*/
let known: AvailableRelease | null = null
let started = false
const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => known

/** Records a check's outcome, so a manual check on Profile also updates the header icon. */
export const publishAvailableUpdate = (release: AvailableRelease | null) => {
  known = release
  listeners.forEach(listener => listener())
}

/**
 * The newer release, or null — including while the check runs and when it fails.
 *
 * Failure is silent on purpose: this only decides whether an icon appears. The explicit
 * "Check for updates" control on Profile is where errors are worth a sentence.
 */
export const useAvailableUpdate = (): AvailableRelease | null => {
  useEffect(() => {
    if (started || Platform.OS !== 'android') return
    started = true
    void checkForUpdate()
      .then(result => publishAvailableUpdate(result.available))
      .catch(() => {
        // Let a later mount try again; offline at launch should not mean no icon all session.
        started = false
      })
  }, [])

  return useSyncExternalStore(subscribe, getSnapshot)
}
