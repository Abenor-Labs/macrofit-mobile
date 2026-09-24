import React from 'react'
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft } from 'lucide-react-native'
import { BlurTargetArea } from './BlurTarget'
import { useTheme } from '@/theme/useTheme'
import { HIT_SIZE, fonts, radius, spacing } from '@/theme/tokens'
import { Body, Label, SectionTitle } from './Text'
import { Glass, Island } from './Material'

/** Height the floating tab bar occupies, so scroll content can clear it. */
export const TAB_BAR_SPACE = 76

export interface ScreenProps {
  title?: string
  subtitle?: string
  right?: React.ReactNode
  /** Shows a back arrow before the title. Training uses it to return to the main app. */
  onBack?: () => void
  /** Extra space under the content, for chrome that sits above the tab bar. */
  extraBottomSpace?: number
  children: React.ReactNode
  /** Set false for screens that manage their own scrolling (e.g. a FlatList). */
  scroll?: boolean
  contentStyle?: StyleProp<ViewStyle>
}

/**
 * Standard screen shell: glass header that content scrolls beneath, safe-area aware,
 * with bottom padding that clears the floating tab bar.
 */
export const Screen: React.FC<ScreenProps> = ({
  title,
  subtitle,
  right,
  onBack,
  extraBottomSpace = 0,
  children,
  scroll = true,
  contentStyle,
}) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  const body = (
    <View style={[{ paddingHorizontal: spacing.lg, gap: spacing.lg }, contentStyle]}>
      {children}
    </View>
  )

  return (
    /*
      Flat ground. No ambient field, no scene.

      This used to mount an `Aurora` behind every routed screen, because the material above
      it refracted and needed something with structure to bend. Nothing refracts any more
      (see Material.tsx), so the field went back to being decoration — and decoration behind
      a table of figures is noise. MOBILE-DESIGN §8 keeps it on Welcome, Login, Onboarding
      and Chat, which are the screens where the field IS the content.

      It is also the single biggest perf win available here: every pane on a screen used to
      mount its own copy of that field.
    */
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      {title !== undefined && (
        <Glass
          radius={0}
          style={{
            paddingTop: insets.top,
            borderBottomWidth: StyleSheet.hairlineWidth * 2,
            borderBottomColor: theme.glass.border,
            zIndex: 10,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              gap: spacing.md,
            }}
          >
            {onBack ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                onPress={onBack}
                hitSlop={8}
                style={({ pressed }) => ({
                  width: HIT_SIZE,
                  height: HIT_SIZE,
                  marginLeft: -spacing.md,
                  marginRight: -spacing.sm,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.pill,
                  backgroundColor: pressed ? theme.border : 'transparent',
                })}
              >
                <ChevronLeft size={26} color={theme.text} strokeWidth={2.2} />
              </Pressable>
            ) : null}
            <View style={{ flex: 1 }}>
              <SectionTitle>{title}</SectionTitle>
              {subtitle ? (
                <Body size={12} tone="muted" numberOfLines={1}>
                  {subtitle}
                </Body>
              ) : null}
            </View>
            {right}
          </View>
        </Glass>
      )}

      {/* This is what the header and the tab bar blur. Both float above it, so it has to be the
          content and not the whole screen — a BlurView inside its own target is the one case
          expo-blur cannot composite. */}
      <BlurTargetArea style={{ flex: 1 }}>
        {scroll ? (
          /*
            Keyboard-aware, so a focused field scrolls itself above the keyboard — set inputs
            deep in a workout, a goal field, a weigh-in. The window no longer pans (that slid
            headers off the top of the screen), so the scroll view has to make the room itself.
          */
          <KeyboardAwareScrollView
            bottomOffset={spacing.xl}
            contentContainerStyle={{
              paddingTop: title === undefined ? insets.top + spacing.lg : spacing.lg,
              paddingBottom: TAB_BAR_SPACE + extraBottomSpace + insets.bottom + spacing.xl,
            }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {body}
          </KeyboardAwareScrollView>
        ) : (
          body
        )}
      </BlurTargetArea>
    </View>
  )
}

export const Pill: React.FC<{
  children: React.ReactNode
  color?: string
  style?: StyleProp<ViewStyle>
}> = ({ children, color, style }) => {
  const theme = useTheme()
  return (
    /*
      A flat tinted fill, not a pane.

      The colour a pill carries is load-bearing — it is how a macro or a status says which
      one it is — and a translucent material sitting on an unpredictable background is
      exactly how that colour stops being reliable. `1A` on the fill and `40` on the edge are
      the values this had before it was briefly made glass.
    */
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 5,
          borderRadius: radius.pill,
          backgroundColor: color ? `${color}1A` : theme.border,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: color ? `${color}40` : theme.border,
        },
        style,
      ]}
    >
      {typeof children === 'string' ? (
        <Body size={12} weight="semibold" style={{ color: color ?? theme.textSecondary }}>
          {children}
        </Body>
      ) : (
        children
      )}
    </View>
  )
}

export interface FieldProps extends TextInputProps {
  label?: string
  /** Numeric fields use the display face so figures match the rest of the app. */
  numeric?: boolean
}

export const Field: React.FC<FieldProps> = ({ label, numeric = false, style, ...props }) => {
  const theme = useTheme()
  return (
    <View style={{ gap: 6 }}>
      {label ? <Label>{label}</Label> : null}
      {/*
        Solid, and this was always the right answer even when everything else was glass: an
        input is read while it is being typed into, so it needs a fixed floor under the text
        rather than whatever happens to be behind it that second. The TextInput goes
        transparent and the island supplies the ground, the radius and the edge.
      */}
      <Island radius={radius.control}>
      <TextInput
        placeholderTextColor={theme.textMuted}
        style={[
          {
            minHeight: HIT_SIZE,
            backgroundColor: 'transparent',
            color: theme.text,
            paddingHorizontal: 14,
            fontFamily: numeric ? fonts.display : fonts.body,
            fontSize: 16,
          },
          /*
            No `fontVariant: ['tabular-nums']` here, deliberately.

            It is a Text style, and Android's TextInput does not implement it — but it does not
            ignore it cleanly either. Combined with the Fraunces display face and centred text
            it re-measured the input on keystrokes, which is what made the numeric fields
            (serving amount, height, weight) jump and lose the cursor mid-edit.

            `StatValue` keeps it, where it is both valid and needed: that is a Text, and column
            alignment across a table of figures is the reason the token exists. An input holds
            one number the user is looking straight at, so it gains nothing there.
          */
          numeric && { textAlign: 'center' },
          style,
        ]}
        {...props}
      />
      </Island>
    </View>
  )
}

export const EmptyState: React.FC<{
  icon?: React.ReactNode
  title: string
  message: string
  action?: React.ReactNode
}> = ({ icon, title, message, action }) => {
  const theme = useTheme()
  return (
    <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl }}>
      {icon ? (
        <Island
          radius={radius.control}
          elevated={false}
          style={{
            width: 56,
            height: 56,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </Island>
      ) : null}
      <SectionTitle style={{ textAlign: 'center' }}>{title}</SectionTitle>
      <Body tone="secondary" style={{ textAlign: 'center' }}>
        {message}
      </Body>
      {action}
    </View>
  )
}
