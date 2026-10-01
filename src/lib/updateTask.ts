import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as BackgroundTask from 'expo-background-task'
import * as TaskManager from 'expo-task-manager'

import { checkForUpdate } from './appUpdate'
import { notifyUpdateAvailable } from './notifications'
import { syncRemindersInBackground } from './reminderSync'

/**
 * The app's periodic background run: re-arms the week's reminders, and checks GitHub for a
 * newer release while the app is closed.
 *
 * Reminders first. They are alarms, and a phone that force-stops the app for battery
 * (OxygenOS does) wipes them; without this run they stay wiped until the next launch. The
 * home-screen widgets re-arm them hourly too, but only for someone who has placed one.
 *
 * Then the update check, for the person who has not opened the app in a week and so never
 * sees the icon on Today. It runs through Android's WorkManager, which decides the exact
 * moment (after the interval, with a network connection), so it costs nothing noticeable.
 *
 * The task is DEFINED here, at module scope, because Android can start the JS runtime just
 * to run it — with no screen mounted — and the definition has to exist by then. The app's
 * entry (index.ts) requires this file for that reason; a screen importing it is too late.
 *
 * The name stays 'macrofit-update-check' although the task now does more: phones already
 * have it registered under that name, and renaming would leave them running a task that no
 * longer exists.
 */

const TASK = 'macrofit-update-check'

/** Often enough that a wiped schedule loses at most a few hours of reminders. */
const INTERVAL_MINUTES = 3 * 60

/** Twice a day at most. Releases are days apart; checking more often only spends GitHub's limit. */
const UPDATE_CHECK_GAP_MS = 12 * 60 * 60 * 1000
const LAST_UPDATE_CHECK_KEY = 'macrofit-last-update-check'

const checkForUpdateIfDue = async (): Promise<void> => {
  const last = Number(await AsyncStorage.getItem(LAST_UPDATE_CHECK_KEY))
  if (Number.isFinite(last) && Date.now() - last < UPDATE_CHECK_GAP_MS) return
  const result = await checkForUpdate()
  await AsyncStorage.setItem(LAST_UPDATE_CHECK_KEY, String(Date.now()))
  if (result.available) {
    await notifyUpdateAvailable(result.available.version, result.available.notes)
  }
}

TaskManager.defineTask(TASK, async () => {
  await syncRemindersInBackground()
  try {
    await checkForUpdateIfDue()
    return BackgroundTask.BackgroundTaskResult.Success
  } catch {
    // Offline, rate limited, GitHub down: all of them mean "try again next time".
    return BackgroundTask.BackgroundTaskResult.Failed
  }
})

/**
 * Registers the periodic run. Safe to call on every launch.
 *
 * Registering a task that already exists only rewrites its saved options; the job keeps the
 * interval it was first scheduled with. So a phone registered under an older interval is
 * unregistered and registered afresh.
 */
export const registerUpdateCheck = async (): Promise<void> => {
  if (Platform.OS !== 'android') return
  try {
    const status = await BackgroundTask.getStatusAsync()
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return
    const registered = (await TaskManager.getRegisteredTasksAsync()).find(t => t.taskName === TASK)
    if (registered?.options?.minimumInterval === INTERVAL_MINUTES) return
    if (registered) await BackgroundTask.unregisterTaskAsync(TASK)
    await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: INTERVAL_MINUTES })
  } catch {
    // A phone that refuses background work still has the icon on Today, and the widgets.
  }
}
