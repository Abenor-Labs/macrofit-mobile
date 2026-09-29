import { router, type Href } from 'expo-router'

/**
 * Goes to `href` through a one-way door: everything under the current screen is cleared first.
 *
 * `router.replace` swaps only the top screen. Welcome PUSHES Login, so after signing in the
 * stack was [Welcome, Home] — and Android back from Home walked straight back to the welcome
 * screen of an app the user was already signed into. Dismissing to the root first means the
 * destination is the only screen left, so back from it leaves the app, as it should.
 */
export const landAt = (href: Href): void => {
  if (router.canDismiss()) router.dismissAll()
  router.replace(href)
}
