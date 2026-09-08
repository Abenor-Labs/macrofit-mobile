import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { router, useGlobalSearchParams } from 'expo-router'
import * as Haptics from 'expo-haptics'
import {
  AlertCircle,
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react-native'

import { Island } from '@/components/Material'
import { Button, IconButton } from '@/components/Button'
import { Field, Pill, Screen } from '@/components/Layout'
import { ProgressTrack } from '@/components/MacroRing'
import { Body, Label, SectionTitle, StatValue } from '@/components/Text'
import { useSnackbar } from '@/components/Snackbar'
import { useStore } from '@/store/useStore'
import { DateNavigator } from '@/components/DateNavigator'
import { useTheme } from '@/theme/useTheme'
import { HIT_SIZE, radius, spacing } from '@/theme/tokens'
import type { DiaryDay, FoodEntry, MealType } from '@core/types'
import {
  formatDate,
  getDateString,
  getDayNutrition,
  getTodayString,
} from '@core/utils/calculations'

/** Every meal gets a card, in the order a day is actually eaten. */
const MEAL_TYPES: readonly MealType[] = [
  'Breakfast',
  'Lunch',
  'Dinner',
  'Snacks',
  'Pre-Workout',
  'Post-Workout',
]

const HAIRLINE = StyleSheet.hairlineWidth * 2


const round2 = (value: number): number => Math.round(value * 100) / 100

/** Keeps '1 × 182 g' reading as itself rather than '1.00 × 182.00 g'. */
const formatAmount = (value: number): string => String(round2(value))

const emptyDay = (date: string): DiaryDay => ({
  date,
  entries: [],
  waterIntake: 0,
  exercises: [],
})

const plural = (count: number, word: string): string =>
  `${count} ${word}${count === 1 ? '' : 's'}`

// --- Small shared pieces ----------------------------------------------------

/**
 * P / C / F for one entry.
 *
 * The visible text is deliberately terse so three chips fit one line on a small phone;
 * the wrapper carries the spelled-out label so a screen reader never has to decode a
 * single letter or rely on the chip's hue.
 */
const MacroChips: React.FC<{ protein: number; carbs: number; fat: number }> = ({
  protein,
  carbs,
  fat,
}) => {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
      <View accessible accessibilityLabel={`Protein ${protein} grams`}>
        <Pill color={theme.macro.protein}>{`P ${protein}g`}</Pill>
      </View>
      <View accessible accessibilityLabel={`Carbs ${carbs} grams`}>
        <Pill color={theme.macro.carbs}>{`C ${carbs}g`}</Pill>
      </View>
      <View accessible accessibilityLabel={`Fat ${fat} grams`}>
        <Pill color={theme.macro.fat}>{`F ${fat}g`}</Pill>
      </View>
    </View>
  )
}

// --- Date navigator ---------------------------------------------------------

// --- Day totals -------------------------------------------------------------

const MacroStat: React.FC<{
  label: string
  value: number
  goal: number
  color: string
}> = ({ label, value, goal, color }) => (
  <View style={{ flex: 1, gap: 6 }}>
    <Label>{label}</Label>
    <View
      style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}
      accessible
      accessibilityLabel={`${label}: ${Math.round(value)} of ${Math.round(goal)} grams`}
    >
      <StatValue size={18} color={color}>
        {Math.round(value)}
      </StatValue>
      <Body size={12} tone="muted">{`/ ${Math.round(goal)} g`}</Body>
    </View>
    <ProgressTrack progress={goal > 0 ? value / goal : 0} color={color} height={6} />
  </View>
)

const DayTotals: React.FC<{ day: DiaryDay }> = ({ day }) => {
  const theme = useTheme()
  const goals = useStore(s => s.goals)
  const totals = useMemo(() => getDayNutrition(day), [day])

  const remaining = goals.calories - totals.calories
  const over = remaining < 0

  return (
    <Island style={{ padding: spacing.lg, gap: spacing.lg }}>
      <View style={{ gap: spacing.sm }}>
        <Label>Calories</Label>
        <View
          style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}
          accessible
          accessibilityLabel={`${totals.calories} of ${goals.calories} kilocalories eaten`}
        >
          <StatValue size={34}>{totals.calories}</StatValue>
          <Body size={14} tone="muted">{`/ ${goals.calories} kcal`}</Body>
        </View>
        <ProgressTrack
          progress={goals.calories > 0 ? totals.calories / goals.calories : 0}
          color={theme.brand}
        />
        {over ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={14} color={theme.status.warning} strokeWidth={2.2} />
            <Body size={12} weight="medium" style={{ color: theme.status.warning }}>
              {`Over goal by ${Math.abs(remaining)} kcal`}
            </Body>
          </View>
        ) : (
          <Body size={12} tone="secondary">{`${remaining} kcal left today`}</Body>
        )}
      </View>

      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', gap: spacing.lg }}>
          <MacroStat
            label="Protein"
            value={totals.protein}
            goal={goals.protein}
            color={theme.macro.protein}
          />
          <MacroStat
            label="Carbs"
            value={totals.carbs}
            goal={goals.carbs}
            color={theme.macro.carbs}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.lg }}>
          <MacroStat label="Fat" value={totals.fat} goal={goals.fat} color={theme.macro.fat} />
          <MacroStat
            label="Fiber"
            value={totals.fiber}
            goal={goals.fiber}
            color={theme.macro.fiber}
          />
        </View>
      </View>

      {/*
        Sugar and sodium are not part of the categorical macro palette — they get neutral
        stone and a spelled-out label rather than an invented fifth and sixth hue.
      */}
      <View
        style={{
          flexDirection: 'row',
          gap: spacing.xl,
          borderTopWidth: HAIRLINE,
          borderTopColor: theme.border,
          paddingTop: spacing.md,
        }}
      >
        <View
          style={{ gap: 2 }}
          accessible
          accessibilityLabel={`Sugar: ${Math.round(totals.sugar)} of ${goals.sugar} grams`}
        >
          <Label>Sugar</Label>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <StatValue size={15} tone="secondary">
              {Math.round(totals.sugar)}
            </StatValue>
            <Body size={11} tone="muted">{`/ ${goals.sugar} g`}</Body>
          </View>
        </View>
        <View
          style={{ gap: 2 }}
          accessible
          accessibilityLabel={`Sodium: ${totals.sodium} of ${goals.sodium} milligrams`}
        >
          <Label>Sodium</Label>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <StatValue size={15} tone="secondary">
              {totals.sodium}
            </StatValue>
            <Body size={11} tone="muted">{`/ ${goals.sodium} mg`}</Body>
          </View>
        </View>
      </View>
    </Island>
  )
}

// --- One logged food --------------------------------------------------------

const EntryRow: React.FC<{ entry: FoodEntry; date: string }> = ({ entry, date }) => {
  const theme = useTheme()
  const removeFoodEntry = useStore(s => s.removeFoodEntry)
  const updateFoodEntry = useStore(s => s.updateFoodEntry)
  const addFoodEntry = useStore(s => s.addFoodEntry)
  const snackbar = useSnackbar()

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => formatAmount(entry.servings))

  const kcal = Math.round(entry.food.calories * entry.servings)
  const protein = Math.round(entry.food.protein * entry.servings)
  const carbs = Math.round(entry.food.carbs * entry.servings)
  const fat = Math.round(entry.food.fat * entry.servings)

  const perServing = `${formatAmount(entry.food.servingSize)} ${entry.food.servingUnit}`
  const amount = `${formatAmount(entry.servings)} × ${perServing}`
  const meta = entry.food.brand ? `${entry.food.brand} · ${amount}` : amount

  /** A serving of zero is not an edit, it is a deletion the user did not ask for. */
  const applyServings = (next: number) => {
    const safe = round2(Math.max(0.25, next))
    updateFoodEntry(date, entry.id, safe)
    setDraft(formatAmount(safe))
  }

  const commitDraft = () => {
    const parsed = Number.parseFloat(draft.replace(',', '.'))
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setDraft(formatAmount(entry.servings))
      return
    }
    applyServings(parsed)
  }

  const stepperStyle = {
    borderWidth: HAIRLINE,
    borderColor: theme.border,
    borderRadius: radius.control,
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: editing }}
        accessibilityLabel={`${entry.food.name}, ${amount}, ${kcal} kilocalories. ${
          editing ? 'Hide' : 'Show'
        } serving controls`}
        onPress={() => {
          setDraft(formatAmount(entry.servings))
          setEditing(value => !value)
        }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          minHeight: HIT_SIZE,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <View style={{ flex: 1, gap: 3 }}>
          <Body size={14} weight="medium" numberOfLines={1}>
            {entry.food.name}
          </Body>
          <Body size={12} tone="muted" numberOfLines={1}>
            {meta}
          </Body>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <StatValue size={17}>{kcal}</StatValue>
          <Body size={10} tone="muted">
            kcal
          </Body>
        </View>
      </Pressable>

      <MacroChips protein={protein} carbs={carbs} fat={fat} />

      {editing && (
        <View style={{ gap: spacing.sm, paddingBottom: spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <IconButton
              accessibilityLabel={`Decrease servings of ${entry.food.name}`}
              onPress={() => applyServings(entry.servings - 0.5)}
              style={stepperStyle}
            >
              <Minus size={18} color={theme.text} strokeWidth={2.2} />
            </IconButton>
            <View style={{ flex: 1 }}>
              <Field
                numeric
                value={draft}
                onChangeText={setDraft}
                onBlur={commitDraft}
                onSubmitEditing={commitDraft}
                keyboardType="decimal-pad"
                returnKeyType="done"
                selectTextOnFocus
                accessibilityLabel={`Servings of ${entry.food.name}`}
              />
            </View>
            <IconButton
              accessibilityLabel={`Increase servings of ${entry.food.name}`}
              onPress={() => applyServings(entry.servings + 0.5)}
              style={stepperStyle}
            >
              <Plus size={18} color={theme.text} strokeWidth={2.2} />
            </IconButton>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Body size={11} tone="muted" style={{ flex: 1 }}>
              {`Servings of ${perServing}`}
            </Body>
            <Button
              label="Remove"
              variant="ghost"
              onPress={() => {
                removeFoodEntry(date, entry.id)
                setEditing(false)
                snackbar.show(`${entry.food.name} removed`, {
                  label: 'Undo',
                  onPress: () => addFoodEntry(date, {
                    foodId: entry.food.id,
                    food: entry.food,
                    servings: entry.servings,
                    mealType: entry.mealType,
                  }),
                })
              }}
              icon={<Trash2 size={15} color={theme.status.critical} strokeWidth={2} />}
            />
          </View>
        </View>
      )}
    </View>
  )
}

// --- One meal ---------------------------------------------------------------

const MealCard: React.FC<{
  meal: MealType
  date: string
  entries: FoodEntry[]
  teach?: boolean
}> = ({ meal, date, entries, teach }) => {
  const theme = useTheme()
  const saveMealTemplate = useStore(s => s.saveMealTemplate)

  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const kcal = Math.round(
    entries.reduce((total, entry) => total + entry.food.calories * entry.servings, 0)
  )

  const saveTemplate = () => {
    // A name of only spaces is unfindable in the saved-meals row later, so it is refused
    // here rather than written and quietly lost.
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setError('Give this meal a name so you can find it again.')
      return
    }
    saveMealTemplate(trimmed, date, meal)
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setNaming(false)
    setName('')
    setError(null)
  }

  return (
    <Island style={{ padding: spacing.lg, gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <SectionTitle style={{ flex: 1 }}>{meal}</SectionTitle>

        {entries.length > 0 && (
          <View
            style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}
            accessible
            accessibilityLabel={`${kcal} kilocalories in ${meal}`}
          >
            <StatValue size={18}>{kcal}</StatValue>
            <Body size={11} tone="muted">
              kcal
            </Body>
          </View>
        )}

        {entries.length > 0 && (
          <IconButton
            accessibilityLabel={`Save ${meal} as a reusable meal`}
            onPress={() => {
              setError(null)
              setNaming(value => !value)
            }}
          >
            <BookmarkPlus
              size={19}
              color={naming ? theme.brandText : theme.textSecondary}
              strokeWidth={2}
            />
          </IconButton>
        )}
      </View>

      {entries.length === 0 ? (
        <Body size={13} tone="muted">
          {teach
            ? `Nothing logged for ${meal.toLowerCase()} yet. Use Add food to search, or the assistant to just describe what you ate.`
            : `Nothing logged for ${meal.toLowerCase()} yet.`}
        </Body>
      ) : (
        entries.map((entry, index) => (
          <View
            key={entry.id}
            style={
              index === 0
                ? undefined
                : { borderTopWidth: HAIRLINE, borderTopColor: theme.border, paddingTop: spacing.md }
            }
          >
            <EntryRow entry={entry} date={date} />
          </View>
        ))
      )}

      {naming && (
        <View
          style={{
            gap: spacing.sm,
            borderTopWidth: HAIRLINE,
            borderTopColor: theme.border,
            paddingTop: spacing.md,
          }}
        >
          <Field
            label="Save as"
            value={name}
            onChangeText={text => {
              setName(text)
              if (error !== null) setError(null)
            }}
            placeholder={`e.g. Standard ${meal.toLowerCase()}`}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={saveTemplate}
            accessibilityLabel={`Name for the saved ${meal}`}
          />

          {error !== null && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={14} color={theme.status.critical} strokeWidth={2.2} />
              <Body size={12} weight="medium" style={{ flex: 1, color: theme.status.critical }}>
                {error}
              </Body>
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label="Save meal" onPress={saveTemplate} />
            <Button
              label="Cancel"
              variant="ghost"
              onPress={() => {
                setNaming(false)
                setName('')
                setError(null)
              }}
            />
          </View>
        </View>
      )}

      <Button
        label="Add food"
        variant="secondary"
        icon={<Plus size={16} color={theme.text} strokeWidth={2.2} />}
        onPress={() => router.push({ pathname: '/food-search', params: { meal, date } })}
      />
    </Island>
  )
}

// --- Saved meals ------------------------------------------------------------

const SavedMeals: React.FC<{ date: string }> = ({ date }) => {
  const theme = useTheme()
  const templates = useStore(s => s.mealTemplates)
  const applyMealTemplate = useStore(s => s.applyMealTemplate)
  const deleteMealTemplate = useStore(s => s.deleteMealTemplate)
  const snackbar = useSnackbar()

  return (
    <Island style={{ padding: spacing.lg, gap: spacing.md }}>
      <View style={{ gap: 4 }}>
        <SectionTitle>Saved meals</SectionTitle>
        <Body size={12} tone="muted">
          {templates.length === 0
            ? 'Log a meal, then tap its bookmark to save it. Saved meals drop into any day in one tap.'
            : 'Tap one to add every item back into this day.'}
        </Body>
      </View>

      {templates.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.xs }}
        >
          {templates.map(template => {
            const kcal = Math.round(
              template.entries.reduce(
                (total, entry) => total + entry.food.calories * entry.servings,
                0
              )
            )
            const items = template.entries.length

            return (
              <View
                key={template.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  maxWidth: 260,
                  paddingLeft: spacing.md,
                  borderRadius: radius.control,
                  borderWidth: HAIRLINE,
                  borderColor: theme.border,
                  backgroundColor: theme.canvas,
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Add saved meal ${template.name} to this day. ${plural(
                    items,
                    'item'
                  )}, ${kcal} kilocalories`}
                  onPress={() => {
                    applyMealTemplate(template.id, date)
                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
                    // No undo offered: applyMealTemplate mints the new entry ids inside the
                    // store and returns nothing, so there is no handle to remove them again.
                    snackbar.show(`${template.name} added · ${plural(items, 'item')}`)
                  }}
                  style={({ pressed }) => ({
                    minHeight: HIT_SIZE,
                    justifyContent: 'center',
                    paddingRight: spacing.md,
                    paddingVertical: spacing.sm,
                    gap: 2,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Body size={13} weight="semibold" numberOfLines={1}>
                    {template.name}
                  </Body>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                    <StatValue size={13} tone="secondary">
                      {kcal}
                    </StatValue>
                    <Body size={11} tone="muted">
                      {`kcal · ${plural(items, 'item')}`}
                    </Body>
                  </View>
                </Pressable>

                <IconButton
                  accessibilityLabel={`Delete saved meal ${template.name}`}
                  onPress={() =>
                    Alert.alert(
                      'Delete saved meal',
                      `"${template.name}" will be removed. The food already logged from it stays where it is.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: () => deleteMealTemplate(template.id),
                        },
                      ],
                    )
                  }
                >
                  <Trash2 size={16} color={theme.textMuted} strokeWidth={2} />
                </IconButton>
              </View>
            )
          })}
        </ScrollView>
      )}
    </Island>
  )
}

// --- Screen -----------------------------------------------------------------

export default function DiaryScreen() {
  const theme = useTheme()
  // Recomputed every render rather than held in state: an app left open past midnight
  // would otherwise keep calling yesterday "Today".
  const today = getTodayString()
  const [date, setDate] = useState(today)

  /*
    Open on the day the caller was looking at.

    The dashboard has its own date navigator, so tapping Intake or a meal row while it showed
    Jul 29 used to land here on today — the same numbers the user had just navigated away from,
    with no sign the date had changed under them.

    The parameter is cleared once consumed. Without that it survives in the route, so switching
    to another tab and back would drag the user to that day again long after they had moved on.
  */
  const params = useGlobalSearchParams<{ date?: string }>()
  useEffect(() => {
    const requested = params.date
    if (typeof requested !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(requested)) return
    // A date after today would put the navigator past its own bound.
    if (requested <= today) setDate(requested)
    router.setParams({ date: undefined })
  }, [params.date, today])

  /*
    Only for someone who actually is new. Every day starts empty, so keying the hint on an
    empty day alone taught a two-year user how to log food every morning.
  */
  const onboardedAt = useStore(s => s.onboardedAt)
  const isNewUser = onboardedAt !== null && Date.now() - onboardedAt < 7 * 24 * 60 * 60 * 1000

  const storedDay = useStore(s => s.diary[date])
  const day = useMemo(() => storedDay ?? emptyDay(date), [storedDay, date])

  const byMeal = useMemo(() => {
    const grouped = new Map<MealType, FoodEntry[]>()
    for (const meal of MEAL_TYPES) grouped.set(meal, [])
    for (const entry of day.entries) {
      const bucket = grouped.get(entry.mealType)
      if (bucket) bucket.push(entry)
    }
    return grouped
  }, [day])

  return (
    <Screen
      title="Diary"
      right={
        <IconButton accessibilityLabel="Open AI Assistant" onPress={() => router.push('/chat')}>
          <Sparkles size={20} color={theme.brandText} strokeWidth={2} />
        </IconButton>
      }
    >
      <DateNavigator date={date} today={today} onChange={setDate} />
      <DayTotals day={day} />

      {/*
        One instance, always above the cards. It used to sit at the bottom when empty and jump
        to the top on the first save — which fires from inside a meal card, so the page moved
        under the finger that had just tapped it.
      */}
      <SavedMeals date={date} />

      {MEAL_TYPES.map((meal, index) => (
        <MealCard
          key={meal}
          meal={meal}
          date={date}
          entries={byMeal.get(meal) ?? []}
          /*
            First card, and only on a day with nothing in it at all. Keyed on the whole day
            rather than on this card being empty, so someone who logs lunch before breakfast
            is not told how to log food they have plainly already worked out how to log.
          */
          teach={index === 0 && day.entries.length === 0 && isNewUser}
        />
      ))}
    </Screen>
  )
}
