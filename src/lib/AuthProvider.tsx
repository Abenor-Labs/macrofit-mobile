import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AppState } from 'react-native'
import * as Linking from 'expo-linking'
import Constants from 'expo-constants'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { describeAuthError, normalizeEmail, type AuthResult } from '@core/utils/authErrors'
import { getStoreEpoch, resetStore, useStore } from '@/store/useStore'

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error'

/**
 * How the account's saved data fetch ended.
 *
 * The distinction between `empty` and `failed` is load-bearing. `empty` means the server
 * genuinely has no row for this account, so the local defaults *are* the truth and saving
 * them is correct. `failed` means we never found out — and writing to the server in that
 * state overwrites a real history with defaults. Anything other than `ok` or `empty`
 * therefore blocks every save for the session.
 */
export type HydrationOutcome = 'pending' | 'ok' | 'empty' | 'failed'

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<AuthResult>
  signUp: (email: string, password: string) => Promise<AuthResult>
  /** Re-sends the sign-up confirmation email for an address that never got one. */
  resendConfirmation: (email: string) => Promise<AuthResult>
  /**
   * Email a sign-in link to someone who has forgotten their password.
   *
   * The link carries a PKCE code, which `exchangeConfirmation` already trades for a session —
   * so tapping it signs them in directly rather than dropping them at a form. That is why
   * this needed no new deep-link handling: recovery and confirmation arrive identically.
   *
   * Being signed in is the point. Their data comes back the moment the session exists; the
   * password itself can be replaced afterwards, from Profile, and does not block anything.
   */
  requestPasswordReset: (email: string) => Promise<AuthResult>
  /** Replace the password of the currently signed-in user. */
  updatePassword: (password: string) => Promise<AuthResult>
  /**
   * Ends the session and wipes this device. Reports failure rather than throwing — a
   * sign-out that could not reach the server leaves the user signed in, and the caller has
   * to say so instead of pretending it worked.
   */
  signOut: (options?: { warnedAboutUnsyncedChanges?: boolean }) => Promise<{
    error: string | null
  }>
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
  /** How the last attempt to read this account's saved data ended. */
  hydrationOutcome: HydrationOutcome
  /**
   * Read-only mode: the account is unreachable, but this device already holds a copy of it,
   * so the app runs against that copy and holds edits back. Show it, do not hide the app.
   */
  syncBlocked: boolean
  /**
   * The account is unreachable and this device has never read it.
   *
   * On its own this is NOT a reason to keep the user out — the caller must also establish
   * that there is nothing on the device worth showing. A store with data in it is the
   * user's data whether or not this build has ever spoken to the server, and hiding it
   * behind a wall is worse than the risk it was meant to avoid.
   */
  syncUnavailable: boolean
  /** This session was created by signing up in this launch, so there is no row to wait for. */
  isNewAccount: boolean
  /**
   * There is data on this device, the signed-in account has nothing on the server, and
   * nothing records whose the data is. Set for the one case where guessing is unsafe in
   * both directions, and cleared by `resolveUnclaimed`.
   */
  unclaimedConflict: { userId: string; email: string | null } | null
  /** `keep` publishes the device to this account; `discard` erases it. */
  resolveUnclaimed: (choice: 'keep' | 'discard') => Promise<void>
  /** Retry the failed load. Unblocks saving if it succeeds. */
  retrySync: () => Promise<void>
  /**
   * This device holds edits the server has never accepted. They are safe locally, but a
   * sign-out wipes the device — so anything offering to sign out has to say this first.
   */
  hasUnsyncedChanges: boolean
  /**
   * Set when the session ended without the user asking — an expired or revoked refresh
   * token. The login screen reads it so the user is told why they are looking at a form
   * again. Cleared once shown.
   */
  sessionEndedReason: string | null
  clearSessionEndedReason: () => void
  /**
   * A confirmation link is being exchanged for a session right now.
   *
   * The login screen shows this instead of its form: the user tapped a link in their email
   * and is watching the app open, and a password field appearing first would read as the
   * confirmation having failed.
   */
  confirming: boolean
  /** Why the confirmation link could not be used. Its own state, with its own copy. */
  confirmationError: string | null
  clearConfirmationError: () => void
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
const LOAD_TIMEOUT_MS = 8000
const SAVE_TIMEOUT_MS = 15000

/*
  Three separate questions, three separate pieces of state. Collapsing any two of them is
  what produced every data-loss bug this file has had:

    OWNER   — whose data is on this device?              STORE_OWNER_KEY / userRef
    LOADED  — have we ever read that account's server    LOADED_KEY / hasLoadedRef
              state on this device?
    LICENCE — may the local store be published over      UNSYNCED_KEY (epoch-stamped)
              the server?

  "There are local edits" is a fourth, separate thing (localEditsRef). It is what the UI
  and every destructive confirmation must read, and it is NEVER gated on the others —
  gating it is how a sign-out came to promise "your data is saved" over work that only
  existed on the device.
*/
const STORE_OWNER_KEY = 'macrofit-store-owner'
const LOADED_KEY = 'macrofit-loaded-owner'
const UNSYNCED_KEY = 'macrofit-unsynced-owner'

/** A publish licence is only valid for the account AND the store contents it was cut for. */
const licenceFor = (epoch: string, userId: string) => `${epoch}:${userId}`

/**
 * Where Supabase sends someone after they tap the confirmation link in their email.
 *
 * WHY THIS EXISTS:
 * `signUp` passed no `emailRedirectTo`, so GoTrue fell back to the project's Site URL — the
 * website. Someone who created an account in the app, on their phone, tapped the link in the
 * email and landed in a browser looking at the marketing site, with no indication that the
 * confirmation had worked or that they should switch back to the app.
 *
 * WHY IT IS WRITTEN OUT RATHER THAN BUILT WITH `Linking.createURL`:
 * That helper returns `macrofit:///auth/callback` here — three slashes, because it inserts an
 * empty authority. It is a legal URL and it works, but this exact string has to be copied by
 * hand into a dashboard field, and a URL nobody can predict from reading the code is a URL
 * that gets typed in wrong. The literal is checked against the configured scheme below, so it
 * cannot silently drift from app.json either.
 *
 * REQUIRES A DASHBOARD CHANGE THIS CODE CANNOT MAKE:
 * Supabase rejects any redirect that is not on its allow-list, and a rejection looks exactly
 * like the old behaviour — the link opens the website. Add this exact URL under
 * Authentication → URL Configuration → Redirect URLs. See the README.
 */
const CONFIRM_REDIRECT = 'macrofit://auth/callback'

if (__DEV__) {
  const configured = Constants.expoConfig?.scheme
  const schemes = Array.isArray(configured) ? configured : configured ? [configured] : []
  if (schemes.length > 0 && !schemes.includes('macrofit')) {
    console.warn(
      `[auth] CONFIRM_REDIRECT is '${CONFIRM_REDIRECT}' but app.json declares scheme(s) ` +
        `${schemes.join(', ')}. The confirmation link will not open the app until they agree.`,
    )
  }
}

const SESSION_EXPIRED_MESSAGE =
  'Your session expired, so you were signed out. Everything you logged is still on this device — sign in to sync it.'

/**
 * What went wrong confirming an email address, in words that name the actual cause.
 *
 * Deliberately NOT routed through `sessionEndedReason`. That channel says "Your session
 * expired, so you were signed out. Everything you logged is still on this device" — which,
 * shown after a stale confirmation link, is false in every clause and sends the user hunting
 * for data loss that did not happen.
 */
const describeConfirmationError = (code: string | null, description: string | null): string => {
  if (code === 'otp_expired') {
    return 'That confirmation link has expired. Send yourself a new one and open it within the hour.'
  }
  if (code === 'access_denied') {
    return 'That confirmation link has already been used. Try signing in.'
  }
  if (description) {
    // GoTrue's own descriptions are written for humans and arrive URL-encoded with plus signs
    // for spaces, which reads as machine output if passed through untouched.
    return `${description.replace(/\+/g, ' ')}. Try signing in, or send yourself a new link.`
  }
  return 'We could not confirm your email from that link. Try signing in, or send yourself a new link.'
}

const SIGN_OUT_FAILED_MESSAGE =
  'Could not sign out — check your connection and try again.'

/**
 * Whether a session survives, used to tell a failed sign-out from a noisy successful one.
 *
 * An errored probe counts as "still signed in". Only a clean `{ session: null, error: null }`
 * proves the session is gone, and that proof is the precondition for wiping the device:
 * leaving data on a device whose session ended is recoverable, wiping a device whose
 * session did not is not.
 */
const stillSignedIn = async (): Promise<boolean> => {
  try {
    const { data, error } = await supabase.auth.getSession()
    return data.session !== null || error != null
  } catch {
    return true
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [hydrating, setHydrating] = useState(false)
  const [hydrationOutcome, setHydrationOutcome] = useState<HydrationOutcome>('pending')
  const [sessionEndedReason, setSessionEndedReason] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmationError, setConfirmationError] = useState<string | null>(null)
  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState(false)
  const [hasLoadedAccount, setHasLoadedAccount] = useState(false)
  const [isNewAccount, setIsNewAccount] = useState(false)
  const [unclaimedConflict, setUnclaimedConflict] = useState<{
    userId: string
    email: string | null
  } | null>(null)

  const userRef = useRef<User | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** The pending "…and back to idle" transition after a successful save. */
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isHydratingRef = useRef(false)
  /**
   * Saving is opt-in, not opt-out. It stays false until a load has actually told us what
   * the server holds, so no code path can upload defaults over a real account.
   */
  const canSaveRef = useRef(false)
  /** The upload currently in flight, so sign-out can wait for it instead of racing it. */
  const inFlightSaveRef = useRef<Promise<'saved' | 'skipped' | 'failed'> | null>(null)
  /** True only while the user's own sign-out is running, to tell it apart from expiry. */
  const signingOutRef = useRef(false)
  /**
   * Does this device hold changes the server has not accepted? Recorded unconditionally.
   * This is the flag the UI and every destructive confirmation read.
   */
  const localEditsRef = useRef(false)
  /** Has this device ever read the current account's server state? */
  const hasLoadedRef = useRef(false)
  /** The store epoch this session is operating on; invalidated by any reset. */
  const epochRef = useRef('0')
  /** Has the store changed since the last upload that succeeded? */
  const dirtyRef = useRef(false)
  /**
   * Incremented by every store change. An upload stamps itself with the value it collected
   * at, and its result is only allowed to clear the dirty flag when nothing has moved since
   * — otherwise an edit made while the upload was in flight is marked as already saved and
   * never uploaded by anyone.
   */
  const changeSeqRef = useRef(0)
  /**
   * Bumped by every operation that changes whose data this device holds. An async
   * continuation compares against it and abandons if it has been superseded, so a load
   * started for one user can never land after a sign-out or an account switch.
   */
  const generationRef = useRef(0)

  const setLoaded = useCallback((value: boolean) => {
    hasLoadedRef.current = value
    setHasLoadedAccount(value)
  }, [])

  const setLocalEdits = useCallback((value: boolean) => {
    localEditsRef.current = value
    setHasUnsyncedChanges(value)
    // Unpublished work means the store differs from the server by definition. This also
    // covers the licence found on disk at launch: nothing has changed *this session*, so
    // without it the dirty check would skip the very upload that publishes those edits.
    if (value) {
      dirtyRef.current = true
      changeSeqRef.current++
    }
  }, [])

  /**
   * Record that this device holds unpublished work.
   *
   * The flag is always set — the user must be told before anything destroys it. The
   * persisted *licence* is separate and only issued once this device has read the account,
   * because only then is the local store a descendant of the server's rather than a set of
   * defaults standing in for data that was never fetched.
   */
  const markUnsynced = useCallback(
    (userId: string) => {
      setLocalEdits(true)
      if (!hasLoadedRef.current) return
      void AsyncStorage.setItem(UNSYNCED_KEY, licenceFor(epochRef.current, userId))
    },
    [setLocalEdits]
  )

  const clearUnsynced = useCallback(() => {
    setLocalEdits(false)
    void AsyncStorage.removeItem(UNSYNCED_KEY)
  }, [setLocalEdits])

  const collect = useCallback((): Record<string, unknown> => {
    const state = useStore.getState() as unknown as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of SYNC_FIELDS) out[key] = state[key]
    return out
  }, [])

  /** Resolves true only when the account's row on the server now matches this device. */
  const saveUserData = useCallback(
    async (userId: string, storeData: Record<string, unknown>): Promise<boolean> => {
      setSyncStatus('saving')
      let timer: ReturnType<typeof setTimeout> | null = null
      try {
        // The upload needs its own deadline. adoptUser and retrySync await this inside the
        // window that owns `hydrating`, and `hydrating` gates both the router and the login
        // button — so an upsert that never settles freezes the app rather than the save.
        const timeout = new Promise<'timeout'>(resolve => {
          timer = setTimeout(() => resolve('timeout'), SAVE_TIMEOUT_MS)
        })
        const outcome = await Promise.race([
          supabase
            .from('user_data')
            .upsert({ user_id: userId, data: storeData }, { onConflict: 'user_id' }),
          timeout,
        ])
        if (outcome === 'timeout') {
          setSyncStatus('error')
          return false
        }
        const { error } = outcome
        setSyncStatus(error ? 'error' : 'saved')
        if (error) return false
        // Tracked and cancelled on the next save: an untracked timer from an earlier save
        // will happily overwrite a live 'saving' or a fresh 'error' with 'idle', which the
        // UI renders as "Synced".
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
        idleTimerRef.current = setTimeout(() => setSyncStatus('idle'), 2000)
        return true
      } catch {
        setSyncStatus('error')
        return false
      } finally {
        if (timer) clearTimeout(timer)
      }
    },
    []
  )

  /**
   * Read the account's saved data and report how it went.
   *
   * `.maybeSingle()` rather than `.single()` is deliberate: `.single()` raises PGRST116 for
   * an account with no row, which is indistinguishable at the call site from a real error.
   * `.maybeSingle()` returns `data: null` instead, so "new account" and "we could not
   * reach the server" stay separate — and only the first is safe to save over.
   */
  const loadUserData = useCallback(
    async (
      userId: string,
      /*
        A thunk, not a boolean. The select can be in flight for LOAD_TIMEOUT_MS, and in
        read-only mode the whole app is interactive throughout — the banner even invites the
        user to keep logging. A value captured at call time says "there was nothing local to
        protect" long after that stopped being true, and the overwrite below destroys
        whatever arrived in between.
      */
      shouldPreserveLocal: () => boolean,
      generation: number
    ): Promise<HydrationOutcome> => {
      let timer: ReturnType<typeof setTimeout> | null = null
      try {
        const timeout = new Promise<'timeout'>(resolve => {
          timer = setTimeout(() => resolve('timeout'), LOAD_TIMEOUT_MS)
        })
        const result = await Promise.race([
          supabase.from('user_data').select('data').eq('user_id', userId).maybeSingle(),
          timeout,
        ])

        if (result === 'timeout') return 'failed'
        if (result.error) return 'failed'

        /*
          The device holds edits the server has never seen, so the server's copy is by
          definition the older one — and `hydrateStore` overwrites field by field rather
          than merging, destroying the only copy that exists. Report the account as
          reachable and let the caller publish the local state instead.

          The cost is explicit: an edit made on the web app during the same outage is
          overwritten by this device's version. That is the deliberate trade — losing a
          second copy of something beats deleting the only copy of something.
        */
        if (shouldPreserveLocal()) return 'ok'

        if (!result.data?.data) return 'empty'

        /*
          The guard sits here, immediately before the write — not in the caller after this
          returns. A select can be in flight for up to LOAD_TIMEOUT_MS, and `hydrateStore`
          is a durable, wholesale overwrite that zustand's persist middleware then writes
          back to AsyncStorage. Checking only on return protects the bookkeeping while
          letting the mutation through, which would let a load for the account that just
          signed out repopulate the device it was wiped from.
        */
        if (generation !== generationRef.current) return 'failed'
        // Re-asked at the write site: an edit made while the select was in flight has to
        // win, exactly like a generation bump does.
        if (shouldPreserveLocal()) return 'ok'

        // try/finally, not a bare pair of assignments: a throw between them would latch the
        // flag true for the life of the process, silently disabling autosave.
        isHydratingRef.current = true
        try {
          useStore.getState().hydrateStore(result.data.data as Record<string, unknown>)
          // Let the hydrated state flush before re-enabling saves, so rehydration does not
          // immediately echo back to the server as a "change".
          await new Promise(r => setTimeout(r, 300))
        } finally {
          isHydratingRef.current = false
        }
        return generation === generationRef.current ? 'ok' : 'failed'
      } catch {
        return 'failed'
      } finally {
        if (timer) clearTimeout(timer)
      }
    },
    []
  )

  /**
   * `saved` — the server now matches this device. `skipped` — nothing was sent, either
   * because there was nothing to send or because sending is blocked; the caller must read
   * `localEditsRef` to tell those apart. `failed` — an upload was attempted and rejected.
   */
  const flushSave = useCallback((): Promise<'saved' | 'skipped' | 'failed'> => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const current = userRef.current
    if (!current || isHydratingRef.current || !canSaveRef.current) {
      return inFlightSaveRef.current ?? Promise.resolve('skipped')
    }
    /*
      Nothing has changed since the last upload, so there is nothing to send — and, more
      importantly, nothing to lose. Without this check, backgrounding a fully-synced device
      while offline fails an upload of unchanged data and mints a publish licence, marking a
      device that matches the server as diverged from it.
    */
    if (!dirtyRef.current) return Promise.resolve('skipped')

    const generation = generationRef.current
    /*
      Uploads are serialised, never overlapped. Two upserts to the same row can otherwise be
      in flight at once — the debounce is 1.5s and an upload may take far longer — and their
      handlers then run in resolution order rather than send order, so an older upload
      finishing last clears the very flags a newer failed one just set, and the row's final
      contents are decided by arrival order.
    */
    const previous = inFlightSaveRef.current
    const pending: Promise<'saved' | 'skipped' | 'failed'> = (
      previous ? previous.catch(() => undefined) : Promise.resolve()
    ).then(async () => {
      if (!userRef.current || isHydratingRef.current || !canSaveRef.current) return 'skipped'
      if (generation !== generationRef.current) return 'skipped'
      if (!dirtyRef.current) return 'skipped'

      // Stamped before the snapshot, compared after: anything that changes in between must
      // leave the device marked dirty so the queued flush still publishes it.
      const seq = changeSeqRef.current
      const saved = await saveUserData(current.id, collect())

      if (saved) {
        /*
          The upload landed, so the device is clean whether or not the session moved on.
          Gating this on the generation left dirtyRef set after a successful save, which
          made the next flush re-upload with a dead token and mint a publish licence on a
          device that already matched the server.
        */
        if (changeSeqRef.current === seq) {
          dirtyRef.current = false
          // Session-scoped state and the licence key belong to the generation that started
          // this save; a newer one has already reset them for itself.
          if (generation === generationRef.current) clearUnsynced()
        }
        return 'saved'
      }
      if (generation !== generationRef.current) return 'failed'
      // A rejected upload leaves this device the only copy, exactly like an outage does.
      markUnsynced(current.id)
      return 'failed'
    })

    inFlightSaveRef.current = pending
    void pending.finally(() => {
      if (inFlightSaveRef.current === pending) inFlightSaveRef.current = null
    })
    return pending
  }, [clearUnsynced, collect, markUnsynced, saveUserData])

  /**
   * Adopt a signed-in user: drop any other account's data, read theirs, and decide whether
   * this session is allowed to write back.
   */
  const adoptUser = useCallback(
    async (nextUser: User): Promise<void> => {
      const generation = ++generationRef.current
      canSaveRef.current = false
      setHydrationOutcome('pending')

      try {
        const stored = await AsyncStorage.multiGet([STORE_OWNER_KEY, UNSYNCED_KEY, LOADED_KEY])
        if (generation !== generationRef.current) return
        // Read by key rather than by position: a short or reordered result would otherwise
        // leave `previousOwner` undefined, which reads as "a different account" and wipes
        // the device on a perfectly ordinary launch.
        const valueFor = (key: string) => stored.find(([k]) => k === key)?.[1] ?? null
        const previousOwner = valueFor(STORE_OWNER_KEY)
        const licence = valueFor(UNSYNCED_KEY)
        const loadedOwner = valueFor(LOADED_KEY)

        /*
          An unclaimed store: it holds someone's data but nothing records whose.

          This is the state every device carries into the first launch of this build —
          STORE_OWNER_KEY did not exist before it — and it is also what the previous
          build's sign-out left behind, because that version cleared the session and
          nothing else. So it covers both "this is the owner upgrading" and "this is
          somebody else's leftovers", and there is nothing on disk to tell them apart:
          the store records a name, never a user id.

          Neither guess is safe on its own. Adopting it hands one user's health record to
          another; wiping it deletes a legitimate upgrader's data. So we do not guess — the
          server decides, below, once the load comes back.
        */
        const unclaimedStore = previousOwner === null && useStore.getState().onboardedAt !== null
        const switchingAccount = previousOwner !== null && previousOwner !== nextUser.id
        if (switchingAccount) {
          // Ownership keys go before the data. A device whose keys are gone is treated as
          // unknown, which is safe; a wiped store still claiming to hold a user's edits is
          // a licence to upload defaults over their account.
          await AsyncStorage.multiRemove([UNSYNCED_KEY, LOADED_KEY])
          setLoaded(false)
          setLocalEdits(false)
          isHydratingRef.current = true
          try {
            await resetStore()
          } finally {
            isHydratingRef.current = false
          }
        } else {
          setLoaded(loadedOwner === nextUser.id)
        }

        epochRef.current = await getStoreEpoch()
        if (generation !== generationRef.current) return

        /*
          Arm the owner guard the moment we know whose device this is, rather than after a
          successful load. On a device where every load fails the old ordering never wrote
          the key at all, which left the next account free to inherit this one's data.

          The unclaimed case is the exception: claiming it now would permanently attribute
          data of unknown provenance to whoever happens to be signed in, and a failed load
          would bake that in. It stays unclaimed until the server settles it.
        */
        if (!unclaimedStore) {
          await AsyncStorage.setItem(STORE_OWNER_KEY, nextUser.id)
          if (generation !== generationRef.current) return
        }

        /*
          All three conditions are required. The account must match, this device must have
          read that account before (so local descends from the server), and the licence must
          have been cut for the store contents that are actually present — a reset since
          then bumped the epoch and voided it.
        */
        const licensed =
          !switchingAccount &&
          hasLoadedRef.current &&
          licence === licenceFor(epochRef.current, nextUser.id)
        if (licensed) setLocalEdits(true)

        const outcome = await loadUserData(
          nextUser.id,
          // Either the licence found on disk, or edits made while the select was running.
          () => licensed || (hasLoadedRef.current && localEditsRef.current),
          generation
        )
        if (generation !== generationRef.current) return

        /*
          The server settles the unclaimed store.

          'ok'    — hydrateStore has just overwritten every synced field with this account's
                    own data, so whatever was here is gone either way and the device is now
                    unambiguously theirs. Correct for the upgrader and for the stranger.
          'empty' — the account has no server row, and the data on this device could be
                    either the same person's (a row that never synced) or the previous
                    user's. Guessing wrong in one direction leaks a health record; guessing
                    wrong in the other deletes one. So the person holding the phone is
                    asked, once, before anything is destroyed. See `unclaimedConflict`.
          'failed' — still unknown. Nothing is claimed and nothing is destroyed; the app
                    holds on the retry screen (hasLoadedAccount is false) until it can ask
                    again.
        */
        if (unclaimedStore && outcome === 'empty') {
          setUnclaimedConflict({ userId: nextUser.id, email: nextUser.email ?? null })
          // Saving stays off until they answer: this data must not reach the account until
          // someone confirms it belongs there.
          canSaveRef.current = false
          setHydrationOutcome('pending')
          return
        }

        setHydrationOutcome(outcome)
        // Only a load that actually told us what the server holds earns the right to write.
        canSaveRef.current = outcome === 'ok' || outcome === 'empty'
        if (canSaveRef.current) {
          setLoaded(true)
          await AsyncStorage.multiSet([
            [STORE_OWNER_KEY, nextUser.id],
            [LOADED_KEY, nextUser.id],
          ])
        }
        // Held edits go up now that there is somewhere to put them.
        if (canSaveRef.current && localEditsRef.current) await flushSave()
      } catch {
        isHydratingRef.current = false
        if (generation !== generationRef.current) return
        // A storage or reset failure must land somewhere the user can see and retry, not
        // in a silent state where saving is off and nothing says so.
        canSaveRef.current = false
        setHydrationOutcome('failed')
      }
    },
    [flushSave, loadUserData, setLoaded, setLocalEdits]
  )

  const retrySync = useCallback(async () => {
    const current = userRef.current
    if (!current) return
    const generation = ++generationRef.current
    setHydrating(true)
    try {
      epochRef.current = await getStoreEpoch()
      const outcome = await loadUserData(
        current.id,
        // Re-read on every call: the app is fully interactive behind the banner, so the
        // user can log something between this tap and the response arriving.
        () => hasLoadedRef.current && localEditsRef.current,
        generation
      )
      if (generation !== generationRef.current) return
      setHydrationOutcome(outcome)
      canSaveRef.current = outcome === 'ok' || outcome === 'empty'
      if (canSaveRef.current) {
        setLoaded(true)
        await AsyncStorage.multiSet([
          [STORE_OWNER_KEY, current.id],
          [LOADED_KEY, current.id],
        ])
        // Whatever the user did while blocked is now safe to publish.
        await flushSave()
      }
    } catch {
      if (generation !== generationRef.current) return
      canSaveRef.current = false
      setHydrationOutcome('failed')
    } finally {
      setHydrating(false)
    }
  }, [flushSave, loadUserData, setLoaded])

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session)
        setUser(data.session?.user ?? null)
        userRef.current = data.session?.user ?? null
        if (data.session?.user) {
          return adoptUser(data.session.user)
        }
        return undefined
      })
      // Without this the launch screen is forever: `loading` is only cleared here, and a
      // rejected getSession (a storage-layer failure, a corrupt token) skips .then entirely.
      .catch(() => setHydrationOutcome('failed'))
      .finally(() => setLoading(false))

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)

      if (event === 'SIGNED_OUT') {
        // Supabase may dispatch this after `signOut()` has already returned, so the flag is
        // consumed here rather than cleared in signOut's own teardown — otherwise a
        // deliberate sign-out gets reported to the user as an expiry.
        const voluntary = signingOutRef.current
        signingOutRef.current = false
        // A deliberate sign-out owns its own teardown, including wiping the device.
        if (voluntary) return

        // The token expired or was revoked. Bank whatever is still saveable while userRef
        // holds the old user, then stop writing.
        //
        // The local store is deliberately left intact: this is the same person, they are
        // about to sign back in, and wiping here would destroy edits that never reached
        // the server — while the message below promises the opposite. Handing the device
        // to a *different* account is covered by the owner check in adoptUser.
        const expiredUserId = userRef.current?.id
        // Supersede any load still in flight for this session, so a select that started
        // before the token died cannot land and overwrite those very edits.
        const expiryGeneration = ++generationRef.current
        void flushSave().then(flushed => {
          // The user can sign back in while this is still settling. Without the guard, the
          // continuation nulls userRef and canSaveRef belonging to the NEW session and
          // autosave is dead for the rest of it.
          if (expiryGeneration !== generationRef.current) return
          userRef.current = null
          canSaveRef.current = false
          // Only when an upload was actually attempted and rejected. `skipped` means there
          // was nothing to send — a fully-synced device — and marking that as diverged
          // would licence the phone's copy to overwrite the server on the next sign-in.
          if (flushed === 'failed' && expiredUserId) markUnsynced(expiredUserId)
        })
        setSessionEndedReason(SESSION_EXPIRED_MESSAGE)
        setHydrationOutcome('pending')
        return
      }

      userRef.current = nextSession?.user ?? null
      // SIGNED_IN also fires on token refresh; getSession above already covers the
      // initial load, so this must not touch `loading` or it re-shows the splash.
      if (event === 'SIGNED_IN' && nextSession?.user) {
        signingOutRef.current = false
        setSessionEndedReason(null)
        setHydrating(true)
        void adoptUser(nextSession.user).finally(() => setHydrating(false))
      }
    })

    return () => sub.subscription.unsubscribe()
  }, [adoptUser, flushSave, markUnsynced])

  // Debounced auto-save on any store change.
  useEffect(() => {
    const unsubscribe = useStore.subscribe(() => {
      const current = userRef.current
      if (!current || isHydratingRef.current) return
      dirtyRef.current = true
      changeSeqRef.current++
      if (!canSaveRef.current) {
        // Read-only mode. Record that this device now holds the only copy of this edit.
        markUnsynced(current.id)
        return
      }
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => void flushSave(), SAVE_DEBOUNCE_MS)
    })
    return unsubscribe
  }, [flushSave, markUnsynced])

  // Mobile has no "tab hidden" event: backgrounding is the moment the OS may kill the
  // process, so a pending debounced save must be flushed immediately here or the last
  // edits are lost.
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      if (next === 'background' || next === 'inactive') {
        void flushSave()
        return
      }
      /*
        Coming back to the foreground is the most likely moment for signal to have returned,
        and it is the only automatic retry there is. Without it the banner's promise that
        things resume "until it clears" is false: retrySync only ever ran from a tap, so a
        user who regained signal in their pocket stayed blocked, and unsaved for the rest of
        the session.
      */
      if (next === 'active' && userRef.current && !canSaveRef.current && !signingOutRef.current) {
        void retrySync()
      }
    })
    return () => sub.remove()
  }, [flushSave, retrySync])

  /*
    Confirmation links, arriving as `macrofit://auth/callback?code=…`.

    `detectSessionInUrl` is false and has to stay false — it reads `window.location`, which
    does not exist here — so nothing in supabase-js is watching for this. Without the handler
    below, the link opened the app and then simply sat on the login screen: the account WAS
    confirmed server-side by the time the redirect fired, but the app never picked up the
    session, so the user was asked to sign in by an app they had just proved themselves to.

    Both entry points are needed. `getInitialURL` covers a cold start, where the link is what
    launched the process; the listener covers the app already being open in the background,
    which is the common case seconds after signing up.
  */
  const exchangeConfirmation = useCallback(async (url: string): Promise<void> => {
    const { queryParams } = Linking.parse(url)
    const readParam = (key: string): string | null => {
      const value = queryParams?.[key]
      return typeof value === 'string' && value.length > 0 ? value : null
    }

    // GoTrue reports a refused or expired link by redirecting WITH the error rather than by
    // failing to redirect, so this has to be checked before looking for a code.
    const errorCode = readParam('error_code') ?? readParam('error')
    if (errorCode !== null) {
      setConfirmationError(describeConfirmationError(errorCode, readParam('error_description')))
      return
    }

    const code = readParam('code')
    if (code === null) return

    setConfirming(true)
    setConfirmationError(null)
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) {
        setConfirmationError(describeConfirmationError(error.code ?? null, error.message))
        return
      }
      // Success needs no handling here: exchangeCodeForSession stores the session, which
      // fires SIGNED_IN, which adopts the user and routes them exactly like a sign-in.
    } catch {
      setConfirmationError(describeConfirmationError(null, null))
    } finally {
      setConfirming(false)
    }
  }, [])

  useEffect(() => {
    void Linking.getInitialURL().then(url => {
      if (url) void exchangeConfirmation(url)
    })
    const sub = Linking.addEventListener('url', event => {
      void exchangeConfirmation(event.url)
    })
    return () => sub.remove()
  }, [exchangeConfirmation])

  const signIn: AuthContextValue['signIn'] = useCallback(async (rawEmail, password) => {
    const email = normalizeEmail(rawEmail)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error) return { error: null, notice: null }
    return {
      error: describeAuthError(error, email),
      notice: null,
      awaitingConfirmation: error.code === 'email_not_confirmed',
    }
  }, [])

  const signUp: AuthContextValue['signUp'] = useCallback(async (rawEmail, password) => {
    const email = normalizeEmail(rawEmail)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      // Without this, GoTrue falls back to the project's Site URL and the confirmation link
      // opens the website — on the phone the account was just created on. See CONFIRM_REDIRECT.
      options: { emailRedirectTo: CONFIRM_REDIRECT },
    })
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
    if (data.session) {
      // An account created seconds ago has no server row to wait for, so a failed load must
      // not hold them behind the "can't reach your account" wall — there is nothing there.
      setIsNewAccount(true)
      return { error: null, notice: null }
    }

    return {
      error: null,
      notice: `Account created. Open the confirmation link we emailed to ${email}, then sign in.`,
      awaitingConfirmation: true,
    }
  }, [])

  const resendConfirmation: AuthContextValue['resendConfirmation'] = useCallback(async rawEmail => {
    const email = normalizeEmail(rawEmail)
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      // Must match signUp's. A resend that omits it sends a link back to the website, so the
      // user's second attempt fails the same way as the first for no visible reason.
      options: { emailRedirectTo: CONFIRM_REDIRECT },
    })
    if (error) return { error: describeAuthError(error, email), notice: null }
    return { error: null, notice: `Confirmation email sent again to ${email}.` }
  }, [])

  const requestPasswordReset: AuthContextValue['requestPasswordReset'] = useCallback(
    async rawEmail => {
      const email = normalizeEmail(rawEmail)
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        // The same allow-listed redirect the confirmation flow uses. Anything else lands the
        // user on the website holding a token the app never sees.
        redirectTo: CONFIRM_REDIRECT,
      })
      if (error) return { error: describeAuthError(error, email), notice: null }
      /*
        Deliberately worded as "if an account exists". GoTrue does not reveal whether an
        address is registered, and neither should this — a message that distinguishes the two
        turns the form into a way to enumerate who has an account here.
      */
      return {
        error: null,
        notice: `If an account exists for ${email}, a sign-in link is on its way. Open it on this phone.`,
      }
    },
    []
  )

  const updatePassword: AuthContextValue['updatePassword'] = useCallback(async password => {
    const { error } = await supabase.auth.updateUser({ password })
    // `describeAuthError` phrases some messages around the address, so it gets the signed-in
    // one rather than an empty string wherever there is one to give.
    if (error) return { error: describeAuthError(error, userRef.current?.email ?? ''), notice: null }
    return { error: null, notice: 'Password updated.' }
  }, [])

  /**
   * Sign out, in the one order that neither loses the outgoing user's last edits nor
   * leaves their data on the device.
   *
   * Three orderings matter and each was a bug at some point:
   *  1. The final save completes *before* the session is torn down — an upsert whose token
   *     is revoked mid-flight is rejected by RLS and lost.
   *  2. Nothing is destroyed unless the session is verifiably gone. supabase-js reports a
   *     failed sign-out by resolving with an error, and on that path never emits
   *     SIGNED_OUT; wiping anyway strands a still-authenticated user in onboarding with an
   *     empty diary, because resetStore restores `onboardedAt: null`.
   *  3. Ownership keys are cleared *before* the data. A device that still holds the data
   *     and its keys is recoverable; a wiped store still carrying a publish licence
   *     uploads pristine defaults over the account on the next sign-in.
   */
  const signOut = useCallback<AuthContextValue['signOut']>(async options => {
    // Consumed by the SIGNED_OUT handler, which may run after this function returns.
    signingOutRef.current = true
    /*
      Consent comes from the caller, not from a re-read here. The confirmation dialog was
      built from `hasUnsyncedChanges` at the moment it opened; if a mark lands while it is
      on screen, re-reading the flag would count the user as having agreed to lose work the
      dialog never mentioned. Falling back to the live ref only covers callers that show no
      dialog at all.
    */
    const warnedAlready = options?.warnedAboutUnsyncedChanges ?? localEditsRef.current
    try {
      const flushed = await flushSave()
      await inFlightSaveRef.current

      /*
        Signing out wipes the device, so the last upload having actually landed is a
        precondition, not a formality. `skipped` is only safe when there was nothing to
        send — when sending was *blocked* it means the opposite, so the local-edits flag
        decides, not the status alone.

        A user already warned about held-back changes (Profile branches its dialog on
        `hasUnsyncedChanges`) has consented; a clean session that fails on the way out
        has not.
      */
      if (flushed !== 'saved' && localEditsRef.current && !warnedAlready) {
        signingOutRef.current = false
        return {
          error:
            'Your latest changes could not be saved, so you are still signed in. Try again once you have a connection.',
        }
      }

      const { error } = await supabase.auth.signOut()
      if (error && (await stillSignedIn())) {
        signingOutRef.current = false
        return { error: SIGN_OUT_FAILED_MESSAGE }
      }
    } catch {
      // An error is not proof the session survived: supabase-js can clear the local session
      // and still report a failure talking to the server. Only bail when the user really is
      // still signed in.
      if (await stillSignedIn()) {
        signingOutRef.current = false
        return { error: SIGN_OUT_FAILED_MESSAGE }
      }
    }

    // Abandon any load still in flight for the account being signed out, so it cannot
    // land afterwards and re-populate the device we are about to wipe.
    generationRef.current++
    userRef.current = null
    canSaveRef.current = false

    /*
      The two kinds of key have OPPOSITE safe orderings, and getting either backwards has
      already cost a P0:

        LICENCE keys (UNSYNCED_KEY, LOADED_KEY) go BEFORE the data. A wiped store still
        holding permission to publish uploads pristine defaults over the real account.

        OWNER key (STORE_OWNER_KEY) goes AFTER the data. A populated store with no owner
        looks unclaimed, so the next account adopts it — inheriting the previous user's
        diary and then uploading it to their own row.

      Between the two, the device is briefly owned-but-unlicensed, which is the safe
      direction: the worst case is re-downloading from the server.
    */
    try {
      await AsyncStorage.multiRemove([UNSYNCED_KEY, LOADED_KEY])
    } catch {
      signingOutRef.current = false
      return {
        error:
          'Signed out, but this device could not be cleared. Reinstall the app to remove the data left on it.',
      }
    }
    setLoaded(false)
    setLocalEdits(false)

    isHydratingRef.current = true
    try {
      await resetStore()
      await AsyncStorage.removeItem(STORE_OWNER_KEY)
    } catch {
      // The store may still hold data, and it still names its owner — which is what stops
      // the next account from adopting it. Recoverable, but say so.
      return {
        error:
          'Signed out, but this device could not be fully cleared. Sign in again on a working connection, or reinstall the app.',
      }
    } finally {
      isHydratingRef.current = false
    }

    // This path never emits SIGNED_OUT when supabase resolved with an error, so the user
    // state is driven explicitly rather than waiting for an event that may not come.
    setUser(null)
    setSession(null)
    setHydrationOutcome('pending')
    setSyncStatus('idle')
    return { error: null }
  }, [flushSave, setLoaded, setLocalEdits])

  /**
   * Settle an unclaimed store once the person holding the phone has said whose it is.
   *
   * `keep` is the upgrade case: their own logging, from a build that had no ownership
   * keys, on an account whose row never made it to the server. It is claimed and published.
   * `discard` is the handed-down-phone case: someone else's data, which must not be shown
   * to them or uploaded to their account.
   */
  const resolveUnclaimed = useCallback<AuthContextValue['resolveUnclaimed']>(
    async choice => {
      const conflict = unclaimedConflict
      if (!conflict) return
      setUnclaimedConflict(null)

      if (choice === 'discard') {
        isHydratingRef.current = true
        try {
          await resetStore()
        } finally {
          isHydratingRef.current = false
        }
        setLocalEdits(false)
      }

      epochRef.current = await getStoreEpoch()
      setLoaded(true)
      canSaveRef.current = true
      await AsyncStorage.multiSet([
        [STORE_OWNER_KEY, conflict.userId],
        [LOADED_KEY, conflict.userId],
      ])
      setHydrationOutcome('empty')
      // Kept data has never reached the server, so publish it now rather than waiting for
      // the next incidental edit.
      if (choice === 'keep') {
        dirtyRef.current = true
        await flushSave()
      }
    },
    [flushSave, setLoaded, setLocalEdits, unclaimedConflict]
  )

  const clearSessionEndedReason = useCallback(() => setSessionEndedReason(null), [])
  const clearConfirmationError = useCallback(() => setConfirmationError(null), [])

  /**
   * Memoised because `syncStatus` cycles saving → saved → idle on every autosave, and
   * every consumer of this context (the root navigator, the entry gate, Profile) would
   * otherwise re-render three times per cycle — several times a minute while logging.
   */
  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      signIn,
      signUp,
      resendConfirmation,
      requestPasswordReset,
      updatePassword,
      signOut,
      syncStatus,
      hydrating,
      hydrationOutcome,
      // Read-only mode needs a local copy to be read-only *of*. Without one there is
      // nothing to show and nothing safe to log against, so the two states are distinct.
      syncBlocked: hydrationOutcome === 'failed' && hasLoadedAccount,
      syncUnavailable: hydrationOutcome === 'failed' && !hasLoadedAccount,
      isNewAccount,
      unclaimedConflict,
      resolveUnclaimed,
      retrySync,
      hasUnsyncedChanges,
      sessionEndedReason,
      clearSessionEndedReason,
      confirming,
      confirmationError,
      clearConfirmationError,
    }),
    [
      user,
      session,
      loading,
      signIn,
      signUp,
      resendConfirmation,
      requestPasswordReset,
      updatePassword,
      signOut,
      syncStatus,
      hydrating,
      hydrationOutcome,
      hasLoadedAccount,
      isNewAccount,
      unclaimedConflict,
      resolveUnclaimed,
      retrySync,
      hasUnsyncedChanges,
      sessionEndedReason,
      clearSessionEndedReason,
      confirming,
      confirmationError,
      clearConfirmationError,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
