import React, { useMemo } from 'react'
import { View } from 'react-native'
import { History } from 'lucide-react-native'

import { sessionVolume } from '@core/utils/workoutMath'

import { useStore } from '@/store/useStore'
import { useTheme } from '@/theme/useTheme'
import { spacing } from '@/theme/tokens'
import { Surface } from '@/components/Glass'
import { Label, StatValue } from '@/components/Text'
import { EmptyState, Screen } from '@/components/Layout'
import { HistoryCard } from '@/features/training/HistoryCard'
import { fromKg, groupDigits, weightUnitLabel } from '@/features/training/format'
import { exitTraining } from '@/features/training/exitTraining'
import { useLiveStripSpace } from '@/features/training/useLiveStripSpace'

const DAY_MS = 86_400_000

export default function TrainingHistory() {
  const theme = useTheme()
  const workoutLog = useStore(s => s.workoutLog)
  const activeWorkoutId = useStore(s => s.activeWorkoutId)
  const unit = useStore(s => s.profile.weightUnit)
  const bottomSpace = useLiveStripSpace()

  const history = useMemo(
    () => workoutLog.filter(session => session.id !== activeWorkoutId),
    [workoutLog, activeWorkoutId]
  )

  // The last 30 days, as the one line of context above the list.
  const recent = useMemo(() => {
    const since = Date.now() - 30 * DAY_MS
    const sessions = history.filter(session => session.startedAt >= since)
    return {
      count: sessions.length,
      volumeKg: sessions.reduce((sum, session) => sum + sessionVolume(session), 0),
    }
  }, [history])

  return (
    <Screen
      title="History"
      subtitle={history.length === 0 ? undefined : `${history.length} workouts logged`}
      onBack={exitTraining}
      extraBottomSpace={bottomSpace}
    >
      {history.length === 0 ? (
        <Surface style={{ padding: spacing.lg }}>
          <EmptyState
            icon={<History size={26} color={theme.textMuted} strokeWidth={1.8} />}
            title="No workouts yet"
            message="Finished workouts land here, with every set, so next time you know what to beat."
          />
        </Surface>
      ) : (
        <>
          <Surface style={{ padding: spacing.lg, flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Label>Last 30 days</Label>
              <StatValue size={24}>{recent.count}</StatValue>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Label>Volume</Label>
              <StatValue size={24} numberOfLines={1}>
                {`${groupDigits(fromKg(recent.volumeKg, unit))} ${weightUnitLabel(unit)}`}
              </StatValue>
            </View>
          </Surface>
          {history.map(session => (
            <HistoryCard key={session.id} session={session} unit={unit} />
          ))}
        </>
      )}
    </Screen>
  )
}
