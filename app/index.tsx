import React from 'react'
import { Redirect } from 'expo-router'

import { useAuth } from '@/lib/AuthProvider'

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

  if (loading) return null
  if (!user) return <Redirect href="/login" />
  return <Redirect href="/(tabs)" />
}
