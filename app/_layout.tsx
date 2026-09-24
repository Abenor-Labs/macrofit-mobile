import 'react-native-get-random-values'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, StyleSheet, View } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import * as Application from 'expo-application'
import * as SystemUI from 'expo-system-ui'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import {
  SafeAreaInsetsContext,
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context'
import { useFonts } from 'expo-font'
import { CloudOff } from 'lucide-react-native'
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold'
import { Fraunces_700Bold } from '@expo-google-fonts/fraunces/700Bold'
import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular'
import { Figtree_500Medium } from '@expo-google-fonts/figtree/500Medium'
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold'

import { useTheme } from '@/theme/useTheme'
import { useStore, useStoreHydrated } from '@/store/useStore'
import { AuthProvider, useAuth } from '@/lib/AuthProvider'
import {
  leaveGuestMode,
  loadDeviceFlags,
  useGuestMode,
  useWelcomeSeen,
} from '@/lib/welcomeSeen'
import { HealthProvider } from '@/hooks/useHealthSync'
import { LAUNCH_SEQUENCE_MS, LaunchScreen } from '@/components/LaunchScreen'
import { BrandMark } from '@/components/BrandMark'
import { Button } from '@/components/Button'
import { Body, SectionTitle } from '@/components/Text'
import { BlurTargetProvider } from '@/components/BlurTarget'
import { AuroraDriftProvider } from '@/components/Aurora'
import { SnackbarProvider } from '@/components/Snackbar'
import { HIT_SIZE, spacing } from '@/theme/tokens'
import { configureFoodApis } from '@core/utils/foodApiConfig'
import { USDA_API_KEY } from '@/lib/env'
import { useNotifications } from '@/hooks/useNotifications'
// Defines the background update check at module scope: Android can start the JS runtime just
// to run it, with no screen mounted, and the task has to be defined by then.
import '@/lib/updateTask'

// Hold the native splash until fonts AND persisted state are ready. Without the store
// gate, the first frame renders default goals and an empty diary before AsyncStorage
// rehydrates — the user sees their data "reset" for a moment on every cold start.
void SplashScreen.preventAutoHideAsync()

/*
  Start reading the "has this device seen the welcome screen" flag at import time, so it
  resolves alongside the fonts and the store rather than after them.

  They gate the same splash it does, and for the same reason: routing before they land would
  send a first-time user to the login form and then yank them to the welcome screen a frame
  later, or send a guest to login and then bounce them into the app. Neither read rejects.
*/
void loadDeviceFlags()

/*
  Hand the shared food-search code its platform values, at import time so nothing can
  search before they are set.

  This call is the only reason EXPO_PUBLIC_USDA_API_KEY works at all. `src/core/utils/
  usdaApi.ts` is vendored from the web app, where the key was read off
  `import.meta.env.VITE_USDA_API_KEY` — an expression Metro cannot evaluate, so on mobile it
  silently produced the shared DEMO_KEY and always had. DEMO_KEY is capped at 30 requests a
  minute and 1000 a day across every anonymous caller on the internet, which is why food
  search failed at busy times and worked fine at quiet ones.

  The user agent is required by Open Food Facts, which refuses clients that do not identify
  themselves.
*/
configureFoodApis({
  usdaApiKey: USDA_API_KEY,
  userAgent: `MacroFit-Android/${Application.nativeApplicationVersion ?? 'dev'} (https://github.com/warpirate/macrofit-mobile)`,
})

/**
 * Standing notice that the app could not reach the server and is running read-only.
 *
 * It sits in the layout flow rather than floating: a degraded session should look
 * different, and an overlay would cover the very headers the user needs to tap. Status is
 * carried by an icon and words, never by colour alone.
 */
const SyncBlockedBanner: React.FC<{ topInset: number }> = ({ topInset }) => {
  const theme = useTheme()
  const { retrySync, hydrating } = useAuth()

  return (
    <View
      style={{
        paddingTop: topInset + spacing.sm,
        paddingBottom: spacing.sm,
        paddingHorizontal: spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: theme.surface,
        borderBottomWidth: StyleSheet.hairlineWidth * 2,
        borderBottomColor: theme.status.critical,
      }}
    >
      <CloudOff size={18} color={theme.status.critical} />
      <Body size={13} style={{ flex: 1, color: theme.text }}>
        Not synced — we couldn&apos;t reach your account. Everything you log stays safely on
        this device.
      </Body>
      <Pressable
        needsOffscreenAlphaCompositing
        accessibilityRole="button"
        accessibilityLabel="Retry syncing your account"
        accessibilityState={{ disabled: hydrating, busy: hydrating }}
        disabled={hydrating}
        onPress={() => void retrySync()}
        style={({ pressed }) => ({
          // The design system's floor. A 13pt label alone measures well under it.
          minHeight: HIT_SIZE,
          minWidth: HIT_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed || hydrating ? 0.6 : 1,
        })}
      >
        <Body size={13} weight="semibold" style={{ color: theme.brandText }}>
          {hydrating ? 'Retrying…' : 'Retry'}
        </Body>
      </Pressable>
    </View>
  )
}

/**
 * Shown when the account is unreachable AND this device has never read it.
 *
 * There is deliberately no way past this screen. Read-only mode needs a local copy to be
 * read-only *of*; without one the store is the app's factory defaults — a 30-year-old
 * 175 cm profile and an empty diary. Letting someone log a day against that produces work
 * that can neither be kept (the next successful load overwrites it) nor published (it would
 * replace their real account with defaults). The honest move is not to start.
 */
const SyncUnavailableScreen: React.FC = () => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { retrySync, hydrating, signOut, user } = useAuth()
  // signOut never sets `hydrating`, so without its own busy state the button gives no
  // feedback and can be fired re-entrantly on the one screen the user cannot leave.
  const [signingOut, setSigningOut] = useState(false)
  // Two failed attempts look identical, so people tap Try again over and over with no idea
  // whether anything happened. Counting them lets the screen say so.
  const [attempts, setAttempts] = useState(0)
  const busy = hydrating || signingOut

  const tryAgain = () => {
    void retrySync().finally(() => setAttempts(n => n + 1))
  }

  const escape = () => {
    // Signing out here wipes the device. Profile confirms this every time; the one screen
    // the user cannot leave must not be the exception.
    Alert.alert(
      'Sign out and clear this device?',
      'Anything saved only on this phone will be removed. Your account is not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => {
            setSigningOut(true)
            void signOut({ warnedAboutUnsyncedChanges: true })
              .then(result => {
                if (result.error) Alert.alert('Still signed in', result.error)
              })
              .catch(() =>
                Alert.alert(
                  'Still signed in',
                  'Something went wrong signing out. Check your connection and try again.'
                )
              )
              .finally(() => setSigningOut(false))
          },
        },
      ]
    )
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.canvas,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.lg,
        paddingHorizontal: spacing.xl,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
    >
      <BrandMark />
      <SectionTitle style={{ textAlign: 'center' }}>Can&apos;t reach your account</SectionTitle>
      {/* States the problem as a connection failure, which is what it is, and says the one
          thing the user actually wants to know. The old copy claimed the device held no
          data, which was untrue for a new account and untrue for anyone upgrading. */}
      <Body tone="secondary" style={{ textAlign: 'center' }}>
        We can&apos;t reach the server right now, so we can&apos;t load your account. Nothing
        on your account has changed.
      </Body>
      {user?.email ? (
        <Body size={13} tone="muted" style={{ textAlign: 'center' }}>
          Signed in as {user.email}
        </Body>
      ) : null}
      {/* No haptic: retrying a fetch is not a commit, and the design rules reserve haptics
          for the moments something is actually recorded. */}
      <Button
        label={hydrating ? 'Trying…' : 'Try again'}
        onPress={tryAgain}
        disabled={busy}
        loading={hydrating}
        full
      />
      {/* Two failed attempts render identically, so without this the button feels dead. */}
      {attempts > 0 && !hydrating ? (
        <Body size={13} tone="muted" style={{ textAlign: 'center' }}>
          Still no connection. We&apos;ll keep trying whenever you reopen the app.
        </Body>
      ) : null}
      <Button
        label="Sign out and clear this device"
        variant="ghost"
        onPress={escape}
        disabled={busy}
        loading={signingOut}
        full
      />
    </View>
  )
}

/**
 * Asked once, when there is data on this phone and the signed-in account has none on the
 * server, and nothing on disk records whose the data is.
 *
 * Both guesses are destructive in one direction: assume it is theirs and a handed-down
 * phone leaks one person's health record into another's account; assume it is not and an
 * upgrade whose row never synced deletes months of logging. The person holding the phone
 * is the only one who knows, so they are asked before anything is written or erased.
 */
const UnclaimedDataScreen: React.FC = () => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { unclaimedConflict, resolveUnclaimed } = useAuth()
  const [busy, setBusy] = useState(false)

  const choose = (choice: 'keep' | 'discard') => {
    setBusy(true)
    void resolveUnclaimed(choice).finally(() => setBusy(false))
  }

  const confirmDiscard = () => {
    Alert.alert(
      'Delete the data on this phone?',
      'It has not been saved to any account, so this cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete it', style: 'destructive', onPress: () => choose('discard') },
      ]
    )
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.canvas,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.lg,
        paddingHorizontal: spacing.xl,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
    >
      <BrandMark />
      <SectionTitle style={{ textAlign: 'center' }}>Is this your data?</SectionTitle>
      <Body tone="secondary" style={{ textAlign: 'center' }}>
        There&apos;s a diary and weight history saved on this phone, but nothing saved to
        this account yet. If this phone was yours all along, keep it — we&apos;ll save it to
        your account now.
      </Body>
      {unclaimedConflict?.email ? (
        <Body size={13} tone="muted" style={{ textAlign: 'center' }}>
          Signed in as {unclaimedConflict.email}
        </Body>
      ) : null}
      <Button
        label="Keep it — it&apos;s mine"
        onPress={() => choose('keep')}
        disabled={busy}
        loading={busy}
        full
      />
      <Button
        label="Not mine — start fresh"
        variant="ghost"
        onPress={confirmDiscard}
        disabled={busy}
        full
      />
    </View>
  )
}

/** Routes registered with `presentation: 'modal'` in the Stack below. */
const MODAL_ROUTES = new Set([
  'food-search',
  'lift-picker',
  'chat',
  'weigh-in',
  'update',
  'routine-day',
])

/** Routes drawn in workout mode's always-dark palette. */
const TRAINING_ROUTES = new Set(['training', 'lift-picker', 'routine-day', 'workout-summary'])

const RootNavigator: React.FC = () => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  /*
    Paint the native root the same colour as the canvas.

    Everything above the React tree — the window behind a modal's rounded corners, the
    overscroll area, the frame between the splash screen tearing down and the first render —
    is drawn by the platform, using a colour React Native never sets. It defaults to white, so
    a dark-mode cold start flashed white for a frame and a bounced scroll showed a white band
    under a near-black page.

    `expo-system-ui` was already a dependency and nothing called it.
  */
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.canvas)
  }, [theme.canvas])
  const {
    user,
    loading,
    hydrating,
    syncBlocked,
    syncUnavailable,
    isNewAccount,
    unclaimedConflict,
    recoveryPending,
  } = useAuth()
  const onboardedAt = useStore(s => s.onboardedAt)
  const segments = useSegments()
  const router = useRouter()

  /*
    Auth routing has to live here, in a component that stays mounted for the whole
    session. `app/index.tsx` redirects correctly on a cold start, but a <Redirect>
    unmounts itself as soon as it fires — so signing in would leave the user sitting on
    the login screen, and signing out would leave them inside the app. This effect is the
    only thing watching `user` continuously.
  */
  const onLoginScreen = segments[0] === 'login'
  const onWelcome = segments[0] === 'welcome'
  const onOnboarding = segments[0] === 'onboarding'
  const onResetPassword = segments[0] === 'reset-password'
  const needsSetup = onboardedAt === null
  const welcomeSeen = useWelcomeSeen()
  const guest = useGuestMode()
  useNotifications()

  useEffect(() => {
    // `hydrating` is the fetch that follows a fresh sign-in. Routing before it lands would
    // read a store that has not received the account's saved profile yet.
    if (loading || hydrating) return
    // The navigator is unmounted in this state (SyncUnavailableScreen replaces it), so a
    // replace() here dispatches into a tree that is not there. Routing resumes when it is.
    if (user && unclaimedConflict) return
    if (user && syncUnavailable && needsSetup && !isNewAccount) return
    if (!user) {
      /*
        NO ACCOUNT IS NOT THE SAME AS NOT ALLOWED IN.

        The store has never known that users exist — diary, workouts, weigh-ins, targets and
        charts are all local state persisted to this phone, and Supabase is a sync layer over
        the top. So someone without a session can run the entire app; the only things they
        genuinely cannot have are backup and their data on a second device.

        Guest mode is therefore just this branch declining to redirect. There is no guest
        account and no parallel code path.
      */
      if (guest) {
        // Setup still has to happen — it is what produces the targets every screen reads —
        // but it writes only to the local store, so it needs no session.
        if (needsSetup) {
          if (!onOnboarding) router.replace('/onboarding')
          return
        }
        // Login stays reachable: a guest tapping "sign in" from Profile must not be bounced
        // straight back out of it.
        if (onWelcome) router.replace('/(tabs)')
        return
      }

      /*
        Not a guest and no session: this is someone who has not chosen yet. A device that has
        never been introduced gets the welcome screen rather than a password field.
        `welcomeSeen` is null only before the flag is read, which cannot happen here —
        LaunchGate holds the splash until it lands — and null is treated as "seen" anyway, so
        the failure mode is a missed introduction rather than nowhere to go.
      */
      const destination = welcomeSeen === false ? '/welcome' : '/login'
      if (!onLoginScreen && !onWelcome) router.replace(destination)
      return
    }
    /*
      A session exists, so this device is not a guest any more — whatever it was a moment ago.

      Clearing the flag here rather than in the login screen catches every route in: the form,
      a confirmation deep link, and a session restored on cold start. Leaving it set would mean
      a later sign-out dropped the person back into the local-only app still holding the
      account's data, which is precisely the "whose data is this?" state the store epochs and
      the unclaimed-data screen exist to prevent.
    */
    if (guest) leaveGuestMode()

    /*
      A recovery link was just redeemed, so this session exists to choose a password and
      nothing else. Checked ahead of setup and of the tabs: a reset that let the user through
      to the app first has not reset anything, which is precisely how "reset your password"
      came to leave the old password working. Cleared by the screen once it saves.
    */
    if (recoveryPending) {
      if (!onResetPassword) router.replace('/reset-password')
      return
    }

    if (needsSetup) {
      if (!onOnboarding) router.replace('/onboarding')
      return
    }
    if (onLoginScreen || onOnboarding || onWelcome || onResetPassword) router.replace('/(tabs)')
  }, [
    user,
    loading,
    hydrating,
    syncUnavailable,
    isNewAccount,
    unclaimedConflict,
    needsSetup,
    onLoginScreen,
    onWelcome,
    onOnboarding,
    onResetPassword,
    recoveryPending,
    welcomeSeen,
    guest,
    router,
  ])

  const showBanner = syncBlocked && !!user
  /*
    The banner has consumed the status-bar area, so the screens below must stop reserving
    it too — every screen header and scroll view pads by `insets.top` of its own, which
    would otherwise leave a full status bar of dead space under the banner. Overriding the
    context is the supported way to say "that inset is already spent".

    Modally-presented routes are excluded: react-native-screens presents them at the native
    level, above the banner rather than below it, so they still own the status bar and need
    the real inset. The screens underneath keep their padding while covered, which nobody
    can see.
  */
  const onModalRoute = MODAL_ROUTES.has(segments[0] ?? '')
  const overrideTop = showBanner && !onModalRoute
  // Memoised: a fresh object here would change the context value on every render of this
  // component and re-render every inset consumer in the tree along with it.
  const insetsForStack = useMemo(
    () => (overrideTop ? { ...insets, top: 0 } : insets),
    [overrideTop, insets]
  )

  /*
    After every hook. The wall is for one narrow case: an account we could not read, on a
    device holding nothing to show.

    `needsSetup` is the test for "nothing to show" — a store that has been through setup
    holds the user's real data, whether it arrived from this build's loader or was simply
    already there before this build existed. Walling that user hides weeks of their own
    logging behind a connection error, which is worse than the risk the wall exists for.
    They get the not-synced banner instead, and their edits are held.

    A brand-new account is let through for the opposite reason: there is no server row to
    wait for, so the setup flow is exactly where they should be.
  */
  // Asked before anything is written or erased, so it outranks every other state here.
  if (user && unclaimedConflict) {
    return (
      <>
        <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
        <UnclaimedDataScreen />
      </>
    )
  }

  if (user && syncUnavailable && needsSetup && !isNewAccount) {
    return (
      <>
        <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
        <SyncUnavailableScreen />
      </>
    )
  }

  return (
    <>
      {/* Training is always dark (workout mode ignores the light/dark setting), so its
          status bar is light whatever the rest of the app is doing. */}
      <StatusBar
        style={theme.mode === 'dark' || TRAINING_ROUTES.has(segments[0] ?? '') ? 'light' : 'dark'}
      />
      {showBanner ? <SyncBlockedBanner topInset={insets.top} /> : null}
      <SafeAreaInsetsContext.Provider value={insetsForStack}>
        {/* Above the Stack so the tab bar, which renders outside the screens, can still reach
            the focused screen's content to blur it. */}
        <BlurTargetProvider>
          {/* Inside BlurTargetProvider so a toast renders above the tab bar rather than
              beneath it, and above the Stack so any screen can raise one. */}
          <SnackbarProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.canvas },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="(tabs)" />
            {/* Fade, like login and onboarding: these three replace each other rather than
                stacking, and a horizontal push would claim a hierarchy that is not there.
                No gesture — leaving is the "Get started" button's job, and an edge swipe off
                a one-way door has nowhere to go. */}
            <Stack.Screen
              name="welcome"
              options={{ animation: 'fade', gestureEnabled: false }}
            />
            <Stack.Screen name="login" options={{ animation: 'fade' }} />
            {/* Same family as login and welcome, and for the same reason: it replaces them
                rather than stacking on them. No gesture — routing holds the user here until
                the password is saved, so an edge swipe would fight the redirect and lose. */}
            <Stack.Screen
              name="reset-password"
              options={{ animation: 'fade', gestureEnabled: false }}
            />
            <Stack.Screen
              name="onboarding"
              options={{ animation: 'fade', gestureEnabled: false }}
            />
            <Stack.Screen
              name="food-search"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="lift-picker"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen name="goals" />
            <Stack.Screen name="help" />
            <Stack.Screen
              name="weigh-in"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen name="chat" options={{ presentation: 'modal' }} />
            {/* Training opens like an app inside the app: it slides in over the whole tab
                navigator, main tab bar included, and its own back arrow takes it away. */}
            <Stack.Screen name="training" options={{ animation: 'slide_from_right' }} />
            {/* Fades up over the finished workout rather than sliding: it is the same moment,
                concluded, not a new place. */}
            <Stack.Screen
              name="workout-summary"
              options={{ presentation: 'fullScreenModal', animation: 'fade' }}
            />
            <Stack.Screen
              name="routine-day"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="update"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
          </Stack>
          </SnackbarProvider>
        </BlurTargetProvider>
      </SafeAreaInsetsContext.Provider>
    </>
  )
}

/**
 * Releases the splash and decides what the very first frame is.
 *
 * This lives *inside* AuthProvider so the Supabase session restore starts in parallel with
 * font loading and AsyncStorage rehydration. Previously the provider was mounted only
 * after those finished, which made the network round trip strictly serial with them and
 * pushed the worst-case cold start past eight seconds.
 */
const LaunchGate: React.FC<{ localReady: boolean }> = ({ localReady }) => {
  const { loading } = useAuth()

  const onLayout = useCallback(() => {
    if (localReady) void SplashScreen.hideAsync()
  }, [localReady])

  useEffect(() => {
    if (localReady) void SplashScreen.hideAsync()
  }, [localReady])

  /*
    A floor on how long the launch animation is allowed to be on screen.

    The rings take `LAUNCH_SEQUENCE_MS` to turn into alignment, and a warm start where the
    session is already cached resolves in a couple of hundred milliseconds — which would cut
    the animation off part-way and swap to the dashboard mid-rotation. A launch sequence that
    gets truncated does not read as "fast", it reads as a glitch, and it is the single most
    common way a branded launch is ruined.

    So this is a deliberate delay: on a fast start the user waits for branding. That is a real
    cost, paid on every cold launch, and it is only defensible because it is bounded and
    because the alternative looks broken. It is NOT a minimum on slow starts — those already
    exceed it and are gated by `loading` alone — and it starts ticking at mount, so the time
    auth spends working counts toward it rather than being added to it.
  */
  const [sequenceDone, setSequenceDone] = useState(false)

  useEffect(() => {
    if (!localReady) return
    const timer = setTimeout(() => setSequenceDone(true), LAUNCH_SEQUENCE_MS)
    return () => clearTimeout(timer)
  }, [localReady])

  if (!localReady) return null

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      {loading || !sequenceDone ? <LaunchScreen /> : <RootNavigator />}
    </View>
  )
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
  })
  const hydrated = useStoreHydrated()
  // Null until the read lands. Gated with the rest of local state so the first frame knows
  // whether this device has been introduced to the app, rather than guessing and correcting.
  // Both device flags, not just one. Routing reads guest mode on the very first pass, so
  // letting the app render before it resolves would send a guest to the login screen and
  // then bounce them into the tabs a frame later.
  const welcomeSeen = useWelcomeSeen()
  const guest = useGuestMode()

  // A font that fails to download must not deadlock the splash forever — fall through
  // and let the platform fall back rather than showing an infinite launch screen.
  const localReady =
    (fontsLoaded || !!fontError) && hydrated && welcomeSeen !== null && guest !== null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* Above everything, including the pane-local copies of the backdrop. One set of
            drift clocks for the whole app rather than three per Aurora instance — see the
            note in Aurora.tsx. */}
        <AuroraDriftProvider>
        <AuthProvider>
          {/* One Health Connect probe for the whole app. Three screens read it, and when each
              held its own copy, connecting from Profile left the dashboard card still saying
              "Not connected" until something happened to remount it. */}
          <HealthProvider>
            <LaunchGate localReady={localReady} />
          </HealthProvider>
        </AuthProvider>
        </AuroraDriftProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
