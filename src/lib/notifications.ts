import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { getNotificationPrefs } from '@/store/notificationPrefs'
import type { PlannedReminder } from './reminderPlan'

/**
 * Every system notification MacroFit sends, in one place.
 *
 * All of them are LOCAL: scheduled on the phone from data the phone already has, so there is
 * no push server, no device token and nothing that works only online. Each has a fixed
 * identifier, so scheduling it again replaces it rather than stacking a duplicate, and
 * cancelling it needs nothing but its name.
 *
 * WHY THE CHANNEL IDS CARRY A VERSION:
 * Android freezes a channel's sound and importance the moment it is created; an app can never
 * change them afterwards. Shipping a new tone therefore means a new channel id. Bump the
 * suffix, never edit a channel in place.
 */

export const CHANNELS = {
  workout: 'workout-v1',
  reminders: 'reminders-v1',
  // Its own channel because on Android 8+ the CHANNEL's sound plays, not the notification's:
  // a water nudge posted to 'reminders' would ring the reminder tone.
  water: 'water-v1',
  updates: 'updates-v1',
} as const

const IDS = {
  restOver: 'rest-over',
  workoutOpen: 'workout-left-open',
} as const

/** Kind tag on every notification's data, so the foreground handler can treat them apart. */
type Kind = 'rest' | 'workout-open' | 'update'

const LAST_UPDATE_NOTIFIED_KEY = 'macrofit-last-update-notified'

/** Whether the rest timer (visible in the app) owns this notification while the app is open. */
const ownedByOpenApp = (kind: unknown): boolean => kind === 'rest' || kind === 'workout-open'

let configured = false

/**
 * Channels and the foreground policy. Idempotent; call once at launch, before anything is
 * scheduled — a notification posted to a channel that does not exist yet is dropped on
 * Android 8+.
 */
export const setupNotifications = async (): Promise<void> => {
  if (configured) return
  configured = true

  Notifications.setNotificationHandler({
    handleNotification: async notification => {
      // With the app open, the rest timer is already on screen and has buzzed; a banner and
      // a second sound on top of it would be the same news twice.
      const quiet = ownedByOpenApp(notification.request.content.data?.kind)
      return {
        shouldShowBanner: !quiet,
        shouldShowList: !quiet,
        shouldPlaySound: !quiet,
        shouldSetBadge: false,
      }
    },
  })

  if (Platform.OS !== 'android') return

  await Notifications.setNotificationChannelAsync(CHANNELS.workout, {
    name: 'Workout',
    description: 'Rest timer and a workout left running',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'rest_over.wav',
    // A strong double buzz: on vibrate, the pattern alone says "rest is over".
    vibrationPattern: [0, 220, 120, 220],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  })
  await Notifications.setNotificationChannelAsync(CHANNELS.reminders, {
    name: 'Reminders',
    description: 'Training days, meals, weigh-ins and water',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'reminder.wav',
    vibrationPattern: [0, 180],
  })
  await Notifications.setNotificationChannelAsync(CHANNELS.water, {
    name: 'Water',
    description: 'A nudge when you are behind on water for the day',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'water.wav',
    vibrationPattern: [0, 120],
  })
  await Notifications.setNotificationChannelAsync(CHANNELS.updates, {
    name: 'App updates',
    description: 'A new version of MacroFit is ready',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'reminder.wav',
  })
}

/** Granted already, or granted now. Never nags: a "don't ask again" answer stays answered. */
export const ensureNotificationPermission = async (): Promise<boolean> => {
  const current = await Notifications.getPermissionsAsync()
  if (current.granted) return true
  if (!current.canAskAgain) return false
  const asked = await Notifications.requestPermissionsAsync()
  return asked.granted
}

const hasPermission = async (): Promise<boolean> =>
  (await Notifications.getPermissionsAsync()).granted

// --- Rest over ------------------------------------------------------------------------------

/**
 * Fires when the rest countdown ends — the one that matters when the phone is locked in a
 * pocket between sets. Rescheduling replaces the previous one (same identifier), so +30s and
 * -30s on the timer simply move it.
 *
 * `next` names the set waiting ("Next: Bench Press · 80 kg × 8"), so the lock screen answers
 * the only question anyone has at that moment without unlocking the phone. Without one it
 * falls back to the generic line.
 */
export const scheduleRestOver = async (seconds: number, next?: string): Promise<void> => {
  if (seconds < 1 || !getNotificationPrefs().restOver) return
  if (!(await ensureNotificationPermission())) return
  await Notifications.scheduleNotificationAsync({
    identifier: IDS.restOver,
    content: {
      title: 'Rest is over',
      body: next !== undefined && next !== '' ? next : 'Time for your next set.',
      sound: 'rest_over.wav',
      data: { kind: 'rest' satisfies Kind, url: '/training' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.round(seconds),
      channelId: CHANNELS.workout,
    },
  })
}

export const cancelRestOver = (): Promise<void> =>
  Notifications.cancelScheduledNotificationAsync(IDS.restOver).catch(() => undefined)

// --- Workout left open ----------------------------------------------------------------------

/** Two hours of silence from a running workout almost always means it was never finished. */
const WORKOUT_OPEN_AFTER_S = 2 * 60 * 60

/**
 * Pushed back two hours every time a set is ticked, so it only ever fires after two hours of
 * nothing. Never asks for permission itself: it is not worth an interruption on its own.
 */
export const scheduleWorkoutLeftOpen = async (workoutName: string): Promise<void> => {
  if (!getNotificationPrefs().workoutOpen) return void cancelWorkoutLeftOpen()
  if (!(await hasPermission())) return
  await Notifications.scheduleNotificationAsync({
    identifier: IDS.workoutOpen,
    content: {
      title: `${workoutName} is still running`,
      body: 'Finish it to save your sets and see your summary.',
      sound: 'rest_over.wav',
      data: { kind: 'workout-open' satisfies Kind, url: '/training' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: WORKOUT_OPEN_AFTER_S,
      channelId: CHANNELS.workout,
    },
  })
}

export const cancelWorkoutLeftOpen = (): Promise<void> =>
  Notifications.cancelScheduledNotificationAsync(IDS.workoutOpen).catch(() => undefined)

// --- Update available -----------------------------------------------------------------------

/** First line of the release notes, stripped of Markdown, as the notification's body. */
const summaryOf = (notes: string | undefined): string | null => {
  const line = notes
    ?.split('\n')
    .map(l => l.replace(/^[#>*\-\s]+/, '').replace(/[*_`]/g, '').trim())
    .find(l => l.length > 0)
  return line ? (line.length > 110 ? `${line.slice(0, 107)}…` : line) : null
}

/**
 * Announces a new release once per version, ever. Called from the background check, so it
 * never asks for permission — without it, the update icon on Today still does the job.
 */
export const notifyUpdateAvailable = async (version: string, notes?: string): Promise<void> => {
  if (!getNotificationPrefs().updates || !(await hasPermission())) return
  if ((await AsyncStorage.getItem(LAST_UPDATE_NOTIFIED_KEY)) === version) return
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `MacroFit ${version} is ready`,
      body: summaryOf(notes) ?? 'Tap to see what is new and update.',
      sound: 'reminder.wav',
      data: { kind: 'update' satisfies Kind, url: '/update' },
    },
    trigger: { channelId: CHANNELS.updates },
  })
  await AsyncStorage.setItem(LAST_UPDATE_NOTIFIED_KEY, version)
}

/** Where a tapped notification should take the user, if anywhere. */
export const routeOf = (notification: Notifications.Notification): string | null => {
  const url = notification.request.content.data?.url
  return typeof url === 'string' && url.startsWith('/') ? url : null
}

// --- Reminders ------------------------------------------------------------------------------

const REMINDER_PREFIX = 'rem:'

/**
 * Makes the pending reminders exactly `plan`: anything pending that is not in it is cancelled,
 * everything in it is (re)scheduled under its fixed id. Called whenever the data a reminder
 * depends on changes, so a reminder never outlives the reason for it.
 */
export const applyReminderPlan = async (plan: PlannedReminder[]): Promise<void> => {
  const pending = await Notifications.getAllScheduledNotificationsAsync()
  const wanted = new Set(plan.map(reminder => reminder.id))
  await Promise.all(
    pending
      .filter(n => n.identifier.startsWith(REMINDER_PREFIX) && !wanted.has(n.identifier))
      .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier))
  )
  if (plan.length === 0 || !(await hasPermission())) return
  for (const reminder of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: reminder.id,
      content: {
        title: reminder.title,
        body: reminder.body,
        sound: reminder.sound,
        data: { kind: reminder.kind, url: reminder.url },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminder.at,
        channelId: reminder.sound === 'water.wav' ? CHANNELS.water : CHANNELS.reminders,
      },
    })
  }
}
