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
import { Backdrop } from './Backdrop'

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
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      {/* Gives every frosted surface on the screen something to refract. Without it a
          BlurView over the flat canvas just reads as a grey rectangle. */}
      <Backdrop />

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
      <TextInput
        placeholderTextColor={theme.textMuted}
        style={[
          {
            minHeight: HIT_SIZE,
            borderRadius: radius.control,
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: theme.border,
            backgroundColor: theme.surface,
            color: theme.text,
            paddingHorizontal: 14,
            fontFamily: numeric ? fonts.display : fonts.body,
            fontSize: 16,
          },
          numeric && { textAlign: 'center', fontVariant: ['tabular-nums'] },
          style,
        ]}
        {...props}
      />
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
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: radius.control,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.border,
          }}
        >
          {icon}
        </View>
      ) : null}
      <SectionTitle style={{ textAlign: 'center' }}>{title}</SectionTitle>
      <Body tone="secondary" style={{ textAlign: 'center' }}>
        {message}
      </Body>
      {action}
    </View>
  )
}
