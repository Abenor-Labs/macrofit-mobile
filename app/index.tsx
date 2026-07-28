import React from 'react'
import { Redirect } from 'expo-router'

import { useAuth } from '@/lib/AuthProvider'
import { useStore } from '@/store/useStore'

/**
 * The entry route, and the app's single redirect authority.
 *
 * `/` resolves here rather than to `(tabs)/index` — the root `index` config sorts ahead
 * of the group's index for the empty path — so every cold start lands on this gate before
 * any screen renders. Nothing else in the tree redirects on auth state; login.tsx only
 * signs in, and the tab screens assume they are already behind the gate.
 *
 * While the session is still resolving we render null on purpose: the native splash is
 * still up at that point, so a spinner here would only flash a second loading state.
 */
export default function Index() {
  const { user, loading } = useAuth()
  const onboardedAt = useStore(s => s.onboardedAt)

  if (loading) return null
  if (!user) return <Redirect href="/login" />
  // Setup has to clear before the tabs: the store's defaults describe a 30-year-old
  // 175 cm male, so an unconfigured account shows targets that look authoritative and
  // belong to nobody. `loading` above already covers the fetch of saved data, so a
  // returning user never lands here.
  if (onboardedAt === null) return <Redirect href="/onboarding" />
  return <Redirect href="/(tabs)" />
}
