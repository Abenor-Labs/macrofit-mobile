import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { BlurTargetView, BlurView, type BlurTint } from 'expo-blur'
import { useIsFocused } from 'expo-router'

/**
 * Wires up the floating chrome's blur — tab bar, screen headers, chat composer.
 *
 * WHY THIS EXISTS:
 * expo-blur 57 will not blur anything on Android without a `blurTarget`: a ref to the
 * BlurTargetView holding the content to sample. Every BlurView in this app asked for
 * `dimezisBlurView` and passed no target, so the library logged
 *
 *   You have selected the "dimezisBlurView" blur method, but the `blurTarget` prop has not been
 *   configured. The blur view will fallback to "none" blur method to avoid errors.
 *
 * on every render and drew a flat translucent rectangle instead. The glass material the design
 * is built on was not shipping at all on Android — which is also why content stayed crisply
 * legible through the tab bar and read as a layout bug.
 *
 * A screen cannot simply hand its own ref to the chrome: GlassTabBar renders as a sibling of the
 * screens, outside their tree (see the note in app/(tabs)/_layout.tsx). So the focused screen
 * publishes its content view here and the chrome reads it back.
 *
 * BlurTargetView is a plain View on iOS, so none of this needs platform branching.
 */

interface BlurTargetContextValue {
  target: View | null
  /** Takes an updater, so a screen can stand down without clobbering whoever replaced it. */
  publish: React.Dispatch<React.SetStateAction<View | null>>
}

const BlurTargetContext = createContext<BlurTargetContextValue | null>(null)

/** Mount once above the navigators. Screens publish into it; chrome reads out of it. */
export const BlurTargetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [target, setTarget] = useState<View | null>(null)
  const value = useMemo<BlurTargetContextValue>(() => ({ target, publish: setTarget }), [target])

  return <BlurTargetContext.Provider value={value}>{children}</BlurTargetContext.Provider>
}

/**
 * The current blur target as a ref object, or undefined until a screen has published one.
 *
 * A *new* ref object per target is load-bearing. BlurView only re-resolves its native target
 * when `prevProps.blurTarget?.current !== this.props.blurTarget?.current`; one stable ref mutated
 * in place reads the same value on both sides of that comparison, so the change is silently
 * dropped and the blur never appears.
 */
const useBlurTargetRef = (): React.RefObject<View | null> | undefined => {
  const target = useContext(BlurTargetContext)?.target ?? null

  return useMemo(() => (target ? { current: target } : undefined), [target])
}

/**
 * Marks its children as the thing the chrome blurs, while this screen is the focused one.
 *
 * Focus matters because a tab navigator keeps every screen mounted: without the check, the last
 * screen to lay out wins and the tab bar blurs whichever one that happened to be. The effect
 * covers tab switches, where nothing re-lays out and only focus changes.
 *
 * Standing down on cleanup is not optional. BlurView resolves the target through
 * `findNodeHandle`, which throws "Unable to find node on an unmounted component" the moment it is
 * handed a view that has gone away — so a published target has to be retracted before it dies.
 * The comparison guard means a screen only ever retracts itself, never a successor that already
 * published during the same transition.
 */
export const BlurTargetArea: React.FC<{
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
}> = ({ children, style }) => {
  const ref = useRef<View | null>(null)
  const publish = useContext(BlurTargetContext)?.publish
  const isFocused = useIsFocused()

  useEffect(() => {
    if (isFocused) publish?.(ref.current)

    return () => {
      const retiring = ref.current
      publish?.(current => (current === retiring ? null : current))
    }
  }, [isFocused, publish])

  return (
    <BlurTargetView
      ref={ref}
      style={style}
      onLayout={() => {
        if (isFocused) publish?.(ref.current)
      }}
    >
      {children}
    </BlurTargetView>
  )
}

/**
 * A BlurView already pointed at the current blur target.
 *
 * Android is asked for no blur at all until a target exists, rather than for a blur it cannot
 * perform — otherwise the library warns and silently falls back on every mount before the first
 * screen lays out.
 *
 * `dimezisBlurViewSdk31Plus` rather than `dimezisBlurView`: the cheaper path only exists from SDK
 * 31, and below that the Dimezis implementation is expensive enough to cost frames on exactly the
 * devices least able to spare them. Those fall back to the flat scrim, which the overlay colours
 * in the theme are already opaque enough to carry (see the Android note in Glass.tsx).
 */
export const ChromeBlur: React.FC<{
  tint: BlurTint
  intensity: number
  style?: StyleProp<ViewStyle>
}> = ({ tint, intensity, style }) => {
  const blurTarget = useBlurTargetRef()

  return (
    <BlurView
      tint={tint}
      intensity={intensity}
      blurTarget={blurTarget}
      /*
        Android divides intensity by this before blurring, and it defaults to 4 — so chrome asking
        for 60 was actually getting 15, which is a haze rather than a frost. 1 spends the
        intensity as written and lands near the iOS material the design is drawn from.
      */
      blurReductionFactor={1}
      blurMethod={
        Platform.OS === 'android'
          ? blurTarget
            ? 'dimezisBlurViewSdk31Plus'
            : 'none'
          : undefined
      }
      style={style ?? StyleSheet.absoluteFill}
    />
  )
}
