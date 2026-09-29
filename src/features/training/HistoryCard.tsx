import React, { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { AlertTriangle, ChevronDown, Repeat, Trash2 } from 'lucide-react-native'

import type { WorkoutExercise, WorkoutSession } from '@core/types'
import { formatDate } from '@core/utils/calculations'
import { sessionSetCount, sessionVolume } from '@core/utils/workoutMath'

import { useStore } from '@/store/useStore'
import { useTheme } from '@/theme/useTheme'
import { HIT_SIZE, spacing } from '@/theme/tokens'
import { Surface } from '@/components/Glass'
import { Body, Label, StatValue } from '@/components/Text'
import { Button } from '@/components/Button'
import { Field } from '@/components/Layout'
import { formatDuration, fromKg, groupDigits, weightUnitLabel, type WeightUnit } from './format'

interface SetGroup {
  count: number
  reps: number
  weightKg: number
}

/** Consecutive identical working sets collapse into '3 × 8 @ 100' the way a log reads. */
const groupSets = (exercise: WorkoutExercise): SetGroup[] => {
  const groups: SetGroup[] = []
  for (const set of exercise.sets ?? []) {
    if (!set.completed || set.isWarmup) continue
    const last = groups[groups.length - 1]
    if (last && last.reps === set.reps && last.weightKg === set.weightKg) last.count += 1
    else groups.push({ count: 1, reps: set.reps, weightKg: set.weightKg })
  }
  return groups
}

export const HistoryCard: React.FC<{ session: WorkoutSession; unit: WeightUnit }> = ({
  session,
  unit,
}) => {
  const theme = useTheme()
  const saveWorkoutTemplate = useStore(s => s.saveWorkoutTemplate)
  const deleteWorkout = useStore(s => s.deleteWorkout)

  const [expanded, setExpanded] = useState(false)
  const [namingTemplate, setNamingTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const unitLabel = weightUnitLabel(unit)
  const exercises = session.exercises ?? []
  const setCount = sessionSetCount(session)
  const duration = formatDuration(session)

  return (
    <Surface>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${session.name}, ${formatDate(session.date)}`}
        accessibilityHint={expanded ? 'Hide session detail' : 'Show session detail'}
        onPress={() => setExpanded(value => !value)}
        style={{
          minHeight: HIT_SIZE,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          padding: spacing.md,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Body weight="semibold" numberOfLines={1}>
            {session.name}
          </Body>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <Body size={12} tone="muted">
              {formatDate(session.date)}
            </Body>
            <Body size={12} tone="muted">
              ·
            </Body>
            <StatValue size={12} tone="muted">
              {setCount}
            </StatValue>
            <Body size={12} tone="muted">
              {setCount === 1 ? 'set' : 'sets'}
            </Body>
            <Body size={12} tone="muted">
              ·
            </Body>
            {duration === null ? (
              <Body size={12} tone="muted">
                In progress
              </Body>
            ) : (
              <StatValue size={12} tone="muted">
                {duration}
              </StatValue>
            )}
          </View>
        </View>

        <View style={{ alignItems: 'flex-end' }}>
          <StatValue size={17}>{groupDigits(fromKg(sessionVolume(session), unit))}</StatValue>
          <Label>{`${unitLabel} volume`}</Label>
        </View>

        <ChevronDown
          size={18}
          color={theme.textMuted}
          strokeWidth={2}
          style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
        />
      </Pressable>

      {expanded && (
        <View
          style={{
            gap: spacing.md,
            padding: spacing.md,
            borderTopWidth: StyleSheet.hairlineWidth * 2,
            borderTopColor: theme.border,
          }}
        >
          {exercises.length === 0 ? (
            <Body size={13} tone="muted">
              No exercises were logged in this session.
            </Body>
          ) : (
            exercises.map(exercise => {
              const groups = groupSets(exercise)
              return (
                <View key={exercise.id} style={{ gap: 2 }}>
                  <Body size={13} weight="medium">
                    {exercise.lift.name}
                  </Body>
                  {groups.length === 0 ? (
                    <Body size={12} tone="muted">
                      No completed sets
                    </Body>
                  ) : (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        flexWrap: 'wrap',
                      }}
                    >
                      {groups.map((group, index) => (
                        <React.Fragment key={index}>
                          {index > 0 && (
                            <Body size={12} tone="muted">
                              ·
                            </Body>
                          )}
                          <StatValue size={12} tone="secondary">
                            {group.weightKg > 0
                              ? `${group.count} × ${group.reps} @ ${fromKg(group.weightKg, unit)} ${unitLabel}`
                              : `${group.count} × ${group.reps}`}
                          </StatValue>
                        </React.Fragment>
                      ))}
                    </View>
                  )}
                </View>
              )
            })
          )}

          {namingTemplate ? (
            <View style={{ gap: spacing.sm }}>
              <Field
                label="Template name"
                value={templateName}
                onChangeText={setTemplateName}
                placeholder="e.g. Push day"
                accessibilityLabel="Template name"
              />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => setNamingTemplate(false)}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Save template"
                  disabled={templateName.trim() === ''}
                  onPress={() => {
                    const trimmed = templateName.trim()
                    if (trimmed === '') return
                    saveWorkoutTemplate(trimmed, session.id)
                    setNamingTemplate(false)
                    setTemplateName('')
                  }}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          ) : confirmDelete ? (
            <View style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
                <AlertTriangle size={16} color={theme.status.critical} strokeWidth={2} />
                <Body size={13} tone="secondary" style={{ flex: 1 }}>
                  This deletes the session and every set in it. It cannot be undone.
                </Body>
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button
                  label="Keep it"
                  variant="secondary"
                  onPress={() => setConfirmDelete(false)}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Delete for good"
                  variant="ghost"
                  onPress={() => deleteWorkout(session.id)}
                  icon={<Trash2 size={16} color={theme.status.critical} strokeWidth={2} />}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button
                label="Save as template"
                variant="secondary"
                disabled={exercises.length === 0}
                onPress={() => {
                  setTemplateName(session.name)
                  setNamingTemplate(true)
                }}
                icon={<Repeat size={16} color={theme.text} strokeWidth={2} />}
                style={{ flex: 1 }}
              />
              <Button
                label="Delete"
                variant="ghost"
                onPress={() => setConfirmDelete(true)}
                icon={<Trash2 size={16} color={theme.textMuted} strokeWidth={2} />}
              />
            </View>
          )}
        </View>
      )}
    </Surface>
  )
}

