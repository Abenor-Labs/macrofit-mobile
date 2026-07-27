// supabase-js builds request URLs with the WHATWG `URL` API, which React Native does not
// ship. Without this polyfill the client throws on its very first call, so the import must
// come before it — side-effect first, then everything else.
import 'react-native-url-polyfill/auto'

import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState, type AppStateStatus } from 'react-native'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env'

/**
 * The Supabase client for the mobile app.
 *
 * Mirrors the web client (`../../src/lib/supabase.ts`) but persists the session through
 * AsyncStorage rather than localStorage, so a signed-in user stays signed in across app
 * restarts.
 *
 * `detectSessionInUrl` MUST stay false. It exists for the browser OAuth redirect flow; on
 * native there is no `window.location` to read and leaving it on makes the client throw
 * during construction. Any OAuth flow added later has to arrive over a deep link and be
 * handed to `supabase.auth.setSession` explicitly.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

/**
 * Runs the token refresh timer only while the app is in the foreground.
 *
 * The timer is a plain `setInterval`, which the OS suspends along with the rest of the JS
 * thread when the app is backgrounded. Without restarting it on resume, a session that
 * expired while the phone was in a pocket is never refreshed and the next request fails
 * with an opaque 401 — the failure looks like a server problem, not a lifecycle one.
 */
const syncAutoRefresh = (status: AppStateStatus): void => {
  const pending =
    status === 'active' ? supabase.auth.startAutoRefresh() : supabase.auth.stopAutoRefresh()

  // Deliberately fire-and-forget: a refresh failure already surfaces through
  // `onAuthStateChange`, and an unhandled rejection here would take down the JS thread.
  void pending.catch(() => undefined)
}

// 'change' does not fire for the state the app launches in, so seed from it directly.
syncAutoRefresh(AppState.currentState)
AppState.addEventListener('change', syncAutoRefresh)
