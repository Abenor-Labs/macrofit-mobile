import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { useStore } from '@/store/useStore'
import { useAuth } from '@/lib/AuthProvider'
import { capturePhoto } from '@/lib/mealPhoto'
import { appAlert } from '@/components/AppAlert'
import { refreshWidgets, widgetsAvailable } from './index'
import {
  handOffWidgetPhoto,
  onWidgetRoute,
  PHOTO_ROUTE,
  SNAP_TAKEN,
  takeWidgetRoute,
  TODAY_ROUTE,
} from './links'

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

/*
  The widget's Photo button: the camera first, straight over Today, and the Coach only once
  there is a photo for it. Opening the Coach and having it open the camera showed Today, then
  the Coach sliding in, then the camera — the app visibly navigating itself to get there.
  Cancelled, it stays on Today. Refused, the Coach opens and explains, as for its own button.
  A guest never gets here: the Coach, which needs an account, says so instead.
*/
const snapThenCoach = async (router: ReturnType<typeof useRouter>): Promise<void> => {
  let capture
  try {
    capture = await capturePhoto('camera')
  } catch (err: unknown) {
    appAlert('Could not prepare that photo', err instanceof Error ? err.message : 'Try taking it again.')
    return
  }
  if (capture.status === 'canceled') return
  if (capture.status === 'denied') {
    router.push(PHOTO_ROUTE as Href)
    return
  }
  handOffWidgetPhoto(capture.photo)
  router.push(`/chat?snap=${SNAP_TAKEN}` as Href)
}

/** A tap on a widget is acted on only while it is fresh: not minutes later, after setup. */
const ROUTE_TTL_MS = 2 * 60 * 1000

/**
 * Opens the screen a widget tap asked for. Mounted by the tab navigator, so it acts only once
 * the launch gate, sign-in and setup are all behind the user and Today sits under the target.
 */
export const useWidgetLaunch = (): void => {
  const router = useRouter()
  const { user } = useAuth()
  const signedIn = useRef(user !== null)
  signedIn.current = user !== null
  useEffect(() => {
    let frame: number | null = null
    const go = () => {
      const parked = takeWidgetRoute()
      if (!parked || Date.now() - parked.at > ROUTE_TTL_MS) return
      // Back from the target returns to Today, whatever was open when the widget was tapped.
      if (router.canDismiss()) router.dismissAll()
      if (parked.route === TODAY_ROUTE) router.navigate('/(tabs)')
      else if (parked.route === PHOTO_ROUTE && signedIn.current) void snapThenCoach(router)
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
