import React, { useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import Svg, { Circle, Line, Polyline } from 'react-native-svg'
import { History } from 'lucide-react-native'

import type { WorkoutSession } from '@core/types'
import { formatDate } from '@core/utils/calculations'
import { epley1RM, getLiftHistory } from '@core/utils/workoutMath'

import { useStore } from '@/store/useStore'
import { ThemeScope } from '@/theme/ThemeScope'
import { useTheme } from '@/theme/useTheme'
import { spacing, workoutTheme } from '@/theme/tokens'
import { Surface } from '@/components/Glass'
import { Body, Label, StatValue } from '@/components/Text'
import { EmptyState, Screen } from '@/components/Layout'
import { fromKg, weightUnitLabel, type WeightUnit } from '@/features/training/format'
import { findLiftById } from '@/features/training/liftNames'

const CHART_HEIGHT = 140
/** Room inside the plot so the end dots and the stroke are not clipped at the edges. */
const CHART_INSET = 8

interface SessionLine {
  id: string
  date: string
  name: string
  /** Completed working sets of this lift in the session, across every card it appeared on. */
  setCount: number
  best: { weightKg: number; reps: number }
  /** 0 for bodyweight work, which has no load to estimate a max from. */
  best1RM: number
}

/**
 * One line per session that has at least one ticked working set of the lift. A session that
 * only opened the lift and never logged it says nothing about strength, so it is left out.
 *
 * The best set is the one with the highest estimated 1RM, so 100 × 5 outranks 105 × 1; with
 * no load at all it falls back to the most reps.
 */
const summarise = (session: WorkoutSession, liftId: string): SessionLine | null => {
  let setCount = 0
  let best: SessionLine['best'] | null = null
  let best1RM = 0
  for (const exercise of session.exercises ?? []) {
    if (exercise.liftId !== liftId) continue
    for (const set of exercise.sets ?? []) {
      if (!set.completed || set.isWarmup || set.reps <= 0) continue
      setCount += 1
      const oneRM = epley1RM(set.weightKg, set.reps)
      if (
        best === null ||
        oneRM > best1RM ||
        (oneRM === best1RM && oneRM === 0 && set.reps > best.reps)
      ) {
        best = { weightKg: set.weightKg, reps: set.reps }
        best1RM = oneRM
      }
    }
  }
  if (best === null) return null
  return { id: session.id, date: session.date, name: session.name, setCount, best, best1RM }
}

const formatSet = (set: SessionLine['best'], unit: WeightUnit): string =>
  set.weightKg > 0
    ? `${fromKg(set.weightKg, unit)} ${weightUnitLabel(unit)} × ${set.reps}`
    : `${set.reps} reps`

/**
 * Best estimated 1RM per session, oldest on the left. A single line and two labelled extremes
 * is all it needs: the question is "am I getting stronger", and gridlines or a legend would
 * only sit between the eye and the slope.
 */
const TrendChart: React.FC<{ points: SessionLine[]; unit: WeightUnit }> = ({ points, unit }) => {
  const theme = useTheme()
  const [width, setWidth] = useState(0)

  const values = points.map(point => point.best1RM)
  const max = Math.max(...values)
  const min = Math.min(...values)
  // A flat run still draws as a line through the middle rather than dividing by zero.
  const span = max - min || 1
  const plotWidth = Math.max(0, width - CHART_INSET * 2)
  const plotHeight = CHART_HEIGHT - CHART_INSET * 2
  const coords = points.map((point, index) => ({
    x: CHART_INSET + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth),
    y:
      CHART_INSET +
      (max === min ? plotHeight / 2 : plotHeight - ((point.best1RM - min) / span) * plotHeight),
  }))
  const last = coords[coords.length - 1]
  const unitLabel = weightUnitLabel(unit)

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Label>{`Estimated 1RM, ${unitLabel}`}</Label>
        <StatValue size={12} tone="muted">
          {`${fromKg(min, unit)} – ${fromKg(max, unit)}`}
        </StatValue>
      </View>
      <View
        onLayout={event => setWidth(event.nativeEvent.layout.width)}
        style={{ height: CHART_HEIGHT }}
        accessibilityRole="image"
        accessibilityLabel={`Estimated one-rep max over ${points.length} sessions, from ${fromKg(
          points[0].best1RM,
          unit
        )} to ${fromKg(points[points.length - 1].best1RM, unit)} ${unitLabel}`}
      >
        {width > 0 && (
          <Svg width={width} height={CHART_HEIGHT}>
            <Line
              x1={CHART_INSET}
              x2={width - CHART_INSET}
              y1={CHART_HEIGHT - CHART_INSET}
              y2={CHART_HEIGHT - CHART_INSET}
              stroke={theme.border}
              strokeWidth={StyleSheet.hairlineWidth * 2}
            />
            <Polyline
              points={coords.map(point => `${point.x},${point.y}`).join(' ')}
              fill="none"
              stroke={theme.brand}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* Dots only while they stay distinct; past that they turn the line into beads. */}
            {coords.length <= 24 &&
              coords.map((point, index) => (
                <Circle key={points[index].id} cx={point.x} cy={point.y} r={3} fill={theme.brand} />
              ))}
            <Circle cx={last.x} cy={last.y} r={5} fill={theme.brand} stroke={theme.canvas} strokeWidth={2} />
          </Svg>
        )}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Body size={12} tone="muted">
          {formatDate(points[0].date)}
        </Body>
        <Body size={12} tone="muted">
          {formatDate(points[points.length - 1].date)}
        </Body>
      </View>
    </View>
  )
}

/**
 * Everything logged for one lift: its best, the trend of its estimated max, and every session
 * it was trained in. Opened from a row on Records.
 */
const LiftHistoryBody: React.FC = () => {
  const theme = useTheme()
  const { liftId } = useLocalSearchParams<{ liftId: string }>()
  const workoutLog = useStore(s => s.workoutLog)
  const customLifts = useStore(s => s.customLifts)
  const unit = useStore(s => s.profile.weightUnit)
  const unitLabel = weightUnitLabel(unit)

  const history = useMemo(
    () => getLiftHistory(workoutLog, liftId ?? ''),
    [workoutLog, liftId]
  )
  // Newest first, as getLiftHistory returns them.
  const lines = useMemo(
    () =>
      history
        .map(session => summarise(session, liftId ?? ''))
        .filter((line): line is SessionLine => line !== null),
    [history, liftId]
  )

  // The name travels with each logged exercise, so a lift deleted from the library since
  // still has one to show.
  const liftName =
    history[0]?.exercises.find(exercise => exercise.liftId === liftId)?.lift.name ??
    findLiftById(liftId ?? '', customLifts)?.name ??
    'Lift history'

  const bestLine = lines.reduce<SessionLine | null>(
    (best, line) =>
      best === null ||
      line.best1RM > best.best1RM ||
      (line.best1RM === 0 && best.best1RM === 0 && line.best.reps > best.best.reps)
        ? line
        : best,
    null
  )
  const trend = lines.filter(line => line.best1RM > 0).reverse()

  return (
    <Screen
      title={liftName}
      subtitle={
        lines.length === 0
          ? undefined
          : `${lines.length} ${lines.length === 1 ? 'session' : 'sessions'}`
      }
      onBack={() => router.back()}
    >
      {bestLine === null ? (
        <Surface style={{ padding: spacing.lg }}>
          <EmptyState
            icon={<History size={26} color={theme.textMuted} strokeWidth={1.8} />}
            title="No sets logged yet"
            message="Tick off a working set of this lift and each session shows up here, with its best set and the trend of your estimated max."
          />
        </Surface>
      ) : (
        <>
          <Surface style={{ padding: spacing.lg, flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Label>Best est. 1RM</Label>
              {bestLine.best1RM > 0 ? (
                <StatValue size={24} color={theme.brandText}>
                  {`${fromKg(bestLine.best1RM, unit)}`}
                  <Body size={15} tone="muted">{` ${unitLabel}`}</Body>
                </StatValue>
              ) : (
                <StatValue size={24} tone="muted">
                  —
                </StatValue>
              )}
              <Body size={12} tone="muted" numberOfLines={1}>
                {formatDate(bestLine.date)}
              </Body>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Label>Best set</Label>
              <StatValue size={24} numberOfLines={1}>
                {formatSet(bestLine.best, unit)}
              </StatValue>
              <Body size={12} tone="muted" numberOfLines={1}>
                {bestLine.name}
              </Body>
            </View>
          </Surface>

          {trend.length >= 2 && (
            <Surface style={{ padding: spacing.lg }}>
              <TrendChart points={trend} unit={unit} />
            </Surface>
          )}

          <View style={{ gap: spacing.sm }}>
            <Label>Sessions</Label>
            <Surface>
              {lines.map((line, index) => (
                <View
                  key={line.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.md,
                    padding: spacing.md,
                    minHeight: 64,
                    borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth * 2,
                    borderTopColor: theme.border,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Body weight="semibold" numberOfLines={1}>
                      {formatDate(line.date)}
                    </Body>
                    <Body size={12} tone="muted" numberOfLines={1}>
                      {`${line.name} · ${line.setCount} ${line.setCount === 1 ? 'set' : 'sets'}`}
                    </Body>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <StatValue size={17}>{formatSet(line.best, unit)}</StatValue>
                    {line.best1RM > 0 && (
                      <Label>{`1RM ${fromKg(line.best1RM, unit)} ${unitLabel}`}</Label>
                    )}
                  </View>
                </View>
              ))}
            </Surface>
          </View>
        </>
      )}
    </Screen>
  )
}

/** Opened from Records, so it keeps Training's palette rather than flashing the app's own. */
export default function LiftHistoryScreen() {
  return (
    <ThemeScope theme={workoutTheme}>
      <LiftHistoryBody />
    </ThemeScope>
  )
}
