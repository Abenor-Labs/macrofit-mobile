import React, { useEffect, useMemo } from 'react'
import { ScrollView, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { ArrowRight, Award, Check, Moon, Trophy } from 'lucide-react-native'

import { formatDate, getTodayString } from '@core/utils/calculations'
import { resolveUpNext } from '@core/utils/trainingProgram'
import {
  ordinal,
  previousComparable,
  sessionPRs,
  summarize,
  weeklyGoalFor,
  weeklyProgress,
  workoutMilestone,
} from '@core/utils/trainingStats'

import { useStore } from '@/store/useStore'
import { ThemeScope } from '@/theme/ThemeScope'
import { useTheme } from '@/theme/useTheme'
import { radius, spacing, workoutTheme } from '@/theme/tokens'
import { Surface } from '@/components/Glass'
import { Body, Label, SectionTitle, StatValue } from '@/components/Text'
import { Button } from '@/components/Button'
import { WeekProgressCard } from '@/features/training/WeekProgress'
import { formatElapsed, fromKg, groupDigits, weightUnitLabel } from '@/features/training/format'
import { weekdayOf } from '@/features/training/liftNames'

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)

/**
 * The moment after Finish.
 *
 * This is the reward half of the loop, and until now it did not exist: tapping Finish dropped
 * the user back onto an empty Today tab, as if nothing had happened. Every number here is
 * something the user earned in the last hour — what they lifted, what they beat, where it
 * leaves their week — and the last line is the next day of the plan, so the screen that ends
 * one workout is also the one that books the next.
 */
const SummaryBody: React.FC = () => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>()

  const workoutLog = useStore(s => s.workoutLog)
  const program = useStore(s => s.trainingPrograms.find(p => p.id === s.activeProgramId) ?? null)
  const unit = useStore(s => s.profile.weightUnit)
  const unitLabel = weightUnitLabel(unit)
  const session = workoutLog.find(entry => entry.id === sessionId) ?? null
  const today = getTodayString()

  const data = useMemo(() => {
    if (!session) return null
    const stats = summarize(session)
    const previous = previousComparable(session, workoutLog)
    return {
      stats,
      previous: previous ? summarize(previous) : null,
      prs: sessionPRs(session, workoutLog),
      milestone: workoutMilestone(session, workoutLog),
      week: weeklyProgress(workoutLog, weeklyGoalFor(program), today),
      upNext: program ? resolveUpNext(program, today) : null,
    }
  }, [session, workoutLog, program, today])

  // The hero lands, then the rest follows: one beat of celebration, not a light show.
  const hero = useSharedValue(reduced ? 1 : 0)
  const rest = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    if (reduced) return
    hero.value = withTiming(1, { duration: 420, easing: EASE_OUT })
    rest.value = withDelay(180, withTiming(1, { duration: 360, easing: EASE_OUT }))
  }, [hero, rest, reduced])
  const heroStyle = useAnimatedStyle(() => ({
    opacity: hero.value,
    transform: [{ scale: 0.9 + hero.value * 0.1 }],
  }))
  const restStyle = useAnimatedStyle(() => ({
    opacity: rest.value,
    transform: [{ translateY: (1 - rest.value) * 16 }],
  }))

  if (!session || !data) return null
  const { stats, previous, prs, milestone, week, upNext } = data

  const volumeDelta = previous ? stats.volumeKg - previous.volumeKg : 0
  const comparison =
    previous === null
      ? null
      : volumeDelta > 0
        ? `+${groupDigits(fromKg(volumeDelta, unit))} ${unitLabel} more than last time`
        : // Down on last time is said as a fact, never as a failure.
          `Last time: ${groupDigits(fromKg(previous.volumeKg, unit))} ${unitLabel}`

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.xl,
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.xl,
          gap: spacing.lg,
        }}
      >
        <Animated.View
          needsOffscreenAlphaCompositing
          style={[{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md }, heroStyle]}
        >
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 44,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.brand,
            }}
          >
            {prs.length > 0 ? (
              <Trophy size={42} color={theme.brandOn} strokeWidth={2.2} />
            ) : (
              <Check size={46} color={theme.brandOn} strokeWidth={3} />
            )}
          </View>
          <Label style={{ color: theme.brandText, marginTop: spacing.sm }}>Workout complete</Label>
          <StatValue size={32} style={{ textAlign: 'center' }}>
            {session.name}
          </StatValue>
          <Body size={13} tone="muted">
            {`${weekdayOf(session.date)}, ${formatDate(session.date)}`}
          </Body>
        </Animated.View>

        <Animated.View needsOffscreenAlphaCompositing style={[{ gap: spacing.lg }, restStyle]}>
          {milestone !== null ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                padding: spacing.md,
                borderRadius: radius.control,
                backgroundColor: `${theme.brand}1F`,
              }}
            >
              <Award size={26} color={theme.brandText} strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Body weight="semibold" style={{ color: theme.brandText }}>
                  {milestone === 1 ? 'Your first workout' : `Your ${ordinal(milestone)} workout`}
                </Body>
                <Body size={13} tone="secondary">
                  {milestone === 1
                    ? 'The hardest one to start. Everything from here builds on it.'
                    : 'That is a habit now, not an attempt.'}
                </Body>
              </View>
            </View>
          ) : null}

          <Surface style={{ padding: spacing.lg, gap: spacing.md }}>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Label>Duration</Label>
                <StatValue size={22}>{formatElapsed(stats.durationMs)}</StatValue>
              </View>
              <View style={{ flex: 1.3, gap: 2 }}>
                <Label>Volume</Label>
                <StatValue size={22} numberOfLines={1}>
                  {`${groupDigits(fromKg(stats.volumeKg, unit))} ${unitLabel}`}
                </StatValue>
              </View>
              <View style={{ flex: 0.7, gap: 2 }}>
                <Label>Sets</Label>
                <StatValue size={22}>{stats.sets}</StatValue>
              </View>
            </View>
            {comparison ? (
              <Body
                size={13}
                weight="semibold"
                style={{ color: volumeDelta > 0 ? theme.brandText : theme.textSecondary }}
              >
                {comparison}
              </Body>
            ) : null}
          </Surface>

          {prs.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              <SectionTitle>{prs.length === 1 ? 'New personal record' : `${prs.length} new personal records`}</SectionTitle>
              <Surface>
                {prs.map((pr, index) => (
                  <View
                    key={`${pr.liftName}-${index}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.md,
                      padding: spacing.md,
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: theme.border,
                    }}
                  >
                    <Trophy size={18} color={theme.brandText} strokeWidth={2.2} />
                    <Body weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
                      {pr.liftName}
                    </Body>
                    <StatValue size={15} color={theme.brandText}>
                      {`${fromKg(pr.weightKg, unit)} ${unitLabel} × ${pr.reps}`}
                    </StatValue>
                  </View>
                ))}
              </Surface>
            </View>
          ) : null}

          <WeekProgressCard progress={week} />

          {upNext ? (
            <Surface
              style={{ padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
            >
              {upNext.day.rest ? (
                <Moon size={22} color={theme.textSecondary} strokeWidth={2} />
              ) : (
                <ArrowRight size={22} color={theme.brandText} strokeWidth={2.2} />
              )}
              <View style={{ flex: 1 }}>
                <Label>Up next</Label>
                <Body weight="semibold">
                  {upNext.day.rest
                    ? `Rest, ${weekdayOf(upNext.date)}`
                    : `${upNext.day.name}, ${upNext.date === today ? 'today' : weekdayOf(upNext.date)}`}
                </Body>
              </View>
            </Surface>
          ) : null}
        </Animated.View>
      </ScrollView>

      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: insets.bottom + spacing.md }}>
        <Button label="Done" full onPress={() => router.back()} />
      </View>
    </View>
  )
}

export default function WorkoutSummaryScreen() {
  return (
    <ThemeScope theme={workoutTheme}>
      <SummaryBody />
    </ThemeScope>
  )
}
