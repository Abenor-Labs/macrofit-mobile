#!/usr/bin/env node

/*
  The REAL module, as scripts/check-auth-link.mjs does: Node strips the types on import, and
  src/lib/activity.ts is deliberately free of imports so nothing else has to be resolved.
*/
import assert from 'node:assert/strict'
import { activityLine, stepsSummary, topSetsLine, waterSummary } from '../src/lib/activity.ts'

const base = () => ({
  water: { todayMl: 2000, goalMl: 3000, avg7Ml: 2400 },
  steps: { today: 5000, avg7: 6000 },
  training: { today: { planned: null, done: null }, week: [], weeklyGoal: null },
})
const lunch = { meal: 'Lunch', share: 1 / 2 }
const dinner = { meal: 'Dinner', share: 1 }
const snack = { meal: 'Snacks', share: 'snack' }
const withTraining = (over = {}) => ({ ...base(), training: { ...base().training, today: { planned: 'Legs', done: null, ...over } } })

const CASES = [
  ['planned training, protein share rounded and clamped',
    () => activityLine(withTraining(), { proteinLeft: 99, hour: 12, next: lunch }),
    'Legs today, so get 50 g protein at lunch.'],
  ['finished session wins over planned name',
    () => activityLine(withTraining({ done: 'Push' }), { proteinLeft: 30, hour: 19, next: dinner }),
    'Push today, so get 30 g protein at dinner.'],
  ['small remainder clamps up to 20 g',
    () => activityLine(withTraining(), { proteinLeft: 12, hour: 12, next: lunch }),
    'Legs today, so get 20 g protein at lunch.'],
  ['snack slot gets a snack line',
    () => activityLine(withTraining(), { proteinLeft: 60, hour: 17, next: snack }),
    'Legs today. Have a protein snack before dinner.'],
  ['protein done: training line skipped',
    () => activityLine(withTraining(), { proteinLeft: 0, hour: 12, next: lunch }),
    null],
  ['after the last slot: training line skipped',
    () => activityLine(withTraining(), { proteinLeft: 40, hour: 23, next: null }),
    null],
  ['water behind at 15:00',
    () => activityLine({ ...base(), water: { todayMl: 600, goalMl: 3000, avg7Ml: 2400 } }, { proteinLeft: 50, hour: 15, next: lunch }),
    '0.6 L of 3.0 L so far. Have a glass with lunch.'],
  ['water: nothing before noon',
    () => activityLine({ ...base(), water: { todayMl: 0, goalMl: 3000, avg7Ml: 2400 } }, { proteinLeft: 50, hour: 11, minute: 59, next: lunch }),
    null],
  ['water: no goal, no line',
    () => activityLine({ ...base(), water: { todayMl: 0, goalMl: 0, avg7Ml: 0 } }, { proteinLeft: 50, hour: 18, next: dinner }),
    null],
  ['water on pace: no line',
    () => activityLine({ ...base(), water: { todayMl: 1000, goalMl: 3000, avg7Ml: 2400 } }, { proteinLeft: 50, hour: 15, next: lunch }),
    null],
  ['training beats water',
    () => activityLine({ ...withTraining(), water: { todayMl: 0, goalMl: 3000, avg7Ml: 0 } }, { proteinLeft: 60, hour: 15, next: lunch }),
    'Legs today, so get 30 g protein at lunch.'],
  ['big step day',
    () => activityLine({ ...base(), steps: { today: 11234, avg7: 6100 } }, { proteinLeft: 50, hour: 18, next: dinner }),
    '11k steps already, well above your usual 6.1k. Keep water up tonight.'],
  ['under 8k is not a big day',
    () => activityLine({ ...base(), steps: { today: 7900, avg7: 3000 } }, { proteinLeft: 50, hour: 18, next: dinner }),
    null],
  ['steps unknown: no line',
    () => activityLine({ ...base(), steps: null }, { proteinLeft: 50, hour: 18, next: dinner }),
    null],
  ['stepsSummary leaves out today and zero days',
    () => stepsSummary(9000, [{ date: '2026-09-27', steps: 5000 }, { date: '2026-09-28', steps: 0 }, { date: '2026-09-29', steps: 9000 }], '2026-09-29'),
    { today: 9000, avg7: 5000 }],
  ['stepsSummary is null without a reading',
    () => stepsSummary(null, [{ date: '2026-09-27', steps: 5000 }], '2026-09-29'),
    null],
  ['waterSummary averages the days given',
    () => waterSummary(600, 3000, [2000, 2500]),
    { todayMl: 600, goalMl: 3000, avg7Ml: 2250 }],
  ['topSetsLine: three biggest lifts by volume, heaviest completed set each',
    () => topSetsLine([
      { name: 'Squat', sets: [{ weightKg: 100, reps: 5, completed: true }, { weightKg: 110, reps: 3, completed: false }] },
      { name: 'RDL', sets: [{ weightKg: 80, reps: 8, completed: true }] },
      { name: 'Leg press', sets: [{ weightKg: 160, reps: 10, completed: true }] },
      { name: 'Calf raise', sets: [{ weightKg: 40, reps: 15, completed: true }] },
    ]),
    'Leg press 160×10, RDL 80×8, Calf raise 40×15'],
  ['topSetsLine: bodyweight-only session is empty',
    () => topSetsLine([{ name: 'Push-up', sets: [{ weightKg: 0, reps: 20, completed: true }] }]),
    ''],
]

let failed = 0
for (const [name, run, expected] of CASES) {
  try {
    assert.deepEqual(run(), expected)
    console.log(`  ok    ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  FAIL  ${name}\n        ${String(error.message).split('\n').join('\n        ')}`)
  }
}
console.log(failed ? `\n${failed} failed` : `\nall ${CASES.length} passed`)
process.exit(failed ? 1 : 0)
