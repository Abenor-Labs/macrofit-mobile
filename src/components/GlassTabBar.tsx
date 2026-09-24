import React, { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import type { Tabs } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { Circle } from 'lucide-react-native'

import { Glass } from './Material'
import { Body } from './Text'
import { useTheme } from '@/theme/useTheme'
import { HIT_SIZE } from '@/theme/tokens'

/**
 * expo-router bundles its own copy of the bottom-tabs types. Importing them from
 * @react-navigation/bottom-tabs pulls in a second, structurally incompatible copy, so the
 * prop type is derived from the Tabs component itself and stays correct across upgrades.
 */
type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0]

export type TabIcon = React.ComponentType<{ size: number; color: string; strokeWidth: number }>

export interface GlassTabBarProps extends TabBarProps {
  /** Label and icon per route name. */
  items: Record<string, { label: string; icon: TabIcon }>
  /**
   * Called before the default tab switch. Return true to swallow the press — how the main
   * bar's Workout item opens Training as its own app instead of switching to a tab.
   */
  onPressItem?: (routeName: string) => boolean
  /** Rides on top of the bar inside the same glass: Training's live-session strip. */
  accessory?: React.ReactNode
}

/** Width of the sliding active indicator. */
const INDICATOR_WIDTH = 26

/**
 * Floating glass tab bar.
 *
 * This is the one place blur is unambiguously worth its cost: content scrolls underneath
 * it continuously, so a solid bar would look pasted on. The active state carries an
 * indicator bar AND a weight change, never color alone.
 */
export const GlassTabBar: React.FC<GlassTabBarProps> = ({ state, navigation, items, onPressItem, accessory }) => {
  /*
    The theme comes from wherever the navigator is mounted. Training mounts its whole tab
    navigator inside workout mode's ThemeScope, so its bar is lime-on-black without this
    component knowing a second palette exists.
  */
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  /*
    The active indicator travels between tabs instead of being repainted under each one.

    It used to be a per-tab View whose background flipped between `brandText` and
    `transparent`, so the state changed with no motion at all — the one moment in the app
    where the user's own finger causes a jump cut. A single indicator that slides is the
    standard treatment and it is what makes the bar feel like one object rather than five.

    Tab CONTENT still never slides (the screens are peers, and cross-fading them would claim
    a hierarchy that is not there). This is the indicator only.
  */
  const [barWidth, setBarWidth] = useState(0)
  const reduced = useReducedMotion()
  const tabWidth = state.routes.length > 0 ? barWidth / state.routes.length : 0
  const indicatorX = useSharedValue(0)

  useEffect(() => {
    if (tabWidth === 0) return
    const target = state.index * tabWidth + (tabWidth - INDICATOR_WIDTH) / 2
    indicatorX.value = reduced
      ? target
      : // Short and strongly decelerated: the finger has already arrived, so the indicator is
        // catching up rather than leading. Anything slower reads as lag.
        withTiming(target, { duration: 260, easing: Easing.bezier(0.23, 1, 0.32, 1) })
  }, [state.index, tabWidth, indicatorX, reduced])

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }))

  return (
    /*
      The tab bar is one of the four things in this app allowed to be glass, and it is the
      canonical one — Telegram attaches its own glass drawable to exactly this surface
      (`MainTabsActivity`, `tabsViewBackground`) and to sheets, and to nothing else.

      `Glass` owns the blur, the tint and the edge now. The tint it applies is far heavier
      than the 0.30 that used to be here, which is what makes these five labels legible
      against whatever is scrolling underneath them.
    */
    <Glass
      radius={0}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        // Clears the iOS home indicator / Android gesture bar.
        paddingBottom: Math.max(insets.bottom, 8),
        borderTopWidth: StyleSheet.hairlineWidth * 2,
        borderTopColor: theme.glass.border,
      }}
    >
      {/*
        A lit bevel used to sit here, drawn by a Skia runtime shader, giving the bar's edge the
        thickness of real glass.

        It cost 10.8 MB of native library per architecture — 43 MB across the four the app
        shipped, on a download users fetch in full every release because this app sideloads
        rather than going through a store. One highlight on one bar is not worth a third of the
        APK, and the blur and tint above carry the material on their own.

        LiquidGlass already returned null whenever its shader failed to compile, so the bar was
        always built to stand without it.
      */}

      {accessory}

      <View
        style={{ flexDirection: 'row' }}
        onLayout={event => setBarWidth(event.nativeEvent.layout.width)}
      >
        {/* One indicator for the whole bar, positioned by transform. Shape as well as hue, so
            the active state still survives greyscale. */}
        {tabWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: 0,
                left: 0,
                width: INDICATOR_WIDTH,
                height: 3,
                borderRadius: 999,
                backgroundColor: theme.brandText,
                zIndex: 1,
              },
              indicatorStyle,
            ]}
          />
        ) : null}
        {state.routes.map((route, index) => {
          const focused = state.index === index
          const item = items[route.name]
          const Icon = item?.icon ?? Circle
          const label = item?.label ?? route.name

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              onPress={() => {
                // A launcher item leaves this navigator instead of switching tab.
                if (onPressItem?.(route.name)) return
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
              <Icon
                size={22}
                color={focused ? theme.brandText : theme.textMuted}
                strokeWidth={focused ? 2.4 : 1.8}
              />
              <Body
                size={11}
                weight={focused ? 'semibold' : 'medium'}
                style={{ color: focused ? theme.brandText : theme.textMuted }}
              >
                {label}
              </Body>
            </Pressable>
          )
        })}
      </View>
    </Glass>
  )
}

