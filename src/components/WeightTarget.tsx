import React, { useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { ArrowDown, ArrowUp, CalendarClock, Check, Minus, Scale, TriangleAlert } from 'lucide-react-native'

import { getWeightTargetProgress, type TrackStatus } from '@core/utils/weightTarget'
import { getTodayString } from '@core/utils/calculations'
import { useStore } from '@/store/useStore'
import { useTheme } from '@/theme/useTheme'
import { radius, spacing } from '@/theme/tokens'
import { Surface } from './Glass'
import { Body, Label, StatValue } from './Text'
import { Button } from './Button'
import { Field } from './Layout'
import { ProgressTrack } from './MacroRing'

const LBS_PER_KG = 2.20462

/** Status drives an icon and words, never colour alone. */
const STATUS_META: Record<
  TrackStatus,
  { label: string; tone: 'good' | 'warning' | 'critical' | 'neutral' }
> = {
  no_target: { label: 'No goal set', tone: 'neutral' },
  insufficient_data: { label: 'Projected from your plan', tone: 'neutral' },
  reached: { label: 'Goal reached', tone: 'good' },
  on_track: { label: 'On track', tone: 'good' },
  ahead: { label: 'Faster than planned', tone: 'warning' },
  slow: { label: 'Stalled', tone: 'warning' },
  wrong_way: { label: 'Going the wrong way', tone: 'critical' },
}

/**
 * Goal weight, today's weigh-in, and an honest read on whether the trend is heading the
 * right way. This is the screen's answer to "am I actually making progress?".
 */
export const WeightTargetCard: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const theme = useTheme()
  const profile = useStore(s => s.profile)
  const weightLog = useStore(s => s.weightLog)
  const currentWeightKg = useStore(s => s.currentWeightKg)
  const addWeightEntry = useStore(s => s.addWeightEntry)

  const [draft, setDraft] = useState('')

  const today = getTodayString()
  const loggedToday = weightLog.some(e => e.date === today)

  const progress = useMemo(
    () => getWeightTargetProgress(weightLog, profile, currentWeightKg, today),
    [weightLog, profile, currentWeightKg, today],
  )

  const unit = profile.weightUnit
  const toDisplay = (kg: number): number =>
    Math.round((unit === 'lbs' ? kg * LBS_PER_KG : kg) * 10) / 10

  const meta = STATUS_META[progress.status]
  const toneColor =
    meta.tone === 'good'
      ? theme.status.good
      : meta.tone === 'warning'
        ? theme.status.warning
        : meta.tone === 'critical'
          ? theme.status.critical
          : theme.textSecondary

  const StatusIcon =
    meta.tone === 'good' ? Check : meta.tone === 'critical' ? TriangleAlert : Minus

  const TrendIcon =
    progress.trendKgPerWeek === null
      ? Minus
      : progress.trendKgPerWeek < 0
        ? ArrowDown
        : progress.trendKgPerWeek > 0
          ? ArrowUp
          : Minus

  const submitWeighIn = () => {
    const value = Number(draft.replace(',', '.').trim())
    if (!Number.isFinite(value) || value <= 0) return
    // Stored in the user's display unit, exactly like the rest of the weight log.
    addWeightEntry({ date: today, weight: Math.round(value * 10) / 10 })
    setDraft('')
  }

  return (
    <Surface style={{ padding: spacing.lg, gap: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Scale size={16} color={theme.brandText} strokeWidth={2} />
        <Label>Weight goal</Label>
      </View>

      {progress.targetKg === null ? (
        <Body tone="secondary">{progress.message}</Body>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
            <StatValue size={40}>{String(toDisplay(currentWeightKg))}</StatValue>
            <Body tone="muted" style={{ marginBottom: 6 }}>
              {`${unit} → ${toDisplay(progress.targetKg)} ${unit}`}
            </Body>
          </View>

          {progress.fraction !== null && (
            <View style={{ gap: 6 }}>
              <ProgressTrack progress={progress.fraction} color={theme.brand} />
              <Body size={12} tone="muted">
                {`${Math.round(progress.fraction * 100)}% of the way from your starting weight`}
              </Body>
            </View>
          )}

          {/* The countdown. The single most-read number here, so it gets its own row
              rather than being buried in the status sentence. */}
          {progress.etaDays !== null && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                padding: spacing.md,
                borderRadius: radius.control,
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderColor: theme.border,
                backgroundColor: theme.surface,
              }}
            >
              <CalendarClock size={16} color={theme.textSecondary} strokeWidth={2} />
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <StatValue size={20}>{String(progress.etaDays)}</StatValue>
                <Body size={13} tone="secondary">
                  {`days left (${progress.etaWeeks} week${progress.etaWeeks === 1 ? '' : 's'})`}
                </Body>
              </View>
              {progress.etaIsProjected && (
                <Body size={11} tone="muted">
                  planned pace
                </Body>
              )}
            </View>
          )}

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: spacing.sm,
              padding: spacing.md,
              borderRadius: radius.control,
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: toneColor + '55',
              backgroundColor: toneColor + '14',
            }}
          >
            <StatusIcon size={16} color={toneColor} strokeWidth={2.2} />
            <View style={{ flex: 1, gap: 2 }}>
              <Body size={13} weight="semibold" style={{ color: toneColor }}>
                {meta.label}
              </Body>
              <Body size={13} tone="secondary">
                {progress.message}
              </Body>
            </View>
          </View>

          {!compact && progress.trendKgPerWeek !== null && (
            <View style={{ flexDirection: 'row', gap: spacing.lg }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Label>Trend</Label>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <TrendIcon size={14} color={theme.textSecondary} strokeWidth={2.2} />
                  <StatValue size={18}>
                    {String(toDisplay(Math.abs(progress.trendKgPerWeek)))}
                  </StatValue>
                  <Body size={12} tone="muted">
                    {`${unit}/week`}
                  </Body>
                </View>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Label>Based on</Label>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <StatValue size={18}>{String(progress.daysOfTrend)}</StatValue>
                  <Body size={12} tone="muted">
                    days
                  </Body>
                </View>
              </View>
            </View>
          )}
        </>
      )}

      {/* Daily weigh-in. Direction can only be measured if this happens regularly. */}
      {loggedToday ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Check size={15} color={theme.status.good} strokeWidth={2.2} />
          <Body size={13} tone="secondary">
            Weighed in today. Daily weigh-ins make the trend far more reliable.
          </Body>
        </View>
      ) : (
        <View style={{ gap: spacing.sm }}>
          <Label>{`Today's weight (${unit})`}</Label>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Field
                numeric
                value={draft}
                onChangeText={setDraft}
                placeholder={String(toDisplay(currentWeightKg))}
                keyboardType="decimal-pad"
                inputMode="decimal"
                accessibilityLabel={`Today's weight in ${unit}`}
                returnKeyType="done"
                onSubmitEditing={submitWeighIn}
              />
            </View>
            <Button
              label="Log"
              onPress={submitWeighIn}
              disabled={draft.trim().length === 0}
              haptic
            />
          </View>
        </View>
      )}
    </Surface>
  )
}
