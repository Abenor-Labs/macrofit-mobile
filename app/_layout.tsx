import 'react-native-get-random-values'
import '../global.css'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, StyleSheet, View } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
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
import { LaunchScreen } from '@/components/LaunchScreen'
import { BrandMark } from '@/components/BrandMark'
import { Button } from '@/components/Button'
import { Body, SectionTitle } from '@/components/Text'
import { HIT_SIZE, spacing } from '@/theme/tokens'

// Hold the native splash until fonts AND persisted state are ready. Without the store
// gate, the first frame renders default goals and an empty diary before AsyncStorage
// rehydrates — the user sees their data "reset" for a moment on every cold start.
void SplashScreen.preventAutoHideAsync()

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
const MODAL_ROUTES = new Set(['food-search', 'lift-picker', 'chat'])

const RootNavigator: React.FC = () => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { user, loading, hydrating, syncBlocked, syncUnavailable, isNewAccount, unclaimedConflict } =
    useAuth()
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
  const onOnboarding = segments[0] === 'onboarding'
  const needsSetup = onboardedAt === null

  useEffect(() => {
    // `hydrating` is the fetch that follows a fresh sign-in. Routing before it lands would
    // read a store that has not received the account's saved profile yet.
    if (loading || hydrating) return
    // The navigator is unmounted in this state (SyncUnavailableScreen replaces it), so a
    // replace() here dispatches into a tree that is not there. Routing resumes when it is.
    if (user && unclaimedConflict) return
    if (user && syncUnavailable && needsSetup && !isNewAccount) return
    if (!user) {
      if (!onLoginScreen) router.replace('/login')
      return
    }
    if (needsSetup) {
      if (!onOnboarding) router.replace('/onboarding')
      return
    }
    if (onLoginScreen || onOnboarding) router.replace('/(tabs)')
  }, [
    user,
    loading,
    hydrating,
    syncUnavailable,
    isNewAccount,
    unclaimedConflict,
    needsSetup,
    onLoginScreen,
    onOnboarding,
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
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      {showBanner ? <SyncBlockedBanner topInset={insets.top} /> : null}
      <SafeAreaInsetsContext.Provider value={insetsForStack}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.canvas },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="login" options={{ animation: 'fade' }} />
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
          <Stack.Screen name="chat" options={{ presentation: 'modal' }} />
        </Stack>
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

  if (!localReady) return null

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      {loading ? <LaunchScreen /> : <RootNavigator />}
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

  // A font that fails to download must not deadlock the splash forever — fall through
  // and let the platform fall back rather than showing an infinite launch screen.
  const localReady = (fontsLoaded || !!fontError) && hydrated

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <LaunchGate localReady={localReady} />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
