import { router } from 'expo-router'

/**
 * Leaves Training for the main app, from any of its tabs.
 *
 * `router.back()` inside a tab navigator goes to the previous TAB, so the same back arrow
 * left Training on Today but hopped to another tab on Plan. Dismissing to the main tabs
 * makes the arrow mean one thing everywhere, the way JioTunes' back always returns to MyJio.
 */
export const exitTraining = () => router.dismissTo('/(tabs)')
