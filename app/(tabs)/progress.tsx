import React, { useEffect, useMemo, useRef, useState } from 'react'
import { PanResponder, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg'
import { useGlobalSearchParams, useRouter } from 'expo-router'
import {
  Activity,
  Dumbbell,
  Flame,
  Minus,
  RefreshCw,
  Scale,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trophy,
  Utensils,
} from 'lucide-react-native'

import { Button, IconButton } from '@/components/Button'
import { Surface } from '@/components/Glass'
import { EmptyState, Screen } from '@/components/Layout'
import { ProgressTrack } from '@/components/MacroRing'
import { Body, Label, SectionTitle, StatValue } from '@/components/Text'
import { WeightTargetCard } from '@/components/WeightTarget'
import { useStore } from '@/store/useStore'
import { useTheme } from '@/theme/useTheme'
import { HIT_SIZE, radius, spacing } from '@/theme/tokens'
import {
  formatDate,
  getDayNutrition,
  getLast7Days,
  getLast30Days,
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
/** Scrub readout width. Wide enough for '2,427 kcal' plus a date under it. */
const TOOLTIP_W = 116

const RANGE_DAYS = { '7d': 7, '30d': 30 } as const

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
  /** One date per slot, so a scrubbed point can say which day it is. */
  dates?: readonly string[]
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
  dates,
  unit,
}) => {
  const theme = useTheme()

  /*
    Press and drag to read the series. At this width a 30-day chart puts its points about ten
    pixels apart, which is under half a fingertip: without scrubbing the only way to know what
    a dot is worth is to count gridlines and guess.

    The index is kept in state and the hit-testing in a ref. PanResponder is built once, so a
    handler that closed over `points` directly would still be reading the first render's data
    a week later; the ref is reassigned on every render and the handlers call through it.
  */
  const [active, setActive] = useState<number | null>(null)
  const nearestRef = useRef<(x: number) => number | null>(() => null)

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // The chart lives inside a ScrollView. Granting termination lets a vertical drag that
      // started on the chart still scroll the page instead of trapping the finger.
      onPanResponderTerminationRequest: () => true,
      onPanResponderGrant: event => setActive(nearestRef.current(event.nativeEvent.locationX)),
      onPanResponderMove: event => setActive(nearestRef.current(event.nativeEvent.locationX)),
      onPanResponderRelease: () => setActive(null),
      onPanResponderTerminate: () => setActive(null),
    })
  ).current

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
  const activeDate = activePoint === null ? undefined : dates?.[activePoint.index]

  return (
    <View>
      {activePoint ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            // Clamped so a reading at either end stays on screen instead of hanging off it.
            left: Math.min(Math.max(GUTTER + activeX - TOOLTIP_W / 2, 0), GUTTER + plotW - TOOLTIP_W),
            width: TOOLTIP_W,
            zIndex: 2,
            alignItems: 'center',
            gap: 1,
            paddingVertical: 6,
            borderRadius: radius.control,
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: theme.border,
            backgroundColor: theme.surfaceRaised,
          }}
        >
          <StatValue size={15}>{`${format(activePoint.value)}${unit ? ` ${unit}` : ''}`}</StatValue>
          {activeDate ? <Label>{formatDate(activeDate)}</Label> : null}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row' }} {...responder.panHandlers}>
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

const MacroBars: React.FC<{ width: number; slots: number; days: MacroDay[] }> = ({
  width,
  slots,
  days,
}) => {
  const theme = useTheme()
  if (days.length === 0) return null

  const plotW = Math.max(width - GUTTER, 1)
  const totals = days.map(d => d.protein + d.carbs + d.fat)
  const max = niceMax(Math.max(...totals, 1))
  const slotW = plotW / Math.max(slots, 1)
  const barW = Math.max(Math.min(slotW - 3, 18), 2)

  const yOf = (value: number): number => PAD_Y + USABLE_H - (value / max) * USABLE_H
  const ticks: Tick[] = [max, max / 2, 0].map(value => ({ value, y: yOf(value) }))

  return (
    <View style={{ flexDirection: 'row' }}>
      <YAxis ticks={ticks} format={v => withCommas(v)} />
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
              />
            )
          })
        })}
      </Svg>
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
 * Controls
 * ------------------------------------------------------------------ */

interface SegmentedOption<T extends string> {
  key: T
  label: string
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  groupLabel,
}: {
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (next: T) => void
  groupLabel: string
}) {
  const theme = useTheme()
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        gap: 4,
        padding: 4,
        borderRadius: radius.control,
        backgroundColor: theme.surface,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: theme.border,
      }}
    >
      {options.map(option => {
        const selected = option.key === value
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${groupLabel}: ${option.label}`}
            onPress={() => onChange(option.key)}
            style={{
              flex: 1,
              minHeight: HIT_SIZE,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.tight,
              backgroundColor: selected ? theme.brand : 'transparent',
            }}
          >
            <Body
              size={13}
              weight={selected ? 'semibold' : 'medium'}
              style={{ color: selected ? theme.brandOn : theme.textSecondary }}
            >
              {option.label}
            </Body>
          </Pressable>
        )
      })}
    </View>
  )
}

const StatTile: React.FC<{
  label: string
  value: string | null
  unit?: string
  /** Shown instead of the figure when there is nothing real to report. */
  fallback?: string
}> = ({ label, value, unit, fallback = 'No data yet' }) => (
  <View style={{ flex: 1, gap: 4, minWidth: 92 }}>
    <Label>{label}</Label>
    {value === null ? (
      <Body size={13} tone="muted">
        {fallback}
      </Body>
    ) : (
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <StatValue size={22}>{value}</StatValue>
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
  { key: 'calories', label: 'Calories' },
  { key: 'macros', label: 'Macros' },
  { key: 'weight', label: 'Weight' },
  { key: 'training', label: 'Training' },
]

const RANGES: readonly SegmentedOption<RangeKey>[] = [
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
]

const TAB_CAPTION: Record<TabKey, string> = {
  calories: 'Daily intake against your goal',
  macros: 'Protein, carbs and fat per day',
  weight: 'Every weigh-in you logged',
  training: 'Volume load and personal records',
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
 * Screen
 * ------------------------------------------------------------------ */

const isTabKey = (value: string | undefined): value is TabKey =>
  value === 'calories' || value === 'macros' || value === 'weight' || value === 'training'

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
  const params = useGlobalSearchParams<{ metric?: string }>()
  const [tab, setTab] = useState<TabKey>(isTabKey(params.metric) ? params.metric : 'calories')
  const [range, setRange] = useState<RangeKey>('7d')

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

  const unitLabel = weightUnit === 'lbs' ? 'lb' : 'kg'
  // Volume comes out of workoutMath in kg. Convert only here, at the display edge.
  const toDisplayWeight = (kg: number): number => (weightUnit === 'lbs' ? kgToLbs(kg) : kg)

  const dates = useMemo(
    () => (range === '7d' ? getLast7Days() : getLast30Days()),
    [range]
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

  const rangeWords = range === '7d' ? 'last 7 days' : 'last 30 days'

  /* --------------------------- Calories --------------------------- */

  const caloriesTab = (
    <>
      <Surface style={{ padding: spacing.lg, gap: spacing.lg }}>
        <CardHeader title="Calories" caption={`Intake per day, ${rangeWords}`} />
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
                    dates={dates}
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
        <CardHeader title="Macros" caption={`Grams per day, ${rangeWords}`} />
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
                    <StatValue size={16} color={row.color}>
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
        <CardHeader title="Weight" caption={`Weigh-ins in ${unitLabel}, ${rangeWords}`} />
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
                  slots={slots}
                  points={weightPoints.map(p => ({ index: p.index, value: p.value }))}
                  color={theme.text}
                  fillToZero={false}
                  connectGaps
                  showDots
                  format={oneDecimal}
                  dates={dates}
                  unit={unitLabel}
                />
                <AxisDates from={dates[0]} to={dates[slots - 1]} />
              </View>
            )}
          </ChartArea>
        )}
      </Surface>

      <Surface style={{ padding: spacing.lg, gap: spacing.lg }}>
        <CardHeader title="Summary" />
        <View style={{ flexDirection: 'row', gap: spacing.lg }}>
          <StatTile
            label="Latest"
            value={lastWeight ? oneDecimal(lastWeight.value) : null}
            unit={unitLabel}
          />
          <StatTile
            label="Entries"
            value={weightPoints.length > 0 ? String(weightPoints.length) : null}
          />
          <View style={{ flex: 1, gap: 4, minWidth: 92 }}>
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
                    <StatValue size={18}>{oneDecimal(Math.abs(weightDelta))}</StatValue>
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
        <CardHeader title="Volume by muscle" caption={`Volume load in ${unitLabel}, ${rangeWords}`} />
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
                  <Body size={14} weight="medium" numberOfLines={1}>
                    {pr.liftName}
                  </Body>
                  <Body size={11} tone="muted">
                    {pr.achievedOn ? formatDate(pr.achievedOn) : 'Date not recorded'}
                  </Body>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                  <StatValue size={18}>
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

  const tabIcon =
    tab === 'calories' ? (
      <Flame size={16} color={theme.textMuted} strokeWidth={2} />
    ) : tab === 'macros' ? (
      <Utensils size={16} color={theme.textMuted} strokeWidth={2} />
    ) : tab === 'weight' ? (
      <Scale size={16} color={theme.textMuted} strokeWidth={2} />
    ) : (
      <Dumbbell size={16} color={theme.textMuted} strokeWidth={2} />
    )

  return (
    <Screen
      title="Progress"
      subtitle={TAB_CAPTION[tab]}
      right={
        <IconButton accessibilityLabel="Open AI Assistant" onPress={() => router.push('/chat')}>
          <Sparkles size={20} color={theme.brandText} strokeWidth={2} />
        </IconButton>
      }
    >
      <View style={{ gap: spacing.md }}>
        <Segmented options={TABS} value={tab} onChange={setTab} groupLabel="Metric" />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.md,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
            {tabIcon}
            <Label>{rangeWords}</Label>
          </View>
          <View style={{ width: 132 }}>
            <Segmented options={RANGES} value={range} onChange={setRange} groupLabel="Range" />
          </View>
        </View>
      </View>

      {tab === 'calories' ? caloriesTab : null}
      {tab === 'macros' ? macrosTab : null}
      {tab === 'weight' ? weightTab : null}
      {tab === 'training' ? trainingTab : null}
    </Screen>
  )
}
