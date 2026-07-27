import type {
  Lift,
  MuscleGroup,
  PersonalRecord,
  WorkoutExercise,
  WorkoutSession,
  WorkoutSet,
} from '../types'

const MS_PER_DAY = 86_400_000
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Weight added when every working set hit its top rep count (kg). */
const COMPOUND_INCREMENT_KG = 2.5
const ISOLATION_INCREMENT_KG = 1.25

const round1 = (value: number): number =>
  Number.isFinite(value) ? Math.round(value * 10) / 10 : 0

const isNum = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

// Persisted data is a JSONB blob restored from the cloud, so arrays can legitimately
// be absent on older rows. These readers keep every traversal below total.
const sessionsOf = (workoutLog: WorkoutSession[]): WorkoutSession[] =>
  Array.isArray(workoutLog) ? workoutLog : []

const exercisesOf = (session: WorkoutSession): WorkoutExercise[] =>
  Array.isArray(session.exercises) ? session.exercises : []

const setsOf = (ex: WorkoutExercise): WorkoutSet[] => (Array.isArray(ex.sets) ? ex.sets : [])

/** A set that counts toward volume, set counts and progression: completed, not a warmup. */
const isWorkingSet = (set: WorkoutSet): boolean =>
  set.completed === true && set.isWarmup !== true && isNum(set.reps) && set.reps > 0

/** A session is "completed" only once it has been finished; in-progress ones have no endedAt. */
const isCompletedSession = (session: WorkoutSession): boolean => isNum(session.endedAt)

/** Midnight UTC in ms for a 'YYYY-MM-DD' string, or null when the string is not a valid date. */
const parseIsoDate = (date: string): number | null => {
  if (typeof date !== 'string' || !ISO_DATE.test(date)) return null
  const ms = Date.parse(`${date}T00:00:00Z`)
  return Number.isFinite(ms) ? ms : null
}

// ISO 'YYYY-MM-DD' sorts lexicographically in chronological order, so string
// comparison is safe here and avoids timezone parsing entirely.
const compareNewestFirst = (a: WorkoutSession, b: WorkoutSession): number => {
  const aDate = typeof a.date === 'string' ? a.date : ''
  const bDate = typeof b.date === 'string' ? b.date : ''
  if (aDate !== bDate) return aDate < bDate ? 1 : -1
  return (isNum(b.startedAt) ? b.startedAt : 0) - (isNum(a.startedAt) ? a.startedAt : 0)
}

/**
 * Estimated one-rep max in kg via the Epley formula (weight * (1 + reps/30)); returns
 * the weight itself at 1 rep or fewer, and 0 for non-finite or non-positive weight.
 */
export const epley1RM = (weightKg: number, reps: number): number => {
  if (!isNum(weightKg) || weightKg <= 0) return 0
  if (!isNum(reps) || reps <= 1) return round1(weightKg)
  return round1(weightKg * (1 + reps / 30))
}

/**
 * Volume load of a single set in kg (weightKg * reps); returns 0 for warmup sets,
 * incomplete sets, and any non-finite or non-positive weight/reps.
 */
export const setVolume = (set: WorkoutSet): number => {
  if (!isWorkingSet(set)) return 0
  if (!isNum(set.weightKg) || set.weightKg <= 0) return 0
  return round1(set.weightKg * set.reps)
}

/** Total volume load in kg across all completed working sets of one exercise. */
export const exerciseVolume = (ex: WorkoutExercise): number =>
  round1(setsOf(ex).reduce((total, set) => total + setVolume(set), 0))

/**
 * Total volume load in kg for a session. Sessions still in progress (no endedAt) are
 * included — volume is a live running total.
 */
export const sessionVolume = (session: WorkoutSession): number =>
  round1(exercisesOf(session).reduce((total, ex) => total + exerciseVolume(ex), 0))

/** Number of completed working sets in a session; warmup and unchecked sets are excluded. */
export const sessionSetCount = (session: WorkoutSession): number =>
  exercisesOf(session).reduce(
    (count, ex) => count + setsOf(ex).filter(isWorkingSet).length,
    0
  )

/**
 * Every session that contains the given lift, newest first (by date, then start time).
 * Returns an empty array when the lift has never been trained.
 */
export const getLiftHistory = (
  workoutLog: WorkoutSession[],
  liftId: string
): WorkoutSession[] =>
  sessionsOf(workoutLog)
    .filter((session) => exercisesOf(session).some((ex) => ex.liftId === liftId))
    .slice()
    .sort(compareNewestFirst)

interface PrAccumulator {
  liftId: string
  liftName: string
  bestWeightKg: number
  bestEstimated1RM: number
  best1RMOn: string
  bestSessionVolume: number
}

/**
 * Best weight, best Epley 1RM and best single-session volume for every lift with at
 * least one completed working set carrying load; returns an empty array for an empty
 * log. `achievedOn` is the date of the best estimated 1RM — the headline strength PR.
 */
export const getPersonalRecords = (workoutLog: WorkoutSession[]): PersonalRecord[] => {
  const records = new Map<string, PrAccumulator>()

  for (const session of sessionsOf(workoutLog)) {
    const date = typeof session.date === 'string' ? session.date : ''
    // One lift can appear as several exercise cards in a session (top set + back-offs),
    // so session volume is accumulated per lift before it is compared to the record.
    const sessionVolumeByLift = new Map<string, number>()

    for (const ex of exercisesOf(session)) {
      const lift = ex.lift
      if (!lift) continue
      const liftId = ex.liftId

      sessionVolumeByLift.set(
        liftId,
        (sessionVolumeByLift.get(liftId) ?? 0) + exerciseVolume(ex)
      )

      for (const set of setsOf(ex)) {
        if (!isWorkingSet(set) || !isNum(set.weightKg) || set.weightKg <= 0) continue
        const oneRM = epley1RM(set.weightKg, set.reps)
        const current = records.get(liftId)
        if (!current) {
          records.set(liftId, {
            liftId,
            liftName: lift.name,
            bestWeightKg: round1(set.weightKg),
            bestEstimated1RM: oneRM,
            best1RMOn: date,
            bestSessionVolume: 0,
          })
          continue
        }
        if (set.weightKg > current.bestWeightKg) current.bestWeightKg = round1(set.weightKg)
        if (oneRM > current.bestEstimated1RM) {
          current.bestEstimated1RM = oneRM
          current.best1RMOn = date
        }
      }
    }

    for (const [liftId, volume] of sessionVolumeByLift) {
      const current = records.get(liftId)
      if (current && volume > current.bestSessionVolume) {
        current.bestSessionVolume = round1(volume)
      }
    }
  }

  return Array.from(records.values())
    .map((record) => ({
      liftId: record.liftId,
      liftName: record.liftName,
      bestWeightKg: record.bestWeightKg,
      bestEstimated1RM: record.bestEstimated1RM,
      bestSessionVolume: record.bestSessionVolume,
      achievedOn: record.best1RMOn,
    }))
    .sort((a, b) => b.bestEstimated1RM - a.bestEstimated1RM)
}

/**
 * Next target weight/reps for a lift using double progression, or null when the lift has
 * no finished session with a completed working set — a starting weight is never invented.
 */
export const suggestNextSet = (
  workoutLog: WorkoutSession[],
  liftId: string,
  lift: Lift
): { weightKg: number; reps: number } | null => {
  const history = getLiftHistory(workoutLog, liftId).filter(isCompletedSession)

  for (const session of history) {
    const workingSets = exercisesOf(session)
      .filter((ex) => ex.liftId === liftId)
      .flatMap(setsOf)
      .filter(isWorkingSet)
    if (workingSets.length === 0) continue

    // Heaviest completed set defines the working weight; ties broken by the longer set.
    const topSet = workingSets.reduce((best, set) => {
      const bestWeight = isNum(best.weightKg) ? best.weightKg : 0
      const setWeight = isNum(set.weightKg) ? set.weightKg : 0
      if (setWeight > bestWeight) return set
      if (setWeight === bestWeight && set.reps > best.reps) return set
      return best
    }, workingSets[0])

    const workingWeight = isNum(topSet.weightKg) && topSet.weightKg > 0 ? topSet.weightKg : 0
    const topReps = workingSets.reduce((max, set) => (set.reps > max ? set.reps : max), 0)
    const lowReps = workingSets.reduce(
      (min, set) => (set.reps < min ? set.reps : min),
      topReps
    )
    const allHitTopReps = lowReps >= topReps

    // Bodyweight work carries no load to add, so it always progresses on reps.
    if (workingWeight <= 0) {
      return { weightKg: 0, reps: allHitTopReps ? topReps + 1 : lowReps + 1 }
    }

    if (allHitTopReps) {
      const increment = lift.isCompound ? COMPOUND_INCREMENT_KG : ISOLATION_INCREMENT_KG
      return { weightKg: round1(workingWeight + increment), reps: topReps }
    }

    // Reps fell short somewhere: hold the weight and bring the weakest set up by one.
    return { weightKg: round1(workingWeight), reps: lowReps + 1 }
  }

  return null
}

/**
 * Volume load and completed working-set count per muscle group over the last `weeks`
 * weeks ending on `today` (inclusive). Groups with no completed working sets are
 * omitted; returns an empty array for an empty log or a non-positive `weeks`.
 * When `today` is omitted the newest session date in the log is used, so the result
 * stays deterministic and free of any wall-clock dependency.
 */
export const weeklyVolumeByMuscle = (
  workoutLog: WorkoutSession[],
  weeks: number,
  today?: string
): Array<{ muscleGroup: MuscleGroup; volumeKg: number; sets: number }> => {
  const sessions = sessionsOf(workoutLog)
  if (sessions.length === 0 || !isNum(weeks) || weeks <= 0) return []

  const latestDate = sessions.reduce<string | null>((latest, session) => {
    const date = typeof session.date === 'string' && ISO_DATE.test(session.date) ? session.date : null
    if (!date) return latest
    return latest === null || date > latest ? date : latest
  }, null)

  const endMs = parseIsoDate(today ?? latestDate ?? '')
  if (endMs === null) return []
  // Inclusive window of exactly weeks * 7 days, ending on `today`.
  const startMs = endMs - (Math.floor(weeks * 7) - 1) * MS_PER_DAY

  const totals = new Map<MuscleGroup, { volumeKg: number; sets: number }>()

  for (const session of sessions) {
    const dateMs = parseIsoDate(session.date)
    if (dateMs === null || dateMs < startMs || dateMs > endMs) continue

    for (const ex of exercisesOf(session)) {
      const muscleGroup = ex.lift?.muscleGroup
      if (!muscleGroup) continue
      const working = setsOf(ex).filter(isWorkingSet)
      if (working.length === 0) continue

      const bucket = totals.get(muscleGroup) ?? { volumeKg: 0, sets: 0 }
      bucket.volumeKg += working.reduce((total, set) => total + setVolume(set), 0)
      bucket.sets += working.length
      totals.set(muscleGroup, bucket)
    }
  }

  return Array.from(totals.entries())
    .map(([muscleGroup, bucket]) => ({
      muscleGroup,
      volumeKg: round1(bucket.volumeKg),
      sets: bucket.sets,
    }))
    .sort((a, b) => b.volumeKg - a.volumeKg || b.sets - a.sets)
}
