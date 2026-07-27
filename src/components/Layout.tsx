import React from 'react'
import {
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native'
import { BlurView } from 'expo-blur'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/theme/useTheme'
import { HIT_SIZE, fonts, radius, spacing } from '@/theme/tokens'
import { Body, Label, SectionTitle } from './Text'

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
          <BlurView
            tint={theme.glass.tint}
            intensity={theme.glass.intensity + 20}
            experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
            style={StyleSheet.absoluteFill}
          />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.glass.overlay }]} />
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
