import React, { useEffect, useMemo, useState } from 'react'
import { View, type LayoutChangeEvent } from 'react-native'
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg'
import { useGlobalSearchParams, useRouter } from 'expo-router'
import {
  Dumbbell,
  Minus,
  Scale,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trophy,
  Utensils,
} from 'lucide-react-native'

import { IconButton } from '@/components/Button'
import { ScrubReadout, useChartScrub } from '@/components/charts/ChartScrub'
import { Surface } from '@/components/Glass'
import { EmptyState, Screen } from '@/components/Layout'
import { ProgressTrack } from '@/components/MacroRing'
import { Segmented, type SegmentedOption } from '@/components/Segmented'
import { Body, Label, SectionTitle, StatValue } from '@/components/Text'
import { WeightTargetCard } from '@/components/WeightTarget'
import { DateNavigator } from '@/components/DateNavigator'
import { useStore } from '@/store/useStore'
import { useTheme } from '@/theme/useTheme'
import { spacing } from '@/theme/tokens'
import {
  formatDate,
  getDateString,
  getDayNutrition,
  getTodayString,
  kgToLbs,
} from '@core/utils/calculations'
import {
  getPersonalRecords,
  sessionSetCount,
  sessionVolume,
  weeklyVolumeByMuscle,
} from '@core/utils/workoutMath'
import type { DiaryDay } from '@core/types'

/* ------------------------------------------------------------------ *
 * Chart geometry
 *
 * Charts are drawn with react-native-svg for the marks only. Every axis
 * value is a real React Native <StatValue>, laid out beside the canvas —
 * SVG text cannot carry Fraunces + tabular figures the way the design
 * system requires.
 * ------------------------------------------------------------------ */

const CHART_H = 152
/** Left column reserved for y-axis figures. */
const GUTTER = 44
const PAD_X = 4
const PAD_Y = 8
const USABLE_H = CHART_H - PAD_Y * 2
/** Scrub readout width. Wide enough for '2,427 kcal', or for 'Week of Sep 18' under a weight. */
const TOOLTIP_W = 132

/*
  Day sits alongside the week and the month because the Intake ring on the dashboard opens here
  and has to land on the day it was showing. Fit draws the same three: a detail screen answers
  "today", "this week" and "this month" from one place rather than making the user guess which
  screen owns which span. The quarter and the year are there for weight, where a month is too
  short to separate a trend from a week of water.
*/
const RANGE_DAYS = { day: 1, '7d': 7, '30d': 30, '90d': 90, '1y': 365 } as const

type RangeKey = keyof typeof RANGE_DAYS
type TabKey = 'calories' | 'macros' | 'weight' | 'training'

interface Tick {
  value: number
  y: number
}

const withCommas = (value: number): string =>
  String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

const oneDecimal = (value: number): string => (Math.round(value * 10) / 10).toFixed(1)

/** Rounds an axis maximum up to a readable step so tick labels are not arbitrary. */
const niceMax = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 1
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)))
  const step = magnitude / 2
  return Math.ceil(value / step) * step
}

/* ------------------------------------------------------------------ *
 * Small shared pieces
 * ------------------------------------------------------------------ */

const YAxis: React.FC<{ ticks: Tick[]; format: (value: number) => string }> = ({
  ticks,
  format,
}) => (
  <View style={{ width: GUTTER, height: CHART_H }}>
    {ticks.map((tick, i) => (
      <View key={i} style={{ position: 'absolute', top: tick.y - 7, right: 8 }}>
        <StatValue size={11} tone="muted">
          {format(tick.value)}
        </StatValue>
      </View>
    ))}
  </View>
)

const AxisDates: React.FC<{ from: string; to: string }> = ({ from, to }) => (
  <View
    style={{
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingLeft: GUTTER,
      marginTop: 6,
    }}
  >
    <StatValue size={11} tone="muted">
      {formatDate(from)}
    </StatValue>
    <StatValue size={11} tone="muted">
      {formatDate(to)}
    </StatValue>
  </View>
)

/** The last `count` calendar days, oldest first, ending today. */
const lastDays = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (count - 1 - i))
    return getDateString(d)
  })

/** Width of one month label; three letters of an 11pt figure face, with room to centre. */
const MONTH_LABEL_W = 32

/**
 * Month names under the year chart, each centred on the first week of its month.
 *
 * Two end dates, which is what the shorter spans show, say nothing about a year that a reader
 * does not already know — "Sep 25 … Sep 24" is just the range control again. Months are what
 * a year is navigated by. Every other month is named, counted back from the latest so the most
 * recent one is always labelled: twelve three-letter names do not fit a phone's width without
 * touching.
 */
const MonthAxis: React.FC<{
  width: number
  slots: number
  startOf: (index: number) => string
}> = ({ width, slots, startOf }) => {
  const plotW = Math.max(width - GUTTER, 1)
  const usableW = Math.max(plotW - PAD_X * 2, 1)
  const xOf = (index: number): number =>
    slots <= 1 ? PAD_X + usableW / 2 : PAD_X + (index * usableW) / (slots - 1)

  const starts: { index: number; label: string }[] = []
  let previousMonth = ''
  for (let index = 0; index < slots; index++) {
    const date = startOf(index)
    const month = date.slice(0, 7)
    if (month !== previousMonth) {
      previousMonth = month
      // The first slot's month is usually a partial one; naming it at the very edge would
      // collide with the gutter and describe a week or two at most.
      if (index > 0) {
        const [year, monthNumber] = month.split('-').map(Number)
        starts.push({
          index,
          label: new Date(year, monthNumber - 1, 1).toLocaleDateString('en-US', { month: 'short' }),
        })
      }
    }
  }
  const shown = starts.filter((_, i) => (starts.length - 1 - i) % 2 === 0)

  return (
    <View style={{ height: 20, marginTop: 6 }}>
      {shown.map(mark => (
        <View
          key={mark.index}
          style={{
            position: 'absolute',
            left: Math.min(
              Math.max(GUTTER + xOf(mark.index) - MONTH_LABEL_W / 2, GUTTER),
              width - MONTH_LABEL_W
            ),
            width: MONTH_LABEL_W,
            alignItems: 'center',
          }}
        >
          <StatValue size={11} tone="muted">
            {mark.label}
          </StatValue>
        </View>
      ))}
    </View>
  )
}

interface LegendItem {
  label: string
  color: string
  dashed?: boolean
}

/** Identity is never carried by color alone: every swatch ships with its name. */
const Legend: React.FC<{ items: LegendItem[] }> = ({ items }) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
    {items.map(item => (
      <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {item.dashed ? (
          <View style={{ flexDirection: 'row', gap: 2, width: 14 }}>
            {[0, 1, 2].map(i => (
              <View key={i} style={{ width: 4, height: 2, backgroundColor: item.color }} />
            ))}
          </View>
        ) : (
          <View
            style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: item.color }}
          />
        )}
        <Body size={12} tone="secondary">
          {item.label}
        </Body>
      </View>
    ))}
  </View>
)

/** Measures its own width so the SVG canvas can be sized in real pixels. */
const ChartArea: React.FC<{
  accessibilityLabel: string
  children: (width: number) => React.ReactNode
}> = ({ accessibilityLabel, children }) => {
  const [width, setWidth] = useState(0)
  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width)
    setWidth(prev => (prev === next ? prev : next))
  }
  return (
    <View accessible accessibilityLabel={accessibilityLabel} onLayout={onLayout}>
      {width > 0 ? children(width) : <View style={{ height: CHART_H }} />}
    </View>
  )
}

/* ------------------------------------------------------------------ *
 * Line / area chart — calories and weight
 * ------------------------------------------------------------------ */

interface LinePoint {
  index: number
  value: number
}

interface LineChartProps {
  width: number
  /** Number of x slots in the window, so gaps stay proportional to real time. */
  slots: number
  points: LinePoint[]
  color: string
  /** Calories get an area to a true zero baseline; weight never does. */
  fillToZero: boolean
  /** Weight is continuous, so it joins across days with no entry. */
  connectGaps: boolean
  goal?: number
  goalColor?: string
  showDots: boolean
  format: (value: number) => string
  /**
    Names a slot, so a scrubbed point can say which day it is. A function rather than a date
    array because the year view plots weeks, and a week is named by its start, not by a day.
  */
  slotLabel?: (index: number) => string
  /** Appended to the scrubbed value, e.g. 'kcal'. The axis has no room to repeat it. */
  unit?: string
}

const LineChart: React.FC<LineChartProps> = ({
  width,
  slots,
  points,
  color,
  fillToZero,
  connectGaps,
  goal,
  goalColor,
  showDots,
  format,
  slotLabel,
  unit,
}) => {
  const theme = useTheme()

  /*
    Press and drag to read the series. At this width a 30-day chart puts its points about ten
    pixels apart, which is under half a fingertip: without scrubbing the only way to know what
    a dot is worth is to count gridlines and guess.
  */
  const { active, nearestRef, panHandlers } = useChartScrub()

  if (points.length === 0) return null

  const plotW = Math.max(width - GUTTER, 1)
  const usableW = Math.max(plotW - PAD_X * 2, 1)
  const values = points.map(p => p.value)

  let min: number
  let max: number
  if (fillToZero) {
    min = 0
    max = niceMax(Math.max(...values, goal ?? 0, 1))
  } else {
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    const spread = hi - lo
    const pad = spread > 0 ? spread * 0.18 : Math.max(Math.abs(hi) * 0.02, 0.5)
    min = lo - pad
    max = hi + pad
  }
  const span = max - min > 0 ? max - min : 1

  const xOf = (index: number): number =>
    slots <= 1 ? PAD_X + usableW / 2 : PAD_X + (index * usableW) / (slots - 1)
  const yOf = (value: number): number => PAD_Y + USABLE_H - ((value - min) / span) * USABLE_H

  const ticks: Tick[] = [max, (max + min) / 2, min].map(value => ({ value, y: yOf(value) }))

  const segments: LinePoint[][] = []
  let current: LinePoint[] = []
  points.forEach((point, i) => {
    const previous = points[i - 1]
    if (previous && !connectGaps && point.index !== previous.index + 1) {
      segments.push(current)
      current = []
    }
    current.push(point)
  })
  if (current.length > 0) segments.push(current)

  const lineD = (segment: LinePoint[]): string =>
    segment
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.index).toFixed(2)} ${yOf(p.value).toFixed(2)}`)
      .join(' ')

  const areaD = (segment: LinePoint[]): string => {
    const base = yOf(min).toFixed(2)
    const last = segment[segment.length - 1]
    return `${lineD(segment)} L${xOf(last.index).toFixed(2)} ${base} L${xOf(
      segment[0].index
    ).toFixed(2)} ${base} Z`
  }

  /*
    Snap to the nearest plotted point rather than to the nearest slot. On a sparse month most
    slots hold nothing, and a crosshair that lands between two logged days and reports neither
    is worse than one that always names a real reading.
  */
  nearestRef.current = (x: number): number | null => {
    let best = points[0]
    let bestDistance = Math.abs(xOf(best.index) - x)
    for (const point of points) {
      const distance = Math.abs(xOf(point.index) - x)
      if (distance < bestDistance) {
        best = point
        bestDistance = distance
      }
    }
    return best.index
  }

  const activePoint = active === null ? null : (points.find(p => p.index === active) ?? null)
  const activeX = activePoint === null ? 0 : xOf(activePoint.index)
  const activeLabel = activePoint === null ? undefined : slotLabel?.(activePoint.index)

  return (
    <View>
      {activePoint ? (
        <ScrubReadout left={GUTTER + activeX} bounds={GUTTER + plotW} width={TOOLTIP_W}>
          <StatValue size={15}>{`${format(activePoint.value)}${unit ? ` ${unit}` : ''}`}</StatValue>
          {activeLabel ? <Label>{activeLabel}</Label> : null}
        </ScrubReadout>
      ) : null}

      <View style={{ flexDirection: 'row' }} {...panHandlers}>
        <YAxis ticks={ticks} format={format} />
        <Svg width={plotW} height={CHART_H}>
          {activePoint ? (
            <Line
              x1={activeX}
              y1={PAD_Y}
              x2={activeX}
              y2={PAD_Y + USABLE_H}
              stroke={theme.textMuted}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          ) : null}
          {/* Grid stays recessive — a hairline in the border token, never a black axis. */}
          {ticks.map((tick, i) => (
            <Line
              key={`grid-${i}`}
              x1={0}
              y1={tick.y}
              x2={plotW}
              y2={tick.y}
              stroke={theme.border}
              strokeWidth={1}
            />
          ))}

          {goal !== undefined && Number.isFinite(goal) && goal > 0 ? (
            <Line
              x1={0}
              y1={yOf(goal)}
              x2={plotW}
              y2={yOf(goal)}
              stroke={goalColor ?? theme.textMuted}
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
          ) : null}

          {segments.map((segment, i) =>
            segment.length > 1 ? (
              <React.Fragment key={`seg-${i}`}>
                {fillToZero ? (
                  <Path d={areaD(segment)} fill={color} fillOpacity={0.12} />
                ) : null}
                <Path
                  d={lineD(segment)}
                  stroke={color}
                  strokeWidth={2}
                  fill="none"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </React.Fragment>
            ) : (
              <Circle
                key={`seg-${i}`}
                cx={xOf(segment[0].index)}
                cy={yOf(segment[0].value)}
                r={3.5}
                fill={color}
              />
            )
          )}

          {activePoint ? (
            <Circle
              cx={activeX}
              cy={yOf(activePoint.value)}
              r={6}
              fill={color}
              stroke={theme.surface}
              strokeWidth={2}
            />
          ) : null}

          {showDots
            ? points.map(point => (
                <Circle
                  key={`dot-${point.index}`}
                  cx={xOf(point.index)}
                  cy={yOf(point.value)}
                  r={3.5}
                  fill={color}
                  stroke={theme.surface}
                  strokeWidth={1.5}
                />
              ))
            : null}
        </Svg>
      </View>
    </View>
  )
}

/* ------------------------------------------------------------------ *
 * Stacked bars — macro grams per day
 * ------------------------------------------------------------------ */

interface MacroDay {
  index: number
  protein: number
  carbs: number
  fat: number
}

/** Macro readout is wider than the line chart's: it carries the split as well as the total. */
const MACRO_TOOLTIP_W = 168

const MacroBars: React.FC<{
  width: number
  slots: number
  days: MacroDay[]
  /** Sum of the three macro goals in grams — the height a day on target stacks to. */
  goal?: number
  slotLabel: (index: number) => string
}> = ({ width, slots, days, goal, slotLabel }) => {
  const theme = useTheme()

  /*
    The same press-and-drag reading the line chart has. A stacked bar is the one chart where
    the gridlines cannot answer the question at all: the protein band's height is readable,
    but where carbs begin and end is a subtraction nobody does by eye.
  */
  const { active, nearestRef, panHandlers } = useChartScrub()

  if (days.length === 0) return null

  const hasGoal = goal !== undefined && Number.isFinite(goal) && goal > 0
  const plotW = Math.max(width - GUTTER, 1)
  const totals = days.map(d => d.protein + d.carbs + d.fat)
  // The goal is part of the scale, so a week of under-eating still shows how far short it fell.
  const max = niceMax(Math.max(...totals, hasGoal ? (goal as number) : 0, 1))
  const slotW = plotW / Math.max(slots, 1)
  const barW = Math.max(Math.min(slotW - 3, 18), 2)

  const yOf = (value: number): number => PAD_Y + USABLE_H - (value / max) * USABLE_H
  const ticks: Tick[] = [max, max / 2, 0].map(value => ({ value, y: yOf(value) }))
  const centreOf = (index: number): number => slotW * index + slotW / 2

  /*
    Snap to the nearest logged day, not to the slot under the finger. On a sparse month most
    slots are empty, and a readout that names an empty day tells the user nothing the gap in
    the bars had not already said.
  */
  nearestRef.current = (x: number): number | null => {
    let best = days[0]
    let bestDistance = Math.abs(centreOf(best.index) - x)
    for (const day of days) {
      const distance = Math.abs(centreOf(day.index) - x)
      if (distance < bestDistance) {
        best = day
        bestDistance = distance
      }
    }
    return best.index
  }

  const activeDay = active === null ? null : (days.find(d => d.index === active) ?? null)
  const goalY = hasGoal ? yOf(goal as number) : 0

  return (
    <View>
      {activeDay ? (
        <ScrubReadout
          left={GUTTER + centreOf(activeDay.index)}
          bounds={GUTTER + plotW}
          width={MACRO_TOOLTIP_W}
        >
          <StatValue size={15}>
            {`${withCommas(activeDay.protein + activeDay.carbs + activeDay.fat)} g`}
          </StatValue>
          <Label>{slotLabel(activeDay.index)}</Label>
          <Body size={11} tone="secondary">
            {'P '}
            <StatValue size={11} color={theme.macro.protein}>
              {Math.round(activeDay.protein)}
            </StatValue>
            {' · C '}
            <StatValue size={11} color={theme.macro.carbs}>
              {Math.round(activeDay.carbs)}
            </StatValue>
            {' · F '}
            <StatValue size={11} color={theme.macro.fat}>
              {Math.round(activeDay.fat)}
            </StatValue>
          </Body>
        </ScrubReadout>
      ) : null}

      <View style={{ flexDirection: 'row' }} {...panHandlers}>
        <YAxis ticks={ticks} format={v => withCommas(v)} />
        <View>
          <Svg width={plotW} height={CHART_H}>
            {ticks.map((tick, i) => (
              <Line
                key={`grid-${i}`}
                x1={0}
                y1={tick.y}
                x2={plotW}
                y2={tick.y}
                stroke={theme.border}
                strokeWidth={1}
              />
            ))}

            {days.map(day => {
              const stack = [
                { key: 'protein', value: day.protein, color: theme.macro.protein },
                { key: 'carbs', value: day.carbs, color: theme.macro.carbs },
                { key: 'fat', value: day.fat, color: theme.macro.fat },
              ]
              const x = slotW * day.index + (slotW - barW) / 2
              // While a bar is held the others recede, so the one being read is unmistakable
              // even at thirty bars to a card.
              const opacity = activeDay === null || activeDay.index === day.index ? 1 : 0.35
              let base = 0
              return stack.map(segment => {
                const top = base + segment.value
                const y = yOf(top)
                const height = Math.max((segment.value / max) * USABLE_H, 0)
                base = top
                if (height <= 0) return null
                return (
                  <Rect
                    key={`${day.index}-${segment.key}`}
                    x={x}
                    y={y}
                    width={barW}
                    height={height}
                    fill={segment.color}
                    fillOpacity={opacity}
                  />
                )
              })
            })}

            {/* Drawn over the bars so a day that clears the goal still shows where the goal was. */}
            {hasGoal ? (
              <Line
                x1={0}
                y1={goalY}
                x2={plotW}
                y2={goalY}
                stroke={theme.textMuted}
                strokeWidth={1.5}
                strokeDasharray="5 4"
              />
            ) : null}
          </Svg>

          {/* Named in React Native text rather than SVG text, like every other figure on the
              chart, and tucked against the right edge where the latest bars are least likely to
              be tall enough to collide with it. */}
          {hasGoal ? (
            <View
              pointerEvents="none"
              style={{ position: 'absolute', right: 2, top: Math.max(goalY - 16, 0) }}
            >
              <StatValue size={11} tone="muted">
                {`Goal ${withCommas(goal as number)} g`}
              </StatValue>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  )
}

/* ------------------------------------------------------------------ *
 * Horizontal bars — training volume by muscle group
 * ------------------------------------------------------------------ */

interface VolumeRow {
  label: string
  value: number
  sets: number
}

const VolumeBars: React.FC<{ width: number; rows: VolumeRow[]; unit: string }> = ({
  width,
  rows,
  unit,
}) => {
  const theme = useTheme()
  if (rows.length === 0) return null

  const max = Math.max(...rows.map(r => r.value), 1)
  const barW = Math.max(width, 1)

  return (
    <View style={{ gap: spacing.md }}>
      {rows.map(row => {
        const fraction = max > 0 ? Math.max(0, Math.min(1, row.value / max)) : 0
        return (
          <View key={row.label} style={{ gap: 6 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                gap: spacing.sm,
              }}
            >
              <Body size={13} weight="medium">
                {row.label}
              </Body>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <StatValue size={15}>{withCommas(row.value)}</StatValue>
                <Body size={11} tone="muted">
                  {unit}
                </Body>
                <Body size={11} tone="muted">
                  {'· '}
                  <StatValue size={11} tone="muted">
                    {row.sets}
                  </StatValue>
                  {' sets'}
                </Body>
              </View>
            </View>
            <Svg width={barW} height={10}>
              <Rect x={0} y={0} width={barW} height={10} rx={5} fill={theme.border} />
              <Rect
                x={0}
                y={0}
                width={Math.max(barW * fraction, fraction > 0 ? 4 : 0)}
                height={10}
                rx={5}
                fill={theme.textSecondary}
              />
            </Svg>
          </View>
        )
      })}
    </View>
  )
}

/* ------------------------------------------------------------------ *
 * Cards
 * ------------------------------------------------------------------ */

const StatTile: React.FC<{
  label: string
  value: string | null
  unit?: string
  /** Shown instead of the figure when there is nothing real to report. */
  fallback?: string
}> = ({ label, value, unit, fallback = 'No data yet' }) => (
  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
    <Label>{label}</Label>
    {value === null ? (
      <Body size={13} tone="muted">
        {fallback}
      </Body>
    ) : (
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <StatValue size={20}>{value}</StatValue>
        {unit ? (
          <Body size={12} tone="muted">
            {unit}
          </Body>
        ) : null}
      </View>
    )}
  </View>
)

const CardHeader: React.FC<{ title: string; caption?: string }> = ({ title, caption }) => (
  <View style={{ gap: 2 }}>
    <SectionTitle>{title}</SectionTitle>
    {caption ? (
      <Body size={12} tone="muted">
        {caption}
      </Body>
    ) : null}
  </View>
)

const TABS: readonly SegmentedOption<TabKey>[] = [
  { value: 'calories', label: 'Calories' },
  { value: 'macros', label: 'Macros' },
  { value: 'weight', label: 'Weight' },
  { value: 'training', label: 'Training' },
]

const RANGES: readonly SegmentedOption<RangeKey>[] = [
  { value: 'day', label: 'Day' },
  { value: '7d', label: 'Week' },
  { value: '30d', label: 'Month' },
  { value: '90d', label: '3M' },
  { value: '1y', label: 'Year' },
]

/*
  Which spans each metric can draw. Day is intake only, and the quarter and the year are weight
  only: body weight is the one series whose story is told in months, while a year of daily
  calorie or macro bars is 365 marks in a phone's width — a texture, not a chart.
*/
const TAB_RANGES: Record<TabKey, readonly RangeKey[]> = {
  calories: ['day', '7d', '30d'],
  macros: ['7d', '30d'],
  weight: ['7d', '30d', '90d', '1y'],
  training: ['7d', '30d'],
}

interface DayStat {
  date: string
  index: number
  calories: number
  protein: number
  carbs: number
  fat: number
  sugar: number
  sodium: number
}


/* ------------------------------------------------------------------ *
 * Day breakdown — one day, by the hour
 * ------------------------------------------------------------------ */

/** Bar height for the busiest hour of the day. */
const HOUR_BAR_MAX = 92

/**
 * A single day's intake, hour by hour.
 *
 * The line chart is wrong at this span: one logged day is one point, and a point plotted
 * between two axis labels both reading the same date says nothing at all. What a day actually
 * has that a week does not is *timing* — every food entry carries a timestamp, and until now
 * nothing in the app read it.
 *
 * So the day view answers questions the other spans cannot: when the calories went in, whether
 * the day front-loads or back-loads, and how much of the target is still open. Fit's Day tab
 * does the same thing with its hourly bars.
 */
const DayBreakdown: React.FC<{
  entries: readonly { hour: number; calories: number }[]
  total: number
  goal: number
}> = ({ entries, total, goal }) => {
  const theme = useTheme()

  const hours = React.useMemo(() => {
    const buckets = Array.from({ length: 24 }, () => 0)
    for (const entry of entries) {
      if (entry.hour >= 0 && entry.hour < 24) buckets[entry.hour] += entry.calories
    }
    return buckets
  }, [entries])

  const busiest = Math.max(...hours, 1)
  const remaining = goal - total
  const over = remaining < 0

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
        <StatValue size={30} color={over ? theme.status.critical : undefined}>
          {withCommas(total)}
        </StatValue>
        <Body size={13} tone="secondary">
          {'of '}
          <StatValue size={13} tone="secondary">
            {withCommas(goal)}
          </StatValue>
          {' kcal'}
        </Body>
      </View>

      <ProgressTrack
        progress={total / Math.max(goal, 1)}
        color={over ? theme.status.critical : theme.brand}
        over={over}
      />

      <Body size={13} tone="secondary">
        {total === 0
          ? 'Nothing logged on this day.'
          : over
            ? `${withCommas(Math.abs(remaining))} kcal over the target.`
            : `${withCommas(remaining)} kcal of the target still open.`}
      </Body>

      <View style={{ gap: 6 }}>
        <Label>By hour</Label>
        <View
          accessible
          accessibilityLabel={
            total === 0
              ? 'No intake to break down by hour'
              : `Intake by hour. Busiest hour holds ${withCommas(busiest)} kilocalories.`
          }
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 2,
            height: HOUR_BAR_MAX,
          }}
        >
          {hours.map((value, hour) => (
            <View
              key={hour}
              style={{ flex: 1, height: HOUR_BAR_MAX, justifyContent: 'flex-end' }}
            >
              <View
                style={{
                  // A hairline for empty hours, so the day reads as 24 slots rather than as
                  // however many happen to hold food.
                  height: value > 0 ? Math.max((value / busiest) * HOUR_BAR_MAX, 4) : 2,
                  borderRadius: 2,
                  backgroundColor: value > 0 ? theme.brand : theme.border,
                }}
              />
            </View>
          ))}
        </View>
        {/* Four labels rather than twenty-four: the bars carry the shape, and a legible axis
            matters more than naming every hour. */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {['00', '06', '12', '18', '24'].map(mark => (
            <StatValue key={mark} size={11} tone="muted">
              {mark}
            </StatValue>
          ))}
        </View>
      </View>
    </View>
  )
}

/* ------------------------------------------------------------------ *
 * Screen
 * ------------------------------------------------------------------ */

const isTabKey = (value: string | undefined): value is TabKey =>
  value === 'calories' || value === 'macros' || value === 'weight' || value === 'training'

const isRangeKey = (value: string | undefined): value is RangeKey =>
  value !== undefined && Object.prototype.hasOwnProperty.call(RANGE_DAYS, value)

export default function ProgressScreen() {
  const theme = useTheme()
  /*
    The metric can arrive as a param so cards elsewhere can open the one they are about — the
    dashboard's Today card lands on Calories rather than dropping the user on this screen to
    find their way back to what they tapped. Unrecognised or absent values fall back to
    Calories, which is what this screen opened on before it took params at all.
  */
  /*
    Global, not local. useLocalSearchParams only reports params while its route is the active
    one, and this screen is a tab: it stays mounted in the background, so a link fired from the
    dashboard changed the URL and this screen never heard about it. The metric arrived, the tab
    did not move, and the link looked like it did nothing.
  */
  const params = useGlobalSearchParams<{ metric?: string; range?: string }>()
  const [tab, setTab] = useState<TabKey>(isTabKey(params.metric) ? params.metric : 'calories')
  const [range, setRange] = useState<RangeKey>('7d')
  /*
    Which day the Day range is showing. Separate from `range` because moving the cursor must not
    reset the span, and switching to Week and back should return to the day you were on.
  */
  const [day, setDay] = useState(getTodayString())

  const diary = useStore(s => s.diary)
  const goals = useStore(s => s.goals)
  const weightLog = useStore(s => s.weightLog)
  const workoutLog = useStore(s => s.workoutLog)
  const weightUnit = useStore(s => s.profile.weightUnit)

  const router = useRouter()

  /*
    The initial state above only runs once, and a tab screen stays mounted for the life of the
    app — so without this, the first card to send someone here would decide the metric forever
    and every later link would be silently ignored.

    The param is cleared once applied. Otherwise it keeps applying: pick Weight by hand, leave
    via the tab bar, come back the same way, and a stale `metric=calories` from an hour ago
    would drag you off the tab you chose.
  */
  useEffect(() => {
    if (!isTabKey(params.metric)) return
    setTab(params.metric)
    router.setParams({ metric: undefined })
  }, [params.metric, router])

  /*
    The span can arrive as a param too, so the dashboard's Intake ring lands on the day it was
    showing rather than on whatever span this screen was last left in. Cleared once applied, for
    the same reason the metric is: a stale param must not drag the user off a span they chose.
  */
  useEffect(() => {
    if (!isRangeKey(params.range)) return
    setRange(params.range)
    if (params.range === 'day') setDay(getTodayString())
    router.setParams({ range: undefined })
  }, [params.range, router])

  /*
    Each tab offers only the spans it can draw (see TAB_RANGES). Day on any tab but Calories
    would be a chart of one point — the same degenerate view the calorie day replaced — and a
    year of daily bars is a comb. So a tab switch carries a span the new tab cannot draw back to
    the nearest one it can: Day to the week, the quarter and the year to the month.

    Offering a control that produces a broken view is worse than not offering it: the user reads
    the empty chart as missing data rather than as a span this screen does not answer.
  */
  useEffect(() => {
    if (TAB_RANGES[tab].includes(range)) return
    setRange(range === 'day' ? '7d' : '30d')
  }, [range, tab])

  const unitLabel = weightUnit === 'lbs' ? 'lb' : 'kg'
  // Volume comes out of workoutMath in kg. Convert only here, at the display edge.
  const toDisplayWeight = (kg: number): number => (weightUnit === 'lbs' ? kgToLbs(kg) : kg)

  const dates = useMemo(
    /*
      Day is the one range that is not "the last N days ending now": it is a single chosen day,
      so it carries its own cursor and the arrows move it. Week and month stay anchored to
      today, which is what makes them comparable from one visit to the next.
    */
    () => (range === 'day' ? [day] : lastDays(RANGE_DAYS[range])),
    [range, day]
  )
  const slots = dates.length

  const dayStats = useMemo<DayStat[]>(() => {
    const out: DayStat[] = []
    dates.forEach((date, index) => {
      const day = diary[date] as DiaryDay | undefined
      if (!day) return
      const entries = Array.isArray(day.entries) ? day.entries : []
      if (entries.length === 0) return
      const exercises = Array.isArray(day.exercises) ? day.exercises : []
      const nutrition = getDayNutrition({ ...day, entries, exercises })
      out.push({
        date,
        index,
        calories: nutrition.calories,
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        fat: nutrition.fat,
        sugar: nutrition.sugar,
        sodium: nutrition.sodium,
      })
    })
    return out
  }, [dates, diary])

  /*
    The selected day's entries reduced to (hour, calories). Only built for the day range, since
    nothing else reads timestamps — a month of them would be work for a view that never shows
    the result.
  */
  const dayHours = useMemo(() => {
    if (range !== 'day') return []
    const stored = diary[day]
    if (!stored) return []
    return (stored.entries ?? []).map(entry => ({
      hour: new Date(entry.timestamp).getHours(),
      calories: entry.food.calories * entry.servings,
    }))
  }, [range, diary, day])

  const dayTotal = useMemo(
    () => dayHours.reduce((sum, entry) => sum + entry.calories, 0),
    [dayHours]
  )

  const loggedDays = dayStats.length

  /*
    Averages run over finished days only. Today is still plotted — it is a real data point and
    the chart is a record of what happened — but it is a day in progress, and at lunchtime it
    holds one meal. With a 7-day range and a single logged day that produced "You averaged
    1,727 kcal below goal", which described nothing except the hour of the afternoon.

    "Days logged" keeps counting today, because it is logged. The two figures answer different
    questions and it would be worse to make either of them lie to match the other. The
    dashboard's week card splits them the same way.
  */
  const today = getTodayString()
  const settledStats = useMemo(() => dayStats.filter(d => d.date !== today), [dayStats, today])
  const settledDays = settledStats.length
  const average = (pick: (d: DayStat) => number): number | null =>
    settledDays > 0 ? settledStats.reduce((total, d) => total + pick(d), 0) / settledDays : null

  const avgCalories = average(d => d.calories)
  const avgProtein = average(d => d.protein)
  const avgCarbs = average(d => d.carbs)
  const avgFat = average(d => d.fat)
  const avgSugar = average(d => d.sugar)
  const avgSodium = average(d => d.sodium)

  // weightLog stores each entry in the unit the user was using — no conversion here.
  const weightPoints = useMemo(() => {
    const indexByDate = new Map(dates.map((date, index) => [date, index]))
    return (Array.isArray(weightLog) ? weightLog : [])
      .filter(w => indexByDate.has(w.date) && Number.isFinite(w.weight))
      .map(w => ({ index: indexByDate.get(w.date) ?? 0, value: w.weight, date: w.date }))
      .sort((a, b) => a.index - b.index)
  }, [dates, weightLog])

  /*
    What the weight chart actually plots. A year of daily slots puts 365 x positions across
    roughly 300 pixels, and someone who weighs in every morning gets a line that zigzags on
    every pixel — a comb, with the trend buried in day-to-day water. Weekly means are what a
    year is read in, and they are what Fit draws at this span too.

    Weeks are counted back from today so the last one ends on today rather than being a
    fragment of a week that has barely started.
  */
  const weightSeries = useMemo(() => {
    if (range !== '1y') {
      return {
        slots,
        points: weightPoints.map(p => ({ index: p.index, value: p.value })),
        slotLabel: (index: number) => formatDate(dates[index]),
        startOf: (index: number) => dates[index],
      }
    }
    const weeks = Math.ceil(slots / 7)
    const offset = weeks * 7 - slots
    const startOf = (week: number): string => dates[Math.max(week * 7 - offset, 0)]
    const sums = new Map<number, { total: number; count: number }>()
    for (const point of weightPoints) {
      const week = Math.floor((point.index + offset) / 7)
      const bucket = sums.get(week) ?? { total: 0, count: 0 }
      bucket.total += point.value
      bucket.count += 1
      sums.set(week, bucket)
    }
    return {
      slots: weeks,
      points: [...sums.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([week, bucket]) => ({ index: week, value: bucket.total / bucket.count })),
      slotLabel: (week: number) => `Week of ${formatDate(startOf(week))}`,
      startOf,
    }
  }, [range, slots, dates, weightPoints])

  const firstWeight = weightPoints[0]
  const lastWeight = weightPoints[weightPoints.length - 1]
  const weightDelta =
    firstWeight && lastWeight && weightPoints.length >= 2
      ? lastWeight.value - firstWeight.value
      : null

  const dateSet = useMemo(() => new Set(dates), [dates])
  const sessionsInRange = useMemo(
    () => (Array.isArray(workoutLog) ? workoutLog : []).filter(s => dateSet.has(s.date)),
    [workoutLog, dateSet]
  )
  const totalVolumeKg = sessionsInRange.reduce((total, s) => total + sessionVolume(s), 0)
  const totalSets = sessionsInRange.reduce((total, s) => total + sessionSetCount(s), 0)

  const volumeRows = useMemo<VolumeRow[]>(
    () =>
      weeklyVolumeByMuscle(workoutLog, slots / 7, getTodayString()).map(row => ({
        label: row.muscleGroup,
        value: toDisplayWeight(row.volumeKg),
        sets: row.sets,
      })),
    // toDisplayWeight is a pure function of weightUnit, which is listed here.
    [workoutLog, slots, weightUnit]
  )

  const recentPRs = useMemo(
    () =>
      getPersonalRecords(workoutLog)
        .sort((a, b) => b.achievedOn.localeCompare(a.achievedOn))
        .slice(0, 4),
    [workoutLog]
  )

  /*
    The span in words, for screen readers and empty states only. The range control is the one
    place the period is shown; captions and headers used to repeat it until the same "last 7
    days" appeared four times on one screen.
  */
  const rangeWords =
    range === 'day'
      ? formatDate(day)
      : range === '1y'
        ? 'last 12 months'
        : `last ${RANGE_DAYS[range]} days`

  /* --------------------------- Calories --------------------------- */

  /*
    The day gets its own card rather than a one-point line chart, and it replaces the Summary
    too: an average over a single day is either that day's total or nothing, and "Avg intake"
    over one date is a label with no meaning behind it.
  */
  const caloriesTab = range === 'day' ? (
    <Surface style={{ padding: spacing.lg, gap: spacing.lg }}>
      <CardHeader title="Calories" />
      <DayBreakdown entries={dayHours} total={Math.round(dayTotal)} goal={goals.calories} />
    </Surface>
  ) : (
    <>
      <Surface style={{ padding: spacing.lg, gap: spacing.lg }}>
        <CardHeader title="Calories" caption="Intake per day" />
        {loggedDays === 0 ? (
          <EmptyState
            icon={<Utensils size={24} color={theme.textMuted} strokeWidth={1.8} />}
            title="Nothing logged yet"
            message={`Add food in the Diary tab and your intake for the ${rangeWords} will chart here.`}
          />
        ) : (
          <>
            <Legend
              items={[
                { label: 'Intake', color: theme.text },
                { label: 'Goal', color: theme.textMuted, dashed: true },
              ]}
            />
            <ChartArea
              accessibilityLabel={`Calorie intake chart for the ${rangeWords}. ${loggedDays} days logged, averaging ${
                avgCalories === null ? 'no' : withCommas(avgCalories)
              } calories against a goal of ${withCommas(goals.calories)}.`}
            >
              {width => (
                <View>
                  <LineChart
                    width={width}
                    slots={slots}
                    points={dayStats.map(d => ({ index: d.index, value: d.calories }))}
                    color={theme.text}
                    fillToZero
                    connectGaps={false}
                    goal={goals.calories}
                    goalColor={theme.textMuted}
                    showDots={slots <= 7}
                    format={withCommas}
                    slotLabel={index => formatDate(dates[index])}
                    unit="kcal"
                  />
                  <AxisDates from={dates[0]} to={dates[slots - 1]} />
                </View>
              )}
            </ChartArea>
          </>
        )}
      </Surface>

      <Surface style={{ padding: spacing.lg, gap: spacing.lg }}>
        <CardHeader title="Summary" />
        <View style={{ flexDirection: 'row', gap: spacing.lg }}>
          <StatTile
            label="Avg intake"
            value={avgCalories === null ? null : withCommas(avgCalories)}
            unit="kcal"
          />
          <StatTile label="Daily goal" value={withCommas(goals.calories)} unit="kcal" />
          <StatTile label="Days logged" value={`${loggedDays}/${slots}`} />
        </View>
        {avgCalories === null ? (
          /* An "Avg intake —" with nothing next to it reads as a bug rather than as a screen
             waiting for data, and the reason differs: either today is the only logged day and
             is not finished, or the range is genuinely empty. */
          <Body size={13} tone="secondary">
            {loggedDays > 0
              ? 'Today is still in progress, so it is not in the average yet.'
              : `Nothing logged in the ${rangeWords}.`}
          </Body>
        ) : Math.round(avgCalories) === Math.round(goals.calories) ? (
          <Body size={13} tone="secondary">
            You averaged exactly your calorie goal.
          </Body>
        ) : (
          <Body size={13} tone="secondary">
            {'You averaged '}
            <StatValue size={13} tone="secondary">
              {withCommas(Math.abs(avgCalories - goals.calories))}
            </StatValue>
            {avgCalories > goals.calories ? ' kcal above goal.' : ' kcal below goal.'}
          </Body>
        )}
      </Surface>
    </>
  )

  /* ---------------------------- Macros ---------------------------- */

  const macroRows: { key: string; label: string; avg: number | null; goal: number; color: string }[] =
    [
      { key: 'protein', label: 'Protein', avg: avgProtein, goal: goals.protein, color: theme.macro.protein },
      { key: 'carbs', label: 'Carbs', avg: avgCarbs, goal: goals.carbs, color: theme.macro.carbs },
      { key: 'fat', label: 'Fat', avg: avgFat, goal: goals.fat, color: theme.macro.fat },
    ]

  const macrosTab = (
    <>
      <Surface style={{ padding: spacing.lg, gap: spacing.lg }}>
        <CardHeader title="Macros" caption="Grams per day" />
        {loggedDays === 0 ? (
          <EmptyState
            icon={<Utensils size={24} color={theme.textMuted} strokeWidth={1.8} />}
            title="No macros to chart"
            message="Log a meal in the Diary tab and the protein, carb and fat split will build up here."
          />
        ) : (
          <>
            <Legend
              items={[
                { label: 'Protein', color: theme.macro.protein },
                { label: 'Carbs', color: theme.macro.carbs },
                { label: 'Fat', color: theme.macro.fat },
              ]}
            />
            <ChartArea
              accessibilityLabel={`Stacked macro chart for the ${rangeWords}, in grams per day.`}
            >
              {width => (
                <View>
                  <MacroBars
                    width={width}
                    slots={slots}
                    goal={goals.protein + goals.carbs + goals.fat}
                    slotLabel={index => formatDate(dates[index])}
                    days={dayStats.map(d => ({
                      index: d.index,
                      protein: d.protein,
                      carbs: d.carbs,
                      fat: d.fat,
                    }))}
                  />
                  <AxisDates from={dates[0]} to={dates[slots - 1]} />
                </View>
              )}
            </ChartArea>
          </>
        )}
      </Surface>

      <Surface style={{ padding: spacing.lg, gap: spacing.lg }}>
        <CardHeader title="Average vs goal" caption="Daily average across your logged days" />
        {loggedDays === 0 ? (
          <Body size={13} tone="muted">
            Nothing logged in the {rangeWords}.
          </Body>
        ) : (
          <View style={{ gap: spacing.md }}>
            {macroRows.map(row => (
              <View key={row.key} style={{ gap: 6 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                  }}
                >
                  <Body size={13} weight="medium">
                    {row.label}
                  </Body>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                    <StatValue size={15} color={row.color}>
                      {row.avg === null ? '' : Math.round(row.avg)}
                    </StatValue>
                    <Body size={12} tone="muted">
                      {'/ '}
                      <StatValue size={12} tone="muted">
                        {row.goal}
                      </StatValue>
                      {' g'}
                    </Body>
                  </View>
                </View>
                <ProgressTrack
                  progress={row.goal > 0 && row.avg !== null ? row.avg / row.goal : 0}
                  color={row.color}
                />
              </View>
            ))}
          </View>
        )}
      </Surface>

      {loggedDays > 0 ? (
        <Surface style={{ padding: spacing.lg, gap: spacing.md }}>
          {/* Sugar and sodium are not macros — neutral stone, named directly. */}
          <CardHeader title="Also tracked" caption="Daily average" />
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <StatTile
              label="Sugar"
              value={avgSugar === null ? null : String(Math.round(avgSugar))}
              unit="g"
            />
            <StatTile
              label="Sodium"
              value={avgSodium === null ? null : withCommas(avgSodium)}
              unit="mg"
            />
          </View>
        </Surface>
      ) : null}
    </>
  )

  /* ---------------------------- Weight ---------------------------- */

  // Direction is stated in words first; the icon follows the word, never the raw sign, so a
  // 0.02 kg drift never reads as "up" next to a "No change" label.
  const directionWord =
    weightDelta === null ? '' : weightDelta > 0.05 ? 'Up' : weightDelta < -0.05 ? 'Down' : 'No change'
  const DirectionIcon =
    directionWord === 'Up' ? TrendingUp : directionWord === 'Down' ? TrendingDown : Minus

  const weightTab = (
    <>
      {/*
        The tab that answers "is my weight going the right way" had no way to weigh in and
        no on-track verdict — it sent people to another tab to do the one thing this screen
        is about. This is the same card the dashboard uses.
      */}
      <WeightTargetCard />

      <Surface style={{ padding: spacing.lg, gap: spacing.lg }}>
        <CardHeader
          title="Weight"
          caption={range === '1y' ? `Weekly average, in ${unitLabel}` : `Weigh-ins in ${unitLabel}`}
        />
        {weightPoints.length === 0 ? (
          <EmptyState
            icon={<Scale size={24} color={theme.textMuted} strokeWidth={1.8} />}
            title="No weigh-ins yet"
            message={`Add today's weight above. Two entries in the ${rangeWords} draw a trend.`}
          />
        ) : (
          <ChartArea
            accessibilityLabel={`Weight chart for the ${rangeWords}, in ${unitLabel}. ${weightPoints.length} entries.`}
          >
            {width => (
              <View>
                <LineChart
                  width={width}
                  slots={weightSeries.slots}
                  points={weightSeries.points}
                  color={theme.text}
                  fillToZero={false}
                  connectGaps
                  // Past a month the dots touch and become a second, thicker line.
                  showDots={weightSeries.slots <= 31}
                  format={oneDecimal}
                  slotLabel={weightSeries.slotLabel}
                  unit={unitLabel}
                />
                {range === '1y' ? (
                  <MonthAxis
                    width={width}
                    slots={weightSeries.slots}
                    startOf={weightSeries.startOf}
                  />
                ) : (
                  <AxisDates from={dates[0]} to={dates[slots - 1]} />
                )}
              </View>
            )}
          </ChartArea>
        )}
      </Surface>

      <Surface style={{ padding: spacing.lg, gap: spacing.lg }}>
        <CardHeader title="Summary" />
        <View style={{ flexDirection: 'row', gap: spacing.lg }}>
          <StatTile
            label="Entries"
            value={weightPoints.length > 0 ? String(weightPoints.length) : null}
          />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Label>Change</Label>
            {weightDelta === null ? (
              <Body size={13} tone="muted">
                Needs 2 weigh-ins
              </Body>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <DirectionIcon size={16} color={theme.textSecondary} strokeWidth={2} />
                <Body size={13} weight="semibold" tone="secondary">
                  {directionWord}
                </Body>
                {directionWord === 'No change' ? null : (
                  <>
                    <StatValue size={17}>{oneDecimal(Math.abs(weightDelta))}</StatValue>
                    <Body size={12} tone="muted">
                      {unitLabel}
                    </Body>
                  </>
                )}
              </View>
            )}
          </View>
        </View>
        {firstWeight && lastWeight && weightDelta !== null ? (
          <Body size={13} tone="secondary">
            {directionWord === 'No change'
              ? 'Your weight held steady from '
              : `${directionWord} `}
            {directionWord === 'No change' ? null : (
              <>
                <StatValue size={13} tone="secondary">
                  {oneDecimal(Math.abs(weightDelta))}
                </StatValue>
                {` ${unitLabel} from `}
              </>
            )}
            <StatValue size={13} tone="secondary">
              {formatDate(firstWeight.date)}
            </StatValue>
            {' to '}
            <StatValue size={13} tone="secondary">
              {formatDate(lastWeight.date)}
            </StatValue>
            .
          </Body>
        ) : null}
      </Surface>

    </>
  )

  /* --------------------------- Training --------------------------- */

  const trainingTab = (
    <>
      <Surface style={{ padding: spacing.lg, gap: spacing.lg }}>
        <CardHeader title="Volume by muscle" caption={`Volume load in ${unitLabel}`} />
        {volumeRows.length === 0 ? (
          <EmptyState
            icon={<Dumbbell size={24} color={theme.textMuted} strokeWidth={1.8} />}
            title="No sets logged"
            message={`Finish a workout with completed sets and the ${rangeWords} of volume will break down by muscle group here.`}
          />
        ) : (
          <ChartArea
            accessibilityLabel={`Training volume by muscle group over the ${rangeWords}, in ${unitLabel}.`}
          >
            {width => <VolumeBars width={width} rows={volumeRows} unit={unitLabel} />}
          </ChartArea>
        )}
      </Surface>

      <Surface style={{ padding: spacing.lg, gap: spacing.lg }}>
        <CardHeader title="Summary" />
        <View style={{ flexDirection: 'row', gap: spacing.lg }}>
          <StatTile
            label="Sessions"
            value={sessionsInRange.length > 0 ? String(sessionsInRange.length) : null}
            fallback="None yet"
          />
          <StatTile
            label="Total volume"
            value={totalVolumeKg > 0 ? withCommas(toDisplayWeight(totalVolumeKg)) : null}
            unit={unitLabel}
            fallback="None yet"
          />
          <StatTile
            label="Working sets"
            value={totalSets > 0 ? String(totalSets) : null}
            fallback="None yet"
          />
        </View>
      </Surface>

      <Surface style={{ padding: spacing.lg, gap: spacing.lg }}>
        <CardHeader title="Personal records" caption="Best estimated 1RM per lift" />
        {recentPRs.length === 0 ? (
          <EmptyState
            icon={<Trophy size={24} color={theme.textMuted} strokeWidth={1.8} />}
            title="No records yet"
            message="Complete a working set with weight on it and your first PR lands here."
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {recentPRs.map(pr => (
              <View
                key={pr.liftId}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: spacing.md,
                }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Body size={15} weight="medium" numberOfLines={1}>
                    {pr.liftName}
                  </Body>
                  <Body size={11} tone="muted">
                    {pr.achievedOn ? formatDate(pr.achievedOn) : 'Date not recorded'}
                  </Body>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                  <StatValue size={17}>
                    {oneDecimal(toDisplayWeight(pr.bestEstimated1RM))}
                  </StatValue>
                  <Body size={12} tone="muted">
                    {unitLabel} e1RM
                  </Body>
                </View>
              </View>
            ))}
          </View>
        )}
      </Surface>
    </>
  )

  return (
    <Screen
      title="Progress"
      right={
        <IconButton accessibilityLabel="Open the assistant" onPress={() => router.push('/chat')}>
          <Sparkles size={20} color={theme.brandText} strokeWidth={2} />
        </IconButton>
      }
    >
      <View style={{ gap: spacing.md }}>
        <Segmented options={TABS} value={tab} onChange={setTab} />
        {/* Full width, and the only statement of the period on the screen. */}
        <Segmented
          options={RANGES.filter(r => TAB_RANGES[tab].includes(r.value))}
          value={range}
          onChange={setRange}
        />

        {/* Only the Day range has a cursor to move. The other spans stay anchored to today,
            which is what keeps them comparable between visits. */}
        {range === 'day' ? (
          <DateNavigator date={day} today={getTodayString()} onChange={setDay} />
        ) : null}
      </View>

      {tab === 'calories' ? caloriesTab : null}
      {tab === 'macros' ? macrosTab : null}
      {tab === 'weight' ? weightTab : null}
      {tab === 'training' ? trainingTab : null}
    </Screen>
  )
}
