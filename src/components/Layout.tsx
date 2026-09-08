import React from 'react'
import {
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BlurTargetArea, ChromeBlur } from './BlurTarget'
import { useTheme } from '@/theme/useTheme'
import { HIT_SIZE, fonts, radius, spacing } from '@/theme/tokens'
import { Body, Label, SectionTitle } from './Text'
import { Aurora } from './Aurora'
import { LiquidGlassPane, LiquidGlassScene } from './LiquidGlass'

/** Height the floating tab bar occupies, so scroll content can clear it. */
export const TAB_BAR_SPACE = 76

export interface ScreenProps {
  title?: string
  subtitle?: string
  right?: React.ReactNode
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
      The scene, not a plain View, and `Aurora` rather than the static `Backdrop`.

      Every surface in this app now refracts (see Glass.tsx), and a refracting pane needs two
      things from its ancestor: a declared backdrop it is allowed to sample, and a coloured
      field with enough structure to be worth bending. `Backdrop` supplied the second badly —
      it is still, so a lens over it displaces nothing visible — and the first not at all.

      One consequence worth stating: this makes the ambient wash a hard dependency of the
      material rather than decoration behind it. A screen that renders panes outside a
      `LiquidGlassScene` still works, but it falls back to frost and stops being glass.
    */
    <LiquidGlassScene backdrop={<Aurora />} style={{ backgroundColor: theme.canvas }}>
      {title !== undefined && (
        <View
          style={{
            paddingTop: insets.top,
            borderBottomWidth: StyleSheet.hairlineWidth * 2,
            borderBottomColor: theme.glass.border,
            overflow: 'hidden',
            zIndex: 10,
          }}
        >
          <ChromeBlur tint={theme.glass.tint} intensity={theme.glass.intensity + 20} />
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.glass.chromeOverlay }]}
          />
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
        </View>
      )}

      {/* This is what the header and the tab bar blur. Both float above it, so it has to be the
          content and not the whole screen — a BlurView inside its own target is the one case
          expo-blur cannot composite. */}
      <BlurTargetArea style={{ flex: 1 }}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={{
              paddingTop: title === undefined ? insets.top + spacing.lg : spacing.lg,
              paddingBottom: TAB_BAR_SPACE + insets.bottom + spacing.xl,
            }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {body}
          </ScrollView>
        ) : (
          body
        )}
      </BlurTargetArea>
    </LiquidGlassScene>
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
      Tinted glass. The colour a pill carries is load-bearing — it is how a macro or a status
      says which one it is — so it survives as the pane's tint rather than as a flat fill.
      `1A` is the same alpha the solid version used, now sitting over a lens instead of over
      the canvas.
    */
    <LiquidGlassPane
      radius={radius.pill}
      variant="clear"
      tint={color ? `${color}1A` : undefined}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 5,
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
    </LiquidGlassPane>
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
        `regular`, never `clear`. An input is read while it is being typed into, so the pane
        has to hold a floor under the text rather than letting the aurora decide what the
        contrast is that second. The TextInput itself goes transparent and the pane supplies
        the ground, the radius and the edge.
      */}
      <LiquidGlassPane radius={radius.control} variant="regular">
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
      </LiquidGlassPane>
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
        <LiquidGlassPane
          radius={radius.control}
          variant="clear"
          style={{
            width: 56,
            height: 56,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </LiquidGlassPane>
      ) : null}
      <SectionTitle style={{ textAlign: 'center' }}>{title}</SectionTitle>
      <Body tone="secondary" style={{ textAlign: 'center' }}>
        {message}
      </Body>
      {action}
    </View>
  )
}
