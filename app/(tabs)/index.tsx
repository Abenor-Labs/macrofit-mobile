import React, { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
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
import {
  Check,
  ChevronRight,
  Cookie,
  Download,
  Droplets,
  Minus,
  Moon,
  Sparkles,
  Sun,
  Sunrise,
  Target,
  Bell,
} from 'lucide-react-native'

import type { DiaryDay, MealType, NutritionSummary, PhaseType, Recommendation } from '@core/types'
import {
  formatDate,
  getDayNutrition,
  getLast7Days,
  getTodayString,
} from '@core/utils/calculations'

import { useStore } from '@/store/useStore'
import { formatNumber } from '@/lib/formatNumber'
import { useAvailableUpdate } from '@/hooks/useAvailableUpdate'
import { useActivityFeed } from '@/hooks/useActivityFeed'
import { WeeklyRecapCard } from '@/components/WeeklyRecapCard'
import { buildTdeeEstimate } from '@core/utils/tdee'
import { buildLocalRecommendation } from '@core/utils/localRecommendation'
import { estimateBodyComposition, latestUsableMeasurement } from '@core/utils/bodyComposition'
import { useTheme, type Theme } from '@/theme/useTheme'
import { Surface } from '@/components/Glass'
import { MacroRing, ProgressTrack } from '@/components/MacroRing'
import { Body, Label, SectionTitle, StatValue } from '@/components/Text'
import { IconButton } from '@/components/Button'
import { Screen } from '@/components/Layout'
import { StepsCard } from '@/components/StepsCard'
import { WeightTargetCard, WeightVerdict } from '@/components/WeightTarget'
import { HIT_SIZE, radius, spacing } from '@/theme/tokens'


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

export default function DashboardScreen() {
  const theme = useTheme()

  /*
    Today only, deliberately. A date navigator lived here briefly and was the wrong control on
    the wrong screen: this is the today-screen, and every card on it either describes today or
    describes the trend. Browsing days belongs in the detail views, which is where the Intake
    card now sends you — the same split Google Fit uses, where Home carries no date picker and
    the activity detail carries Day, Week and Month.
  */
  const today = getTodayString()
  const storedDay = useStore(s => s.diary[today])
  // The whole diary, for the week strip. Today's row is selected separately above so the rest
  // of the screen keeps re-rendering only on changes to today.
  const diary = useStore(s => s.diary)
  const goals = useStore(s => s.goals)
  const streak = useStore(s => s.streak)
  const recommendation = useStore(s => s.recommendation)

  // A day the user has not touched yet has no row in the diary. Building the empty shape
  // in a memo rather than inline in the selector keeps the object identity stable, so
  // getDayNutrition is not re-run on every unrelated store change.
  const router = useRouter()
  // Null until the launch check finds something newer, so the header carries the icon only
  // while there is an update to take — never a permanent "check for updates" affordance.
  const update = useAvailableUpdate()
  const { unread, recap } = useActivityFeed()
  const weightUnit = useStore(s => s.profile.weightUnit)
  // Monday to Wednesday: after that, last week is old news on the home screen (it stays in
  // Activity).
  const showRecap = recap !== null && [1, 2, 3].includes(new Date().getDay())
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
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {update ? (
            <IconButton
              accessibilityLabel={`Update to version ${update.version}`}
              onPress={() => router.push('/update')}
            >
              <Download size={20} color={theme.brandText} strokeWidth={2} />
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: 11,
                  right: 11,
                  width: 9,
                  height: 9,
                  borderRadius: radius.pill,
                  borderWidth: 1.5,
                  backgroundColor: theme.brand,
                  borderColor: theme.canvas,
                }}
              />
            </IconButton>
          ) : null}
          {/* Activity: records, milestones and the weekly recap. The dot means something new
              since you last looked — the only badge in the app, so it still means something. */}
          <IconButton
            accessibilityLabel={unread > 0 ? `Activity, ${unread} new` : 'Activity'}
            onPress={() => router.push('/activity')}
          >
            <Bell size={20} color={theme.brandText} strokeWidth={2} />
            {unread > 0 ? (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: 11,
                  right: 11,
                  width: 9,
                  height: 9,
                  borderRadius: radius.pill,
                  borderWidth: 1.5,
                  backgroundColor: theme.brand,
                  borderColor: theme.canvas,
                }}
              />
            ) : null}
          </IconButton>
          <IconButton
            accessibilityLabel="Open the assistant"
            onPress={() => router.push('/chat')}
          >
            <Sparkles size={20} color={theme.brandText} strokeWidth={2} />
          </IconButton>
        </View>
      }
    >
      {/*
        The ring leads, and there is no calorie hero above it any more. That card printed the
        same total the ring already holds in its middle — 56pt in one card, 30pt in the next —
        so the screen opened by saying the same number twice. The ring says it once, alongside
        the macro balance rather than beside it.

        No assistant card here either. The chat was reachable three ways from this one screen:
        the header icon above, a full card in the second slot, and "Ask AI" in the log button's
        menu. The card was the only one of the three that cost a slot above the day's numbers
        to advertise what the other two already offered.
      */}
      {showRecap && recap ? <WeeklyRecapCard recap={recap} unit={weightUnit} /> : null}

      <MacroCard
        theme={theme}
        nutrition={nutrition}
        goalCalories={goals.calories}
        proteinGoal={goals.protein}
        carbsGoal={goals.carbs}
        fatGoal={goals.fat}
        date={today}
        hasEntries={day.entries.length > 0}
      />

      {/* Second, not first. It is the only line on this screen that asks for a change, and
              it used to sit seventh — but a dashboard that opens on "Stalled" every morning
              leads with a scolding. The day's numbers go first; the verdict reads under them. */}
          <WeightVerdict />

          {/* Directly under the verdict because it is the evidence for it: "Stalled" is a
              claim, and what you average and how often you hit protein is why. */}
          <WeekCard
            theme={theme}
            diary={diary}
            today={today}
            goalCalories={goals.calories}
            proteinGoal={goals.protein}
            streakDays={streak.current}
          />

      <CoachCard theme={theme} recommendation={recommendation} />

      <MealsCard theme={theme} date={today} mealTotals={mealTotals} />

      <WaterCard theme={theme} date={today} intakeMl={day.waterIntake} goalMl={goals.water} />

      {/* Health Connect renders nothing when the platform cannot supply steps — an empty
          "0 steps" tile would be a lie, not an empty state. */}
      <StepsCard />

      {/* Daily weigh-in plus an honest read on whether the trend is heading toward the goal.
          Compact here; the full breakdown lives on Profile. */}
      <WeightTargetCard compact />

    </Screen>
  )
}

/* --- Macros ---------------------------------------------------------------- */

const MacroCard: React.FC<{
  theme: Theme
  nutrition: NutritionSummary
  goalCalories: number
  proteinGoal: number
  carbsGoal: number
  fatGoal: number
  /** The day these figures describe, so the diary opens on it rather than on today. */
  date: string
  hasEntries: boolean
}> = ({
  theme,
  nutrition,
  goalCalories,
  proteinGoal,
  carbsGoal,
  fatGoal,
  date,
  hasEntries,
}) => {
  const router = useRouter()

  const legend = [
    { key: 'Protein', grams: nutrition.protein, goal: proteinGoal, color: theme.macro.protein },
    { key: 'Carbs', grams: nutrition.carbs, goal: carbsGoal, color: theme.macro.carbs },
    { key: 'Fat', grams: nutrition.fat, goal: fatGoal, color: theme.macro.fat },
  ]

  const over = nutrition.calories > goalCalories

  /*
    Every macro at or past its target, on a day that actually has food in it. The ring fills
    and then says nothing, which leaves the one moment the whole screen is built around
    unmarked. `calories > 0` guards the day that has not started: three zeroes are not three
    targets met.
  */
  const allMacrosHit =
    nutrition.calories > 0 &&
    nutrition.protein >= proteinGoal &&
    nutrition.carbs >= carbsGoal &&
    nutrition.fat >= fatGoal

  const overBy = Math.max(0, Math.round(nutrition.calories - goalCalories))
  const badgeTone = overBy > 0 ? theme.status.warning : theme.status.good

  return (
    /*
      Opens the diary on the day this ring is showing.

      It used to open Progress on its Day range, reasoning that the home ring is a headline and
      one detail screen should answer day, week and month the way Google Fit does. The reasoning
      was fine and the destination was wrong: Progress plots calories by hour. Someone tapping a
      ring that reads "1,340 of 2,100" wants to know what made up the 1,340 — which foods, at
      what serving — and a chart of when the calories landed answers a question they did not ask
      and cannot act on.

      Week and month are still one tap away in Progress, from the trend card lower down this
      screen. That is the right door for them, because they are the questions a chart answers.

      Press feedback is opacity rather than a background change, the same choice CoachCard
      makes: the card is a Surface with its own fill, so a background swap underneath it would
      never show.
    */
    <Pressable
      needsOffscreenAlphaCompositing
      accessibilityRole="link"
      accessibilityLabel={`${formatNumber(nutrition.calories)} of ${formatNumber(
        goalCalories
      )} kilocalories.${
        allMacrosHit
          ? overBy > 0
            ? ` All macros hit, ${overBy} kilocalories over.`
            : ' All macros hit.'
          : ''
      } Open the diary for this day.`}
      onPress={() => router.push({ pathname: '/diary', params: { date } })}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Surface style={{ padding: spacing.lg, gap: spacing.lg }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.md,
          }}
        >
          {/* "Intake", not "Today". The card was titled Today when today was the only day it
              could show; with a date navigator directly above it, that title sat over Jul 29's
              numbers and claimed they were this morning's. The navigator owns the date, so the
              card says what the figures are instead of when they are. */}
          <SectionTitle>Intake</SectionTitle>
          {/* The affordance. Without it a card this dense reads as a display, not a door. */}
          <ChevronRight size={20} color={theme.textMuted} />
        </View>

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
            {/*
              Eaten over target, both inside the ring, because the pair is the reading — 700 on
              its own says nothing until you know whether the day allows 1,800 or 3,200.

              Stacked rather than written across one line: the ring's inner circle is narrow
              enough that a fifteen-character row runs its last word under the fat arc, so the
              target sits on its own line at a size the circle can hold.
            */}
            <StatValue
              size={30}
              /*
                Red once the day is over target. The hero card that used to carry this flipped
                to a warning tone and said "X kcal over your goal"; when it went, nothing was
                left to mark the difference between 2,400 of 2,427 and 3,400 of 2,427.

                Colour is not carrying this alone — the figure is already larger than the
                target printed directly beneath it — so the rule about never signalling by hue
                is intact. It is reinforcement on a number that has to be noticed.
              */
              color={over ? theme.status.critical : undefined}
              accessibilityLabel={
                over
                  ? `${formatNumber(nutrition.calories)} kilocalories, over your ${formatNumber(
                      goalCalories
                    )} target`
                  : `${formatNumber(nutrition.calories)} of ${formatNumber(
                      goalCalories
                    )} kilocalories today`
              }
            >
              {formatNumber(nutrition.calories)}
            </StatValue>
            <StatValue size={13} tone="muted">
              {`/ ${formatNumber(goalCalories)}`}
            </StatValue>
            <Label style={{ marginTop: 2 }}>{over ? 'kcal · over' : 'kcal'}</Label>
          </MacroRing>
        </View>

        {allMacrosHit ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              alignSelf: 'center',
              gap: 6,
              paddingHorizontal: spacing.md,
              paddingVertical: 5,
              borderRadius: radius.pill,
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: theme.border,
            }}
          >
            <Check size={13} color={badgeTone} strokeWidth={2.6} />
            <Body size={12} weight="semibold" style={{ color: badgeTone }}>
              {overBy > 0 ? `All macros hit · ${formatNumber(overBy)} over` : 'All macros hit'}
            </Body>
          </View>
        ) : null}

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

        {!hasEntries ? (
          <Body size={12} tone="muted" style={{ textAlign: 'center' }}>
            Three arcs, outside in: protein, carbs, fat. Log anything and they start filling.
          </Body>
        ) : null}
      </Surface>
    </Pressable>
  )
}

/* --- Coach ----------------------------------------------------------------- */

/**
 * Summary of the coach's plan, linking through to /goals for the full panel.
 *
 * With no plan it now builds one rather than pointing at a screen. "No plan yet" was the
 * empty state of a coach that could not start: the automatic refresh only fires when a plan
 * is already a week old and a weigh-in has landed since, so with no first plan it never ran
 * at all, and the card read as broken rather than as unstarted.
 *
 * Built locally and only on tap. The derivation is not cheap — a TDEE estimate walks 28 days
 * of diary against the weight log — and this is the dashboard, so it must not run on every
 * render of a screen people open all day. The network plan stays where it was, on /goals:
 * the point here is a first plan existing at all, not which service produced it.
 *
 * Nothing is applied to the user's goals. The plan is proposed; accepting it is a decision
 * taken on /goals, where the numbers can be seen next to the ones they would replace.
 */
const CoachCard: React.FC<{
  theme: Theme
  recommendation: Recommendation | null
}> = ({ theme, recommendation }) => {
  const router = useRouter()
  const profile = useStore(s => s.profile)
  const currentWeightKg = useStore(s => s.currentWeightKg)
  const diary = useStore(s => s.diary)
  const weightLog = useStore(s => s.weightLog)
  const bodyMeasurements = useStore(s => s.bodyMeasurements)
  const setRecommendation = useStore(s => s.setRecommendation)
  const [building, setBuilding] = useState(false)

  const buildPlan = () => {
    setBuilding(true)
    requestAnimationFrame(() => {
      const measurement = latestUsableMeasurement(bodyMeasurements ?? [], profile, currentWeightKg)
      const bodyComp = measurement
        ? estimateBodyComposition(profile, currentWeightKg, measurement)
        : null
      const tdee = buildTdeeEstimate(profile, currentWeightKg, bodyComp, diary, weightLog ?? [])
      const trustMeasured =
        tdee.measured !== null &&
        tdee.measured > 0 &&
        (tdee.confidence === 'medium' || tdee.confidence === 'high')
      setRecommendation(
        buildLocalRecommendation({
          goal: profile.goal,
          weightKg: currentWeightKg,
          anchorTdee: trustMeasured && tdee.measured !== null ? tdee.measured : tdee.predicted,
        })
      )
      setBuilding(false)
    })
  }

  const label = recommendation
    ? `Coach plan: ${PHASE_LABELS[recommendation.phase]}, ${formatNumber(
        recommendation.calories
      )} kilocalories a day. Open goals.`
    : 'Coach: no plan yet. Build one from your logged data.'

  return (
    <Pressable
      needsOffscreenAlphaCompositing
      accessibilityRole={recommendation ? 'link' : 'button'}
      accessibilityLabel={label}
      onPress={() => {
        if (building) return
        recommendation ? router.push('/goals') : buildPlan()
      }}
      /*
        A plain card like every other one on this screen. It used to be the only card with a
        gradient wash under glass — decoration with no job, and the one surface that did not
        look like it belonged to the rest of the dashboard.
      */
      style={({ pressed }) => ({
        borderRadius: radius.card,
        minHeight: HIT_SIZE,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Surface style={{ padding: spacing.lg }}>
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
            {building ? (
              <ActivityIndicator size="small" color={theme.brandText} />
            ) : (
              // A target, not sparkles: sparkles mean the assistant in this app's headers,
              // and this card is a calorie plan.
              <Target size={20} color={theme.brandText} strokeWidth={2} />
            )}
          </View>

          <View style={{ flex: 1, gap: 4 }}>
            <Label>{recommendation ? 'Coach plan' : 'Coach'}</Label>
            {recommendation ? (
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
                <Body size={15} weight="semibold">
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
                {building ? 'Building…' : 'No plan yet — tap to build one from what you have logged.'}
              </Body>
            )}
          </View>

          <ChevronRight size={20} color={theme.textMuted} />
        </View>
      </Surface>
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
                ? // The date goes with it. Without it, reviewing Jul 29's breakfast opened
                  // today's diary, which is the same bug the empty branch never had because
                  // it was already passing the date through to the picker.
                  router.push({ pathname: '/diary', params: { date } })
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
                <StatValue size={17}>{formatNumber(data.calories)}</StatValue>
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
            size={20}
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

/* --- Last 7 days ----------------------------------------------------------- */

/** Bar height in px for a day exactly on target. Over-target days are drawn full. */
const BAR_MAX = 52

/**
 * A week of intake, without a chart.
 *
 * This replaced a row holding "day streak" and "kcal burned" — a streak of 1 motivates nobody,
 * and kcal burned reads 0 on any day without a logged workout, so between them they earned the
 * screen's last slot with two zeroes.
 *
 * The shape is deliberately Google Fit's: seven bars, no axis, no gridlines, no legend, nothing
 * to interpret. A bar chart people have to read is a chart; seven bars people can glance at is
 * a shape. Under it go the two numbers a single day cannot give you — what you average, and how
 * often you actually hit protein — because one day in isolation never answers "is this working".
 *
 * The sentence at the bottom is the same move the weight verdict makes: state the number, then
 * say what it means. That verdict is the most useful thing on this screen precisely because it
 * does not make anyone read a graph, and this follows it rather than competing with it.
 */
const WeekCard: React.FC<{
  theme: Theme
  diary: Record<string, DiaryDay>
  /** Today's date string. A dependency, not a display value: see the memo below. */
  today: string
  goalCalories: number
  proteinGoal: number
  streakDays: number
}> = ({ theme, diary, today, goalCalories, proteinGoal, streakDays }) => {
  const router = useRouter()

  const week = useMemo(() => {
    const dates = getLast7Days()
    const todayDate = dates[dates.length - 1]

    const days = dates.map(date => {
      const stored = diary[date]
      const nutrition = stored
        ? getDayNutrition(stored)
        : { calories: 0, protein: 0, carbs: 0, fat: 0, caloriesBurned: 0 }
      return {
        date,
        calories: nutrition.calories,
        protein: nutrition.protein,
        // A day with nothing logged is not a day of eating nothing, and averaging it in as a
        // zero would quietly claim it was. Only logged days count toward the average.
        logged: (stored?.entries.length ?? 0) > 0,
        isToday: date === todayDate,
      }
    })

    /*
      Today is drawn but never counted. It is a day in progress: at lunchtime it holds one
      meal, so averaging it in reported "1,727 kcal under target, on average" off a single
      partial day and made a normal morning look like a crisis. The same goes for the protein
      count — a goal that has not been missed yet has not been missed.
    */
    const settled = days.filter(day => day.logged && !day.isToday)
    const average =
      settled.length > 0 ? settled.reduce((sum, day) => sum + day.calories, 0) / settled.length : 0
    const proteinHits = settled.filter(day => day.protein >= proteinGoal).length

    return { days, settledDays: settled.length, average, proteinHits }
    // `today` is in the deps because getLast7Days() reads the clock. Without it the window
    // is captured once and an app left open overnight keeps charting yesterday's week.
  }, [diary, today, proteinGoal])

  const goal = Math.max(goalCalories, 1)
  const delta = Math.round(week.average - goalCalories)
  const dayWord = week.settledDays === 1 ? 'day' : 'days'
  const summary =
    week.settledDays === 0
      ? 'Finish a day and this starts filling in.'
      : // The average itself is printed just below; this line only adds what it means.
        delta === 0
        ? `On target across ${week.settledDays} ${dayWord}`
        : `${delta > 0 ? '+' : '−'}${formatNumber(Math.abs(delta))} kcal vs target, ${week.settledDays} ${dayWord}`

  return (
    /*
      Opens the same Calories view the Today card does. This card is the seven-day summary of
      it; Progress is the same seven days plotted, with 30d alongside.
    */
    <Pressable
      needsOffscreenAlphaCompositing
      accessibilityRole="link"
      accessibilityLabel={
        week.settledDays === 0
          ? 'Last 7 days, nothing finished yet. Open calorie history.'
          : `Last 7 days. ${summary} Open calorie history.`
      }
      onPress={() =>
        router.push({ pathname: '/progress', params: { metric: 'calories', range: '7d' } })
      }
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Surface style={{ padding: spacing.lg, gap: spacing.md }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.md,
          }}
        >
          <SectionTitle>Last 7 days</SectionTitle>
          <ChevronRight size={20} color={theme.textMuted} />
        </View>

        {/* No chart until there is something to chart. Seven slots holding six stubs and one nub
            is not a week of data, it is an empty frame with a rounding error in it — the same
            reason StepsCard renders nothing rather than a fake zero. The sentence and the dashes
            below still say the card exists and what it will hold. */}
        {week.settledDays > 0 && (
          <View
            accessible
            accessibilityLabel={`Averaging ${formatNumber(week.average)} kilocalories across ${week.settledDays} finished days. ${summary}`}
            style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, height: BAR_MAX }}
          >
            {week.days.map(day => {
              const over = day.calories > goalCalories
              const filled = Math.min(day.calories / goal, 1)

              return (
                <View
                  key={day.date}
                  style={{ flex: 1, height: BAR_MAX, justifyContent: 'flex-end', alignItems: 'center' }}
                >
                  <View
                    style={{
                      // Fixed and narrow, not a share of the column. A percentage of a ~45dp slot
                      // came out wider than the bar was tall, so a normal day read as a lozenge
                      // lying on its side rather than as a bar.
                      width: 12,
                      // A 3px stub for untouched days, so the week reads as seven slots rather
                      // than as however many happen to have food in them.
                      height: Math.max(filled * BAR_MAX, 3),
                      borderRadius: radius.tight,
                      backgroundColor: !day.logged
                        ? theme.border
                        : over
                          ? theme.status.warning
                          : theme.brand,
                      // Today reads as today without relying on hue, which the over-target state
                      // has already spent.
                      opacity: day.isToday ? 1 : 0.55,
                    }}
                  />
                </View>
              )
            })}
          </View>
        )}

        <Body size={13} tone="secondary">
          {summary}
        </Body>

        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <WeekFigure
            value={week.settledDays === 0 ? '—' : formatNumber(week.average)}
            label="Avg kcal"
            accessibilityLabel={
              week.settledDays === 0
                ? 'No average yet'
                : `Averaging ${formatNumber(week.average)} kilocalories`
            }
          />
          <WeekFigure
            value={week.settledDays === 0 ? '—' : `${week.proteinHits}/${week.settledDays}`}
            label="Protein hit"
            accessibilityLabel={
              week.settledDays === 0
                ? 'No finished days yet'
                : `Protein goal hit on ${week.proteinHits} of ${week.settledDays} finished days`
            }
          />
          <WeekFigure
            value={formatNumber(streakDays)}
            label="Day streak"
            accessibilityLabel={`${formatNumber(streakDays)} day logging streak`}
          />
        </View>
      </Surface>
    </Pressable>
  )
}

const WeekFigure: React.FC<{
  value: string
  label: string
  accessibilityLabel: string
}> = ({ value, label, accessibilityLabel }) => (
  <View style={{ flex: 1, gap: 2 }}>
    <StatValue size={20} accessibilityLabel={accessibilityLabel}>
      {value}
    </StatValue>
    <Label>{label}</Label>
  </View>
)
