import type { Lift, LiftEquipment, MuscleGroup } from '../types'

// ---------------------------------------------------------------------------
// STRENGTH LIFT CATALOG
//
// The `id` values below are PERSISTED IN USER DATA (workout sessions store
// `liftId`, templates store `liftIds`, PRs are keyed by `liftId`). They must
// NEVER change — renaming or re-slugging an id orphans every set a user has
// ever logged against that lift. Add new lifts freely; never edit an existing
// id. The display `name` may be corrected safely, the `id` may not.
//
// id format: 'lift_' + equipment (lowercase) + '_' + name in lowercase
// snake_case, e.g. 'lift_barbell_back_squat', 'lift_dumbbell_lateral_raise'.
//
// `muscleGroup` is the PRIMARY mover only, so weekly-volume charts do not
// double count a single set across several groups.
//
// `isCompound` is true for multi-joint movements — the load travels through
// more than one joint and drives several major muscle groups (squats, hinges,
// presses, rows, carries). Single-joint accessory work (curls, raises, flies,
// extensions, crunches, calf raises) is false. This flag drives the
// progressive-overload step size in `suggestNextSet` (+2.5 kg vs +1.25 kg).
//
// Cardio lives in EXERCISE_DATABASE in `foodDatabase.ts` and is unrelated.
// ---------------------------------------------------------------------------

/** Every built-in strength lift. Ids are stable and persisted — never rename one. */
export const LIFT_DATABASE: Lift[] = [
  // === BARBELL ===
  { id: 'lift_barbell_back_squat', name: 'Back Squat', muscleGroup: 'Quads', equipment: 'Barbell', isCompound: true },
  { id: 'lift_barbell_front_squat', name: 'Front Squat', muscleGroup: 'Quads', equipment: 'Barbell', isCompound: true },
  { id: 'lift_barbell_conventional_deadlift', name: 'Conventional Deadlift', muscleGroup: 'Back', equipment: 'Barbell', isCompound: true },
  { id: 'lift_barbell_sumo_deadlift', name: 'Sumo Deadlift', muscleGroup: 'Glutes', equipment: 'Barbell', isCompound: true },
  { id: 'lift_barbell_romanian_deadlift', name: 'Romanian Deadlift', muscleGroup: 'Hamstrings', equipment: 'Barbell', isCompound: true },
  { id: 'lift_barbell_bench_press', name: 'Bench Press', muscleGroup: 'Chest', equipment: 'Barbell', isCompound: true },
  { id: 'lift_barbell_incline_bench_press', name: 'Incline Bench Press', muscleGroup: 'Chest', equipment: 'Barbell', isCompound: true },
  { id: 'lift_barbell_close_grip_bench_press', name: 'Close-Grip Bench Press', muscleGroup: 'Triceps', equipment: 'Barbell', isCompound: true },
  { id: 'lift_barbell_overhead_press', name: 'Overhead Press', muscleGroup: 'Shoulders', equipment: 'Barbell', isCompound: true },
  { id: 'lift_barbell_push_press', name: 'Push Press', muscleGroup: 'Shoulders', equipment: 'Barbell', isCompound: true },
  { id: 'lift_barbell_bent_over_row', name: 'Bent-Over Row', muscleGroup: 'Back', equipment: 'Barbell', isCompound: true },
  { id: 'lift_barbell_pendlay_row', name: 'Pendlay Row', muscleGroup: 'Back', equipment: 'Barbell', isCompound: true },
  { id: 'lift_barbell_hip_thrust', name: 'Hip Thrust', muscleGroup: 'Glutes', equipment: 'Barbell', isCompound: true },
  { id: 'lift_barbell_good_morning', name: 'Good Morning', muscleGroup: 'Hamstrings', equipment: 'Barbell', isCompound: true },
  { id: 'lift_barbell_power_clean', name: 'Power Clean', muscleGroup: 'Full Body', equipment: 'Barbell', isCompound: true },
  { id: 'lift_barbell_clean_and_jerk', name: 'Clean and Jerk', muscleGroup: 'Full Body', equipment: 'Barbell', isCompound: true },
  { id: 'lift_barbell_thruster', name: 'Thruster', muscleGroup: 'Full Body', equipment: 'Barbell', isCompound: true },
  { id: 'lift_barbell_curl', name: 'Curl', muscleGroup: 'Biceps', equipment: 'Barbell', isCompound: false },
  { id: 'lift_barbell_shrug', name: 'Shrug', muscleGroup: 'Back', equipment: 'Barbell', isCompound: false },
  { id: 'lift_barbell_calf_raise', name: 'Calf Raise', muscleGroup: 'Calves', equipment: 'Barbell', isCompound: false },
  { id: 'lift_barbell_rollout', name: 'Rollout', muscleGroup: 'Core', equipment: 'Barbell', isCompound: false },

  // === DUMBBELL ===
  { id: 'lift_dumbbell_bench_press', name: 'Bench Press', muscleGroup: 'Chest', equipment: 'Dumbbell', isCompound: true },
  { id: 'lift_dumbbell_incline_bench_press', name: 'Incline Bench Press', muscleGroup: 'Chest', equipment: 'Dumbbell', isCompound: true },
  { id: 'lift_dumbbell_chest_fly', name: 'Chest Fly', muscleGroup: 'Chest', equipment: 'Dumbbell', isCompound: false },
  { id: 'lift_dumbbell_shoulder_press', name: 'Shoulder Press', muscleGroup: 'Shoulders', equipment: 'Dumbbell', isCompound: true },
  { id: 'lift_dumbbell_lateral_raise', name: 'Lateral Raise', muscleGroup: 'Shoulders', equipment: 'Dumbbell', isCompound: false },
  { id: 'lift_dumbbell_rear_delt_fly', name: 'Rear Delt Fly', muscleGroup: 'Shoulders', equipment: 'Dumbbell', isCompound: false },
  { id: 'lift_dumbbell_row', name: 'Row', muscleGroup: 'Back', equipment: 'Dumbbell', isCompound: true },
  { id: 'lift_dumbbell_pullover', name: 'Pullover', muscleGroup: 'Back', equipment: 'Dumbbell', isCompound: false },
  { id: 'lift_dumbbell_bulgarian_split_squat', name: 'Bulgarian Split Squat', muscleGroup: 'Quads', equipment: 'Dumbbell', isCompound: true },
  { id: 'lift_dumbbell_lunge', name: 'Lunge', muscleGroup: 'Quads', equipment: 'Dumbbell', isCompound: true },
  { id: 'lift_dumbbell_step_up', name: 'Step-Up', muscleGroup: 'Glutes', equipment: 'Dumbbell', isCompound: true },
  { id: 'lift_dumbbell_romanian_deadlift', name: 'Romanian Deadlift', muscleGroup: 'Hamstrings', equipment: 'Dumbbell', isCompound: true },
  { id: 'lift_dumbbell_farmers_walk', name: "Farmer's Walk", muscleGroup: 'Full Body', equipment: 'Dumbbell', isCompound: true },
  { id: 'lift_dumbbell_curl', name: 'Curl', muscleGroup: 'Biceps', equipment: 'Dumbbell', isCompound: false },
  { id: 'lift_dumbbell_hammer_curl', name: 'Hammer Curl', muscleGroup: 'Biceps', equipment: 'Dumbbell', isCompound: false },
  { id: 'lift_dumbbell_skullcrusher', name: 'Skullcrusher', muscleGroup: 'Triceps', equipment: 'Dumbbell', isCompound: false },
  { id: 'lift_dumbbell_overhead_tricep_extension', name: 'Overhead Tricep Extension', muscleGroup: 'Triceps', equipment: 'Dumbbell', isCompound: false },
  { id: 'lift_dumbbell_calf_raise', name: 'Calf Raise', muscleGroup: 'Calves', equipment: 'Dumbbell', isCompound: false },
  { id: 'lift_dumbbell_russian_twist', name: 'Russian Twist', muscleGroup: 'Core', equipment: 'Dumbbell', isCompound: false },

  // === BODYWEIGHT ===
  { id: 'lift_bodyweight_pull_up', name: 'Pull-Up', muscleGroup: 'Back', equipment: 'Bodyweight', isCompound: true },
  { id: 'lift_bodyweight_chin_up', name: 'Chin-Up', muscleGroup: 'Back', equipment: 'Bodyweight', isCompound: true },
  { id: 'lift_bodyweight_inverted_row', name: 'Inverted Row', muscleGroup: 'Back', equipment: 'Bodyweight', isCompound: true },
  { id: 'lift_bodyweight_back_extension', name: 'Back Extension', muscleGroup: 'Back', equipment: 'Bodyweight', isCompound: true },
  { id: 'lift_bodyweight_dip', name: 'Dip', muscleGroup: 'Triceps', equipment: 'Bodyweight', isCompound: true },
  { id: 'lift_bodyweight_push_up', name: 'Push-Up', muscleGroup: 'Chest', equipment: 'Bodyweight', isCompound: true },
  { id: 'lift_bodyweight_pike_push_up', name: 'Pike Push-Up', muscleGroup: 'Shoulders', equipment: 'Bodyweight', isCompound: true },
  { id: 'lift_bodyweight_squat', name: 'Squat', muscleGroup: 'Quads', equipment: 'Bodyweight', isCompound: true },
  { id: 'lift_bodyweight_glute_bridge', name: 'Glute Bridge', muscleGroup: 'Glutes', equipment: 'Bodyweight', isCompound: true },
  { id: 'lift_bodyweight_nordic_curl', name: 'Nordic Curl', muscleGroup: 'Hamstrings', equipment: 'Bodyweight', isCompound: false },
  { id: 'lift_bodyweight_calf_raise', name: 'Calf Raise', muscleGroup: 'Calves', equipment: 'Bodyweight', isCompound: false },
  { id: 'lift_bodyweight_plank', name: 'Plank', muscleGroup: 'Core', equipment: 'Bodyweight', isCompound: false },
  { id: 'lift_bodyweight_hanging_leg_raise', name: 'Hanging Leg Raise', muscleGroup: 'Core', equipment: 'Bodyweight', isCompound: false },
  { id: 'lift_bodyweight_sit_up', name: 'Sit-Up', muscleGroup: 'Core', equipment: 'Bodyweight', isCompound: false },
  { id: 'lift_bodyweight_burpee', name: 'Burpee', muscleGroup: 'Full Body', equipment: 'Bodyweight', isCompound: true },

  // === MACHINE ===
  { id: 'lift_machine_chest_press', name: 'Chest Press', muscleGroup: 'Chest', equipment: 'Machine', isCompound: true },
  { id: 'lift_machine_pec_deck', name: 'Pec Deck', muscleGroup: 'Chest', equipment: 'Machine', isCompound: false },
  { id: 'lift_machine_shoulder_press', name: 'Shoulder Press', muscleGroup: 'Shoulders', equipment: 'Machine', isCompound: true },
  { id: 'lift_machine_chest_supported_row', name: 'Chest Supported Row', muscleGroup: 'Back', equipment: 'Machine', isCompound: true },
  { id: 'lift_machine_assisted_pull_up', name: 'Assisted Pull-Up', muscleGroup: 'Back', equipment: 'Machine', isCompound: true },
  { id: 'lift_machine_leg_press', name: 'Leg Press', muscleGroup: 'Quads', equipment: 'Machine', isCompound: true },
  { id: 'lift_machine_hack_squat', name: 'Hack Squat', muscleGroup: 'Quads', equipment: 'Machine', isCompound: true },
  { id: 'lift_machine_leg_extension', name: 'Leg Extension', muscleGroup: 'Quads', equipment: 'Machine', isCompound: false },
  { id: 'lift_machine_leg_curl', name: 'Leg Curl', muscleGroup: 'Hamstrings', equipment: 'Machine', isCompound: false },
  { id: 'lift_machine_calf_raise', name: 'Calf Raise', muscleGroup: 'Calves', equipment: 'Machine', isCompound: false },
  { id: 'lift_machine_preacher_curl', name: 'Preacher Curl', muscleGroup: 'Biceps', equipment: 'Machine', isCompound: false },
  { id: 'lift_machine_ab_crunch', name: 'Ab Crunch', muscleGroup: 'Core', equipment: 'Machine', isCompound: false },

  // === CABLE ===
  { id: 'lift_cable_lat_pulldown', name: 'Lat Pulldown', muscleGroup: 'Back', equipment: 'Cable', isCompound: true },
  { id: 'lift_cable_seated_row', name: 'Seated Row', muscleGroup: 'Back', equipment: 'Cable', isCompound: true },
  { id: 'lift_cable_straight_arm_pulldown', name: 'Straight-Arm Pulldown', muscleGroup: 'Back', equipment: 'Cable', isCompound: false },
  { id: 'lift_cable_chest_fly', name: 'Chest Fly', muscleGroup: 'Chest', equipment: 'Cable', isCompound: false },
  { id: 'lift_cable_face_pull', name: 'Face Pull', muscleGroup: 'Shoulders', equipment: 'Cable', isCompound: false },
  { id: 'lift_cable_lateral_raise', name: 'Lateral Raise', muscleGroup: 'Shoulders', equipment: 'Cable', isCompound: false },
  { id: 'lift_cable_tricep_pushdown', name: 'Tricep Pushdown', muscleGroup: 'Triceps', equipment: 'Cable', isCompound: false },
  { id: 'lift_cable_curl', name: 'Curl', muscleGroup: 'Biceps', equipment: 'Cable', isCompound: false },
  { id: 'lift_cable_pull_through', name: 'Pull-Through', muscleGroup: 'Glutes', equipment: 'Cable', isCompound: true },
  { id: 'lift_cable_glute_kickback', name: 'Glute Kickback', muscleGroup: 'Glutes', equipment: 'Cable', isCompound: false },
  { id: 'lift_cable_crunch', name: 'Crunch', muscleGroup: 'Core', equipment: 'Cable', isCompound: false },
  { id: 'lift_cable_woodchop', name: 'Woodchop', muscleGroup: 'Core', equipment: 'Cable', isCompound: false },

  // === KETTLEBELL ===
  { id: 'lift_kettlebell_swing', name: 'Swing', muscleGroup: 'Glutes', equipment: 'Kettlebell', isCompound: true },
  { id: 'lift_kettlebell_goblet_squat', name: 'Goblet Squat', muscleGroup: 'Quads', equipment: 'Kettlebell', isCompound: true },
  { id: 'lift_kettlebell_turkish_get_up', name: 'Turkish Get-Up', muscleGroup: 'Full Body', equipment: 'Kettlebell', isCompound: true },

  // === BAND ===
  { id: 'lift_band_pull_apart', name: 'Pull-Apart', muscleGroup: 'Shoulders', equipment: 'Band', isCompound: false },
  { id: 'lift_band_curl', name: 'Curl', muscleGroup: 'Biceps', equipment: 'Band', isCompound: false },
  { id: 'lift_band_pushdown', name: 'Pushdown', muscleGroup: 'Triceps', equipment: 'Band', isCompound: false },
  { id: 'lift_band_lateral_walk', name: 'Lateral Walk', muscleGroup: 'Glutes', equipment: 'Band', isCompound: false },
]

const LIFT_BY_ID: ReadonlyMap<string, Lift> = new Map(LIFT_DATABASE.map((lift) => [lift.id, lift]))

/** Relevance tiers for search — lower sorts first. */
const RANK_NAME_PREFIX = 0
const RANK_NAME_SUBSTRING = 1
const RANK_MUSCLE_GROUP = 2
const RANK_EQUIPMENT = 3
const RANK_NO_MATCH = 99

interface ScoredLift {
  lift: Lift
  rank: number
  index: number
}

const rankLift = (lift: Lift, needle: string): number => {
  const name = lift.name.toLowerCase()
  if (name.startsWith(needle)) return RANK_NAME_PREFIX
  if (name.includes(needle)) return RANK_NAME_SUBSTRING
  const muscleGroup: MuscleGroup = lift.muscleGroup
  if (muscleGroup.toLowerCase().includes(needle)) return RANK_MUSCLE_GROUP
  const equipment: LiftEquipment = lift.equipment
  if (equipment.toLowerCase().includes(needle)) return RANK_EQUIPMENT
  return RANK_NO_MATCH
}

/**
 * Returns built-in lifts matching `query` (case-insensitive substring on name,
 * muscle group and equipment), best matches first, capped at `limit`.
 * An empty or whitespace-only query returns the first `limit` lifts unfiltered.
 * Returns an empty array when nothing matches or `limit` is <= 0 — never null.
 */
export const searchLifts = (query: string, limit = 20): Lift[] => {
  if (limit <= 0) return []
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return LIFT_DATABASE.slice(0, limit)

  const scored: ScoredLift[] = []
  for (let index = 0; index < LIFT_DATABASE.length; index++) {
    const lift = LIFT_DATABASE[index]
    const rank = rankLift(lift, needle)
    if (rank !== RANK_NO_MATCH) scored.push({ lift, rank, index })
  }

  // Rank first, then original catalog order so results are stable across calls.
  scored.sort((a, b) => (a.rank === b.rank ? a.index - b.index : a.rank - b.rank))
  return scored.slice(0, limit).map((entry) => entry.lift)
}

/** Returns the built-in lift with this id, or undefined if the id is unknown (e.g. a custom lift). */
export const getLiftById = (id: string): Lift | undefined => LIFT_BY_ID.get(id)
