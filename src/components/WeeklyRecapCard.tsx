import React from 'react'
import { Pressable, View } from 'react-native'
import { router } from 'expo-router'
import { CalendarCheck, X } from 'lucide-react-native'

import { addDays } from '@core/utils/trainingProgram'
import { formatDate } from '@core/utils/calculations'
import type { WeeklyRecap } from '@/lib/activityFeed'
import { formatNumber } from '@/lib/formatNumber'
import { useActivitySeen } from '@/store/activitySeen'
import { useTheme } from '@/theme/useTheme'
import { radius, spacing } from '@/theme/tokens'
import { Island } from './Material'
import { IconButton } from './Button'
import { Body, Label, StatValue } from './Text'

const Figure: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
    <Label>{label}</Label>
    <StatValue size={20} numberOfLines={1}>
      {value}
    </StatValue>
  </View>
)

/**
 * Last week, on Monday's Today screen, until put away.
 *
 * The weekly reset is when people decide whether to keep going, so this is the moment to show
 * the week they just had — three numbers, no verdict. It stays until dismissed (or the week
 * after next arrives); the same summary lives on in Activity.
 */
export const WeeklyRecapCard: React.FC<{ recap: WeeklyRecap; unit: 'kg' | 'lbs' }> = ({
  recap,
  unit,
}) => {
  const theme = useTheme()
  const dismissed = useActivitySeen(s => s.recapDismissed)
  const dismiss = useActivitySeen(s => s.dismissRecap)
  if (dismissed === recap.weekStart) return null

  const range = `${formatDate(recap.weekStart)} – ${formatDate(addDays(recap.weekStart, 6))}`
  const weight =
    recap.weightChange === null
      ? '—'
      : `${recap.weightChange > 0 ? '+' : recap.weightChange < 0 ? '−' : ''}${Math.abs(recap.weightChange)} ${unit}`

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Last week: ${recap.workouts} of ${recap.goal} workouts. Open Progress`}
      onPress={() => router.push('/progress')}
    >
      {({ pressed }) => (
        <Island
          style={{
            padding: spacing.lg,
            gap: spacing.md,
            backgroundColor: pressed ? theme.surfaceRaised : undefined,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: radius.tight,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: `${theme.brand}1F`,
              }}
            >
              <CalendarCheck size={17} color={theme.brandText} strokeWidth={2} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Body weight="semibold">Your week in review</Body>
              <Body size={12} tone="muted">
                {range}
              </Body>
            </View>
            <IconButton accessibilityLabel="Dismiss the weekly review" onPress={() => dismiss(recap.weekStart)}>
              <X size={18} color={theme.textMuted} strokeWidth={2} />
            </IconButton>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Figure label="Workouts" value={`${recap.workouts}/${recap.goal}`} />
            <Figure
              label="Avg kcal"
              value={recap.avgCalories === null ? '—' : formatNumber(recap.avgCalories)}
            />
            <Figure label="Weight" value={weight} />
          </View>
          {recap.loggedDays > 0 ? (
            <Body size={13} tone="secondary">
              {`Food logged on ${recap.loggedDays} of 7 days · protein target hit on ${recap.proteinDaysHit}.`}
            </Body>
          ) : null}
        </Island>
      )}
    </Pressable>
  )
}
