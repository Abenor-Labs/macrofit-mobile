import React from 'react'
import { Redirect } from 'expo-router'

import { useAuth } from '@/lib/AuthProvider'
import { useStore } from '@/store/useStore'
import { useWelcomeSeen } from '@/lib/welcomeSeen'
import { LaunchScreen } from '@/components/LaunchScreen'

/**
 * The entry route, and the cold-start redirect authority.
 *
 * `/` resolves here rather than to `(tabs)/index` — the root `index` config sorts ahead
 * of the group's index for the empty path — so every cold start lands on this gate before
 * any screen renders. It handles the first frame only; `RootNavigator` in `app/_layout.tsx`
 * owns routing for the rest of the session, because a <Redirect> unmounts as soon as it
 * fires and so cannot react to a later sign-in or sign-out.
 *
 * `LaunchGate` already withholds this whole tree while the session resolves, so `loading`
 * is false by the time this renders. The branded fallback below is defensive only — it
 * exists so that any future change which mounts this route earlier degrades to the launch
 * screen rather than to the blank canvas that used to sit here.
 */
export default function Index() {
  const { user, loading } = useAuth()
  const onboardedAt = useStore(s => s.onboardedAt)
  const welcomeSeen = useWelcomeSeen()

  if (loading) return <LaunchScreen />
  // A phone that has never run the app is introduced to it before it is asked for a
  // password. `LaunchGate` holds the splash until this flag is read, so the null branch
  // here is the same defensive fallback as the one in `RootNavigator`.
  if (!user) return <Redirect href={welcomeSeen === false ? '/welcome' : '/login'} />
  // Setup has to clear before the tabs: the store's defaults describe a 30-year-old
  // 175 cm male, so an unconfigured account shows targets that look authoritative and
  // belong to nobody. `loading` above already covers the fetch of saved data, so a
  // returning user never lands here.
  if (onboardedAt === null) return <Redirect href="/onboarding" />
  return <Redirect href="/(tabs)" />
}
