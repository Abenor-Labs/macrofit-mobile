/*
  Where a tap on a home-screen widget lands.

  The widget opens `macrofit://widget/<route>`. Those links are NOT handed to the router as
  they stand: on a cold start the router would open the target as the only screen in the
  stack, so Back from Food search would leave the app instead of reaching Today, and the
  sign-in and setup gates in app/index.tsx would be skipped. `+native-intent` swallows the
  link and parks its target here; the tab navigator takes it once it is mounted, which is
  also the moment every gate has been passed. On a warm start the tabs are already mounted
  and take it straight away.

  Import-free, because `+native-intent` runs before the app has loaded anything (the one
  import below is a type, and is gone from the bundle).
*/

import type { CapturedPhoto } from '@/lib/mealPhoto'

const SCHEME = 'macrofit'

/** The widget's own links. `route` is an app path such as `/food-search?meal=Lunch`. */
export const widgetLink = (route: string): string => `${SCHEME}://widget${route}`

/** Today's tab. Not `/`: that path is the launch gate in app/index.tsx, not the tab. */
export const TODAY_ROUTE = '/today'

/** The Photo button. The camera opens before the Coach does; see useWidgetLaunch. */
export const PHOTO_ROUTE = '/chat?snap=camera'
/** The Coach's `snap` once the widget has already taken the photo. */
export const SNAP_TAKEN = 'taken'

let takenPhoto: CapturedPhoto | null = null

/** Hands a photo the widget took to the Coach, which opens next. */
export const handOffWidgetPhoto = (photo: CapturedPhoto): void => {
  takenPhoto = photo
}

/** That photo, once. */
export const takeWidgetPhoto = (): CapturedPhoto | null => {
  const photo = takenPhoto
  takenPhoto = null
  return photo
}

const WIDGET_LINK = /^(?:[a-z][a-z0-9+.-]*:)?\/*widget(\/[^#]*)?$/i

/** The app route a widget link asks for, or null when `url` is not a widget link. */
export const widgetRouteOf = (url: string): string | null => {
  const match = WIDGET_LINK.exec(url.trim())
  if (!match) return null
  const route = match[1] ?? ''
  return route === '' || route === '/' ? TODAY_ROUTE : route
}

export interface ParkedRoute {
  route: string
  /** When the tap arrived, so a route left waiting behind setup can be dropped as stale. */
  at: number
}

let pending: ParkedRoute | null = null
const listeners = new Set<() => void>()

export const queueWidgetRoute = (route: string): void => {
  pending = { route, at: Date.now() }
  for (const listener of listeners) listener()
}

/** The parked route, once: taking it clears it so a re-render cannot replay the tap. */
export const takeWidgetRoute = (): ParkedRoute | null => {
  const route = pending
  pending = null
  return route
}

export const onWidgetRoute = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
