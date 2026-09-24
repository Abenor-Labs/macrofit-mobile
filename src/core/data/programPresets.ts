import type { TrainingStyle } from '../types'

/**
 * Starting points for a program. Every one is editable after it is picked — a preset exists
 * so that nobody faces seven empty days on their first visit, not to tell them how to train.
 *
 * Lift ids refer to LIFT_DATABASE. A rest day is written as `null`.
 */
export interface ProgramPreset {
  id: string
  style: TrainingStyle
  name: string
  summary: string
  days: ({ name: string; liftIds: string[] } | null)[]
}

export const PROGRAM_PRESETS: ProgramPreset[] = [
  {
    id: 'gym_bro_split',
    style: 'gym',
    name: 'Body-part split',
    summary: 'Chest, Back, Shoulders, Arms, Legs, then two rest days',
    days: [
      {
        name: 'Chest day',
        liftIds: [
          'lift_barbell_bench_press',
          'lift_dumbbell_incline_bench_press',
          'lift_dumbbell_chest_fly',
          'lift_bodyweight_dip',
        ],
      },
      {
        name: 'Back day',
        liftIds: [
          'lift_barbell_conventional_deadlift',
          'lift_bodyweight_pull_up',
          'lift_barbell_bent_over_row',
          'lift_dumbbell_row',
        ],
      },
      {
        name: 'Shoulder day',
        liftIds: [
          'lift_barbell_overhead_press',
          'lift_dumbbell_lateral_raise',
          'lift_dumbbell_rear_delt_fly',
          'lift_barbell_shrug',
        ],
      },
      {
        name: 'Arm day',
        liftIds: [
          'lift_barbell_curl',
          'lift_dumbbell_hammer_curl',
          'lift_barbell_close_grip_bench_press',
          'lift_dumbbell_overhead_tricep_extension',
        ],
      },
      {
        name: 'Leg day',
        liftIds: [
          'lift_barbell_back_squat',
          'lift_barbell_romanian_deadlift',
          'lift_dumbbell_bulgarian_split_squat',
          'lift_barbell_calf_raise',
        ],
      },
      null,
      null,
    ],
  },
  {
    id: 'gym_ppl',
    style: 'gym',
    name: 'Push / Pull / Legs',
    summary: 'Push, Pull, Legs, rest — and repeat',
    days: [
      {
        name: 'Push',
        liftIds: [
          'lift_barbell_bench_press',
          'lift_barbell_overhead_press',
          'lift_dumbbell_incline_bench_press',
          'lift_dumbbell_lateral_raise',
          'lift_dumbbell_skullcrusher',
        ],
      },
      {
        name: 'Pull',
        liftIds: [
          'lift_barbell_conventional_deadlift',
          'lift_bodyweight_pull_up',
          'lift_barbell_bent_over_row',
          'lift_dumbbell_rear_delt_fly',
          'lift_dumbbell_curl',
        ],
      },
      {
        name: 'Legs',
        liftIds: [
          'lift_barbell_back_squat',
          'lift_barbell_romanian_deadlift',
          'lift_dumbbell_lunge',
          'lift_barbell_calf_raise',
        ],
      },
      null,
    ],
  },
  {
    id: 'cali_ppl',
    style: 'calisthenics',
    name: 'Push / Pull / Legs & core',
    summary: 'Three bodyweight days, then rest — and repeat',
    days: [
      {
        name: 'Push',
        liftIds: [
          'lift_bodyweight_push_up',
          'lift_bodyweight_dip',
          'lift_bodyweight_pike_push_up',
        ],
      },
      {
        name: 'Pull',
        liftIds: [
          'lift_bodyweight_pull_up',
          'lift_bodyweight_chin_up',
          'lift_bodyweight_inverted_row',
        ],
      },
      {
        name: 'Legs & core',
        liftIds: [
          'lift_bodyweight_squat',
          'lift_bodyweight_glute_bridge',
          'lift_bodyweight_nordic_curl',
          'lift_bodyweight_hanging_leg_raise',
          'lift_bodyweight_plank',
        ],
      },
      null,
    ],
  },
  {
    id: 'cali_full_body',
    style: 'calisthenics',
    name: 'Full body, alternate days',
    summary: 'Full body, rest, full body, rest',
    days: [
      {
        name: 'Full body A',
        liftIds: [
          'lift_bodyweight_pull_up',
          'lift_bodyweight_push_up',
          'lift_bodyweight_squat',
          'lift_bodyweight_hanging_leg_raise',
        ],
      },
      null,
      {
        name: 'Full body B',
        liftIds: [
          'lift_bodyweight_dip',
          'lift_bodyweight_inverted_row',
          'lift_bodyweight_glute_bridge',
          'lift_bodyweight_plank',
        ],
      },
      null,
    ],
  },
]

export const presetsFor = (style: TrainingStyle): ProgramPreset[] =>
  PROGRAM_PRESETS.filter(preset => preset.style === style)
