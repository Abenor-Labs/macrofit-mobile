import { Platform } from 'react-native'
import * as BackgroundTask from 'expo-background-task'
import * as TaskManager from 'expo-task-manager'

import { checkForUpdate } from './appUpdate'
import { notifyUpdateAvailable } from './notifications'

/**
 * Checks GitHub for a newer release while the app is closed, and says so once.
 *
 * The Today header's update icon only helps someone who opens the app. This is how a person
 * who has not opened it in a week hears that a new version exists. It runs through Android's
 * WorkManager, which decides the exact moment (after the interval, when the phone is not
 * starved of battery), so it costs nothing noticeable.
 *
 * The task is DEFINED here, at module scope, because Android can start the JS runtime just
 * to run it — with no screen mounted — and the definition has to exist by then. Importing
 * this file from the root layout is what guarantees that.
 */

const TASK = 'macrofit-update-check'

/** Twice a day at most. Releases are days apart; checking more often only spends GitHub's limit. */
const INTERVAL_MINUTES = 12 * 60

TaskManager.defineTask(TASK, async () => {
  try {
    const result = await checkForUpdate()
    if (result.available) {
      await notifyUpdateAvailable(result.available.version, result.available.notes)
    }
    return BackgroundTask.BackgroundTaskResult.Success
  } catch {
    // Offline, rate limited, GitHub down: all of them mean "try again next time".
    return BackgroundTask.BackgroundTaskResult.Failed
  }
})

/** Registers the periodic check. Safe to call on every launch. */
export const registerUpdateCheck = async (): Promise<void> => {
  if (Platform.OS !== 'android') return
  try {
    const status = await BackgroundTask.getStatusAsync()
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return
    if (await TaskManager.isTaskRegisteredAsync(TASK)) return
    await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: INTERVAL_MINUTES })
  } catch {
    // A phone that refuses background work still has the icon on Today.
  }
}
