import type { Lift } from '@core/types'
import { getLiftById } from '@core/data/exerciseDatabase'

/** A lift's display name from the library or the user's own lifts; null if it has gone. */
export const findLiftById = (liftId: string, customLifts: Lift[]): Lift | null =>
  customLifts.find(lift => lift.id === liftId) ?? getLiftById(liftId) ?? null

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** 'Mon' for a 'YYYY-MM-DD'. */
export const weekdayOf = (date: string): string => {
  const [y, m, d] = date.split('-').map(Number)
  return WEEKDAYS[new Date(y, m - 1, d).getDay()]
}
