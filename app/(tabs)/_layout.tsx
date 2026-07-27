import React from 'react'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import { Tabs } from 'expo-router'
import { BlurView } from 'expo-blur'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { BookOpen, Dumbbell, Home, TrendingUp, User } from 'lucide-react-native'

/**
 * expo-router bundles its own copy of the bottom-tabs types. Importing them from
 * @react-navigation/bottom-tabs pulls in a second, structurally incompatible copy, so the
 * prop type is derived from the Tabs component itself and stays correct across upgrades.
 */
type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0]

import { useTheme } from '@/theme/useTheme'
import { Body } from '@/components/Text'
import { HIT_SIZE } from '@/theme/tokens'

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
  const theme = useTheme()
  const insets = useSafeAreaInsets()

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

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={props => <GlassTabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="diary" />
      <Tabs.Screen name="workout" />
      <Tabs.Screen name="progress" />
      <Tabs.Screen name="profile" />
    </Tabs>
  )
}
