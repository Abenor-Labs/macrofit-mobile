#!/usr/bin/env node

/*
  The REAL module, as scripts/check-auth-link.mjs does: Node strips the types on import, and
  src/lib/programDayLabel.ts is deliberately free of imports so nothing else has to be resolved.

  Why this exists: a day nobody named is stored as 'New day', and a training reminder went out
  titled "New day is up".
*/
import assert from 'node:assert/strict'
import { programDayLabel, trainingReminderText } from '../src/lib/programDayLabel.ts'

const CASES = [
  ['a named day keeps its name', () => programDayLabel({ name: 'Legs' }, 3), 'Legs'],
  ['the stored placeholder shows as its place in the plan', () => programDayLabel({ name: 'New day' }, 1), 'Day 2'],
  ['a blank name shows as its place in the plan', () => programDayLabel({ name: '   ' }, 0), 'Day 1'],
  ['surrounding spaces are not part of a name', () => programDayLabel({ name: '  Push  ' }, 0), 'Push'],

  ['named day, no history, lifts known',
    () => trainingReminderText({ name: 'Legs', index: 2, liftNames: ['Squat', 'RDL'], lastTime: null }),
    { title: 'Legs today', body: 'Squat and RDL. Tap to start.' }],
  ['unnamed day says which day and what is in it',
    () => trainingReminderText({ name: 'New day', index: 1, liftNames: ['Squat', 'Bench press', 'Row', 'Curl'], lastTime: null }),
    { title: 'Workout today', body: 'Day 2: Squat, Bench press and 2 more. Tap to start.' }],
  ['three lifts are listed in full',
    () => trainingReminderText({ name: 'Pull', index: 0, liftNames: ['Deadlift', 'Row', 'Curl'], lastTime: null }),
    { title: 'Pull today', body: 'Deadlift, Row and Curl. Tap to start.' }],
  ['a history to beat wins over the lift list',
    () => trainingReminderText({ name: 'New day', index: 0, liftNames: ['Squat'], lastTime: '5,200 kg in 48 min' }),
    { title: 'Workout today', body: 'Last time: 5,200 kg in 48 min. Beat it.' }],
  ['named day with no lifts and no history',
    () => trainingReminderText({ name: 'Legs', index: 0, liftNames: [], lastTime: null }),
    { title: 'Legs today', body: 'Your next session is ready. Tap to start.' }],
  ['unnamed day with no lifts still says which day',
    () => trainingReminderText({ name: '', index: 3, liftNames: [], lastTime: null }),
    { title: 'Workout today', body: 'Day 4 of your plan. Tap to start.' }],
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
