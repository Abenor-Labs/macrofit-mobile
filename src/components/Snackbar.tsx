import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSegments } from 'expo-router'

import { useTheme } from '@/theme/useTheme'
import { HIT_SIZE, radius, spacing } from '@/theme/tokens'
import { Body } from './Text'
import { TAB_BAR_SPACE } from './Layout'

/** The quick-log button's height plus its gap above the tab bar, on Home only. */
const QUICK_LOG_CLEARANCE = 56 + spacing.md

/**
 * Transient confirmation with an optional way back.
 *
 * WHY THIS EXISTS:
 * The log button writes 250 ml of water the instant it is tapped, and nothing said it had
 * happened or offered a way back. The only correction was a minus button on the water card,
 * four swipes down a screen the user was not on. An action that commits in one tap needs an
 * undo within reach of the same thumb, or it is not really one tap — it is one tap and a hunt.
 *
 * Deliberately not a modal. The point of logging from a floating button is that it does not
 * interrupt anything, and a dialog asking "are you sure?" for 250 ml of water would cost more
 * attention than the mistake it prevents. Confirm after the fact, offer the way back, get out
 * of the way on a timer.
 */

const VISIBLE_MS = 5000

interface SnackbarAction {
  label: string
  onPress: () => void
}

interface SnackbarContextValue {
  show: (message: string, action?: SnackbarAction) => void
}

const SnackbarContext = createContext<SnackbarContextValue | null>(null)

interface SnackbarState {
  /** Bumped per show so a repeated message still restarts the animation and the timer. */
  key: number
  message: string
  action?: SnackbarAction
}

export const SnackbarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<SnackbarState | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const keyRef = useRef(0)

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const show = useCallback((message: string, action?: SnackbarAction) => {
    keyRef.current += 1
    setState({ key: keyRef.current, message, action })
  }, [])

  const dismiss = useCallback(() => setState(null), [])

  // Tied to `state`, so tapping the same action twice restarts the countdown rather than
  // letting the first timer dismiss the second message early.
  useEffect(() => {
    if (state === null) return
    clearTimer()
    timerRef.current = setTimeout(() => setState(null), VISIBLE_MS)
    return clearTimer
  }, [state])

  /*
    THE VALUE IS MEMOISED AND THE PROVIDER NO LONGER READS THE ROUTE. It used to pass a new
    `{ show }` object on every render and to call useSegments(), which changes on every
    navigation, so each tab switch handed every useSnackbar() caller a new context value:
    Profile's root, every Diary row, the Today cards and food search all re-rendered on every
    navigation. Context updates go straight past React.memo and freezeOnBlur only defers them,
    so this was the half-second lag on tab switches (measured with a React Profiler on a
    OnePlus 10T: Profile ~250 ms, Diary ~100 ms, Today ~60 ms per switch). The route is now
    read only by the toast itself, which exists only while a message is showing.
  */
  const value = useMemo(() => ({ show }), [show])

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      {state ? <SnackbarToast state={state} onDismiss={dismiss} /> : null}
    </SnackbarContext.Provider>
  )
}

/** The visible bar. Mounted only while a message is showing. */
const SnackbarToast: React.FC<{ state: SnackbarState; onDismiss: () => void }> = ({ state, onDismiss }) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const segments = useSegments() as string[]
  const onHome =
    segments[0] === '(tabs)' && (segments.length === 1 || segments[segments.length - 1] === 'index')

  return (
    <Animated.View
      needsOffscreenAlphaCompositing
      key={state.key}
      entering={FadeInDown.duration(180)}
      exiting={FadeOutDown.duration(140)}
      // box-none: the bar is tappable, the space around it is not. It sits over the whole
      // screen and must not swallow taps meant for the content it is floating above.
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: spacing.lg,
        right: spacing.lg,
        // Clears the floating tab bar, the same measurement Screen pads its scroll by —
        // and on Home the quick-log button too, which the "water logged / Undo" toast it
        // triggers used to land right on top of.
        bottom: TAB_BAR_SPACE + insets.bottom + (onHome ? QUICK_LOG_CLEARANCE : 0),
        zIndex: 20,
      }}
    >
      <View
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={
          state.action ? `${state.message}. ${state.action.label} available.` : state.message
        }
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingLeft: spacing.lg,
          paddingRight: state.action ? spacing.xs : spacing.lg,
          paddingVertical: state.action ? spacing.xs : spacing.md,
          borderRadius: radius.control,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: theme.glass.border,
          backgroundColor: theme.surfaceRaised,
          shadowColor: '#1C1917',
          shadowOpacity: theme.mode === 'light' ? 0.18 : 0.4,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
        }}
      >
        <Body size={15} style={{ flex: 1, color: theme.text }}>
          {state.message}
        </Body>

        {state.action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={state.action.label}
            onPress={() => {
              const run = state.action?.onPress
              onDismiss()
              run?.()
            }}
            style={[
              styles.action,
              { paddingHorizontal: spacing.md, borderRadius: radius.control },
            ]}
          >
            <Body size={15} weight="semibold" style={{ color: theme.brandText }}>
              {state.action.label}
            </Body>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  /*
    Static, and via StyleSheet.create rather than a style function on the Pressable. The
    function form is what silently lost its styles across this codebase twice; there is no
    reason to reintroduce the shape where a plain object does.
  */
  action: {
    minHeight: HIT_SIZE,
    minWidth: HIT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

/**
 * Returns a no-op outside the provider rather than throwing. A missing confirmation is worth
 * far less than the action it confirms, and nothing here should be able to take a screen down
 * because a toast had nowhere to render.
 */
export const useSnackbar = (): SnackbarContextValue =>
  useContext(SnackbarContext) ?? { show: () => {} }
