/**
 * Build-time configuration, read from `EXPO_PUBLIC_*` variables.
 *
 * Expo inlines these by substituting the literal text `process.env.EXPO_PUBLIC_NAME` at
 * bundle time. Every read below must therefore be that exact static expression:
 * destructuring `process.env`, aliasing it, or indexing it with a computed key all yield
 * `undefined` in a release build even when the value is set.
 *
 * See `mobile/.env.example` for the variables and how to set them.
 */

/**
 * Zero-width space, non-joiner, joiner, and the byte-order mark. Built from escapes on
 * purpose: a literal one of these in source would be invisible and unreviewable.
 */
const INVISIBLE = new RegExp('[\u200B\u200C\u200D\uFEFF]', 'g')

/**
 * Returns the cleaned value, or null when the variable is unset or blank.
 *
 * Strips zero-width and BOM characters as well as whitespace and wrapping quotes. The
 * anon key is sent as an HTTP header, and a header value containing a code point above
 * U+00FF makes fetch throw before the request leaves the device. A leading U+FEFF picked
 * up from a copy-paste is invisible and breaks every request with an error that names
 * neither the header nor the variable - this happened in production.
 */
const read = (value: string | undefined): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.replace(INVISIBLE, '').trim().replace(/^["']|["']$/g, '')
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Returns the value, or throws naming the variable that is missing.
 *
 * Missing Supabase config has to fail loudly at startup: `createClient(undefined, ...)`
 * constructs happily and only surfaces much later as an unexplained auth or network
 * failure that looks nothing like a configuration problem.
 */
const requireVar = (value: string | null, name: string): string => {
  if (value === null) {
    throw new Error(
      `Missing ${name}. Add it to mobile/.env (see mobile/.env.example), then restart the ` +
        'bundler with `npx expo start --clear` — EXPO_PUBLIC_* values are inlined at bundle ' +
        'time, so an already-running Metro keeps serving the old ones.',
    )
  }
  return value
}

/** Supabase project URL. Required — the app cannot start without it. */
export const SUPABASE_URL: string = requireVar(
  read(process.env.EXPO_PUBLIC_SUPABASE_URL),
  'EXPO_PUBLIC_SUPABASE_URL',
)

/**
 * Supabase anon (publishable) key. Required.
 * Safe to ship inside the bundle — row level security, not secrecy, is what protects data.
 */
export const SUPABASE_ANON_KEY: string = requireVar(
  read(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
)

/**
 * Origin hosting the AI endpoints, with any trailing slash removed, or null when unset.
 *
 * Optional at startup on purpose: diary, workouts and sync all work without it, so a
 * missing value must not crash the whole app. `requireApiUrl()` enforces it at call time
 * instead, where the error can name the feature that needs it.
 */
export const API_URL: string | null = ((): string | null => {
  const value = read(process.env.EXPO_PUBLIC_API_URL)
  return value === null ? null : value.replace(/\/+$/, '')
})()

/**
 * Returns the API origin, or throws a message that names the likely misconfiguration.
 *
 * The scheme check is not pedantry: `192.168.1.20:3000` without `http://` is accepted by
 * `fetch` on some platforms as a relative path and fails with an error that says nothing
 * about the real cause.
 */
export const requireApiUrl = (): string => {
  if (API_URL === null) {
    throw new Error(
      'Missing EXPO_PUBLIC_API_URL, so the AI features cannot be reached. Set it to your ' +
        "dev machine's LAN IP (e.g. http://192.168.1.20:3000) or a deployed URL — on a phone " +
        "or emulator 'localhost' resolves to the device itself. See mobile/.env.example.",
    )
  }
  if (!/^https?:\/\//.test(API_URL)) {
    throw new Error(
      `EXPO_PUBLIC_API_URL must include a scheme and start with http:// or https:// — got '${API_URL}'.`,
    )
  }
  return API_URL
}

/**
 * USDA FoodData Central key.
 *
 * Falls back to the shared DEMO_KEY exactly like the web app (30 req/min, 1000 req/day per
 * IP) so food search works before anyone signs up for their own.
 */
export const USDA_API_KEY: string = read(process.env.EXPO_PUBLIC_USDA_API_KEY) ?? 'DEMO_KEY'
