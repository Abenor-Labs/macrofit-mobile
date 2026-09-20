/**
 * Reading GoTrue's auth deep links.
 *
 * Its own module, with no React and no expo-linking, for one reason: the fragment half of
 * this was wrong in a shipped release and nothing could execute it outside the app. A pure
 * function over a string can be run against the real URLs GoTrue emits — see
 * `scripts/check-auth-link.mjs`.
 */

/**
 * The parameters in a URL's fragment, as a flat map.
 *
 * WHY A FRAGMENT PARSER EXISTS AT ALL. `Linking.parse` returns
 * `{ scheme, hostname, path, queryParams }` — there is no field for a fragment, so reading
 * `queryParams` alone cannot see anything after a `#`. GoTrue puts the entire result there
 * for any link the device did not itself start with PKCE:
 *
 *   macrofit://auth/callback#access_token=…&refresh_token=…&type=recovery
 *   macrofit://auth/callback#error=access_denied&error_code=otp_expired&…
 *
 * Reading only the query string therefore found neither a session nor an error, and the
 * handler returned in silence. A reset link opened the app and nothing happened.
 *
 * `URLSearchParams` rather than a split on `&`: GoTrue encodes the spaces in
 * `error_description` as `+`, and `decodeURIComponent` leaves those as literal plus signs.
 * React Native gets the class from `react-native-url-polyfill`, loaded by ./supabase.
 */
export const parseAuthFragment = (url: string): Record<string, string> => {
  const params: Record<string, string> = {}

  const hash = url.indexOf('#')
  if (hash === -1) return params

  // A trailing `#` with nothing after it is not an error, just an empty fragment.
  const fragment = url.slice(hash + 1)
  if (fragment.length === 0) return params

  for (const [key, value] of new URLSearchParams(fragment)) {
    if (value.length > 0) params[key] = value
  }

  return params
}
