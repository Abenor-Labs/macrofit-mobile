/**
 * What the coach knows about today's water, steps and training, and the one line the day's
 * opener may add about it.
 *
 * Import-free on purpose, like authLink.ts: scripts/check-activity.mjs loads this exact file
 * with Node's own type stripping, which cannot resolve the app's path aliases. Reading the
 * store and the core training helpers happens in coachContext.ts, which hands plain values in.
 *
 * Activity is context for WHAT and WHEN to eat, never HOW MUCH: targets come from the weigh-in
 * trend, and nothing here adds calories for steps or workouts.
 */

export interface Activity {
  water: { todayMl: number; goalMl: number; avg7Ml: number }
  /** null when Health Connect is not connected or has no reading for today: unknown, not zero. */
  steps: { today: number; avg7: number } | null
  training: {
    today: { planned: string | null; done: string | null }
    week: { date: string; name: string; topSets: string; prs: string[] }[]
    weeklyGoal: { done: number; target: number } | null
  }
}

/** The next day-part as nextMeal.ts defines it: its meal and its share of what is left. */
export interface NextSlot {
  meal: string
  share: number | 'snack'
}

export interface SetLike {
  weightKg: number
  reps: number
  completed: boolean
}

const mean = (values: number[]): number =>
  values.length === 0 ? 0 : Math.round(values.reduce((sum, v) => sum + v, 0) / values.length)
const round5 = (value: number): number => Math.round(value / 5) * 5
const litres = (ml: number): string => (ml / 1000).toFixed(1)
const formatKg = (kg: number): string => (Number.isInteger(kg) ? String(kg) : kg.toFixed(1))
/** 11234 → "11", 8600 → "8.6", 6000 → "6". */
const thousands = (n: number): string =>
  n >= 10000 ? String(Math.round(n / 1000)) : (n / 1000).toFixed(1).replace(/\.0$/, '')

/** `pastMl` is the previous seven days' intake, one value per day that has a diary row. */
export const waterSummary = (todayMl: number, goalMl: number, pastMl: number[]): Activity['water'] => ({
  todayMl: Math.max(0, Math.round(todayMl)),
  goalMl: Math.max(0, Math.round(goalMl)),
  avg7Ml: mean(pastMl),
})

/**
 * Zero-step days are left out of the usual: they are a phone on a desk or a band not worn, and
 * averaging them in would make an ordinary day look like a big one.
 */
export const stepsSummary = (
  todaySteps: number | null,
  weekSteps: { date: string; steps: number }[],
  today: string,
): Activity['steps'] => {
  if (todaySteps === null) return null
  const past = weekSteps.filter(day => day.date !== today && day.steps > 0).map(day => day.steps)
  return { today: Math.round(todaySteps), avg7: mean(past) }
}

/** "Leg press 160×10, RDL 80×8": the heaviest completed set of the three biggest lifts by volume. */
export const topSetsLine = (exercises: { name: string; sets: SetLike[] }[]): string =>
  exercises
    .map(ex => {
      const done = ex.sets.filter(set => set.completed && set.weightKg > 0 && set.reps > 0)
      const volume = done.reduce((sum, set) => sum + set.weightKg * set.reps, 0)
      const top = done.reduce<SetLike | null>((best, set) => (best === null || set.weightKg > best.weightKg ? set : best), null)
      return { name: ex.name, volume, top }
    })
    .filter((ex): ex is { name: string; volume: number; top: SetLike } => ex.top !== null)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 3)
    .map(ex => `${ex.name} ${formatKg(ex.top.weightKg)}×${ex.top.reps}`)
    .join(', ')

/**
 * At most one line, and only when there is something to act on. First match wins:
 * a training day with protein still to go, then water behind pace after noon, then a step
 * count well above the usual.
 */
export const activityLine = (
  activity: Activity,
  input: { proteinLeft: number; hour: number; minute?: number; next: NextSlot | null },
): string | null => {
  const { water, steps, training } = activity
  const name = training.today.done ?? training.today.planned
  if (name !== null && input.proteinLeft > 0 && input.next !== null) {
    if (input.next.share === 'snack') return `${name} today. Have a protein snack before dinner.`
    const grams = Math.min(50, Math.max(20, round5(input.proteinLeft * input.next.share)))
    return `${name} today, so get ${grams} g protein at ${input.next.meal.toLowerCase()}.`
  }

  // Pace: an even share of the goal between 07:00 and 22:00, with 40% slack before it counts.
  // The server's prompt uses the same rule (Macro-tracker api/_coach.ts, waterPace).
  const hour = input.hour + (input.minute ?? 0) / 60
  if (hour >= 12 && water.goalMl > 0 && water.todayMl < (0.6 * water.goalMl * (hour - 7)) / 15) {
    const meal = input.next === null ? 'your next meal' : input.next.share === 'snack' ? 'your snack' : input.next.meal.toLowerCase()
    return `${litres(water.todayMl)} L of ${litres(water.goalMl)} L so far. Have a glass with ${meal}.`
  }

  if (steps !== null && steps.avg7 > 0 && steps.today >= 8000 && steps.today >= 1.5 * steps.avg7) {
    return `${thousands(steps.today)}k steps already, well above your usual ${thousands(steps.avg7)}k. Keep water up tonight.`
  }

  return null
}
