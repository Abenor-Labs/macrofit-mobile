import type { DiaryDay, MacroGoals } from '@core/types'
import { getDayNutrition, getTodayString } from '@core/utils/calculations'
import { formatNumber } from './formatNumber'
import { suggestNextMeal } from './nextMeal'
import { itemFromFood } from './coachWrites'
import type { MealOffer } from '@/store/coachStore'

/**
 * The coach's first line of the day, written on the phone with no model call.
 *
 * Opening the chat used to show the same canned welcome every time ("Hi! I'm your nutrition
 * assistant…"), which is the "dead" feeling in one sentence. The coach now opens with where
 * the day stands and, when it has one, a concrete next meal from what this person usually
 * eats, as a card they can log. Instant, free, and true, because every number is the app's.
 */

const greeting = (hour: number): string =>
  hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

export interface Opener {
  text: string
  offer?: MealOffer
}

export const buildOpener = (input: {
  name: string
  diary: Record<string, DiaryDay>
  goals: MacroGoals
  checkInDue: boolean
  now?: Date
}): Opener => {
  const now = input.now ?? new Date()
  const today = input.diary[getTodayString()]
  const eaten = today ? getDayNutrition(today) : null
  const first = input.name.trim().split(/\s+/)[0]
  const hello = `${greeting(now.getHours())}${first ? `, ${first}` : ''}.`

  const lines: string[] = []
  if (!eaten || eaten.calories === 0) {
    lines.push(`${hello} Nothing logged yet today; your target is **${formatNumber(input.goals.calories)} kcal** with ${input.goals.protein} g protein.`)
  } else {
    const kcalLeft = Math.round(input.goals.calories - eaten.calories)
    const proteinLeft = Math.round(input.goals.protein - eaten.protein)
    lines.push(
      `${hello} **${formatNumber(Math.round(eaten.calories))}** of ${formatNumber(input.goals.calories)} kcal in` +
        (kcalLeft >= 0 ? `, ${formatNumber(kcalLeft)} left` : `, ${formatNumber(-kcalLeft)} over`) +
        (proteinLeft > 0 ? `, and **${proteinLeft} g protein** still to go.` : ', and protein is done for the day.'),
    )
  }

  if (input.checkInDue) lines.push('Your weekly check-in is ready whenever you are.')

  // Last, because it introduces the card that renders under the text.
  const idea = suggestNextMeal(input.diary, input.goals, now)
  let offer: MealOffer | undefined
  if (idea) {
    lines.push(`${idea.meal} idea from what you usually eat:`)
    offer = { meal: idea.meal, items: idea.items.map(item => itemFromFood(item.food, item.servings)) }
  } else if (!input.checkInDue) {
    lines.push('Tell me what you ate, send a photo, or ask me anything about your week.')
  }

  return { text: lines.join('\n'), offer }
}
