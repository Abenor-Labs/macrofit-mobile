import React from 'react'
import { View } from 'react-native'
import { Footprints, Link2, RefreshCw } from 'lucide-react-native'

import { useStore } from '@/store/useStore'
import { formatNumber } from '@/lib/formatNumber'
import { useTheme } from '@/theme/useTheme'
import { spacing } from '@/theme/tokens'
import { useHealthSync } from '@/hooks/useHealthSync'
import { isFullyDenied } from '@/lib/healthConnect'
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
  const { availability, grants, todaySteps, weekSteps, busy, connect, openSettings, refreshSteps } =
    useHealthSync()

  if (availability !== 'available') return null

  const goal = Number.isFinite(profile.stepGoal) ? (profile.stepGoal as number) : DEFAULT_STEP_GOAL

  /*
    Steps specifically, not "connected" in general.

    This card used to hide behind a single `granted` boolean that was true whenever ANY Health
    Connect permission had been given. Allow weight, refuse steps — an entirely reasonable
    choice the permission sheet invites — and the card rendered a step goal beside a permanent
    zero, with nothing on screen admitting it had never been allowed to look.

    A zero the app is not entitled to read is not an empty state. It is a lie with a progress
    bar under it.
  */
  if (!grants.readSteps) {
    const refused = isFullyDenied(grants)
    return (
      <Surface style={{ padding: spacing.lg, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Footprints size={16} color={theme.brandText} strokeWidth={2} />
          <Label>Steps</Label>
        </View>
        <Body tone="secondary" size={13}>
          {refused
            ? 'Connect Health Connect to pull your daily steps and past weigh-ins from your phone, so you do not have to enter them by hand.'
            : 'MacroFit is connected to Health Connect, but was not given access to your steps. Everything else is working.'}
        </Body>
        {/*
          Health Connect prompts once per permission per install and remembers a refusal, so
          asking again after one does nothing at all — the sheet does not appear and the button
          looks broken. Once anything has been refused, its settings screen is the only route
          left, and saying so is the difference between a dead end and a fix.
        */}
        <Button
          label={refused ? 'Connect Health Connect' : 'Allow steps in Health Connect'}
          onPress={() => void (refused ? connect() : openSettings())}
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
        <StatValue size={24}>{formatNumber(steps)}</StatValue>
        <Body tone="muted" style={{ marginBottom: 5 }}>
          {`/ ${formatNumber(goal)}`}
        </Body>
      </View>

      <ProgressTrack progress={goal > 0 ? steps / goal : 0} color={theme.brand} />

      {weekAverage !== null && (
        <Body size={12} tone="muted">
          {`7-day average ${formatNumber(weekAverage)} steps`}
        </Body>
      )}
    </Surface>
  )
}
