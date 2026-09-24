import React from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { Easing, FadeIn, SlideInDown, useReducedMotion } from 'react-native-reanimated'
import { create } from 'zustand'

import { useTheme } from '@/theme/useTheme'
import { HIT_SIZE, radius, spacing } from '@/theme/tokens'
import { Body } from './Text'

/**
 * The app's own confirmation sheet, called exactly like React Native's `Alert.alert`.
 *
 * WHY NOT Alert.alert:
 * On Android that is the system dialog — a grey box in the platform's theme, uppercase teal
 * buttons — and "Re-run setup?" or "Sign out?" read like a crash report dropped into the app.
 *
 * WHY A BOTTOM SHEET AND NOT A CENTRED DIALOG:
 * A confirmation is a short interruption, and destructive confirms belong in an action sheet
 * (the navigation rule the rest of the app follows — ActionSheet.tsx is the same shape). The
 * choice lands where the thumb already is, the destructive option is red and separate, and
 * Cancel sits apart at the bottom. Keeping `Alert.alert`'s signature meant every call site
 * switched by name alone, buttons and callbacks untouched.
 */

export interface AppAlertButton {
  text: string
  style?: 'default' | 'cancel' | 'destructive'
  onPress?: () => void
}

interface AlertState {
  current: { title: string; message?: string; buttons: AppAlertButton[] } | null
  show: (title: string, message?: string, buttons?: AppAlertButton[]) => void
  close: () => void
}

const useAlertStore = create<AlertState>(set => ({
  current: null,
  show: (title, message, buttons) =>
    set({ current: { title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }] } }),
  close: () => set({ current: null }),
}))

/** Drop-in for `Alert.alert(title, message?, buttons?)`. */
export const appAlert = (title: string, message?: string, buttons?: AppAlertButton[]): void =>
  useAlertStore.getState().show(title, message, buttons)

const HAIRLINE = StyleSheet.hairlineWidth * 2

/** Mounted once, at the root. Renders whichever alert is current. */
export const AppAlertHost: React.FC = () => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()
  const current = useAlertStore(s => s.current)
  const close = useAlertStore(s => s.close)

  const buttons = current?.buttons ?? []
  const cancel = buttons.find(b => b.style === 'cancel')
  const actions = buttons.filter(b => b !== cancel)

  const press = (button?: AppAlertButton) => {
    close()
    button?.onPress?.()
  }

  // Tapping outside or pressing back means "no": the Cancel button if there is one, and a
  // plain dismiss for a notice with a single OK. A sheet with two real choices and no Cancel
  // keeps the user's attention rather than guessing.
  const dismiss = () => {
    if (cancel) press(cancel)
    else if (actions.length === 1) press(actions[0])
  }

  return (
    <Modal
      visible={current !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={dismiss}
    >
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={dismiss}
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)' }]}
        />
        {current ? (
          <Animated.View
            accessibilityViewIsModal
            entering={
              reduced
                ? FadeIn.duration(150)
                : SlideInDown.duration(260).easing(Easing.bezier(0.23, 1, 0.32, 1))
            }
            style={{ margin: spacing.md, marginBottom: insets.bottom + spacing.md, gap: spacing.sm }}
          >
            <View
              style={{
                backgroundColor: theme.surfaceRaised,
                borderRadius: radius.card,
                borderWidth: HAIRLINE,
                borderColor: theme.border,
                overflow: 'hidden',
              }}
            >
              <View style={{ padding: spacing.lg, gap: spacing.xs }}>
                <Body size={17} weight="semibold">
                  {current.title}
                </Body>
                {current.message ? (
                  <Body size={14} tone="secondary">
                    {current.message}
                  </Body>
                ) : null}
              </View>

              {actions.map(button => {
                const destructive = button.style === 'destructive'
                return (
                  <Pressable
                    key={button.text}
                    accessibilityRole="button"
                    onPress={() => press(button)}
                    style={({ pressed }) => ({
                      minHeight: HIT_SIZE + spacing.sm,
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: spacing.lg,
                      borderTopWidth: HAIRLINE,
                      borderTopColor: theme.hairline,
                      // Row press is a background highlight, never a scale.
                      backgroundColor: pressed ? theme.border : 'transparent',
                    })}
                  >
                    <Body
                      weight="semibold"
                      style={{ color: destructive ? theme.status.critical : theme.brandText }}
                    >
                      {button.text}
                    </Body>
                  </Pressable>
                )
              })}
            </View>

            {cancel ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => press(cancel)}
                style={({ pressed }) => ({
                  minHeight: HIT_SIZE + spacing.sm,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.card,
                  borderWidth: HAIRLINE,
                  borderColor: theme.border,
                  backgroundColor: pressed ? theme.border : theme.surfaceRaised,
                })}
              >
                <Body weight="semibold" tone="secondary">
                  {cancel.text}
                </Body>
              </Pressable>
            ) : null}
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  )
}
