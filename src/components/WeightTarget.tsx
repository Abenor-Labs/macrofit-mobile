import React, { useMemo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { ArrowDown, ArrowUp, CalendarClock, Check, Minus, Scale, TriangleAlert } from 'lucide-react-native'

import { getWeightTargetProgress, type TrackStatus } from '@core/utils/weightTarget'
import { formatDate, getTodayString } from '@core/utils/calculations'
import { useStore } from '@/store/useStore'
import { useLogWeight } from '@/hooks/useLogWeight'
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
 * The trend read, its tone, and its icon — shared by the full card and by the standalone
 * verdict the dashboard shows above the fold.
 */
const useWeightVerdict = () => {
  const theme = useTheme()
  const profile = useStore(s => s.profile)
  const weightLog = useStore(s => s.weightLog)
  const currentWeightKg = useStore(s => s.currentWeightKg)

  const today = getTodayString()

  const progress = useMemo(
    () => getWeightTargetProgress(weightLog, profile, currentWeightKg, today),
    [weightLog, profile, currentWeightKg, today],
  )

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

  return { progress, meta, toneColor, StatusIcon, today }
}

/** The toned callout itself. One shape, so the two placements cannot drift apart. */
const VerdictBox: React.FC<{
  label: string
  message: string
  toneColor: string
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
}> = ({ label, message, toneColor, Icon }) => (
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
    <Icon size={16} color={toneColor} strokeWidth={2.2} />
    <View style={{ flex: 1, gap: 2 }}>
      <Body size={13} weight="semibold" style={{ color: toneColor }}>
        {label}
      </Body>
      <Body size={13} tone="secondary">
        {message}
      </Body>
    </View>
  </View>
)

/**
 * The verdict on its own, for the top of the dashboard.
 *
 * "Weight has been flat for 26 days with 3.7 kg to go. A change in intake is needed to start
 * moving." is the only line on that screen that asks the user to change something, and it used
 * to sit seventh of eight — below a steps tile, four swipes down, where a ten-second check-in
 * never reaches it. It reads directly under the calorie hero now, so the screen answers "am I
 * on track today" and "is any of this working" in the same glance.
 *
 * WeightTargetCard drops it when `compact`, which is how the dashboard renders it, so the
 * sentence is promoted rather than printed twice.
 *
 * Renders nothing without a goal to measure against: there is no verdict to give, and an empty
 * callout above the fold would cost the position without earning it.
 *
 * Opens the weight history, because "flat for 26 days" is a claim about a trend and the trend
 * is the thing worth looking at next. The copy inside the card is left alone: this is a link on
 * the dashboard only, and the same box inside WeightTargetCard on Progress is already there.
 */
export const WeightVerdict: React.FC = () => {
  const router = useRouter()
  const theme = useTheme()
  const profile = useStore(s => s.profile)
  const weightLog = useStore(s => s.weightLog)
  const { progress, meta, toneColor, StatusIcon, today } = useWeightVerdict()

  /*
    No goal weight is not the same as nothing to say.

    This returned null whenever `targetKg` was null, and goal weight is optional in setup — so
    a large share of users saw NOTHING about weight on the dashboard, which is most of why
    "where is the weight logging in the app?" was asked at all. There is no verdict to give
    without a target, but there is still the most useful thing on the subject: whether they
    have weighed in today, and what the last reading was.

    One line, not a card. The dashboard already carries a finding for having too much above
    the fold, and the actual logging now lives in the log button.
  */
  if (progress.targetKg === null) {
    const loggedToday = weightLog.some(entry => entry.date === today)
    const latest = weightLog[0]
    const unit = profile.weightUnit

    return (
      <Pressable
        needsOffscreenAlphaCompositing
        accessibilityRole="link"
        accessibilityLabel={
          loggedToday
            ? `Weighed in today. Open weight history.`
            : 'No weigh-in yet today. Open weight history.'
        }
        onPress={() => router.push({ pathname: '/progress', params: { metric: 'weight' } })}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Scale size={15} color={theme.textMuted} strokeWidth={2} />
        <Body size={13} tone="secondary" style={{ flex: 1 }}>
          {loggedToday
            ? `Weighed in today${latest ? ` · ${latest.weight} ${unit}` : ''}`
            : latest
              ? `No weigh-in today · last ${latest.weight} ${unit} on ${formatDate(latest.date)}`
              : 'No weigh-ins yet — log one from the + button'}
        </Body>
      </Pressable>
    )
  }

  return (
    <Pressable
      needsOffscreenAlphaCompositing
      accessibilityRole="link"
      accessibilityLabel={`${meta.label}. ${progress.message} Open weight history.`}
      onPress={() => router.push({ pathname: '/progress', params: { metric: 'weight' } })}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <VerdictBox
        label={meta.label}
        message={progress.message}
        toneColor={toneColor}
        Icon={StatusIcon}
      />
    </Pressable>
  )
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
  const { logWeight } = useLogWeight()

  const [draft, setDraft] = useState('')

  const { progress, meta, toneColor, StatusIcon, today } = useWeightVerdict()
  const loggedToday = weightLog.some(e => e.date === today)

  const unit = profile.weightUnit
  const toDisplay = (kg: number): number =>
    Math.round((unit === 'lbs' ? kg * LBS_PER_KG : kg) * 10) / 10

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
    // The same plausible range the weigh-in screen enforces, so a slipped decimal (724 for
    // 72.4) cannot land in the log and swing the trend line off the chart.
    const kg = unit === 'lbs' ? value / LBS_PER_KG : value
    if (!Number.isFinite(value) || kg < 30 || kg > 300) return
    // Stored in the user's display unit, exactly like the rest of the weight log.
    logWeight({ date: today, displayWeight: Math.round(value * 10) / 10 })
    setDraft('')
  }

  // With no goal weight, the dashboard's WeightVerdict line already says whether you weighed
  // in and what you weighed; this card would only repeat it at the bottom of the same screen.
  if (compact && progress.targetKg === null) return null

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
            {/* Compact on the dashboard: the calorie ring is that screen's one display figure, and
                a 40pt weight at the bottom used to out-shout it. */}
            <StatValue size={compact ? 24 : 40}>{String(toDisplay(currentWeightKg))}</StatValue>
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

          {/* Not in compact: the dashboard promotes this to the top of the screen as
              <WeightVerdict />, and saying it twice on one screen would undo the point. */}
          {!compact && (
            <VerdictBox
              label={meta.label}
              message={progress.message}
              toneColor={toneColor}
              Icon={StatusIcon}
            />
          )}

          {!compact && progress.trendKgPerWeek !== null && (
            <View style={{ flexDirection: 'row', gap: spacing.lg }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Label>Trend</Label>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <TrendIcon size={14} color={theme.textSecondary} strokeWidth={2.2} />
                  <StatValue size={17}>
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
                  <StatValue size={17}>{String(progress.daysOfTrend)}</StatValue>
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
