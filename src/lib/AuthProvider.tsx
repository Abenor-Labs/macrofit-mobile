import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { describeAuthError, normalizeEmail, type AuthResult } from '@/lib/authErrors'
import { useStore } from '@/store/useStore'

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error'

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<AuthResult>
  signUp: (email: string, password: string) => Promise<AuthResult>
  /** Re-sends the sign-up confirmation email for an address that never got one. */
  resendConfirmation: (email: string) => Promise<AuthResult>
  signOut: () => Promise<void>
  syncStatus: SyncStatus
  /**
   * A background fetch of the user's saved data is in flight.
   *
   * Only true for a sign-in that happens while the app is already running; the cold start
   * is covered by `loading`. Routing that branches on saved state — the setup flow above
   * all — has to wait for this, or a returning user is bounced into an account setup they
   * finished months ago.
   */
  hydrating: boolean
}

const AuthContext = createContext<AuthContextValue>(null!)

export const useAuth = () => useContext(AuthContext)

/**
 * Must stay identical to SYNC_FIELDS in the web AuthContext AND to the syncFields list
 * inside hydrateStore. A key that is saved but never hydrated silently fails to come back
 * on a new device — exactly the bug that lost progress photos on web.
 */
const SYNC_FIELDS = [
  'profile', 'currentWeightKg', 'goals', 'diary', 'weightLog',
  'mealTemplates', 'customFoods', 'recentFoodIds', 'streak',
  'darkMode', 'bodyMeasurements', 'fastingSession', 'progressPhotos',
  'recommendation', 'recommendationSeenAt', 'onboardedAt',
  'workoutLog', 'customLifts', 'workoutTemplates', 'activeWorkoutId',
] as const

const SAVE_DEBOUNCE_MS = 1500

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [hydrating, setHydrating] = useState(false)

  const userRef = useRef<User | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isHydratingRef = useRef(false)

  const loadUserData = async (userId: string) => {
    try {
      const result = await Promise.race([
        supabase.from('user_data').select('data').eq('user_id', userId).single(),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 8000)),
      ])
      if (!result || !('data' in result) || result.error || !result.data?.data) return

      isHydratingRef.current = true
      useStore.getState().hydrateStore(result.data.data)
      // Let the hydrated state flush before re-enabling saves, so rehydration does not
      // immediately echo back to the server as a "change".
      await new Promise(r => setTimeout(r, 300))
      isHydratingRef.current = false
    } catch {
      // No row yet for this user — they simply start fresh.
    }
  }

  const saveUserData = async (userId: string, storeData: Record<string, unknown>) => {
    setSyncStatus('saving')
    try {
      const { error } = await supabase
        .from('user_data')
        .upsert({ user_id: userId, data: storeData }, { onConflict: 'user_id' })
      setSyncStatus(error ? 'error' : 'saved')
      if (!error) setTimeout(() => setSyncStatus('idle'), 2000)
    } catch {
      setSyncStatus('error')
    }
  }

  const collect = (): Record<string, unknown> => {
    const state = useStore.getState() as unknown as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of SYNC_FIELDS) out[key] = state[key]
    return out
  }

  const flushSave = () => {
    if (!userRef.current || isHydratingRef.current) return
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    void saveUserData(userRef.current.id, collect())
  }

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setUser(data.session?.user ?? null)
      userRef.current = data.session?.user ?? null
      if (data.session?.user) {
        void loadUserData(data.session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      userRef.current = nextSession?.user ?? null
      // SIGNED_IN also fires on token refresh; getSession above already covers the
      // initial load, so this must not touch `loading` or it re-shows the splash.
      if (event === 'SIGNED_IN' && nextSession?.user) {
        setHydrating(true)
        void loadUserData(nextSession.user.id).finally(() => setHydrating(false))
      }
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  // Debounced auto-save on any store change.
  useEffect(() => {
    const unsubscribe = useStore.subscribe(() => {
      if (!userRef.current || isHydratingRef.current) return
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS)
    })
    return unsubscribe
  }, [])

  // Mobile has no "tab hidden" event: backgrounding is the moment the OS may kill the
  // process, so a pending debounced save must be flushed immediately here or the last
  // edits are lost.
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      if (next === 'background' || next === 'inactive') flushSave()
    })
    return () => sub.remove()
  }, [])

  const signIn: AuthContextValue['signIn'] = async (rawEmail, password) => {
    const email = normalizeEmail(rawEmail)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error) return { error: null, notice: null }
    return {
      error: describeAuthError(error, email),
      notice: null,
      awaitingConfirmation: error.code === 'email_not_confirmed',
    }
  }

  const signUp: AuthContextValue['signUp'] = async (rawEmail, password) => {
    const email = normalizeEmail(rawEmail)
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return { error: describeAuthError(error, email), notice: null }

    // GoTrue refuses to leak whether an address is registered: signing up an existing one
    // succeeds, returning a fabricated user whose `identities` array is empty. Without
    // this branch the screen would claim an account was created and the password silently
    // would not be the one on the account.
    if (data.user && data.user.identities?.length === 0) {
      return {
        error: `${email} already has an account. Switch to "Sign in".`,
        notice: null,
      }
    }

    // A session comes back only when the project auto-confirms addresses; otherwise the
    // account exists but cannot sign in until the emailed link is opened.
    if (data.session) return { error: null, notice: null }

    return {
      error: null,
      notice: `Account created. Open the confirmation link we emailed to ${email}, then sign in.`,
      awaitingConfirmation: true,
    }
  }

  const resendConfirmation: AuthContextValue['resendConfirmation'] = async rawEmail => {
    const email = normalizeEmail(rawEmail)
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    if (error) return { error: describeAuthError(error, email), notice: null }
    return { error: null, notice: `Confirmation email sent again to ${email}.` }
  }

  const signOut = async () => {
    flushSave()
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{ user, session, loading, signIn, signUp, resendConfirmation, signOut, syncStatus, hydrating }}
    >
      {children}
    </AuthContext.Provider>
  )
}
