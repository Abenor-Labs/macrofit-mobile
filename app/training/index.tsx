import React, { useMemo } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { Check, ChevronRight, Moon, Play, Plus, Repeat, SkipForward } from 'lucide-react-native'

import type { TrainingProgram } from '@core/types'
import { getTodayString } from '@core/utils/calculations'
import { projectSchedule, resolveUpNext, type UpNext } from '@core/utils/trainingProgram'
import {
  countsAsWorkout,
  previousComparable,
  summarize,
  weeklyGoalFor,
  weeklyProgress,
} from '@core/utils/trainingStats'

import { useStore } from '@/store/useStore'
import { useTheme } from '@/theme/useTheme'
import { HIT_SIZE, radius, spacing } from '@/theme/tokens'
import { Surface } from '@/components/Glass'
import { Body, Label, SectionTitle, StatValue } from '@/components/Text'
import { Button } from '@/components/Button'
import { Screen } from '@/components/Layout'
import { ActiveWorkout } from '@/features/training/ActiveSession'
import { ProgramSetup, STYLE_LABEL } from '@/features/training/ProgramSetup'
import {
  defaultWorkoutName,
  fromKg,
  groupDigits,
  weightUnitLabel,
} from '@/features/training/format'
import { WeekProgressCard } from '@/features/training/WeekProgress'
import { exitTraining } from '@/features/training/exitTraining'
import { useLiveStripSpace } from '@/features/training/useLiveStripSpace'
import { findLiftById, weekdayOf } from '@/features/training/liftNames'

const LIFT_PREVIEW = 5

/**
 * What the plan says about today, as the one thing on the screen that matters.
 *
 * Three states, each with its own single primary action: a training day (start it), a rest
 * day (rest — or train anyway), and a day already done (nothing to do; here is what is next).
 */
const UpNextCard: React.FC<{ program: TrainingProgram; upNext: UpNext; today: string }> = ({
  program,
  upNext,
  today,
}) => {
  const theme = useTheme()
  const customLifts = useStore(s => s.customLifts)
  const workoutLog = useStore(s => s.workoutLog)
  const unit = useStore(s => s.profile.weightUnit)
  const startProgramDay = useStore(s => s.startProgramDay)
  const skipProgramDay = useStore(s => s.skipProgramDay)

  const { day, status } = upNext
  const position = `Day ${upNext.index + 1} of ${program.days.length}`

  if (status === 'done') {
    return (
      <Surface style={{ padding: spacing.lg, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.brand,
            }}
          >
            <Check size={24} color={theme.brandOn} strokeWidth={2.8} />
          </View>
          <View style={{ flex: 1 }}>
            <SectionTitle>Done for today</SectionTitle>
            <Body size={13} tone="secondary">
              {day.rest ? 'Tomorrow is a rest day.' : `Up next: ${day.name}, ${weekdayOf(upNext.date)}.`}
            </Body>
          </View>
        </View>
      </Surface>
    )
  }

  if (status === 'rest') {
    // The first training day after this rest, for "train anyway".
    let nextTraining = null as TrainingProgram['days'][number] | null
    for (let offset = 1; offset <= program.days.length; offset++) {
      const candidate = program.days[(upNext.index + offset) % program.days.length]
      if (!candidate.rest) {
        nextTraining = candidate
        break
      }
    }

    return (
      <Surface style={{ padding: spacing.lg, gap: spacing.md }}>
        <Label>{`Today · ${position}`}</Label>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Moon size={28} color={theme.brandText} strokeWidth={2} />
          <StatValue size={30}>Rest day</StatValue>
        </View>
        <Body size={15} tone="secondary">
          Recovery is where the work turns into strength. The plan moves on by itself tomorrow.
        </Body>
        {nextTraining ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              label={`Train ${nextTraining.name} anyway`}
              variant="secondary"
              onPress={() => startProgramDay(program.id, nextTraining.id, today)}
              style={{ flex: 1 }}
            />
          </View>
        ) : null}
      </Surface>
    )
  }

  const lifts = day.liftIds
    .map(id => findLiftById(id, customLifts))
    .filter((lift): lift is NonNullable<typeof lift> => lift !== null)

  /*
    The number to beat. A plan tells you what to do; last time tells you how well, and that
    is what turns "Chest day again" into something with a score on it.
  */
  const last = previousComparable(
    { id: '', date: today, name: day.name, startedAt: Date.now(), exercises: [], programDayId: day.id },
    workoutLog
  )
  const lastStats = last ? summarize(last) : null

  return (
    <Surface style={{ padding: spacing.lg, gap: spacing.md }}>
      <Label style={{ color: theme.brandText }}>{`Today · ${position}`}</Label>
      <StatValue size={30}>{day.name}</StatValue>
      {lastStats && last ? (
        <Body size={13} tone="secondary">
          {`Last time, ${weekdayOf(last.date)}: ${groupDigits(fromKg(lastStats.volumeKg, unit))} ${weightUnitLabel(unit)} in ${Math.max(1, Math.round(lastStats.durationMs / 60000))} min. Beat it.`}
        </Body>
      ) : null}

      {lifts.length === 0 ? (
        <Body size={15} tone="secondary">
          No lifts on this day yet. Add them in Plan, or start and add as you go.
        </Body>
      ) : (
        <View style={{ gap: 6 }}>
          {lifts.slice(0, LIFT_PREVIEW).map((lift, index) => (
            <View key={`${lift.id}-${index}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View
                style={{ width: 6, height: 6, borderRadius: radius.pill, backgroundColor: theme.brandText }}
              />
              <Body size={15} numberOfLines={1} style={{ flex: 1 }}>
                {lift.name}
              </Body>
              <Body size={12} tone="muted">
                {lift.equipment}
              </Body>
            </View>
          ))}
          {lifts.length > LIFT_PREVIEW ? (
            <Body size={13} tone="muted">{`+ ${lifts.length - LIFT_PREVIEW} more`}</Body>
          ) : null}
        </View>
      )}

      <Button
        label={`Start ${day.name}`}
        full
        haptic
        onPress={() => startProgramDay(program.id, day.id, today)}
        icon={<Play size={16} color={theme.brandOn} strokeWidth={2.4} fill={theme.brandOn} />}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => skipProgramDay(program.id, today)}
        style={({ pressed }) => ({
          minHeight: HIT_SIZE,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          borderRadius: radius.control,
          backgroundColor: pressed ? theme.border : 'transparent',
        })}
      >
        <SkipForward size={15} color={theme.textSecondary} strokeWidth={2} />
        <Body size={15} weight="semibold" tone="secondary">
          Skip to the next day
        </Body>
      </Pressable>
    </Surface>
  )
}

/** The coming week as the plan would run it: the cycle, laid onto the calendar. */
const WeekStrip: React.FC<{ program: TrainingProgram; today: string }> = ({ program, today }) => {
  const theme = useTheme()
  const days = useMemo(() => projectSchedule(program, today, 7), [program, today])

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <SectionTitle style={{ flex: 1 }}>Coming up</SectionTitle>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/training/plan')}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: HIT_SIZE }}
        >
          <Body size={13} weight="semibold" tone="brand">
            Edit plan
          </Body>
          <ChevronRight size={16} color={theme.brandText} strokeWidth={2.2} />
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}
      >
        {days.map((entry, position) => {
          const isToday = entry.date === today
          return (
            <View
              key={`${entry.date}-${position}`}
              style={{
                width: 84,
                padding: spacing.sm,
                gap: 6,
                borderRadius: radius.control,
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderColor: isToday ? theme.brand : theme.border,
                backgroundColor: isToday ? `${theme.brand}14` : theme.surface,
              }}
            >
              <Label style={isToday ? { color: theme.brandText } : undefined}>
                {isToday ? 'Today' : weekdayOf(entry.date)}
              </Label>
              {entry.done ? (
                <Check size={16} color={theme.brandText} strokeWidth={2.6} />
              ) : entry.day.rest ? (
                <Moon size={16} color={theme.textMuted} strokeWidth={2} />
              ) : (
                <View style={{ height: 16, justifyContent: 'center' }}>
                  <View
                    style={{ width: 8, height: 8, borderRadius: radius.pill, backgroundColor: theme.brandText }}
                  />
                </View>
              )}
              <Body
                size={13}
                weight="semibold"
                numberOfLines={2}
                style={{ color: entry.day.rest ? theme.textMuted : theme.text }}
              >
                {entry.day.rest ? 'Rest' : entry.day.name}
              </Body>
            </View>
          )
        })}
      </ScrollView>
    </View>
  )
}

export default function TrainingToday() {
  const theme = useTheme()
  const today = getTodayString()
  const activeSession = useStore(
    s => s.workoutLog.find(session => session.id === s.activeWorkoutId) ?? null
  )
  const program = useStore(
    s => s.trainingPrograms.find(p => p.id === s.activeProgramId) ?? null
  )
  const unit = useStore(s => s.profile.weightUnit)
  const templates = useStore(s => s.workoutTemplates)
  const startWorkout = useStore(s => s.startWorkout)
  const endWorkout = useStore(s => s.endWorkout)
  const applyWorkoutTemplate = useStore(s => s.applyWorkoutTemplate)

  const upNext = program ? resolveUpNext(program, today) : null
  const bottomSpace = useLiveStripSpace(true)
  const workoutLog = useStore(s => s.workoutLog)
  const week = useMemo(
    () => weeklyProgress(workoutLog, weeklyGoalFor(program), today),
    [workoutLog, program, today]
  )
  const hasHistory = useMemo(() => workoutLog.some(countsAsWorkout), [workoutLog])

  /*
    Finish ends the session, then shows what it was worth. A session with nothing ticked off
    skips the summary: there is nothing to celebrate, and a screen of zeros would be a scold.
  */
  const finish = () => {
    if (!activeSession) return
    const id = activeSession.id
    const worthSummary = activeSession.exercises.some(ex => ex.sets.some(set => set.completed))
    endWorkout()
    if (worthSummary) router.push({ pathname: '/workout-summary', params: { sessionId: id } })
  }

  return (
    <Screen
      title="Training"
      subtitle={
        activeSession
          ? 'Workout in progress'
          : program
            ? `${STYLE_LABEL[program.style]} · ${program.name}`
            : 'Your workouts, planned'
      }
      onBack={exitTraining}
      extraBottomSpace={bottomSpace}
      right={
        // Finish sits where Hevy puts it: top right, reachable however long the session.
        activeSession ? <Button label="Finish" haptic onPress={finish} /> : undefined
      }
    >
      {activeSession ? (
        <ActiveWorkout session={activeSession} unit={unit} onFinish={finish} />
      ) : program === null ? (
        <ProgramSetup />
      ) : (
        <>
          {upNext ? <UpNextCard program={program} upNext={upNext} today={today} /> : null}
          {hasHistory ? <WeekProgressCard progress={week} /> : null}
          <WeekStrip program={program} today={today} />

          <View style={{ gap: spacing.sm }}>
            <SectionTitle>Something else today?</SectionTitle>
            <Button
              label="Start an empty workout"
              variant="secondary"
              full
              onPress={() => startWorkout(defaultWorkoutName(), today)}
              icon={<Plus size={16} color={theme.text} strokeWidth={2.2} />}
            />
            {templates.map(template => (
              <Pressable
                key={template.id}
                accessibilityRole="button"
                accessibilityLabel={`Start ${template.name}, ${template.liftIds.length} lifts`}
                onPress={() => applyWorkoutTemplate(template.id, today)}
                style={({ pressed }) => ({
                  minHeight: 56,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.control,
                  backgroundColor: pressed ? theme.surfaceRaised : theme.surface,
                })}
              >
                <Repeat size={17} color={theme.brandText} strokeWidth={2} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Body weight="semibold" numberOfLines={1}>
                    {template.name}
                  </Body>
                  <Body size={12} tone="muted">
                    {`Template · ${template.liftIds.length} ${template.liftIds.length === 1 ? 'lift' : 'lifts'}`}
                  </Body>
                </View>
                <ChevronRight size={16} color={theme.textMuted} strokeWidth={2.2} />
              </Pressable>
            ))}
          </View>
        </>
      )}
    </Screen>
  )
}
