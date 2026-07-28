import React, { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, G } from 'react-native-svg'
import { AlertTriangle, MailCheck } from 'lucide-react-native'

import { useAuth } from '@/lib/AuthProvider'
import type { AuthResult } from '@/lib/authErrors'
import { useTheme } from '@/theme/useTheme'
import { GlassSurface } from '@/components/Glass'
import { Body, Label } from '@/components/Text'
import { Button } from '@/components/Button'
import { Field } from '@/components/Layout'
import { fonts, jade, spacing } from '@/theme/tokens'

/** The launcher mark, redrawn as vector so it scales crisply and can be themed. */
const RingMark: React.FC<{ size?: number }> = ({ size = 72 }) => {
  const c = size / 2
  const rings = [
    { r: c - 6, w: 7, dash: 0.78, color: '#FAFAF9' },
    { r: c - 17, w: 6, dash: 0.55, color: jade[100] },
    { r: c - 27, w: 5, dash: 0.35, color: jade[200] },
  ]
  return (
    <Svg width={size} height={size}>
      <G rotation={-90} origin={`${c}, ${c}`}>
        {rings.map(ring => {
          const circumference = 2 * Math.PI * ring.r
          return (
            <G key={ring.r}>
              <Circle
                cx={c}
                cy={c}
                r={ring.r}
                stroke="rgba(250,250,249,0.25)"
                strokeWidth={ring.w}
                fill="none"
              />
              <Circle
                cx={c}
                cy={c}
                r={ring.r}
                stroke={ring.color}
                strokeWidth={ring.w}
                strokeLinecap="round"
                strokeDasharray={`${circumference * ring.dash} ${circumference}`}
                fill="none"
              />
            </G>
          )
        })}
      </G>
    </Svg>
  )
}

/** An inline result line. Errors read critical, confirmations read positive. */
const Message: React.FC<{ text: string; kind: 'error' | 'notice' }> = ({ text, kind }) => {
  const theme = useTheme()
  const color = kind === 'error' ? theme.status.critical : theme.status.good
  const Icon = kind === 'error' ? AlertTriangle : MailCheck
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
      <Icon size={16} color={color} style={{ marginTop: 2 }} />
      <Body size={13} style={{ color, flex: 1 }}>
        {text}
      </Body>
    </View>
  )
}

export default function LoginScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { signIn, signUp, resendConfirmation } = useAuth()

  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // The address is registered but unverified, so offer another confirmation email.
  const [awaiting, setAwaiting] = useState(false)
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<AuthResult>, keepAwaiting = false) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    const result = await action()
    setError(result.error)
    setNotice(result.notice)
    if (!keepAwaiting) setAwaiting(result.awaitingConfirmation === true)
    setBusy(false)
    return result
  }

  const submit = async () => {
    const result = await run(() =>
      mode === 'in' ? signIn(email, password) : signUp(email, password),
    )
    // A brand new account cannot sign in until it is confirmed, so leave the user on the
    // form they will need next rather than on the one they just used.
    if (mode === 'up' && result.notice) setMode('in')
  }

  const resend = () => run(() => resendConfirmation(email), true)

  const canSubmit = email.trim().length > 3 && password.length >= 6 && !busy

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      {/* Layered jade wash so the glass card has something worth refracting. A flat
          background makes blur invisible and the material read as a grey box. */}
      <LinearGradient
        colors={
          theme.mode === 'dark'
            ? [jade[900], theme.canvas, theme.canvas]
            : [jade[100], jade[50], theme.canvas]
        }
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '70%' }}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            paddingTop: insets.top + spacing.xl,
            paddingBottom: insets.bottom + spacing.xl,
            paddingHorizontal: spacing.lg,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ alignItems: 'center', marginBottom: spacing.xl, gap: spacing.md }}>
            <View
              style={{
                width: 96,
                height: 96,
                borderRadius: 26,
                backgroundColor: jade[600],
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <RingMark />
            </View>
            <Body style={{ fontFamily: fonts.displayBold, fontSize: 34, color: theme.text }}>
              MacroFit
            </Body>
            <Body tone="secondary" style={{ textAlign: 'center' }}>
              Nutrition, training and coaching that adapts to your own data.
            </Body>
          </View>

          <GlassSurface style={{ padding: spacing.lg, gap: spacing.lg }}>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {(['in', 'up'] as const).map(m => {
                const active = mode === m
                return (
                  <Button
                    key={m}
                    label={m === 'in' ? 'Sign in' : 'Create account'}
                    variant={active ? 'primary' : 'ghost'}
                    onPress={() => {
                      setMode(m)
                      setError(null)
                      setNotice(null)
                    }}
                    style={{ flex: 1 }}
                  />
                )
              })}
            </View>

            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              inputMode="email"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              secureTextEntry
              autoCapitalize="none"
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            />

            {error ? <Message text={error} kind="error" /> : null}
            {notice ? <Message text={notice} kind="notice" /> : null}

            <Button
              label={mode === 'in' ? 'Sign in' : 'Create account'}
              onPress={submit}
              disabled={!canSubmit}
              loading={busy}
              full
              haptic
            />

            {awaiting && email.trim().length > 3 ? (
              <Button
                label="Resend confirmation email"
                variant="ghost"
                onPress={resend}
                disabled={busy}
                full
              />
            ) : null}
          </GlassSurface>

          <Label style={{ textAlign: 'center', marginTop: spacing.lg }}>
            Your data syncs privately across your devices
          </Label>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}
