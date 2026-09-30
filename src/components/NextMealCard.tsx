import React, { useMemo, useState } from 'react'
import { View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { Utensils } from '@/components/icons'
import { useStore } from '@/store/useStore'
import { suggestNextMeal, type MealIdeaItem } from '@/lib/nextMeal'
import { useSnackbar } from '@/components/Snackbar'
import { useTheme } from '@/theme/useTheme'
import { Surface } from '@/components/Glass'
import { Body, Label } from '@/components/Text'
import { Button } from '@/components/Button'
import { radius, spacing } from '@/theme/tokens'
import { getTodayString } from '@core/utils/calculations'

/** "Egg dosa (1)" → "Egg dosa". The serving lives in the count, and the diary keeps the detail. */
const baseName = (name: string): string => name.replace(/\s*\([^)]*\)\s*$/, '')

const describe = ({ food, servings }: MealIdeaItem): string =>
  servings === 1 ? baseName(food.name) : `${baseName(food.name)} ×${servings}`

/**
 * The coach speaking first: one concrete idea for the next meal, logged in one tap.
 *
 * Built from the person's own last two weeks at that meal (see src/lib/nextMeal.ts), so it
 * suggests pesarattu to someone who eats pesarattu, not a Western "balanced plate". It renders
 * nothing when there is nothing honest to suggest: late at night, every meal already logged,
 * or too little left to be worth a card.
 *
 * Logging it fills that meal, and the card moves on to the next one by itself.
 */
export const NextMealCard: React.FC = () => {
  const theme = useTheme()
  const diary = useStore(s => s.diary)
  const goals = useStore(s => s.goals)
  const addFoodEntry = useStore(s => s.addFoodEntry)
  const removeFoodEntry = useStore(s => s.removeFoodEntry)
  const updateStreak = useStore(s => s.updateStreak)
  const snackbar = useSnackbar()
  const [offset, setOffset] = useState(0)

  const idea = useMemo(() => suggestNextMeal(diary, goals, new Date(), offset), [diary, goals, offset])
  if (idea === null) return null

  const log = () => {
    const today = getTodayString()
    const before = new Set((useStore.getState().diary[today]?.entries ?? []).map(e => e.id))
    for (const item of idea.items) {
      addFoodEntry(today, {
        foodId: item.food.id,
        food: item.food,
        servings: item.servings,
        mealType: idea.meal,
      })
    }
    updateStreak()
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setOffset(0)

    // addFoodEntry does not return the ids it minted, so undo finds them by what is new.
    const added = (useStore.getState().diary[today]?.entries ?? [])
      .map(e => e.id)
      .filter(id => !before.has(id))
    snackbar.show(`${idea.meal} logged`, {
      label: 'Undo',
      onPress: () => added.forEach(id => removeFoodEntry(today, id)),
    })
  }

  const summary = idea.items.map(describe).join(' + ')
  const proteinNote =
    idea.proteinLeftAfter === 0 ? 'hits your protein for today' : `${idea.proteinLeftAfter} g protein still to go after`

  return (
    <Surface style={{ padding: spacing.lg, gap: spacing.md }}>
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
          <Utensils size={20} color={theme.brandText} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Label>{`${idea.meal} idea`}</Label>
          <Body size={15} weight="semibold">
            {summary}
          </Body>
          <Body size={13} tone="secondary">
            {`${idea.calories} kcal · ${idea.protein} g protein · ${proteinNote}`}
          </Body>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label="Log it" onPress={log} />
        <Button label="Another idea" variant="ghost" onPress={() => setOffset(o => o + 1)} />
      </View>
    </Surface>
  )
}
