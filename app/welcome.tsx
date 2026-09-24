import React, { useEffect } from 'react'
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { BookOpen, Dumbbell, TrendingUp } from 'lucide-react-native'

import { Aurora } from '@/components/Aurora'
import {
  LiquidGlassGroup,
  LiquidGlassPane,
  LiquidGlassScene,
} from '@/components/LiquidGlass'
import { BrandMark } from '@/components/BrandMark'
import { Body } from '@/components/Text'
import { Button } from '@/components/Button'
import { useTheme } from '@/theme/useTheme'
import { enterGuestMode, markWelcomeSeen } from '@/lib/welcomeSeen'
import { fonts, radius, spacing } from '@/theme/tokens'

/**
 * The app's first frame on a phone that has never run it.
 *
 * It is shown once per device and never again — see `src/lib/welcomeSeen.ts` for why that
 * flag is device-local and does not sync. Everything here is therefore a rare, first-time
 * moment, which is the one place the motion rules allow spending on delight.
 *
 * WHY THIS SCREEN EXISTS AT ALL, given that `login` already has the mark and a tagline:
 * cold-starting straight into a password field asks for credentials before saying what the
 * credentials are for. This says it, in one sentence, and then gets out of the way.
 *
 * TWO DOORS, AND THEY ARE NOT THE SAME DOOR.
 * An earlier version of this screen had one button, because both options led to the login
 * form and a second button would have been two ways to reach one place. That is no longer
 * true: "Get started" now goes straight into the app with no account at all, and signing in
 * is the other, quieter path. They are different destinations, so they are different buttons.
 *
 * The prominence is deliberate. Asking someone for a password before they have seen a single
 * screen is the friction this whole change exists to remove, so the local path is the primary
 * action and signing in is the text link underneath — the shape used by every app that treats
 * an account as something you graduate into rather than a toll gate.
 *
 * ONE-WAY DOOR: "Get started" `replace`s onto setup, so back cannot walk into an introduction
 * the user has finished. Signing in `push`es instead — someone who taps it and changes their
 * mind has to be able to come back here.
 */

/**
 * The staggered entrance, driven by a shared value rather than by Reanimated's `entering`
 * layout animations.
 *
 * WHY NOT `FadeInDown.delay(...)`:
 * On device the three pills came up permanently misaligned — same height, each sitting at a
 * different Y — because an interrupted layout animation can leave its residual transform on
 * the view and never reconcile. A row of glass panes at three different heights is a far
 * worse defect than a missing stagger, and it is not a bug you can see in a simulator that
 * never drops a frame.
 *
 * A derived style cannot fail that way. `progress` ends at exactly 1, so the final frame is
 * exactly `translateY: 0, opacity: 1` no matter what interrupts it on the way there.
 */
const Rise: React.FC<{
  delay: number
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
}> = ({ delay, children, style }) => {
  const reduced = useReducedMotion()
  const progress = useSharedValue(reduced ? 1 : 0)

  useEffect(() => {
    if (reduced) return
    progress.value = withDelay(
      delay,
      // Strong ease-out. The built-in curves are too weak to read as deceleration at this
      // duration, and an entrance must never ease in.
      withTiming(1, { duration: 280, easing: Easing.bezier(0.23, 1, 0.32, 1) })
    )
  }, [delay, progress, reduced])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 12 }],
  }))

  return (
    // Composited as one layer, or Android fades each child on its own and the button labels
    // flash lighter boxes over their panes for the length of the entrance.
    <Animated.View needsOffscreenAlphaCompositing style={[style, animatedStyle]}>
      {children}
    </Animated.View>
  )
}

/** The three things the app does, in the order a day happens. */
const CAPABILITIES = [
  { icon: BookOpen, label: 'Log' },
  { icon: Dumbbell, label: 'Train' },
  { icon: TrendingUp, label: 'Adapt' },
] as const

export default function WelcomeScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()

  /*
    Straight into the app. No account, no password, nothing to lose interest during.

    Both flags flip synchronously before the navigation, so the routing effect in
    `_layout.tsx` cannot observe a half-set state and bounce the user back here.
  */
  const start = () => {
    markWelcomeSeen()
    enterGuestMode()
    router.replace('/onboarding')
  }

  // `push`, not `replace`: this one is reversible on purpose.
  const signIn = () => {
    markWelcomeSeen()
    router.push('/login')
  }

  return (
    <LiquidGlassScene backdrop={<Aurora />}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'space-between',
          paddingTop: insets.top + spacing.xxl,
          paddingBottom: insets.bottom + spacing.xl,
          paddingHorizontal: spacing.lg,
          gap: spacing.xxl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Rise delay={0} style={{ alignItems: 'center', gap: spacing.md }}>
          <BrandMark size={80} />
          {/*
            `size`, not a fontSize in `style`. Body derives its lineHeight from the prop, so
            overriding only the style leaves a 40pt glyph in the 21.75pt line box the default
            size implies — which Android renders by shearing the caps flat and dropping the
            tittle off the i. Same trap is live in login.tsx and LaunchScreen.tsx.
          */}
          <Body size={40} style={{ fontFamily: fonts.displayBold, color: theme.text }}>
            MacroFit
          </Body>
          <Body tone="secondary" size={17} style={{ textAlign: 'center' }}>
            Eat, train, and let the numbers keep up with you.
          </Body>
        </Rise>

        {/*
          The glass. `spacing` is what lets iOS 26 bleed the three pills into each other and
          into the card below before their edges touch — the "liquid" half of the material.
          Everywhere else this is a plain view with a gap, so the row must read correctly as
          three separate panes, which it does.
        */}
        <LiquidGlassGroup spacing={28} style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            {CAPABILITIES.map(({ icon: Icon, label }, index) => (
              <Rise
                key={label}
                // Staggered by a beat each, so the eye follows the row left to right and,
                // on iOS 26, watches the panes find each other as they settle.
                delay={120 + index * 70}
                style={{ flex: 1 }}
              >
                {/*
                  `regular`, not `clear`. Clear glass is the prettier material and it is the
                  wrong one here: a 13pt label over a moving colour field needs the pane to
                  hold a floor under it, and a pill whose contrast depends on where the
                  aurora happens to be is not a pill that passes.
                */}
                <LiquidGlassPane
                  radius={radius.control}
                  style={{
                    paddingVertical: spacing.lg,
                    alignItems: 'center',
                    gap: spacing.sm,
                  }}
                >
                  <Icon size={22} color={theme.brandText} strokeWidth={2} />
                  <Body size={13} weight="semibold">
                    {label}
                  </Body>
                </LiquidGlassPane>
              </Rise>
            ))}
          </View>

          <Rise delay={330}>
            <LiquidGlassPane style={{ padding: spacing.xl, gap: spacing.md }}>
              <Body size={17} weight="medium">
                Your targets are not a printout.
              </Body>
              <Body tone="secondary">
                Log a meal, record a session, step on the scale — and the calorie and macro
                numbers you are working to recalculate from what actually happened, not from
                what a formula guessed in week one.
              </Body>
            </LiquidGlassPane>
          </Rise>
        </LiquidGlassGroup>

        <Rise delay={430} style={{ gap: spacing.md }}>
          <Button label="Get started" onPress={start} full />
          {/*
            A text button rather than a second filled one. Two equal-weight buttons make the
            choice feel consequential, and it is not — an account can be added later from
            Profile without losing anything logged before it.
          */}
          <Button label="I already have an account" onPress={signIn} variant="ghost" full />
          <Body size={13} tone="muted" style={{ textAlign: 'center' }}>
            No account needed. Add one later to back up and sync.
          </Body>
        </Rise>
      </ScrollView>
    </LiquidGlassScene>
  )
}
