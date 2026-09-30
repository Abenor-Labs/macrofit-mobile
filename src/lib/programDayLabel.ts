/**
 * What to call a program day, and what its training reminder says.
 *
 * A day nobody has named is stored as 'New day' (the store's default when a day is added, and
 * what a rest day becomes when it is switched to training). That is a placeholder, not a name,
 * and it leaked everywhere a name was shown: "Up next: New day", a "Start New day" button, a
 * history full of sessions called "New day", and a reminder titled "New day is up". An unnamed
 * day is called by its place in the plan instead.
 *
 * Import-free on purpose, like authLink.ts: scripts/check-program-day.mjs loads this exact file
 * with Node's own type stripping, which cannot resolve the app's path aliases.
 */

/** The store's default for a day nobody has named. */
const PLACEHOLDER = 'New day'

/** True for a blank name or the store's placeholder: the day has no name of its own yet. */
export const isUnnamedDay = (name: string): boolean => {
  const trimmed = name.trim()
  return trimmed === '' || trimmed === PLACEHOLDER
}

/** The day's own name, or "Day 2" for the second day of a plan when it has none. */
export const programDayLabel = (day: { name: string }, index: number): string =>
  isUnnamedDay(day.name) ? `Day ${index + 1}` : day.name.trim()

/** "Squat", "Squat and RDL", "Squat, RDL and Curl", "Squat, RDL and 2 more". */
const liftList = (names: string[]): string | null => {
  if (names.length === 0) return null
  if (names.length === 1) return names[0]
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
}

/**
 * The training-day reminder. `lastTime` is the last comparable session, already formatted
 * ("5,200 kg in 48 min"), or null when there is none to beat.
 */
export const trainingReminderText = (input: {
  name: string
  index: number
  liftNames: string[]
  lastTime: string | null
}): { title: string; body: string } => {
  const unnamed = isUnnamedDay(input.name)
  const title = unnamed ? 'Workout today' : `${input.name.trim()} today`
  if (input.lastTime !== null) return { title, body: `Last time: ${input.lastTime}. Beat it.` }

  const lifts = liftList(input.liftNames)
  if (unnamed) {
    const day = `Day ${input.index + 1}`
    return { title, body: lifts ? `${day}: ${lifts}. Tap to start.` : `${day} of your plan. Tap to start.` }
  }
  return { title, body: lifts ? `${lifts}. Tap to start.` : 'Your next session is ready. Tap to start.' }
}
