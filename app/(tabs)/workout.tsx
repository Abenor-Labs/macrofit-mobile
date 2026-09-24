import { Redirect } from 'expo-router'

/**
 * Workout is a launcher in the main tab bar, not a screen: the tab press is intercepted in
 * (tabs)/_layout.tsx and pushes Training, which is its own app with its own tabs.
 *
 * The route has to exist for the bar to draw the item. If anything does land here — a deep
 * link, a restored navigation state — it forwards to Training rather than showing a blank tab.
 */
export default function WorkoutTab() {
  return <Redirect href="/training" />
}
