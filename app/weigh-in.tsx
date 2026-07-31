import React, { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Check, Scale, TriangleAlert, X } from 'lucide-react-native'

import { GlassSurface, Surface } from '@/components/Glass'
import { Button, IconButton } from '@/components/Button'
import { DateNavigator } from '@/components/DateNavigator'
import { Field } from '@/components/Layout'
import { Body, Label, SectionTitle, StatValue } from '@/components/Text'
import { useStore } from '@/store/useStore'
import { useHealthSync } from '@/hooks/useHealthSync'
import { useLogWeight } from '@/hooks/useLogWeight'
import { useTheme } from '@/theme/useTheme'
import { radius, spacing } from '@/theme/tokens'
import { formatDate, getTodayString } from '@core/utils/calculations'

const HAIRLINE = StyleSheet.hairlineWidth * 2

/**
 * Weigh-in, opened from the log button.
 *
 * WHY THIS IS A SCREEN AND NOT A CARD ON THE DASHBOARD:
 * "Where is the weight logging in the app?" was a real report, and the honest answer was that
 * it existed but only inside a card two tabs deep — and that card rendered nothing at all
 * unless a goal weight had been set, which is optional in setup. So for most users there was
 * genuinely nowhere to do it from the home screen.
 *
 * The obvious fix was a seventh dashboard card. The dashboard already carries a finding for
 * printing the same number twice in one viewport and for burying the one line that asks the
 * user to act, so adding to it would have traded one complaint for another. Food and water are
 * already logged from the floating button; weight is the third thing this app records, and it
 * belongs in the same place rather than in a place of its own.
 *
 * WHY IT TAKES A DATE:
 * People weigh themselves in the morning and remember to log it at night. Every other surface
 * in the app assumed today, so the only way to record it was to file it under the wrong day —
 * which corrupts the very trend the weight feature exists to measure.
 */
export default function WeighInScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  const profile = useStore(s => s.profile)
  const weightLog = useStore(s => s.weightLog)
  const currentWeightKg = useStore(s => s.currentWeightKg)
  const { grants } = useHealthSync()
  const { logWeight } = useLogWeight()

  const today = getTodayString()
  const [date, setDate] = useState(today)
  const [draft, setDraft] = useState('')

  const unit = profile.weightUnit
  const toDisplay = (kg: number): number =>
    Math.round((unit === 'lbs' ? kg * 2.20462 : kg) * 10) / 10

  const existing = useMemo(
    () => weightLog.find(entry => entry.date === date) ?? null,
    [weightLog, date],
  )

  const parsed = Number(draft.replace(',', '.').trim())
  const hasDraft = draft.trim().length > 0
  /*
    Bounds, not just "is it a number". A slipped decimal turns 72.4 into 724 and drives every
    TDEE estimate, trend and goal projection off it — the same reason setup validates height.
    In pounds the same window is roughly 66 to 660.
  */
  const minShown = unit === 'lbs' ? 66 : 30
  const maxShown = unit === 'lbs' ? 660 : 300
  const valid = Number.isFinite(parsed) && parsed >= minShown && parsed <= maxShown

  const submit = () => {
    if (!valid) return
    logWeight({ date, displayWeight: Math.round(parsed * 10) / 10 })
    router.back()
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      <GlassSurface
        radius={0}
        bordered={false}
        style={{
          paddingTop: insets.top,
          borderBottomWidth: HAIRLINE,
          borderBottomColor: theme.glass.border,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
          }}
        >
          <IconButton
            accessibilityLabel="Close weigh-in"
            onPress={() => router.back()}
            style={{ marginLeft: -spacing.md }}
          >
            <X size={22} color={theme.text} strokeWidth={2} />
          </IconButton>
          <View style={{ flex: 1 }}>
            <SectionTitle>Log weight</SectionTitle>
            <Body size={12} tone="muted" numberOfLines={1}>
              {formatDate(date)}
            </Body>
          </View>
        </View>
      </GlassSurface>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: insets.bottom + spacing.xxl,
          gap: spacing.lg,
        }}
      >
        {/* Today by default; the arrows are there for the morning weigh-in logged at night. */}
        <DateNavigator date={date} today={today} onChange={setDate} />

        <Surface style={{ padding: spacing.lg, gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Scale size={16} color={theme.brandText} strokeWidth={2} />
            <Label>{`Weight (${unit})`}</Label>
          </View>

          <Field
            numeric
            autoFocus
            value={draft}
            onChangeText={setDraft}
            placeholder={String(toDisplay(currentWeightKg))}
            keyboardType="decimal-pad"
            inputMode="decimal"
            returnKeyType="done"
            onSubmitEditing={submit}
            accessibilityLabel={`Weight on ${formatDate(date)}, in ${unit}`}
          />

          {hasDraft && !valid && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TriangleAlert size={14} color={theme.status.critical} strokeWidth={2.2} />
              <Body size={12} weight="medium" style={{ flex: 1, color: theme.status.critical }}>
                {`Enter a weight between ${minShown} and ${maxShown} ${unit}.`}
              </Body>
            </View>
          )}

          {/* Overwriting a day already logged is legitimate — correcting a typo — but it must
              not be silent, because the previous value disappears without a trace. */}
          {existing !== null && (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
              <Check size={14} color={theme.status.good} strokeWidth={2.2} />
              <Body size={12} tone="secondary" style={{ flex: 1 }}>
                {`Already logged ${existing.weight} ${unit} on this day. Saving replaces it.`}
              </Body>
            </View>
          )}
        </Surface>

        <Button
          label={existing === null ? 'Save weigh-in' : 'Replace weigh-in'}
          full
          disabled={!valid}
          onPress={submit}
          haptic
          icon={<Check size={16} color={theme.brandOn} strokeWidth={2.4} />}
        />

        {/*
          States what the sync actually guarantees, at the moment the user is deciding to
          trust it. "Synced to Google Fit" would be a promise this app cannot keep: whether
          Fit displays a Health Connect record depends on a setting inside Fit that is off by
          default, and nothing here can change it.
        */}
        <View
          style={{
            padding: spacing.md,
            borderRadius: radius.control,
            borderWidth: HAIRLINE,
            borderColor: theme.border,
            backgroundColor: theme.surface,
          }}
        >
          <Body size={12} tone="muted">
            {grants.writeWeight
              ? 'Saved to Health Connect as well. Google Fit shows it if Fit is set to sync with Health Connect.'
              : 'Saved on this device and to your account. Connect Health Connect in Profile to share weigh-ins with your other apps.'}
          </Body>
        </View>

        {weightLog.length > 0 && (
          <Surface style={{ padding: spacing.lg, gap: spacing.md }}>
            <Label>Recent</Label>
            {weightLog.slice(0, 5).map(entry => (
              <View
                key={entry.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                }}
              >
                <Body size={13} tone="secondary">
                  {formatDate(entry.date)}
                </Body>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                  <StatValue size={16}>{String(entry.weight)}</StatValue>
                  <Body size={11} tone="muted">
                    {unit}
                  </Body>
                </View>
              </View>
            ))}
          </Surface>
        )}
      </ScrollView>
    </View>
  )
}
