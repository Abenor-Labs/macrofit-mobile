/**
 * Per-platform configuration for the remote food databases.
 *
 * WHY THIS EXISTS:
 * `usdaApi.ts` read its key straight off `import.meta.env.VITE_USDA_API_KEY`. That works in
 * Vite and nowhere else. The mobile app vendors this directory verbatim (see
 * `mobile/scripts/sync-core.mjs`) and runs it under Metro/Hermes, where `import.meta` does
 * not exist — so on mobile the expression could only ever produce the fallback, and
 * `EXPO_PUBLIC_USDA_API_KEY` had never once been read despite being documented, shipped in
 * `.env.example`, and validated on startup.
 *
 * The visible symptom was not "no key". It was intermittent, unexplained search failures:
 * DEMO_KEY is shared by every anonymous caller and capped at 30 requests a minute and 1000
 * a day per IP, so food search returned "Could not reach USDA FoodData Central" at busy
 * times and worked fine at quiet ones.
 *
 * A module under `src/utils` may not read a platform global. Each app supplies its own
 * values at startup instead, and the shared code only ever reads them back from here.
 *
 * Web:    `configureFoodApis({ usdaApiKey: import.meta.env.VITE_USDA_API_KEY })`
 * Mobile: `configureFoodApis({ usdaApiKey: USDA_API_KEY, userAgent: … })` from `src/lib/env.ts`
 *
 * Calling nothing is safe: the defaults below are what the app used before this file
 * existed, so an unconfigured caller degrades to DEMO_KEY rather than failing.
 */

/**
 * USDA's shared anonymous key. 30 req/min, 1000 req/day per IP, across every caller using
 * it — which is why it is a floor, not a plan.
 */
const DEMO_KEY = 'DEMO_KEY'

/**
 * Open Food Facts blocks clients that do not identify themselves, and asks that the string
 * name the app and offer a contact route. A generic browser-ish agent gets rate-limited or
 * refused outright.
 */
const DEFAULT_USER_AGENT = 'MacroFit - https://github.com/warpirate/macrofit-mobile'

export interface FoodApiConfig {
  /** USDA FoodData Central key. Falls back to the shared DEMO_KEY. */
  usdaApiKey: string
  /** Sent to Open Food Facts, which requires callers to identify themselves. */
  userAgent: string
}

const config: FoodApiConfig = {
  usdaApiKey: DEMO_KEY,
  userAgent: DEFAULT_USER_AGENT,
}

/**
 * Returns the cleaned value, or null when it is missing or blank.
 *
 * A dashboard-supplied variable that exists with an empty value is not undefined, so `??`
 * alone would hand `''` straight through and every request would go out with an empty
 * `api_key` — a 403 that names nothing. Blank means unset.
 */
const clean = (value: string | undefined | null): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Sets the values this module hands out. Call once, at startup, before any search runs.
 *
 * Each field is independent: passing only `usdaApiKey` leaves the user agent at its default.
 * Blank and missing values are ignored rather than stored, so a half-configured environment
 * degrades to the defaults instead of sending empty credentials.
 */
export const configureFoodApis = (next: Partial<Record<keyof FoodApiConfig, string | undefined | null>>): void => {
  const usdaApiKey = clean(next.usdaApiKey)
  if (usdaApiKey !== null) config.usdaApiKey = usdaApiKey

  const userAgent = clean(next.userAgent)
  if (userAgent !== null) config.userAgent = userAgent
}

export const getUsdaApiKey = (): string => config.usdaApiKey

export const getUserAgent = (): string => config.userAgent

/** True while the shared anonymous key is in use, so callers can explain a rate limit. */
export const isUsingDemoKey = (): boolean => config.usdaApiKey === DEMO_KEY
