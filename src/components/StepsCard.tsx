import React from 'react'
import { View } from 'react-native'
import { Footprints, Link2, RefreshCw } from 'lucide-react-native'

import { useStore } from '@/store/useStore'
import { useTheme } from '@/theme/useTheme'
import { spacing } from '@/theme/tokens'
import { useHealthSync } from '@/hooks/useHealthSync'
import { Surface } from './Glass'
import { Body, Label, StatValue } from './Text'
import { Button } from './Button'
import { ProgressTrack } from './MacroRing'

const DEFAULT_STEP_GOAL = 8000

/**
 * Steps read from Android Health Connect.
 *
 * Renders nothing at all when the platform cannot provide steps — an empty "0 steps" tile
 * on iOS or on a device without Health Connect would be a lie, not an empty state.
 */
export const StepsCard: React.FC = () => {
  const theme = useTheme()
  const profile = useStore(s => s.profile)
  const { availability, granted, todaySteps, weekSteps, busy, connect, refreshSteps } =
    useHealthSync()

  if (availability !== 'available') return null

  const goal = Number.isFinite(profile.stepGoal) ? (profile.stepGoal as number) : DEFAULT_STEP_GOAL

  if (!granted) {
    return (
      <Surface style={{ padding: spacing.lg, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Footprints size={16} color={theme.brandText} strokeWidth={2} />
          <Label>Steps</Label>
        </View>
        <Body tone="secondary" size={13}>
          Connect Health Connect to pull your daily steps and past weigh-ins from your
          phone, so you do not have to enter them by hand.
        </Body>
        <Button
          label="Connect Health Connect"
          onPress={() => void connect()}
          loading={busy}
          icon={<Link2 size={15} color={theme.brandOn} strokeWidth={2} />}
        />
      </Surface>
    )
  }

  const steps = todaySteps ?? 0
  const weekAverage =
    weekSteps.length > 0
      ? Math.round(weekSteps.reduce((sum, d) => sum + d.steps, 0) / weekSteps.length)
      : null

  return (
    <Surface style={{ padding: spacing.lg, gap: spacing.md }}>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Footprints size={16} color={theme.brandText} strokeWidth={2} />
          <Label>Steps today</Label>
        </View>
        <Button
          label="Refresh"
          variant="ghost"
          onPress={() => void refreshSteps()}
          icon={<RefreshCw size={13} color={theme.textSecondary} strokeWidth={2} />}
        />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
        <StatValue size={36}>{steps.toLocaleString()}</StatValue>
        <Body tone="muted" style={{ marginBottom: 5 }}>
          {`/ ${goal.toLocaleString()}`}
        </Body>
      </View>

      <ProgressTrack progress={goal > 0 ? steps / goal : 0} color={theme.brand} />

      {weekAverage !== null && (
        <Body size={12} tone="muted">
          {`7-day average ${weekAverage.toLocaleString()} steps`}
        </Body>
      )}
    </Surface>
  )
}
