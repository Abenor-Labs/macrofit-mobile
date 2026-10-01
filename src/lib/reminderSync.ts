import { getTodayString } from '@core/utils/calculations'
import { useStore, whenStoreHydrated } from '@/store/useStore'
import { getNotificationPrefs, whenPrefsHydrated } from '@/store/notificationPrefs'
import { planReminders } from './reminderPlan'
import { applyReminderPlan } from './notifications'

/**
 * Makes the phone's pending reminders match the week's plan, from the data as it is now.
 *
 * Re-arms every reminder, including ones Expo already lists as scheduled. That list is Expo's
 * own copy on disk, not Android's alarms: when the system force-stops the app (OxygenOS does,
 * for battery), the alarms go and the list stays. Skipping "already scheduled" reminders
 * would leave them silently dead until the next launch.
 */
export const syncReminders = async (): Promise<void> => {
  const state = useStore.getState()
  const plan = planReminders({
    now: new Date(),
    today: getTodayString(),
    diary: state.diary,
    goals: state.goals,
    weightLog: state.weightLog,
    workoutLog: state.workoutLog,
    activeWorkoutId: state.activeWorkoutId,
    program: state.trainingPrograms.find(p => p.id === state.activeProgramId) ?? null,
    customLifts: state.customLifts,
    weightUnit: state.profile.weightUnit,
    prefs: getNotificationPrefs(),
  })
  await applyReminderPlan(plan)
}

/**
 * The same, from a runtime with nothing mounted: the widget task and the background task.
 *
 * Those are what keep reminders alive on a phone whose owner does not open the app every
 * day. Without them a wiped schedule stays wiped until the next launch — which is how a
 * whole morning's reminders went missing on a OnePlus.
 *
 * Does nothing unless both stores loaded and the person has set up: a plan made from
 * defaults would cancel their real reminders.
 */
export const syncRemindersInBackground = async (): Promise<void> => {
  try {
    const [storeRead, prefsRead] = await Promise.all([whenStoreHydrated(), whenPrefsHydrated()])
    if (!storeRead || !prefsRead || useStore.getState().onboardedAt === null) return
    await syncReminders()
  } catch {
    // The next widget redraw or background run tries again; nothing here is the user's doing.
  }
}
