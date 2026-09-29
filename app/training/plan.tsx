import React, { useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { CheckCircle2, ChevronRight, Moon, Plus, Trash2 } from 'lucide-react-native'

import type { TrainingProgram, TrainingStyle } from '@core/types'
import { getTodayString } from '@core/utils/calculations'
import { resolveUpNext } from '@core/utils/trainingProgram'

import { useStore } from '@/store/useStore'
import { useTheme } from '@/theme/useTheme'
import { HIT_SIZE, fonts, radius, spacing } from '@/theme/tokens'
import { Surface } from '@/components/Glass'
import { Body, Label } from '@/components/Text'
import { Button, IconButton } from '@/components/Button'
import { ActionSheet } from '@/components/ActionSheet'
import { Pill, Screen } from '@/components/Layout'
import { Segmented } from '@/components/Segmented'
import { ProgramSetup } from '@/features/training/ProgramSetup'
import { findLiftById } from '@/features/training/liftNames'
import { exitTraining } from '@/features/training/exitTraining'
import { useLiveStripSpace } from '@/features/training/useLiveStripSpace'

const STYLE_OPTIONS = [
  { value: 'gym', label: 'Gym' },
  { value: 'calisthenics', label: 'Calisthenics' },
] as const

/** One program: its name, whether Today follows it, and its days in the order they repeat. */
const ProgramEditor: React.FC<{ program: TrainingProgram; active: boolean }> = ({
  program,
  active,
}) => {
  const theme = useTheme()
  const customLifts = useStore(s => s.customLifts)
  const renameProgram = useStore(s => s.renameProgram)
  const setActiveProgram = useStore(s => s.setActiveProgram)
  const deleteProgram = useStore(s => s.deleteProgram)
  const addProgramDay = useStore(s => s.addProgramDay)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const upNext = resolveUpNext(program, getTodayString())

  const openDay = (dayId: string) =>
    router.push({ pathname: '/routine-day', params: { programId: program.id, dayId } })

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <TextInput
          value={program.name}
          onChangeText={name => renameProgram(program.id, name)}
          placeholder="Program name"
          placeholderTextColor={theme.textMuted}
          accessibilityLabel="Program name"
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: HIT_SIZE,
            paddingVertical: 0,
            fontFamily: fonts.displayBold,
            fontSize: 20,
            color: theme.text,
          }}
        />
        <IconButton accessibilityLabel="Delete this plan" onPress={() => setConfirmDelete(true)}>
          <Trash2 size={18} color={theme.textMuted} strokeWidth={2} />
        </IconButton>
      </View>

      {active ? (
        <View style={{ flexDirection: 'row' }}>
          <Pill color={theme.brandText}>
            <CheckCircle2 size={13} color={theme.brandText} strokeWidth={2.4} />
            <Body size={12} weight="semibold" style={{ color: theme.brandText }}>
              Today follows this plan
            </Body>
          </Pill>
        </View>
      ) : (
        <Button
          label="Follow this plan on Today"
          variant="secondary"
          full
          onPress={() => setActiveProgram(program.id)}
        />
      )}

      <Surface>
        {program.days.map((day, index) => {
          const isNext = upNext !== null && upNext.index === index && upNext.status !== 'done'
          const names = day.liftIds
            .map(id => findLiftById(id, customLifts)?.name)
            .filter(Boolean)
            .join(', ')
          return (
            <Pressable
              key={day.id}
              accessibilityRole="button"
              accessibilityLabel={`Day ${index + 1}, ${day.rest ? 'rest' : day.name}${isNext ? ', up next' : ''}. Edit`}
              onPress={() => openDay(day.id)}
              style={({ pressed }) => ({
                minHeight: 64,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth * 2,
                borderTopColor: theme.border,
                backgroundColor: pressed ? theme.surfaceRaised : 'transparent',
              })}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isNext ? theme.brand : theme.surfaceRaised,
                }}
              >
                {day.rest ? (
                  <Moon size={15} color={isNext ? theme.brandOn : theme.textMuted} strokeWidth={2.2} />
                ) : (
                  <Body
                    size={13}
                    weight="semibold"
                    style={{ color: isNext ? theme.brandOn : theme.textSecondary }}
                  >
                    {index + 1}
                  </Body>
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Body
                  weight="semibold"
                  numberOfLines={1}
                  style={day.rest ? { color: theme.textMuted } : undefined}
                >
                  {day.rest ? 'Rest' : day.name}
                </Body>
                {!day.rest ? (
                  <Body size={12} tone="muted" numberOfLines={1}>
                    {names === '' ? 'No lifts yet — tap to add' : names}
                  </Body>
                ) : null}
              </View>
              {isNext ? <Label style={{ color: theme.brandText }}>Up next</Label> : null}
              <ChevronRight size={16} color={theme.textMuted} strokeWidth={2.2} />
            </Pressable>
          )
        })}
      </Surface>

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button
          label="Training day"
          variant="secondary"
          onPress={() => openDay(addProgramDay(program.id, false))}
          icon={<Plus size={16} color={theme.text} strokeWidth={2.2} />}
          style={{ flex: 1 }}
        />
        <Button
          label="Rest day"
          variant="secondary"
          onPress={() => addProgramDay(program.id, true)}
          icon={<Moon size={16} color={theme.text} strokeWidth={2.2} />}
          style={{ flex: 1 }}
        />
      </View>
      <Body size={12} tone="muted" style={{ textAlign: 'center' }}>
        The days repeat in this order. A missed training day waits for you; a rest day passes
        with the calendar.
      </Body>

      <ActionSheet
        visible={confirmDelete}
        title="Delete this plan?"
        message="The schedule goes. Workouts you already logged from it stay in History."
        onClose={() => setConfirmDelete(false)}
        options={[
          {
            label: 'Delete plan',
            icon: <Trash2 size={20} color={theme.status.critical} strokeWidth={2} />,
            destructive: true,
            onPress: () => deleteProgram(program.id),
          },
        ]}
      />
    </View>
  )
}

export default function TrainingPlan() {
  const programs = useStore(s => s.trainingPrograms)
  const activeProgramId = useStore(s => s.activeProgramId)
  const bottomSpace = useLiveStripSpace()

  const activeStyle = programs.find(p => p.id === activeProgramId)?.style ?? 'gym'
  const [style, setStyle] = useState<TrainingStyle>(activeStyle)
  const program = programs.find(p => p.style === style) ?? null

  return (
    <Screen
      title="Plan"
      subtitle="Your repeating schedule"
      onBack={exitTraining}
      extraBottomSpace={bottomSpace}
    >
      <Segmented options={STYLE_OPTIONS} value={style} onChange={setStyle} />
      {program ? (
        <ProgramEditor program={program} active={program.id === activeProgramId} />
      ) : (
        <ProgramSetup style={style} />
      )}
    </Screen>
  )
}
