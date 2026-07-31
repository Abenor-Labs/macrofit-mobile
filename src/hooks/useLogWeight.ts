import { useCallback } from 'react'
import * as Haptics from 'expo-haptics'

import { useStore } from '@/store/useStore'
import { useSnackbar } from '@/components/Snackbar'
import { deleteWeightForDate, writeWeightKg } from '@/lib/healthConnect'
import { useHealthSync } from './useHealthSync'

/**
 * The one way a weigh-in is recorded.
 *
 * WHY A HOOK AND NOT A STORE ACTION:
 * The store lives in `src/core`, which is shared verbatim with the web app and may never
 * import a native module. Health Connect is native and Android-only. So the store keeps doing
 * exactly what it did — record a number against a date — and the platform side of the write
 * lives here, next to the UI that already knows about confirmation and undo.
 *
 * WHY EVERY CALLER GOES THROUGH IT:
 * Three things have to happen together or the feature is wrong in a way nobody notices:
 * the local log, the Health Connect record, and something on screen saying which of those
 * worked. A second call site that writes the store directly produces a weigh-in that never
 * leaves the phone, and the user finds out by looking in Google Fit a week later.
 */

export interface LogWeightInput {
  /** 'YYYY-MM-DD'. Defaults to today at the call site, never here. */
  date: string
  /** In the user's display unit, matching how `weightLog` stores it. */
  displayWeight: number
}

const LBS_PER_KG = 2.20462

export interface LogWeightApi {
  logWeight: (input: LogWeightInput) => void
  /** Removes a weigh-in locally and from Health Connect. */
  removeWeight: (id: string, date: string) => void
}

export const useLogWeight = (): LogWeightApi => {
  const addWeightEntry = useStore(s => s.addWeightEntry)
  const removeWeightEntry = useStore(s => s.removeWeightEntry)
  const weightUnit = useStore(s => s.profile.weightUnit)
  const { show } = useSnackbar()
  const { grants } = useHealthSync()

  const toKg = useCallback(
    (displayWeight: number): number =>
      weightUnit === 'lbs' ? displayWeight / LBS_PER_KG : displayWeight,
    [weightUnit],
  )

  const logWeight = useCallback(
    ({ date, displayWeight }: LogWeightInput) => {
      if (!Number.isFinite(displayWeight) || displayWeight <= 0) return

      addWeightEntry({ date, weight: displayWeight })
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)

      const shown = `${displayWeight} ${weightUnit}`

      const undo = () => {
        // Read fresh: the entry was just created and its id is generated inside the store.
        const entry = useStore.getState().weightLog.find(e => e.date === date)
        if (entry) removeWeightEntry(entry.id)
        void deleteWeightForDate(date)
      }

      /*
        Nothing is written to Health Connect unless the user allowed it, and the message says
        which of the two happened.

        Fire-and-forget on purpose — a slow provider must not hold up the confirmation of a
        write that has already succeeded locally — but NOT silent. "Saved to Health Connect"
        and "couldn't reach Health Connect" are different facts, and a user who asked for the
        sync will go looking in Google Fit for the answer if the app declines to give one.
      */
      if (!grants.writeWeight) {
        show(`Logged ${shown}`, { label: 'Undo', onPress: undo })
        return
      }

      void writeWeightKg(toKg(displayWeight), date).then(ok => {
        show(
          ok ? `Logged ${shown} · saved to Health Connect` : `Logged ${shown} · Health Connect not updated`,
          { label: 'Undo', onPress: undo },
        )
      })
    },
    [addWeightEntry, removeWeightEntry, grants.writeWeight, show, toKg, weightUnit],
  )

  const removeWeight = useCallback(
    (id: string, date: string) => {
      removeWeightEntry(id)
      /*
        Deleting locally alone leaves the record in Health Connect, and therefore in every
        other app reading from it — a mistyped 172 kg vanishes here and stays visible in Fit
        forever. Only records this app wrote carry the id, so a scale's own reading for the
        same day is never caught by this.
      */
      void deleteWeightForDate(date)
    },
    [removeWeightEntry],
  )

  return { logWeight, removeWeight }
}
