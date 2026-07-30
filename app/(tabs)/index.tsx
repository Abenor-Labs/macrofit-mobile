import React, { useMemo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
/*
  `useRouter` rather than `<Link asChild>` for every tappable card on this screen, and it has
  to stay that way. `asChild` renders through Radix's Slot, whose prop merge does
  `style: { ...slotStyle, ...childStyle }` (@radix-ui/react-slot mergeProps). Pressable's
  style is a FUNCTION of the press state, and spreading a function yields `{}` — so the child
  silently loses every style it declared. It cost a dashboard where the meal rows stacked
  vertically because `flexDirection: 'row'` had been deleted at render time.

  That symptom then returned from a second, unrelated direction: NativeWind's JSX interop was
  resolving function-form styles away too, so the meal rows stacked again and the water
  quick-add buttons lost their borders and their 44dp targets. NativeWind has been removed
  (nothing in the app ever used a className), which is what fixed it. Two different libraries,
  one failure mode — anything that sits between this file's JSX and the native view is a
  suspect the moment a row goes vertical.
*/
import { useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Cookie,
  Droplets,
  Dumbbell,
  Flame,
  Minus,
  Moon,
  Sparkles,
  Sun,
  Sunrise,
} from 'lucide-react-native'

import type { DiaryDay, MealType, NutritionSummary, PhaseType, Recommendation } from '@core/types'
import { formatDate, getDayNutrition, getTodayString } from '@core/utils/calculations'

import { useStore } from '@/store/useStore'
import { useTheme, type Theme } from '@/theme/useTheme'
import { GlassSurface, Surface } from '@/components/Glass'
import { MacroRing, ProgressTrack } from '@/components/MacroRing'
import { Body, Label, SectionTitle, StatValue } from '@/components/Text'
import { IconButton } from '@/components/Button'
import { Screen } from '@/components/Layout'
import { StepsCard } from '@/components/StepsCard'
import { WeightTargetCard, WeightVerdict } from '@/components/WeightTarget'
import { HIT_SIZE, jade, radius, spacing } from '@/theme/tokens'

/**
 * Grouped thousands without Intl.
 *
 * Hermes ships Intl, but every figure on this screen is tabular and has to line up the
 * same way on every device — locale data resolving differently on one Android build would
 * silently change the separator and the column width with it.
 */
const formatNumber = (value: number): string =>
  Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

/** The four meals the dashboard summarises; pre/post-workout stay in the diary itself. */
const MEALS: readonly MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snacks']

type IconComponent = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>

const MEAL_ICONS: Record<string, IconComponent> = {
  Breakfast: Sunrise,
  Lunch: Sun,
  Dinner: Moon,
  Snacks: Cookie,
}

const PHASE_LABELS: Record<PhaseType, string> = {
  cut: 'Cut',
  lean_bulk: 'Lean bulk',
  maintain: 'Maintain',
  recomp: 'Recomp',
}

const QUICK_ADD_ML = [150, 250, 350, 500] as const

type MealTotals = Record<string, { calories: number; count: number }>

type Tone = 'good' | 'warning' | 'critical'

/** Two-stop wash, written as the tuple LinearGradient's props require. */
type Wash = readonly [string, string, ...string[]]

const heroWash = (theme: Theme): Wash =>
  theme.mode === 'dark' ? [jade[800], jade[900]] : [jade[200], jade[50]]

const coachWash = (theme: Theme): Wash =>
  theme.mode === 'dark' ? [jade[900], theme.canvas] : [jade[100], jade[50]]

export default function DashboardScreen() {
  const theme = useTheme()

  const today = getTodayString()
  const storedDay = useStore(s => s.diary[today])
  const goals = useStore(s => s.goals)
  const streak = useStore(s => s.streak)
  const recommendation = useStore(s => s.recommendation)

  // A day the user has not touched yet has no row in the diary. Building the empty shape
  // in a memo rather than inline in the selector keeps the object identity stable, so
  // getDayNutrition is not re-run on every unrelated store change.
  const router = useRouter()
  const day = useMemo<DiaryDay>(
    () => storedDay ?? { date: today, entries: [], waterIntake: 0, exercises: [] },
    [storedDay, today]
  )

  const nutrition = useMemo(() => getDayNutrition(day), [day])

  const mealTotals = useMemo<MealTotals>(() => {
    const totals: MealTotals = {}
    for (const entry of day.entries) {
      const bucket = totals[entry.mealType] ?? { calories: 0, count: 0 }
      bucket.calories += entry.food.calories * entry.servings
      bucket.count += 1
      totals[entry.mealType] = bucket
    }
    return totals
  }, [day])

  return (
    <Screen
      title="Today"
      subtitle={`${formatDate(today)} · ${WEEKDAYS[new Date().getDay()]}`}
      right={
        <IconButton
          accessibilityLabel="Open the nutrition assistant"
          onPress={() => router.push('/chat')}
        >
          <Sparkles size={20} color={theme.brandText} strokeWidth={2} />
        </IconButton>
      }
    >
      <HeroCard theme={theme} nutrition={nutrition} goalCalories={goals.calories} />

      {/* Directly under the hero so the screen answers both halves of "how am I doing" in one
          glance: the hero covers today, this covers whether any of it is working. It is the
          only line here that asks for a change, and it used to sit seventh. */}
      <WeightVerdict />

      {/*
        No assistant card here. The chat was reachable three ways from this one screen — the
        header icon above, a full card in the second slot, and "Ask AI" in the log button's
        menu — and the card was the only one of the three that cost a slot above Macros, Meals
        and Water to advertise something the other two already offered. A promotion outranking
        the day's actual numbers is the wrong trade on the screen people open to check those
        numbers.
      */}
      <MacroCard
        theme={theme}
        nutrition={nutrition}
        proteinGoal={goals.protein}
        carbsGoal={goals.carbs}
        fatGoal={goals.fat}
      />

      <CoachCard theme={theme} recommendation={recommendation} />

      <MealsCard theme={theme} date={today} mealTotals={mealTotals} />

      <WaterCard theme={theme} date={today} intakeMl={day.waterIntake} goalMl={goals.water} />

      {/* Steps come from Health Connect and render nothing when the platform cannot
          supply them — an empty "0 steps" tile would be a lie, not an empty state. */}
      <StepsCard />

      {/* Daily weigh-in plus an honest read on whether the trend is heading toward the
          goal. Compact here; the full breakdown lives on Profile. */}
      <WeightTargetCard compact />

      <GlanceRow
        theme={theme}
        streakDays={streak.current}
        caloriesBurned={nutrition.caloriesBurned}
      />
    </Screen>
  )
}

/* --- Hero ------------------------------------------------------------------ */

/**
 * The one number the screen exists for.
 *
 * Glass needs something worth refracting, so a jade wash sits behind the pane. Over a
 * flat canvas the blur resolves to a grey rectangle and the material reads as a bug
 * rather than a surface.
 */
const HeroCard: React.FC<{
  theme: Theme
  nutrition: NutritionSummary
  goalCalories: number
}> = ({ theme, nutrition, goalCalories }) => {
  const goal = Math.max(goalCalories, 1)
  const eaten = nutrition.calories
  const progress = eaten / goal
  const remaining = goalCalories - eaten
  const over = remaining < 0

  const tone: Tone = progress >= 1 ? 'critical' : progress >= 0.9 ? 'warning' : 'good'
  const color = theme.status[tone]
  // Status never rides on hue alone: the icon and the sentence both carry it.
  const StatusIcon = tone === 'good' ? Check : AlertTriangle

  const status = over
    ? `${formatNumber(Math.abs(remaining))} kcal over your goal`
    : `${formatNumber(remaining)} kcal left today`

  return (
    <View style={{ borderRadius: radius.card, overflow: 'hidden' }}>
      <LinearGradient
        colors={heroWash(theme)}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <GlassSurface style={{ padding: spacing.lg, gap: spacing.md }}>
        <Label>Eaten today</Label>

        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
          <StatValue size={56} accessibilityLabel={`${formatNumber(eaten)} calories eaten today`}>
            {formatNumber(eaten)}
          </StatValue>
          <Body size={14} tone="secondary">
            of{' '}
            <StatValue size={14} tone="secondary">
              {formatNumber(goalCalories)}
            </StatValue>{' '}
            kcal
          </Body>
        </View>

        <ProgressTrack progress={progress} color={color} over={over} height={10} />

        <View
          accessible
          accessibilityLabel={status}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <StatusIcon size={16} color={color} strokeWidth={2.2} />
          <Body size={14} weight="semibold" style={{ color }}>
            {status}
          </Body>
        </View>
      </GlassSurface>
    </View>
  )
}

/* --- Macros ---------------------------------------------------------------- */

const MacroCard: React.FC<{
  theme: Theme
  nutrition: NutritionSummary
  proteinGoal: number
  carbsGoal: number
  fatGoal: number
}> = ({ theme, nutrition, proteinGoal, carbsGoal, fatGoal }) => {
  const legend = [
    { key: 'Protein', grams: nutrition.protein, goal: proteinGoal, color: theme.macro.protein },
    { key: 'Carbs', grams: nutrition.carbs, goal: carbsGoal, color: theme.macro.carbs },
    { key: 'Fat', grams: nutrition.fat, goal: fatGoal, color: theme.macro.fat },
  ]

  return (
    <Surface style={{ padding: spacing.lg, gap: spacing.lg }}>
      <SectionTitle>Macros</SectionTitle>

      <View style={{ alignItems: 'center' }}>
        <MacroRing
          size={192}
          strokeWidth={12}
          series={legend.map(item => ({
            progress: item.grams / Math.max(item.goal, 1),
            color: item.color,
            label: item.key,
          }))}
        >
          <StatValue size={30}>{formatNumber(nutrition.calories)}</StatValue>
          <Label style={{ marginTop: 4 }}>kcal today</Label>
        </MacroRing>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        {legend.map(item => (
          <View key={item.key} style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: radius.pill,
                  backgroundColor: item.color,
                }}
              />
              <Label>{item.key}</Label>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
              <StatValue
                size={20}
                color={item.color}
                accessibilityLabel={`${item.key}: ${formatNumber(item.grams)} of ${formatNumber(
                  item.goal
                )} grams`}
              >
                {formatNumber(item.grams)}
              </StatValue>
              <Body size={12} tone="muted">
                g
              </Body>
            </View>

            <Body size={11} tone="muted">
              of{' '}
              <StatValue size={11} tone="muted">
                {formatNumber(item.goal)}
              </StatValue>{' '}
              g
            </Body>
          </View>
        ))}
      </View>
    </Surface>
  )
}

/* --- Coach ----------------------------------------------------------------- */

/**
 * Read-only summary of the coach's plan, linking through to /goals for the full panel.
 * With no plan it asks for one rather than inventing a target to fill the space.
 */
const CoachCard: React.FC<{
  theme: Theme
  recommendation: Recommendation | null
}> = ({ theme, recommendation }) => {
  const router = useRouter()
  const label = recommendation
    ? `Coach plan: ${PHASE_LABELS[recommendation.phase]}, ${formatNumber(
        recommendation.calories
      )} kilocalories a day. Open goals.`
    : 'Coach: no plan yet. Open goals to set one up.'

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() => router.push('/goals')}
      // The card is clipped and fully covered by the wash, so a background change would
      // never show through — opacity is the press feedback that survives the gradient.
      style={({ pressed }) => ({
        borderRadius: radius.card,
        overflow: 'hidden',
        minHeight: HIT_SIZE,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <LinearGradient
        colors={coachWash(theme)}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <GlassSurface style={{ padding: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.control,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.border,
            }}
          >
            <Sparkles size={20} color={theme.brandText} strokeWidth={2} />
          </View>

          <View style={{ flex: 1, gap: 4 }}>
            <Label>{recommendation ? 'Coach plan' : 'Coach'}</Label>
            {recommendation ? (
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
                <Body size={16} weight="semibold">
                  {PHASE_LABELS[recommendation.phase]}
                </Body>
                <Body size={13} tone="secondary">
                  <StatValue size={13} tone="secondary">
                    {formatNumber(recommendation.calories)}
                  </StatValue>{' '}
                  kcal/day
                </Body>
              </View>
            ) : (
              <Body size={13} tone="secondary">
                No plan yet — set a phase and a calorie target built from your own data.
              </Body>
            )}
          </View>

          <ChevronRight size={20} color={theme.textMuted} />
        </View>
      </GlassSurface>
    </Pressable>
  )
}

/* --- Meals ----------------------------------------------------------------- */

/**
 * Every row used to call `router.push('/diary')`, so tapping Breakfast and tapping Snacks
 * landed in the same place and the app threw away the one thing the tap told it. A row now
 * goes where the row says it goes: an empty one reads "Add food" and opens the picker already
 * set to that meal, a filled one shows a total and opens the diary to review it.
 */
const MealsCard: React.FC<{ theme: Theme; date: string; mealTotals: MealTotals }> = ({
  theme,
  date,
  mealTotals,
}) => {
  const router = useRouter()

  return (
    <Surface style={{ padding: spacing.lg, gap: spacing.xs }}>
      <SectionTitle>Meals</SectionTitle>

      {MEALS.map((meal, index) => {
        const data = mealTotals[meal]
        const MealIcon = MEAL_ICONS[meal] ?? Cookie
        const detail = data ? `${data.count} item${data.count === 1 ? '' : 's'}` : 'Nothing logged'
        const label = data
          ? `${meal}, ${formatNumber(data.calories)} kilocalories, ${detail}. Open diary.`
          : `${meal}, nothing logged. Add food to ${meal}.`

        return (
          <Pressable
            key={meal}
            accessibilityRole="link"
            accessibilityLabel={label}
            onPress={() =>
              data
                ? router.push('/diary')
                : router.push({ pathname: '/food-search', params: { meal, date } })
            }
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              minHeight: HIT_SIZE + 8,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.sm,
              marginHorizontal: -spacing.sm,
              borderRadius: radius.control,
              backgroundColor: pressed ? theme.border : 'transparent',
              borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth * 2,
              borderTopColor: theme.border,
            })}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: radius.control,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.border,
              }}
            >
              <MealIcon size={18} color={theme.textSecondary} strokeWidth={2} />
            </View>

            <View style={{ flex: 1, gap: 2 }}>
              <Body size={15} weight="semibold">
                {meal}
              </Body>
              <Body size={12} tone="muted">
                {detail}
              </Body>
            </View>

            {data ? (
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                <StatValue size={18}>{formatNumber(data.calories)}</StatValue>
                <Body size={11} tone="muted">
                  kcal
                </Body>
              </View>
            ) : (
              <Body size={13} tone="brand" weight="semibold">
                Add food
              </Body>
            )}

            <ChevronRight size={18} color={theme.textMuted} />
          </Pressable>
        )
      })}
    </Surface>
  )
}

/* --- Water ----------------------------------------------------------------- */

const WaterCard: React.FC<{
  theme: Theme
  date: string
  intakeMl: number
  goalMl: number
}> = ({ theme, date, intakeMl, goalMl }) => {
  const addWater = useStore(s => s.addWater)
  const goal = Math.max(goalMl, 1)
  const met = intakeMl >= goalMl

  return (
    <Surface style={{ padding: spacing.lg, gap: spacing.md }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.md,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Droplets size={18} color={theme.brandText} strokeWidth={2} />
          <SectionTitle>Water</SectionTitle>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
          <StatValue
            size={22}
            accessibilityLabel={`${formatNumber(intakeMl)} of ${formatNumber(
              goalMl
            )} millilitres of water`}
          >
            {formatNumber(intakeMl)}
          </StatValue>
          <Body size={12} tone="muted">
            of{' '}
            <StatValue size={12} tone="muted">
              {formatNumber(goalMl)}
            </StatValue>{' '}
            ml
          </Body>
        </View>
      </View>

      <ProgressTrack progress={intakeMl / goal} color={theme.brandText} />

      {met ? (
        <View
          accessible
          accessibilityLabel="Water goal met"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <Check size={14} color={theme.status.good} strokeWidth={2.4} />
          <Body size={12} weight="semibold" style={{ color: theme.status.good }}>
            Goal met
          </Body>
        </View>
      ) : null}

      {/* The unit lives in the caption, not on each button: five labelled controls in one
          row overflow on a 320pt screen, and the figures need the room more than "ml" does. */}
      <View style={{ gap: spacing.sm }}>
        <Label>Quick add · ml</Label>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          {QUICK_ADD_ML.map(amount => (
            <Pressable
              key={amount}
              accessibilityRole="button"
              accessibilityLabel={`Add ${amount} millilitres of water`}
              onPress={() => addWater(date, amount)}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: HIT_SIZE,
                borderRadius: radius.control,
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderColor: theme.border,
                backgroundColor: pressed ? theme.border : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              })}
            >
              <StatValue size={15} color={theme.brandText}>
                +{amount}
              </StatValue>
            </Pressable>
          ))}

          <IconButton
            accessibilityLabel="Remove 250 millilitres of water"
            disabled={intakeMl <= 0}
            onPress={() => addWater(date, -250)}
          >
            <Minus size={18} color={theme.textSecondary} strokeWidth={2} />
          </IconButton>
        </View>
      </View>
    </Surface>
  )
}

/* --- At a glance ----------------------------------------------------------- */

const GlanceRow: React.FC<{
  theme: Theme
  streakDays: number
  caloriesBurned: number
}> = ({ theme, streakDays, caloriesBurned }) => (
  <View style={{ flexDirection: 'row', gap: spacing.md }}>
    <GlanceTile
      icon={<Flame size={18} color={theme.brandText} strokeWidth={2} />}
      value={formatNumber(streakDays)}
      label="Day streak"
      accessibilityLabel={`${formatNumber(streakDays)} day logging streak`}
    />
    <GlanceTile
      icon={<Dumbbell size={18} color={theme.textSecondary} strokeWidth={2} />}
      value={formatNumber(caloriesBurned)}
      label="Kcal burned"
      accessibilityLabel={`${formatNumber(caloriesBurned)} kilocalories burned today`}
    />
  </View>
)

const GlanceTile: React.FC<{
  icon: React.ReactNode
  value: string
  label: string
  accessibilityLabel: string
}> = ({ icon, value, label, accessibilityLabel }) => (
  <Surface style={{ flex: 1, padding: spacing.md, alignItems: 'center', gap: 4 }}>
    {icon}
    <StatValue size={22} accessibilityLabel={accessibilityLabel}>
      {value}
    </StatValue>
    <Label>{label}</Label>
  </Surface>
)
