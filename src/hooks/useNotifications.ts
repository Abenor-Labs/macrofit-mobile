import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'

import { sessionSetCount } from '@core/utils/workoutMath'
import { useStore } from '@/store/useStore'
import { getTodayString } from '@core/utils/calculations'
import { useNotificationPrefs, getNotificationPrefs } from '@/store/notificationPrefs'
import { planReminders } from '@/lib/reminderPlan'
import {
  applyReminderPlan,
  cancelRestOver,
  cancelWorkoutLeftOpen,
  routeOf,
  scheduleWorkoutLeftOpen,
  setupNotifications,
} from '@/lib/notifications'
import { registerUpdateCheck } from '@/lib/updateTask'

/**
 * Everything notifications need from the running app. Mounted once, in RootNavigator, which
 * outlives every screen — the workout reminder in particular must keep working after the
 * user leaves Training with a session still open.
 */
export const useNotifications = (): void => {
  // Channels first: anything scheduled before they exist is dropped on Android 8+.
  useEffect(() => {
    void setupNotifications().then(registerUpdateCheck)
  }, [])

  // A tap opens where the notification is about — also when the tap is what launched the app.
  useEffect(() => {
    const open = (notification: Notifications.Notification) => {
      const url = routeOf(notification)
      // Typed routes cannot know a string from a notification payload; routeOf has already
      // checked it is an in-app path.
      if (url) router.push(url as never)
    }
    const launch = Notifications.getLastNotificationResponse()
    if (launch?.notification) open(launch.notification)
    const subscription = Notifications.addNotificationResponseReceivedListener(response =>
      open(response.notification)
    )
    return () => subscription.remove()
  }, [])

  /*
    Workout left open: rescheduled two hours out whenever a set is ticked, cancelled the
    moment the session ends. Keyed on the set count rather than the whole session object so
    typing a weight does not reschedule it on every keystroke.
  */
  const session = useStore(s => s.workoutLog.find(w => w.id === s.activeWorkoutId) ?? null)
  const sets = session ? sessionSetCount(session) : 0
  const sessionName = session?.name ?? null
  const wasRunning = useRef(false)
  const workoutOpenOn = useNotificationPrefs(p => p.workoutOpen)

  useEffect(() => {
    if (sessionName === null) {
      if (wasRunning.current) {
        void cancelWorkoutLeftOpen()
        // A finished workout has no next set to rest for.
        void cancelRestOver()
      }
      wasRunning.current = false
      return
    }
    wasRunning.current = true
    void scheduleWorkoutLeftOpen(sessionName)
  }, [sessionName, sets, workoutOpenOn])

  /*
    Reminders: the whole week's plan is recomputed from scratch and swapped in whenever
    anything it reads changes, and whenever the app comes back to the foreground (the date may
    have rolled over). Debounced, so a burst of edits — ticking five sets, typing a food —
    costs one reschedule, not five.
  */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const reconcile = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
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
          weightUnit: state.profile.weightUnit,
          prefs: getNotificationPrefs(),
        })
        void applyReminderPlan(plan).catch(() => undefined)
      }, 1500)
    }

    reconcile()
    const unsubscribeStore = useStore.subscribe((next, prev) => {
      if (
        next.diary !== prev.diary ||
        next.weightLog !== prev.weightLog ||
        next.workoutLog !== prev.workoutLog ||
        next.activeWorkoutId !== prev.activeWorkoutId ||
        next.trainingPrograms !== prev.trainingPrograms ||
        next.activeProgramId !== prev.activeProgramId ||
        next.goals !== prev.goals
      ) {
        reconcile()
      }
    })
    const unsubscribePrefs = useNotificationPrefs.subscribe(reconcile)
    const appState = AppState.addEventListener('change', status => {
      if (status === 'active') reconcile()
    })
    return () => {
      if (timer) clearTimeout(timer)
      unsubscribeStore()
      unsubscribePrefs()
      appState.remove()
    }
  }, [])
}
