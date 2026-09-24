import React, { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { Camera, Check, Minus, Plus } from 'lucide-react-native'

import { Island, Row } from '@/components/Material'
import { Button, IconButton } from '@/components/Button'
import { Pill } from '@/components/Layout'
import { Body, Label, StatValue } from '@/components/Text'
import { useTheme } from '@/theme/useTheme'
import { HIT_SIZE, radius, spacing } from '@/theme/tokens'
import type { AnalyzedFood } from '@/lib/api'
import type { MealType } from '@core/types'

const MEAL_TYPES: readonly MealType[] = [
  'Breakfast',
  'Lunch',
  'Dinner',
  'Snacks',
  'Pre-Workout',
  'Post-Workout',
]

const HAIRLINE = StyleSheet.hairlineWidth * 2

/** Half a serving is the smallest amount anyone eyeballs off a plate. */
const STEP = 0.5

/** Above this the number is no longer an estimate of a plate, it is a typo. */
const MAX_SERVINGS = 20

/** One reviewed item, at the count the user settled on. */
export interface PhotoReviewSelection {
  food: AnalyzedFood
  servings: number
}

export interface PhotoReviewProps {
  foods: AnalyzedFood[]
  /** Where the meal picker starts. Derived from the clock, not from the photo. */
  initialMeal: MealType
  onLog: (selection: PhotoReviewSelection[], meal: MealType) => void
  onRetake: () => void
  /** Blocks input while the turn that owns this card is busy. */
  disabled?: boolean
}

const formatAmount = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1)

/**
 * The editable result of a meal photo, shown before anything is written.
 *
 * WHY THIS IS NOT AUTO-LOGGED. A vision model estimates: it reads a plate and guesses both
 * what is on it and how much of it there is. Some of those guesses are wrong, and a wrong
 * guess written straight into the diary stops being a guess — it becomes a number the user
 * has to go and find, in a day they have already stopped looking at. The entire cost of
 * being right here is one tap on a button, so the card asks for the tap.
 *
 * Every item starts checked, at the count the model gave. Correcting is meant to be
 * subtraction — uncheck the thing that was never on the plate — rather than data entry.
 */
export const PhotoReview: React.FC<PhotoReviewProps> = ({
  foods,
  initialMeal,
  onLog,
  onRetake,
  disabled = false,
}) => {
  const theme = useTheme()
  const [meal, setMeal] = useState<MealType>(initialMeal)

  /*
    Both maps are keyed by index rather than by name, because a plate genuinely can hold two
    items the model named identically ("roti", "roti"), and keying by name would tie their
    checkboxes and their steppers together.
  */
  const [excluded, setExcluded] = useState<Record<number, true>>({})
  const [counts, setCounts] = useState<Record<number, number>>({})

  const servingsFor = (index: number): number => counts[index] ?? foods[index]?.servings ?? 1

  const toggle = (index: number) => {
    void Haptics.selectionAsync()
    setExcluded(prev => {
      const next = { ...prev }
      if (next[index]) delete next[index]
      else next[index] = true
      return next
    })
  }

  const step = (index: number, direction: 1 | -1) => {
    void Haptics.selectionAsync()
    setCounts(prev => {
      const current = prev[index] ?? foods[index]?.servings ?? 1
      const next = Math.min(MAX_SERVINGS, Math.max(STEP, current + direction * STEP))
      return { ...prev, [index]: next }
    })
  }

  /*
    Totals are derived, never stored. The model reports totals for the count it saw, so a
    per-serving figure is `calories / food.servings`, and a row's own figure is that times
    whatever its stepper is on.
  */
  const selection = useMemo<PhotoReviewSelection[]>(
    () =>
      foods
        .map((food, index) => ({ food, index }))
        .filter(item => !excluded[item.index])
        .map(({ food, index }) => ({ food, servings: counts[index] ?? food.servings })),
    [foods, excluded, counts],
  )

  const totals = useMemo(() => {
    let calories = 0
    let protein = 0
    let carbs = 0
    let fat = 0
    for (const { food, servings } of selection) {
      const scale = servings / food.servings
      calories += food.calories * scale
      protein += food.protein * scale
      carbs += food.carbs * scale
      fat += food.fat * scale
    }
    return { calories, protein, carbs, fat }
  }, [selection])

  const count = selection.length

  return (
    <Island style={{ overflow: 'hidden', flex: 1 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.lg,
          paddingBottom: spacing.md,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Label>{foods.length === 1 ? 'Found 1 item' : `Found ${foods.length} items`}</Label>
        </View>
        <Button
          label="Retake"
          variant="ghost"
          onPress={onRetake}
          disabled={disabled}
          icon={<Camera size={14} color={theme.text} strokeWidth={2} />}
        />
      </View>

      {foods.map((food, index) => {
        const checked = !excluded[index]
        const servings = servingsFor(index)
        const kcal = Math.round((food.calories / food.servings) * servings)

        return (
          <View key={`${food.name}-${index}`}>
            <View
              style={{
                height: StyleSheet.hairlineWidth,
                marginLeft: spacing.lg,
                backgroundColor: theme.hairline,
              }}
            />
            {/*
              A checkbox beside a single column, with the stepper UNDER the text rather than
              beside it. A name, an amount, a calorie figure and a three-part stepper do not
              fit on one line at 360dp, and the row that tries collapses into a vertical mess
              at exactly the widths real phones have.
            */}
            <Row style={{ alignItems: 'flex-start' }}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked, disabled }}
                accessibilityLabel={food.name}
                disabled={disabled}
                onPress={() => toggle(index)}
                hitSlop={spacing.sm}
                style={{
                  width: 26,
                  height: 26,
                  marginTop: 2,
                  borderRadius: radius.tiny,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: HAIRLINE,
                  borderColor: checked ? theme.brandText : theme.border,
                  backgroundColor: checked ? theme.brandText : 'transparent',
                }}
              >
                {checked ? <Check size={16} color={theme.brandOn} strokeWidth={3} /> : null}
              </Pressable>

              <View style={{ flex: 1, minWidth: 0, gap: spacing.sm }}>
                <View style={{ gap: 2 }}>
                  <Body
                    weight="medium"
                    numberOfLines={2}
                    tone={checked ? 'primary' : 'muted'}
                    style={checked ? undefined : { textDecorationLine: 'line-through' }}
                  >
                    {food.name}
                  </Body>
                  <Body size={12} tone="muted">
                    {formatAmount(servings)} × {formatAmount(food.servingSize)} {food.servingUnit}
                    {' · '}
                    {kcal} kcal
                  </Body>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <IconButton
                    accessibilityLabel={`One less serving of ${food.name}`}
                    onPress={() => step(index, -1)}
                    disabled={disabled || !checked || servings <= STEP}
                    style={{
                      borderWidth: HAIRLINE,
                      borderColor: theme.border,
                      borderRadius: radius.control,
                    }}
                  >
                    <Minus size={18} color={theme.text} strokeWidth={2.2} />
                  </IconButton>
                  <View style={{ minWidth: HIT_SIZE, alignItems: 'center' }}>
                    <StatValue size={17} tone={checked ? 'primary' : 'muted'}>
                      {formatAmount(servings)}
                    </StatValue>
                  </View>
                  <IconButton
                    accessibilityLabel={`One more serving of ${food.name}`}
                    onPress={() => step(index, 1)}
                    disabled={disabled || !checked || servings >= MAX_SERVINGS}
                    style={{
                      borderWidth: HAIRLINE,
                      borderColor: theme.border,
                      borderRadius: radius.control,
                    }}
                  >
                    <Plus size={18} color={theme.text} strokeWidth={2.2} />
                  </IconButton>
                </View>
              </View>
            </Row>
          </View>
        )
      })}

      <View
        style={{
          height: StyleSheet.hairlineWidth,
          marginLeft: spacing.lg,
          backgroundColor: theme.hairline,
        }}
      />

      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Label>Meal</Label>
        {/*
          A horizontal scroller rather than a wrapped grid: six meal names wrap to three
          ragged lines and push the Log button off the bottom of a bubble that is already
          tall.
        */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}
        >
          {MEAL_TYPES.map(option => (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ selected: meal === option, disabled }}
              accessibilityLabel={`Log to ${option}`}
              disabled={disabled}
              onPress={() => {
                void Haptics.selectionAsync()
                setMeal(option)
              }}
            >
              <Pill color={meal === option ? theme.brandText : undefined}>{option}</Pill>
            </Pressable>
          ))}
        </ScrollView>

        <View style={{ gap: 2, paddingTop: spacing.xs }}>
          <StatValue size={20}>{Math.round(totals.calories)}</StatValue>
          <Body size={12} tone="muted">
            kcal · {Math.round(totals.protein)}P {Math.round(totals.carbs)}C{' '}
            {Math.round(totals.fat)}F
          </Body>
        </View>

        <Button
          label={count === 1 ? 'Log 1 item' : `Log ${count} items`}
          onPress={() => onLog(selection, meal)}
          disabled={disabled || count === 0}
          full
          haptic
          icon={<Check size={15} color={theme.brandOn} strokeWidth={2.4} />}
        />
      </View>
    </Island>
  )
}
