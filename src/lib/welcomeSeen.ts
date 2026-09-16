import { createDeviceFlag } from './deviceFlags'

/**
 * Whether this device has been shown the welcome screen, and whether the person using it
 * has chosen to carry on without an account.
 *
 * Both are properties of the handset rather than of a user — see `deviceFlags.ts` for why
 * that keeps them out of the synced store and out of `resetStore`'s reach.
 */

const welcome = createDeviceFlag('macrofit-welcome-seen', true)

/**
 * Set when someone taps "Get started" on the welcome screen instead of signing in.
 *
 * This is the whole of guest mode. There is no guest *account*, no placeholder user and no
 * second code path through the app: the store has never known that users exist, and Supabase
 * was only ever a sync layer bolted on top of it. So "guest" means exactly one thing — the
 * router stops sending a person with no session to the login screen.
 *
 * It is deliberately NOT inferred from "no user and setup is finished". Routing has to make a
 * decision the moment someone lands on the welcome screen, before any setup exists to read,
 * and a guess at that point would send a returning account holder into a fresh empty app.
 *
 * Falls back to `false` on an unreadable disk: wrongly assuming someone opted out of signing
 * in is the more damaging error of the two.
 */
const guest = createDeviceFlag('macrofit-guest-mode', false)

/** Kick both reads off together. Neither rejects. */
export const loadDeviceFlags = async (): Promise<void> => {
  await Promise.all([welcome.load(), guest.load()])
}

export const markWelcomeSeen = welcome.set
export const useWelcomeSeen = welcome.use

export const enterGuestMode = guest.set
export const useGuestMode = guest.use

/**
 * Called when a guest signs in, so the device stops being one.
 *
 * Without this, signing out later would drop the person back into the local-only app rather
 * than the login screen, holding whatever the account left behind — which is the shape of
 * the "whose data is this?" bug the store epochs exist to prevent.
 */
export const leaveGuestMode = guest.clear
