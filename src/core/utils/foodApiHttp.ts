import { getUserAgent } from './foodApiConfig'

/**
 * The one way this codebase talks to a remote food database.
 *
 * WHY A SHARED HELPER RATHER THAN TWO FETCHES:
 * Both callers are searched from the same keystroke and their results land in the same
 * list, so they have to fail on the same terms. `searchUSDA` had no timeout at all, which
 * on mobile means a stalled radio holds the spinner until the OS gives up — potentially
 * minutes, on a screen whose whole job is to answer in under a second. A cap belongs on
 * every remote food call, not on whichever one was written most recently.
 *
 * `User-Agent` is not optional for Open Food Facts: it blocks unidentified clients. It is
 * harmless for USDA, and sending it from one place means the identification cannot drift.
 */

/**
 * Long enough for a cold CDN edge, short enough that the list is not held hostage.
 *
 * The search UI already shows local results immediately, so this only bounds how long the
 * remote section says "searching". Past about six seconds a user has retyped anyway.
 */
export const FOOD_API_TIMEOUT_MS = 6000

/** Raised when the request was cut short by the timeout rather than refused by the server. */
export class FoodApiTimeout extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`Timed out after ${timeoutMs}ms: ${url}`)
    this.name = 'FoodApiTimeout'
  }
}

/**
 * GETs `url` and parses the JSON body, or throws.
 *
 * `AbortController` rather than `AbortSignal.timeout` because this module is vendored into
 * a React Native bundle, where the static helper is not reliably present across Hermes
 * versions while the controller has been for years.
 */
export const fetchFoodJson = async (
  url: string,
  timeoutMs: number = FOOD_API_TIMEOUT_MS,
): Promise<unknown> => {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': getUserAgent(),
      },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return (await response.json()) as unknown
  } catch (error) {
    // An abort surfaces as a generic AbortError, which tells a caller nothing about whether
    // the deadline passed or the request was cancelled for some other reason.
    if (timedOut) throw new FoodApiTimeout(url, timeoutMs)
    throw error
  } finally {
    clearTimeout(timer)
  }
}
