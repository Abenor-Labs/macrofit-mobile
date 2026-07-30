import React from 'react'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import { Tabs, useRouter, useSegments } from 'expo-router'
import { BlurView } from 'expo-blur'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { BookOpen, Dumbbell, Home, Sparkles, TrendingUp, User } from 'lucide-react-native'

/**
 * expo-router bundles its own copy of the bottom-tabs types. Importing them from
 * @react-navigation/bottom-tabs pulls in a second, structurally incompatible copy, so the
 * prop type is derived from the Tabs component itself and stays correct across upgrades.
 */
type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0]

import { useTheme } from '@/theme/useTheme'
import { Body } from '@/components/Text'
import { HIT_SIZE, workoutTheme } from '@/theme/tokens'

const ICONS: Record<string, React.ComponentType<{ size: number; color: string; strokeWidth: number }>> = {
  index: Home,
  diary: BookOpen,
  workout: Dumbbell,
  progress: TrendingUp,
  profile: User,
}

const LABELS: Record<string, string> = {
  index: 'Dashboard',
  diary: 'Diary',
  workout: 'Workout',
  progress: 'Progress',
  profile: 'Profile',
}

/**
 * Floating glass tab bar.
 *
 * This is the one place blur is unambiguously worth its cost: content scrolls underneath
 * it continuously, so a solid bar would look pasted on. The active state carries an
 * indicator bar AND a weight change, never color alone.
 */
const GlassTabBar: React.FC<TabBarProps> = ({ state, navigation }) => {
  const appTheme = useTheme()
  const insets = useSafeAreaInsets()

  /*
    The bar crosses into workout mode with the content above it. Leaving it jade over a
    near-black lime screen would draw a seam across the bottom of the display and undo the
    thing the mode is for — the chrome has to be in the room too.

    Read off the focused route rather than a context, because the tab bar renders as a
    sibling of the screens, outside any ThemeScope they set.
  */
  const theme = state.routes[state.index]?.name === 'workout' ? workoutTheme : appTheme

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        // Clears the iOS home indicator / Android gesture bar.
        paddingBottom: Math.max(insets.bottom, 8),
        borderTopWidth: StyleSheet.hairlineWidth * 2,
        borderTopColor: theme.glass.border,
        overflow: 'hidden',
      }}
    >
      <BlurView
        tint={theme.glass.tint}
        intensity={theme.glass.intensity + 20}
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.glass.overlay }]} />

      <View style={{ flexDirection: 'row' }}>
        {state.routes.map((route, index) => {
          const focused = state.index === index
          const Icon = ICONS[route.name] ?? Home
          const label = LABELS[route.name] ?? route.name

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                })
                if (!focused && !event.defaultPrevented) {
                  void Haptics.selectionAsync()
                  navigation.navigate(route.name)
                }
              }}
              style={{
                flex: 1,
                minHeight: HIT_SIZE,
                alignItems: 'center',
                justifyContent: 'center',
                paddingTop: 10,
                gap: 3,
              }}
            >
              {/* Active indicator: shape, not just hue, so the state survives greyscale. */}
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  width: 26,
                  height: 3,
                  borderRadius: 999,
                  backgroundColor: focused ? theme.brandText : 'transparent',
                }}
              />
              <Icon
                size={22}
                color={focused ? theme.brandText : theme.textMuted}
                strokeWidth={focused ? 2.4 : 1.8}
              />
              <Body
                size={10}
                weight={focused ? 'semibold' : 'medium'}
                style={{ color: focused ? theme.brandText : theme.textMuted }}
              >
                {label}
              </Body>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

/**
 * Floating assistant button.
 *
 * app/chat.tsx existed and was registered in the root Stack, but nothing anywhere
 * navigated to it — so the assistant was unreachable and simply never appeared. This is
 * its entry point, mounted once here so it is available from every tab rather than
 * duplicated per screen.
 */
const AssistantButton: React.FC<{ inWorkoutMode: boolean }> = ({ inWorkoutMode }) => {
  const appTheme = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()

  // Floats over the screen, so it takes the screen's palette. A jade pill sitting on the
  // near-black workout canvas is the one element that would still look pasted on.
  const theme = inWorkoutMode ? workoutTheme : appTheme

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open the nutrition assistant"
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        router.push('/chat')
      }}
      style={({ pressed }) => ({
        position: 'absolute',
        right: 18,
        // Clears the tab bar, whose own height already accounts for the safe area.
        bottom: Math.max(insets.bottom, 8) + 74,
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: theme.glass.border,
        opacity: pressed ? 0.85 : 1,
        transform: [{ scale: pressed ? 0.96 : 1 }],
        // A soft lift so it reads as floating above the content it blurs.
        shadowColor: '#1C1917',
        shadowOpacity: theme.mode === 'light' ? 0.18 : 0.4,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
      })}
    >
      <BlurView
        tint={theme.glass.tint}
        intensity={theme.glass.intensity + 30}
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
        style={StyleSheet.absoluteFill}
      />
      {/* Brand wash rather than a flat fill, so the blur still shows through. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.brand + 'E6' }]} />
      {/* brandOn, not a hardcoded white: workout mode's brand is lime-300, and white on it
          is 1.2:1. The icon would vanish into the button. */}
      <Sparkles size={24} color={theme.brandOn} strokeWidth={2} />
    </Pressable>
  )
}

export default function TabsLayout() {
  /*
    A real View, not a fragment. `AssistantButton` positions itself absolutely, and a
    fragment gives it nothing to be absolute against — the navigator becomes its containing
    block, and on Android react-native-screens then lays the button out after the tab bar
    instead of over it. It rendered as a full-width green band below the tab bar with the
    icon jammed against the left edge, which is what an absolute child looks like once it
    has been demoted to a normal one.
  */
  // The button sits outside the navigator, so it cannot read the focused route from the
  // tab bar's props the way GlassTabBar does.
  const segments = useSegments() as string[]
  const inWorkoutMode = segments[segments.length - 1] === 'workout'

  return (
    <View style={{ flex: 1 }}>
      <Tabs screenOptions={{ headerShown: false }} tabBar={props => <GlassTabBar {...props} />}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="diary" />
        <Tabs.Screen name="workout" />
        <Tabs.Screen name="progress" />
        <Tabs.Screen name="profile" />
      </Tabs>
      <AssistantButton inWorkoutMode={inWorkoutMode} />
    </View>
  )
}
