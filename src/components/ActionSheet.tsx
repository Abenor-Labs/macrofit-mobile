import React, { useRef } from 'react'
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { FadeIn, SlideInDown, useReducedMotion } from 'react-native-reanimated'

import { useTheme } from '@/theme/useTheme'
import { ENTER_MS, enterEasing } from '@/theme/motion'
import { HIT_SIZE, radius, spacing } from '@/theme/tokens'
import { Body } from './Text'

export interface ActionSheetOption {
  label: string
  icon: React.ReactNode
  onPress: () => void
  /** Red label, for the one option that throws something away. */
  destructive?: boolean
}

/**
 * A bottom sheet of choices, in the app's own colours.
 *
 * WHY NOT `Alert.alert` WITH THREE BUTTONS:
 * Android renders that as the system's stock dialog: a grey box in the platform's theme
 * rather than the app's, three shouting uppercase buttons stacked right-aligned, and a block
 * of empty space where a message would go. It was the first thing someone saw after tapping
 * the camera in chat and it looked like a crash dialog. A sheet from the bottom also keeps
 * the choices where the thumb that tapped the camera button already is.
 *
 * Cancel is a row of its own, and a tap on the dimmed area or the back button closes it too.
 */
export const ActionSheet: React.FC<{
  visible: boolean
  title?: string
  /** A line under the title, for when the choice needs its consequence spelled out. */
  message?: string
  options: ActionSheetOption[]
  onClose: () => void
}> = ({ visible, title, message, options, onClose }) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()
  /*
    iOS will not present a view controller while another modal is still dismissing, so an
    option that opens the camera or photo library has to wait for this sheet to be gone —
    otherwise the picker silently never appears. `onDismiss` fires only on iOS; Android
    has no such rule and runs the choice straight away.
  */
  const pending = useRef<(() => void) | null>(null)

  const choose = (action: () => void) => {
    onClose()
    if (Platform.OS === 'ios') pending.current = action
    else action()
  }

  return (
    <Modal
      visible={visible}
      onDismiss={() => {
        const action = pending.current
        pending.current = null
        action?.()
      }}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)' }]}
        />

        {/* The scrim fades (the Modal's own animation); the sheet rises from the edge it
            belongs to, so it reads as coming from under the thumb rather than appearing. */}
        <Animated.View
          entering={
            reduced
              ? FadeIn.duration(150)
              : SlideInDown.duration(ENTER_MS).easing(enterEasing)
          }
          style={{
            margin: spacing.md,
            marginBottom: insets.bottom + spacing.md,
            gap: spacing.sm,
          }}
        >
          <View
            style={{
              backgroundColor: theme.surfaceRaised,
              borderRadius: radius.card,
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: theme.border,
              overflow: 'hidden',
            }}
          >
            {title ? (
              <Body
                size={13}
                tone="muted"
                style={{
                  textAlign: 'center',
                  paddingTop: spacing.md,
                  paddingBottom: spacing.sm,
                }}
              >
                {title}
              </Body>
            ) : null}
            {message ? (
              <Body
                size={13}
                tone="secondary"
                style={{
                  textAlign: 'center',
                  paddingHorizontal: spacing.lg,
                  paddingBottom: spacing.md,
                }}
              >
                {message}
              </Body>
            ) : null}

            {options.map((option, index) => (
              <Pressable
                key={option.label}
                needsOffscreenAlphaCompositing
                accessibilityRole="button"
                onPress={() => choose(option.onPress)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  minHeight: HIT_SIZE + spacing.sm,
                  paddingHorizontal: spacing.lg,
                  borderTopWidth: index === 0 && !title ? 0 : StyleSheet.hairlineWidth * 2,
                  borderTopColor: theme.hairline,
                  backgroundColor: pressed ? theme.border : 'transparent',
                })}
              >
                {option.icon}
                <Body
                  weight="semibold"
                  style={option.destructive ? { color: theme.status.critical } : undefined}
                >
                  {option.label}
                </Body>
              </Pressable>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => ({
              minHeight: HIT_SIZE + spacing.sm,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.card,
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: theme.border,
              backgroundColor: pressed ? theme.border : theme.surfaceRaised,
            })}
          >
            <Body weight="semibold" tone="secondary">
              Cancel
            </Body>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  )
}
