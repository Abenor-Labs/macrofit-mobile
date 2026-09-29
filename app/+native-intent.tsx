import { queueWidgetRoute, widgetRouteOf } from '@/widgets/links'

/**
 * Every link the system hands the app passes through here first.
 *
 * Only the home-screen widget's links are intercepted; see src/widgets/links.ts for why they
 * are parked rather than routed. Everything else — the auth callback in particular — goes
 * through untouched.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  try {
    const route = widgetRouteOf(path)
    if (route === null) return path
    queueWidgetRoute(route)
    // No redirection: a cold start opens on the launch gate as usual, a warm one stays put
    // until the tab navigator acts on the parked route.
    return null
  } catch {
    return path
  }
}
