import 'react-native-get-random-values'
import '../global.css'

import React, { useCallback, useEffect } from 'react'
import { View } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useFonts } from 'expo-font'
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold'
import { Fraunces_700Bold } from '@expo-google-fonts/fraunces/700Bold'
import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular'
import { Figtree_500Medium } from '@expo-google-fonts/figtree/500Medium'
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold'

import { useTheme } from '@/theme/useTheme'
import { useStoreHydrated } from '@/store/useStore'
import { AuthProvider, useAuth } from '@/lib/AuthProvider'

// Hold the native splash until fonts AND persisted state are ready. Without the store
// gate, the first frame renders default goals and an empty diary before AsyncStorage
// rehydrates — the user sees their data "reset" for a moment on every cold start.
void SplashScreen.preventAutoHideAsync()

const RootNavigator: React.FC = () => {
  const theme = useTheme()
  const { user, loading } = useAuth()
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

  useEffect(() => {
    if (loading) return
    if (!user && !onLoginScreen) router.replace('/login')
    else if (user && onLoginScreen) router.replace('/(tabs)')
  }, [user, loading, onLoginScreen, router])

  return (
    <>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
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
    </>
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
  const ready = (fontsLoaded || !!fontError) && hydrated

  const onLayout = useCallback(() => {
    if (ready) void SplashScreen.hideAsync()
  }, [ready])

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync()
  }, [ready])

  if (!ready) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayout}>
      <SafeAreaProvider>
        <AuthProvider>
          <View style={{ flex: 1 }}>
            <RootNavigator />
          </View>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
