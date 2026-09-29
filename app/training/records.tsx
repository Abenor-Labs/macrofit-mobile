import React, { useMemo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { ChevronRight, Trophy } from 'lucide-react-native'

import { formatDate } from '@core/utils/calculations'
import { getPersonalRecords } from '@core/utils/workoutMath'

import { useStore } from '@/store/useStore'
import { useTheme } from '@/theme/useTheme'
import { spacing } from '@/theme/tokens'
import { Surface } from '@/components/Glass'
import { Body, Label, StatValue } from '@/components/Text'
import { EmptyState, Screen } from '@/components/Layout'
import { fromKg, weightUnitLabel } from '@/features/training/format'
import { exitTraining } from '@/features/training/exitTraining'
import { useLiveStripSpace } from '@/features/training/useLiveStripSpace'

export default function TrainingRecords() {
  const theme = useTheme()
  const workoutLog = useStore(s => s.workoutLog)
  const unit = useStore(s => s.profile.weightUnit)
  const bottomSpace = useLiveStripSpace()
  const unitLabel = weightUnitLabel(unit)

  const records = useMemo(() => getPersonalRecords(workoutLog), [workoutLog])

  return (
    <Screen
      title="Records"
      subtitle={records.length === 0 ? undefined : `Best estimated 1RM on ${records.length} lifts`}
      onBack={exitTraining}
      extraBottomSpace={bottomSpace}
    >
      {records.length === 0 ? (
        <Surface style={{ padding: spacing.lg }}>
          <EmptyState
            icon={<Trophy size={26} color={theme.textMuted} strokeWidth={1.8} />}
            title="No records yet"
            message="Tick off a weighted set and your best for that lift shows up here. Beat it and the set wears a New PR badge."
          />
        </Surface>
      ) : (
        // overflow hidden so the first and last rows' press highlight keeps the card's corners.
        <Surface style={{ overflow: 'hidden' }}>
          {records.map((record, index) => (
            /* A record is where "how did I get here" starts, so every row opens that lift's
               history, the way Hevy's exercise rows do. */
            <Pressable
              key={record.liftId}
              accessibilityRole="button"
              accessibilityLabel={`${record.liftName}, best estimated one-rep max ${fromKg(record.bestEstimated1RM, unit)} ${unitLabel}. Open history`}
              onPress={() =>
                router.push({ pathname: '/lift-history', params: { liftId: record.liftId } })
              }
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                padding: spacing.md,
                minHeight: 64,
                borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth * 2,
                borderTopColor: theme.border,
                backgroundColor: pressed ? theme.surfaceRaised : 'transparent',
              })}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Body weight="semibold" numberOfLines={1}>
                  {record.liftName}
                </Body>
                <Body size={12} tone="muted" numberOfLines={1}>
                  {`Best set ${fromKg(record.bestWeightKg, unit)} ${unitLabel}${
                    record.achievedOn !== '' ? ` · ${formatDate(record.achievedOn)}` : ''
                  }`}
                </Body>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <StatValue size={20}>{fromKg(record.bestEstimated1RM, unit)}</StatValue>
                <Label>{`1RM ${unitLabel}`}</Label>
              </View>
              <ChevronRight size={18} color={theme.textMuted} strokeWidth={2.2} />
            </Pressable>
          ))}
        </Surface>
      )}
    </Screen>
  )
}
