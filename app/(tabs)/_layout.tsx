import React, { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { Tabs, useRouter, useSegments } from 'expo-router'
import { useSnackbar } from '@/components/Snackbar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import {
  BookOpen,
  Droplets,
  Dumbbell,
  Home,
  Plus,
  Scale,
  Sparkles,
  TrendingUp,
  User,
  Utensils,
} from 'lucide-react-native'

import { getTodayString } from '@core/utils/calculations'
import { useStore } from '@/store/useStore'

import { useTheme } from '@/theme/useTheme'
import { Body } from '@/components/Text'
import { GlassTabBar, type GlassTabBarProps } from '@/components/GlassTabBar'
import { HIT_SIZE, radius, shadow, spacing } from '@/theme/tokens'

const TAB_ITEMS: GlassTabBarProps['items'] = {
  index: { label: 'Dashboard', icon: Home },
  diary: { label: 'Diary', icon: BookOpen },
  workout: { label: 'Workout', icon: Dumbbell },
  progress: { label: 'Progress', icon: TrendingUp },
  profile: { label: 'Profile', icon: User },
}

/**
 * Floating assistant button.
 *
 * app/chat.tsx existed and was registered in the root Stack, but nothing anywhere
 * navigated to it — so the assistant was unreachable and simply never appeared. This is
 * its entry point, mounted once here so it is available from every tab rather than
 * duplicated per screen.
 */
/** How much a "log water" tap adds. The middle of the dashboard's own quick-add row. */
const QUICK_WATER_ML = 250

interface QuickAction {
  key: string
  label: string
  icon: React.ReactNode
  run: () => void
}

/**
 * The one floating control on Home: log anything from a single place.
 *
 * Home only. On Diary a `+` would duplicate the add-food button in every meal row, and on
 * Workout it would duplicate Add exercise — a floating button that repeats what is already
 * on screen teaches people to ignore it.
 *
 * It absorbed the assistant button rather than sitting next to it. Two circles stacked in
 * one thumb's reach is the outcome nobody wants, and Ask AI is already a header icon on
 * Workout and Diary, so it does not lose its footing there.
 *
 * Water logs 250 ml on the spot instead of navigating: there is nowhere to navigate to, and
 * an action that completes in one tap should not cost two. Weight is deliberately absent —
 * it needs a number typed, so it cannot be a one-tap item, and its field is already on this
 * screen in the weight-goal card.
 */
const QuickLogButton: React.FC = () => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const addWater = useStore(s => s.addWater)
  const snackbar = useSnackbar()
  const [open, setOpen] = useState(false)

  const spin = useSharedValue(0)
  const iconSpin = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 45}deg` }],
  }))

  const toggle = (next: boolean) => {
    setOpen(next)
    spin.value = withTiming(next ? 1 : 0, { duration: 160 })
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }

  /** Every item closes the sheet first, so returning to Home never finds it still open. */
  const pick = (action: QuickAction) => {
    toggle(false)
    action.run()
  }

  const actions: QuickAction[] = [
    {
      key: 'ai',
      label: 'Ask AI',
      icon: <Sparkles size={18} color={theme.brandText} strokeWidth={2} />,
      run: () => router.push('/chat'),
    },
    {
      key: 'workout',
      label: 'Log workout',
      icon: <Dumbbell size={18} color={theme.brandText} strokeWidth={2} />,
      run: () => router.push('/training'),
    },
    {
      key: 'water',
      label: `Log ${QUICK_WATER_ML} ml water`,
      icon: <Droplets size={18} color={theme.brandText} strokeWidth={2} />,
      run: () => {
        /*
          The one action in this menu that commits immediately instead of opening a screen.
          Everything else can be abandoned by going back; water is written the moment the
          finger lifts, and the only correction used to be a minus button four swipes down
          the dashboard, on a card the user was not looking at.
        */
        const date = getTodayString()
        addWater(date, QUICK_WATER_ML)
        snackbar.show(`${QUICK_WATER_ML} ml water logged`, {
          label: 'Undo',
          onPress: () => addWater(date, -QUICK_WATER_ML),
        })
      },
    },
    {
      /*
        Weight belongs here rather than on a dashboard card.

        "Where is the weight logging in the app?" was a real report: it existed, but only
        inside a card two tabs deep that renders nothing at all when no goal weight is set —
        which is optional in setup, so for most users there was nowhere to do it from home.

        A seventh dashboard card was the obvious fix and the wrong one. That screen already
        carries findings for printing the same number twice and for burying the one line that
        asks the user to act. Food, water and weight are the three things this app records;
        they belong in one place.
      */
      key: 'weight',
      label: 'Log weight',
      icon: <Scale size={18} color={theme.brandText} strokeWidth={2} />,
      run: () => router.push('/weigh-in'),
    },
    {
      key: 'food',
      label: 'Log food',
      icon: <Utensils size={18} color={theme.brandText} strokeWidth={2} />,
      run: () => router.push('/food-search'),
    },
  ]

  const fabBottom = Math.max(insets.bottom, 8) + 74

  return (
    <>
      {/* Catches the tap that closes the sheet, and dims what is behind it so the items
          read as a layer rather than as more dashboard. */}
      {open && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close the log menu"
          onPress={() => toggle(false)}
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: theme.mode === 'light' ? 'rgba(28,25,23,0.34)' : 'rgba(0,0,0,0.55)' },
          ]}
        />
      )}

      {open && (
        <View
          style={{
            position: 'absolute',
            right: 18,
            bottom: fabBottom + 68,
            alignItems: 'flex-end',
            gap: spacing.sm,
          }}
        >
          {actions.map(action => (
            <Pressable
              needsOffscreenAlphaCompositing
              key={action.key}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={() => pick(action)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              {/* The label is part of the target, not a caption beside it. */}
              <View
                style={{
                  backgroundColor: theme.surface,
                  borderRadius: radius.pill,
                  borderWidth: StyleSheet.hairlineWidth * 2,
                  borderColor: theme.border,
                  paddingHorizontal: spacing.md,
                  paddingVertical: 7,
                }}
              >
                <Body size={13} weight="semibold">
                  {action.label}
                </Body>
              </View>
              <View
                style={{
                  width: HIT_SIZE,
                  height: HIT_SIZE,
                  borderRadius: HIT_SIZE / 2,
                  backgroundColor: theme.surface,
                  borderWidth: StyleSheet.hairlineWidth * 2,
                  borderColor: theme.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {action.icon}
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {/*
        The position lives on this View and not on the Pressable below it. Both the star button
        this replaced and the plus that replaced it rendered as a full-width band under the tab
        bar, and measuring it showed why: the Pressable's function style never reached the native
        view at all, so it laid out at its content size — `{"x":0,"y":774,"width":360,"height":26}`
        on a 360dp screen, 26dp being exactly the icon. Static layout props on a plain View are
        not subject to whatever drops it, and the Pressable keeps only the press feedback, which
        is the part that genuinely has to be a function of `pressed`.

        box-none so the padding around the circle does not eat taps meant for the content behind.
      */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          right: 18,
          // Clears the tab bar, whose own height already accounts for the safe area.
          bottom: fabBottom,
          width: 56,
          height: 56,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={
            open ? 'Close the log menu' : 'Log food, water, a workout, or ask the assistant'
          }
          onPress={() => toggle(!open)}
          /*
            An array rather than `({ pressed }) => …`. NativeWind's JSX interop was resolving
            function-form styles away before they reached the native view — this button measured
            `{"x":0,"y":774,"width":360,"height":26}` on a 360dp screen, content-sized, with no
            radius, centring or position. It has since been removed from the project, so the
            function form works again, but the array plus android_ripple is the simpler shape
            and there is no reason to go back.
          */
          /*
            Solid brand, no blur.

            This used to run a full ChromeBlur underneath a `brand + 'E6'` wash — a 90% opaque
            fill over a blur nobody could see any part of. A button is a control, not a
            window; it gets its separation from the shadow and from being the only saturated
            circle on the screen.
          */
          style={[
            styles.fab,
            { backgroundColor: theme.brand, borderColor: theme.glass.border },
            theme.mode === 'light' && shadow.floating,
          ]}
          android_ripple={{ color: theme.glass.border, borderless: false, radius: 28 }}
        >
          {/* brandOn, not a hardcoded white: white on a light brand is unreadable. */}
          <Animated.View style={iconSpin}>
            <Plus size={26} color={theme.brandOn} strokeWidth={2.4} />
          </Animated.View>
        </Pressable>
      </View>
    </>
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
  const active = segments[segments.length - 1]
  // '(tabs)' is what the segment reads as on the index route, which has no name of its own.
  const onHome = active === '(tabs)' || active === 'index'
  const router = useRouter()

  /*
    Workout is a launcher, not a tab. Training is its own app — own tab bar, own colours,
    own back arrow — the way JioTunes opens out of MyJio, and a tab switch cannot give it
    that: the main bar would stay on screen underneath it. So the press is swallowed and
    Training is pushed over the whole tab navigator instead.
  */
  const openItem = (routeName: string): boolean => {
    if (routeName !== 'workout') return false
    void Haptics.selectionAsync()
    router.push('/training')
    return true
  }

  return (
    <View style={{ flex: 1 }}>
      <Tabs screenOptions={{ headerShown: false }} tabBar={props => <GlassTabBar {...props} items={TAB_ITEMS} onPressItem={openItem} />}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="diary" />
        <Tabs.Screen name="workout" />
        <Tabs.Screen name="progress" />
        <Tabs.Screen name="profile" />
      </Tabs>
      {onHome && <QuickLogButton />}
    </View>
  )
}

const styles = StyleSheet.create({
  /*
    Static, and via StyleSheet.create rather than inline, because this is the layout that kept
    going missing. Only the press-dependent parts stay inline above.
  */
  /*
    No `overflow: 'hidden'` and no shadow of its own any more. The clip existed to contain a
    BlurView that is gone, and on iOS it also clipped the button's own shadow; the shadow
    keys were a one-off pair that `shadow.floating` now supplies from the token table.
  */
  fab: {
    flex: 1,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
})
