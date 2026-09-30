import { useEffect } from 'react'
import { AppState } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { useStore } from '@/store/useStore'
import { refreshWidgets, widgetsAvailable } from './index'
import { onWidgetRoute, takeWidgetRoute, TODAY_ROUTE } from './links'

/**
 * Keeps the home-screen widgets in step with the store while the app is running.
 *
 * Debounced like the reminder planner: typing a serving size is a change per keystroke, and
 * each redraw is a bitmap rendered in the launcher. Also redraws on the way to the background,
 * which is the last moment the app can say what "today" is before the next hourly redraw.
 */
export const useWidgetSync = (): void => {
  useEffect(() => {
    if (!widgetsAvailable) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void refreshWidgets(), 800)
    }

    schedule()
    const unsubscribe = useStore.subscribe((next, prev) => {
      if (
        next.diary !== prev.diary ||
        next.goals !== prev.goals ||
        next.onboardedAt !== prev.onboardedAt ||
        next.workoutLog !== prev.workoutLog ||
        next.activeWorkoutId !== prev.activeWorkoutId ||
        next.trainingPrograms !== prev.trainingPrograms ||
        next.activeProgramId !== prev.activeProgramId ||
        next.customLifts !== prev.customLifts
      ) {
        schedule()
      }
    })
    const appState = AppState.addEventListener('change', status => {
      if (status === 'background') void refreshWidgets()
    })
    return () => {
      if (timer) clearTimeout(timer)
      unsubscribe()
      appState.remove()
    }
  }, [])
}

/** A tap on a widget is acted on only while it is fresh: not minutes later, after setup. */
const ROUTE_TTL_MS = 2 * 60 * 1000

/**
 * Opens the screen a widget tap asked for. Mounted by the tab navigator, so it acts only once
 * the launch gate, sign-in and setup are all behind the user and Today sits under the target.
 */
export const useWidgetLaunch = (): void => {
  const router = useRouter()
  useEffect(() => {
    let frame: number | null = null
    const go = () => {
      const parked = takeWidgetRoute()
      if (!parked || Date.now() - parked.at > ROUTE_TTL_MS) return
      // Back from the target returns to Today, whatever was open when the widget was tapped.
      if (router.canDismiss()) router.dismissAll()
      if (parked.route === TODAY_ROUTE) router.navigate('/(tabs)')
      else router.push(parked.route as Href)
    }
    // A frame's grace: on a cold start this mounts in the same commit that replaced the gate.
    const soon = () => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(go)
    }
    soon()
    const off = onWidgetRoute(soon)
    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      off()
    }
  }, [router])
}
