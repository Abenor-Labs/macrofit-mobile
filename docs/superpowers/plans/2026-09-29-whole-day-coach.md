# Whole-Day Coach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The coach sees today's water, steps and the last week of training, uses it to shape what and when to eat (never how much), and the day's opener gains at most one activity line.

**Architecture:** The phone builds an optional `activity` block into the coach pack it already sends to `/api/chat`; the server renders it as an `ACTIVITY` prompt section with one new rule, and omits it when absent (1.4.2 phones, the web app). Pure logic lives in an import-free `src/lib/activity.ts` checked by a Node script; store and core-helper wiring lives in `src/lib/coachContext.ts`. Before any of it ships, the server's sign-in gate is deployed in `soft` mode so 1.4.1 phones keep working.

**Tech Stack:** Expo 57 / React Native 0.86 (TypeScript), zustand store, Vercel edge functions (`D:\Macro-tracker\api`), Nebius-hosted chat model, Node 24 native type stripping for checks, `npx tsx` for server scripts.

**Spec:** `docs/superpowers/specs/2026-09-29-whole-day-coach-and-speed-design.md` (sections 0 and 1).

---

## Corrections to the spec found while planning

1. The sign-in switch already exists: env `AI_AUTH` = `required` (default) | `soft` | `off` in `api/_auth.ts`. `soft` lets tokenless calls through. Task 1 only adds "a rejected token is let through in soft mode". **Deploying without `AI_AUTH=soft` set enforces sign-in at once** — Task 4 sets it first.
2. The chat's pack is built in `app/chat.tsx` (`buildChatContext` at ~line 408, `buildOpener` at ~line 308), not in `useCoachData`. Steps are read there.
3. The activity line goes **before** the meal-idea line in the opener, because that line introduces the card rendered under the text.

## File map

**Macro-tracker (`D:\Macro-tracker`)**
- Modify `api/_auth.ts` — soft mode lets a rejected token through.
- Create `scripts/check-ai-auth-soft.ts` — proves it against the real handler.
- Modify `api/_coach.ts` — `CoachPack.activity` type, `renderActivity`, rule 8.
- Create `scripts/check-coach-activity.ts` — prompt contains/omits the section.
- Modify `scripts/eval-coach.ts` — four activity scenarios.

**macrofit-mobile (`D:\macrofit-mobile`, branch `whole-day-coach-and-speed`)**
- Create `src/lib/activity.ts` — `Activity` type, `waterSummary`, `stepsSummary`, `topSetsLine`, `activityLine`. No imports.
- Create `scripts/check-activity.mjs` — checks for the above.
- Modify `package.json` — `test` runs both check scripts.
- Modify `src/lib/nextMeal.ts` — export `nextSlot(hour)`.
- Modify `src/lib/api.ts` — `CoachPack.activity`.
- Modify `src/lib/coachContext.ts` — `buildActivity`, `HealthSteps`, new `buildChatContext` parameter.
- Modify `src/lib/coachOpener.ts` — optional `activity` input, one line.
- Modify `app/chat.tsx` — read steps, pass health to both builders.

---

### Task 1: Soft mode lets a rejected token through (server)

**Files:**
- Modify: `D:\Macro-tracker\api\_auth.ts` (the `case 'rejected':` branch inside `requireAiCaller`, ~line 551)
- Create: `D:\Macro-tracker\scripts\check-ai-auth-soft.ts`

- [ ] **Step 1: Write the failing check**

Create `D:\Macro-tracker\scripts\check-ai-auth-soft.ts`:

```ts
/**
 * Soft mode must keep old and lapsed builds working: a call with no token, or with a token
 * Supabase rejects, is let through (and then fails validation on its empty body, 400) instead
 * of being told to sign in (401).
 *
 *   npx tsx --env-file=.env scripts/check-ai-auth-soft.ts
 *
 * Needs SUPABASE_URL and SUPABASE_ANON_KEY in .env: the rejected-token case asks Supabase.
 */
process.env.AI_AUTH = 'soft'

const main = async (): Promise<void> => {
  const handler = (await import('../api/chat')).default
  const call = (headers: Record<string, string>) =>
    handler(new Request('http://local/api/chat', { method: 'POST', headers, body: '{}' }))

  const cases: { name: string; headers: Record<string, string> }[] = [
    { name: 'no token', headers: {} },
    { name: 'rejected token', headers: { authorization: 'Bearer not-a-real-session-token' } },
  ]

  let failed = 0
  for (const c of cases) {
    const res = await call(c.headers)
    const ok = res.status === 400
    if (!ok) failed += 1
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${c.name}: ${res.status}${ok ? '' : ' (expected 400)'}`)
  }
  process.exit(failed ? 1 : 0)
}

void main()
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /d/Macro-tracker && npx tsx --env-file=.env scripts/check-ai-auth-soft.ts`
Expected: `[PASS] no token: 400` and `[FAIL] rejected token: 401 (expected 400)`, exit code 1.

- [ ] **Step 3: Let the rejected token through in soft mode**

In `D:\Macro-tracker\api\_auth.ts`, replace the `case 'rejected':` branch of `requireAiCaller`:

```ts
    case 'rejected':
      explainForeignToken(token, SUPABASE.url)
      return json({ error: SESSION_REJECTED }, 401)
```

with:

```ts
    case 'rejected':
      explainForeignToken(token, SUPABASE.url)
      /*
        Soft mode keeps a build with a lapsed session working exactly as it keeps a build with
        no session: through, uncounted. Refusing it here would cut off precisely the 1.4.2
        users whose sign-in expired, while tokenless 1.4.1 calls sail through.
      */
      if (AI_AUTH_MODE === 'soft') {
        noteTokenless(endpoint, Date.now())
        return { userId: null }
      }
      return json({ error: SESSION_REJECTED }, 401)
```

- [ ] **Step 4: Run the check to verify it passes**

Run: `cd /d/Macro-tracker && npx tsx --env-file=.env scripts/check-ai-auth-soft.ts`
Expected: two `[PASS]` lines, exit code 0.

- [ ] **Step 5: Typecheck**

Macro-tracker's `tsconfig.json` covers only `src/`, so `api/` is checked explicitly:
Run: `cd /d/Macro-tracker && npx tsc --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler --lib es2022,dom --types node api/chat.ts api/_auth.ts api/_coach.ts`
Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
cd /d/Macro-tracker
git add api/_auth.ts scripts/check-ai-auth-soft.ts
git commit -m "Let a rejected session through in soft AI auth mode

Soft mode exists to keep builds that cannot sign their AI calls working.
A 1.4.2 phone whose session lapsed sends a token Supabase rejects, and was
told to sign in again while a tokenless 1.4.1 call went through. Both now
pass uncounted until AI_AUTH is set to required."
```

---

### Task 2: ACTIVITY section in the coach prompt (server)

**Files:**
- Modify: `D:\Macro-tracker\api\_coach.ts` (`CoachPack` ~line 49; helpers ~line 440; prompt ~lines 521-541)
- Create: `D:\Macro-tracker\scripts\check-coach-activity.ts`

- [ ] **Step 1: Write the failing check**

Create `D:\Macro-tracker\scripts\check-coach-activity.ts`:

```ts
/**
 * The ACTIVITY section appears when the phone sends activity, is absent when it does not, and
 * the no-eat-back rule is always in the prompt.
 *
 *   npx tsx scripts/check-coach-activity.ts
 */
import { buildCoachPrompt, type CoachContext } from '../api/_coach'

const withActivity: CoachContext = {
  coach: {
    now: 'Tuesday 29 Sep, 15:00',
    activity: {
      water: { todayMl: 600, goalMl: 3000, avg7Ml: 2250 },
      steps: null,
      training: {
        today: { planned: 'Legs', done: null },
        week: [{ date: '2026-09-27', name: 'Legs', topSets: 'Squat 100×5, RDL 80×8', prs: ['Squat'] }],
        weeklyGoal: { done: 2, target: 4 },
      },
    },
  },
}

const checks: [string, boolean][] = []
const on = buildCoachPrompt(withActivity)
const off = buildCoachPrompt({ coach: { now: 'Tuesday 29 Sep, 15:00' } })

checks.push(['section present', on.includes('ACTIVITY (context for WHAT and WHEN to eat')])
checks.push(['water line', on.includes('Water: 0.6 L of 3.0 L today, 7-day average 2.3 L')])
checks.push(['steps not connected', on.includes('Steps: not connected')])
checks.push(['training today', on.includes('Training today: planned: Legs')])
checks.push(['weekly goal', on.includes('This week: 2 of 4 sessions')])
checks.push(['session line', on.includes('2026-09-27 Legs: Squat 100×5, RDL 80×8 | PRs: Squat')])
checks.push(['section absent without activity', !off.includes('ACTIVITY (')])
checks.push(['rule always present', off.includes('never add calories for steps or workouts')])

let failed = 0
for (const [name, ok] of checks) {
  if (!ok) failed += 1
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}`)
}
process.exit(failed ? 1 : 0)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /d/Macro-tracker && npx tsx scripts/check-coach-activity.ts`
Expected: a TypeScript/runtime complaint or FAIL lines (the `activity` field and section do not exist yet), exit code 1.

- [ ] **Step 3: Add the type**

In `api/_coach.ts`, inside `export interface CoachPack { ... }`, after `nextMealIdea?: string`, add:

```ts
  /**
   * Today's water, steps and the last week of training, from the phone. Absent from 1.4.2
   * phones and the web app, in which case the prompt has no ACTIVITY section.
   */
  activity?: {
    water: { todayMl: number; goalMl: number; avg7Ml: number }
    /** null: Health Connect is not connected, so steps are unknown, not zero. */
    steps: { today: number; avg7: number } | null
    training: {
      today: { planned: string | null; done: string | null }
      week: { date: string; name: string; topSets: string; prs: string[] }[]
      weeklyGoal: { done: number; target: number } | null
    }
  }
```

- [ ] **Step 4: Add the renderer**

In `api/_coach.ts`, directly after `const renderWeights = ...` (ends ~line 443), add:

```ts
const litres = (ml: number): string => (ml / 1000).toFixed(1)

const renderActivity = (activity: CoachPack['activity']): string => {
  if (!activity) return ''
  const { water, steps, training } = activity
  const today = training.today.done
    ? `done: ${training.today.done}`
    : training.today.planned
      ? `planned: ${training.today.planned}`
      : 'rest or nothing planned'
  const lines = [
    'ACTIVITY (context for WHAT and WHEN to eat; it never changes calorie targets)',
    `  Water: ${litres(water.todayMl)} L of ${litres(water.goalMl)} L today, 7-day average ${litres(water.avg7Ml)} L`,
    `  Steps: ${steps ? `${steps.today} today, usual ${steps.avg7}` : 'not connected (Health Connect is off); never estimate them'}`,
    `  Training today: ${today}`,
  ]
  if (training.weeklyGoal) lines.push(`  This week: ${training.weeklyGoal.done} of ${training.weeklyGoal.target} sessions`)
  if (training.week.length === 0) lines.push('  (no workouts in the last 7 days)')
  for (const s of training.week) {
    lines.push(`  ${s.date} ${s.name}: ${s.topSets || 'no weighted sets'}${s.prs.length ? ` | PRs: ${s.prs.join(', ')}` : ''}`)
  }
  return `${lines.join('\n')}\n`
}
```

- [ ] **Step 5: Render it and add the rule**

In `buildCoachPrompt`'s template string, replace:

```ts
ENERGY
  Predicted TDEE ${round(energy.predictedTdee)} kcal | Measured TDEE ${energy.measuredTdee == null ? 'not enough data' : round(energy.measuredTdee)} kcal (confidence ${energy.confidence ?? 'none'}, ${round(energy.daysOfData)} days) | Weight trend ${energy.trendKgPerWeek == null ? 'unknown' : `${energy.trendKgPerWeek.toFixed(2)} kg/week`}

CURRENT PLAN
```

with:

```ts
ENERGY
  Predicted TDEE ${round(energy.predictedTdee)} kcal | Measured TDEE ${energy.measuredTdee == null ? 'not enough data' : round(energy.measuredTdee)} kcal (confidence ${energy.confidence ?? 'none'}, ${round(energy.daysOfData)} days) | Weight trend ${energy.trendKgPerWeek == null ? 'unknown' : `${energy.trendKgPerWeek.toFixed(2)} kg/week`}

${renderActivity(pack.activity)}CURRENT PLAN
```

Then replace:

```ts
7. Propose new targets (propose_targets) only when the data supports it, or in the check-in.
```

with:

```ts
7. Propose new targets (propose_targets) only when the data supports it, or in the check-in.
8. ACTIVITY shapes what and when, never how much: never add calories for steps or workouts, because the targets already come from the weigh-in trend in ENERGY. If asked to "eat back" activity, say that in one line, then help place today's remaining calories: carbs around training, protein spread across meals, a recovery meal after a session. Mention water only when today is below pace for the time of day. When steps are not connected, never guess a number; you may suggest connecting Health Connect once.
```

- [ ] **Step 6: Run the check to verify it passes**

Run: `cd /d/Macro-tracker && npx tsx scripts/check-coach-activity.ts`
Expected: eight `[PASS]` lines, exit 0.

- [ ] **Step 7: Typecheck**

Run: `cd /d/Macro-tracker && npx tsc --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler --lib es2022,dom --types node api/chat.ts api/_auth.ts api/_coach.ts`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
cd /d/Macro-tracker
git add api/_coach.ts scripts/check-coach-activity.ts
git commit -m "Give the coach today's water, steps and training

The phone can now send an activity block: water against the goal, steps
against the usual (or not connected), today's planned or finished session
and the last week of sessions with top sets and PRs. It renders as an
ACTIVITY section, absent when the phone sends none.

Rule 8 keeps activity to what and when: targets come from the weigh-in
trend, so the coach never adds calories for steps or workouts."
```

---

### Task 3: Activity scenarios in the coach eval (server)

**Files:**
- Modify: `D:\Macro-tracker\scripts\eval-coach.ts` (add a helper after `baseContext`, add four entries to `SCENARIOS`)

- [ ] **Step 1: Add the activity fixture**

In `scripts/eval-coach.ts`, directly after the `baseContext` declaration (ends ~line 74), add:

```ts
// A training week for the activity scenarios: legs planned today, two sessions logged.
const activity = (over: Record<string, unknown> = {}) => ({
  water: { todayMl: 1800, goalMl: 3000, avg7Ml: 2400 },
  steps: { today: 6200, avg7: 6000 },
  training: {
    today: { planned: 'Legs', done: null },
    week: [
      { date: dayString(2), name: 'Push', topSets: 'Bench press 70×6, Overhead press 40×8', prs: [] },
      { date: dayString(4), name: 'Pull', topSets: 'Deadlift 140×3, Row 60×10', prs: ['Deadlift'] },
    ],
    weeklyGoal: { done: 2, target: 4 },
  },
  ...over,
})
const withActivity = (now: string, over: Record<string, unknown> = {}) => ({
  coach: { ...baseContext.coach, now, activity: activity(over) },
})
```

- [ ] **Step 2: Add the four scenarios**

Append these entries to the `SCENARIOS` array (before its closing `]`):

```ts
  {
    name: 'legday',
    run: async () => {
      const reply = await ask('what should I have for lunch?', withActivity('Tuesday 29 Sep, 12:10'))
      const raised = reply.actions.some(a => a.tool === 'propose_targets' && a.input.calories > 1900)
      const pass = has(reply, 'offer_meal') && !raised
      return { reply, pass, why: `${has(reply, 'offer_meal') ? 'offered lunch' : 'no offer'}${raised ? ', RAISED calories' : ''}` }
    },
  },
  {
    name: 'eatback',
    run: async () => {
      const reply = await ask('I walked 15k steps today, can I eat more?', withActivity('Tuesday 29 Sep, 18:30', { steps: { today: 15200, avg7: 6100 } }))
      const raised = has(reply, 'propose_targets')
      const earned = /\bearn(ed)?\b/i.test(reply.text)
      const explains = /weigh|trend|target/i.test(reply.text)
      return { reply, pass: !raised && !earned && explains, why: `${raised ? 'proposed targets, ' : ''}${earned ? 'says "earned", ' : ''}${explains ? 'explains weigh-in targets' : 'no explanation'}` }
    },
  },
  {
    name: 'water',
    run: async () => {
      const reply = await ask("what's a good snack?", withActivity('Tuesday 29 Sep, 15:00', { water: { todayMl: 600, goalMl: 3000, avg7Ml: 2400 } }))
      const nudges = (reply.text.match(/water|glass/gi) ?? []).length
      return { reply, pass: nudges >= 1 && nudges <= 3, why: `${nudges} water mention(s)` }
    },
  },
  {
    name: 'nosteps',
    run: async () => {
      const reply = await ask('how active was I today?', withActivity('Tuesday 29 Sep, 20:00', { steps: null }))
      const invented = /\b\d{1,2}[,.]?\d{3}\s*steps\b/i.test(reply.text)
      const says = /connect|not (tracking|connected)|no step/i.test(reply.text)
      return { reply, pass: !invented && says, why: invented ? 'INVENTED a step count' : says ? 'says steps are not connected' : 'did not say' }
    },
  },
```

- [ ] **Step 3: Update the header comment**

In the file's top comment, after the `veg` line, add:

```
 *   legday     a lunch question on a training day gets a meal card, no calorie raise
 *   eatback    "can I eat more after 15k steps?" adds no calories and explains why
 *   water      a question at 15:00 with 0.6 of 3 L gets one water nudge, not a lecture
 *   nosteps    with Health Connect off, the coach never invents a step count
```

- [ ] **Step 4: Run the eval**

Run: `cd /d/Macro-tracker && npx tsx --env-file=.env scripts/eval-coach.ts`
Expected: `SUMMARY ...: 10/10 passed`. Read each FAIL's printed reply; if a scenario fails because of the prompt (not the check), adjust rule 8's wording in `api/_coach.ts`, re-run Task 2's check, and re-run the eval. Do not loosen a check to make it pass.

- [ ] **Step 5: Commit**

```bash
cd /d/Macro-tracker
git add scripts/eval-coach.ts api/_coach.ts
git commit -m "Eval the coach on training days, eat-back, water and missing steps"
```

---

### Task 4: Deploy the server in soft mode (owner-gated)

This task changes production. Do every step only with the owner's explicit go, and stop at any unexpected result.

**Files:** none (deployment)

- [ ] **Step 1: Confirm the deploy route with the owner**

This laptop's Vercel CLI is not logged in (`npx vercel ls` → "missing an authentication token"), and none of Macro-tracker's recent commits is on a remote. Ask the owner which route to use:
- **CLI:** the owner runs `cd /d/Macro-tracker && npx vercel login` once; or
- **Git:** push to the remote Vercel builds from (`git push fork HEAD` if Vercel watches `warpirate/Macro-tracker`).

- [ ] **Step 2: Set AI_AUTH=soft on production BEFORE deploying**

CLI route:
```bash
cd /d/Macro-tracker
printf 'soft' | npx vercel env add AI_AUTH production
npx vercel env ls production | grep AI_AUTH
```
Expected: `AI_AUTH` listed for Production. (Dashboard route: Project → Settings → Environment Variables → `AI_AUTH` = `soft`, Production.)

- [ ] **Step 3: Deploy**

CLI route: `cd /d/Macro-tracker && npx vercel --prod`
Expected: a production URL and "Aliased: https://macro-tracker-livid-chi.vercel.app".

- [ ] **Step 4: Verify from outside**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://macro-tracker-livid-chi.vercel.app/api/chat -H 'content-type: application/json' -d '{}'
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://macro-tracker-livid-chi.vercel.app/api/chat -H 'content-type: application/json' -H 'authorization: Bearer not-a-real-session-token' -d '{}'
```
Expected: `400` and `400`. A `401` means `AI_AUTH` is not `soft` on the deployment: set it and redeploy.

- [ ] **Step 5: Verify on the owner's phone**

Owner opens the coach in MacroFit 1.4.2 and sends "remember I don't eat beef". Expected: a "Remembered" note under the reply. If none: the deploy did not take; stop.

- [ ] **Step 6: Push the commits so the repo matches production**

```bash
cd /d/Macro-tracker && git push fork HEAD
```

---

### Task 5: The pure activity module (app)

**Files:**
- Create: `D:\macrofit-mobile\src\lib\activity.ts`
- Create: `D:\macrofit-mobile\scripts\check-activity.mjs`
- Modify: `D:\macrofit-mobile\package.json` (`test` script)

- [ ] **Step 1: Write the failing check**

Create `scripts/check-activity.mjs`:

```js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /d/macrofit-mobile && node scripts/check-activity.mjs`
Expected: `ERR_MODULE_NOT_FOUND` for `src/lib/activity.ts`.

- [ ] **Step 3: Write the module**

Create `src/lib/activity.ts`:

```ts
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
```

- [ ] **Step 4: Run the check to verify it passes**

Run: `cd /d/macrofit-mobile && node scripts/check-activity.mjs`
Expected: `all 19 passed`, exit 0.

- [ ] **Step 5: Run both checks from `npm test`**

In `package.json`, change:
```json
    "test": "node scripts/check-auth-link.mjs && node scripts/check-program-day.mjs",
```
to:
```json
    "test": "node scripts/check-auth-link.mjs && node scripts/check-program-day.mjs && node scripts/check-activity.mjs",
```
Run: `cd /d/macrofit-mobile && npm test`
Expected: both scripts pass, exit 0.

- [ ] **Step 6: Commit**

```bash
cd /d/macrofit-mobile
git add src/lib/activity.ts scripts/check-activity.mjs package.json
git commit -m "Add the coach's water, steps and training summaries and opener line

Pure and import-free so scripts/check-activity.mjs can load the real module:
water against the goal and the week, steps against the usual (null when
Health Connect is off), a session's top sets, and at most one opener line:
training day with protein to go, then water behind pace after noon, then a
step count well above the usual.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Export the next day-part (app)

**Files:**
- Modify: `D:\macrofit-mobile\src\lib\nextMeal.ts` (after the `SLOTS` constant, ~line 54)

- [ ] **Step 1: Add the export**

Directly after the `SLOTS` array's closing `]`, add:

```ts
/**
 * The day-part that comes next at `hour`, or null once the last one has ended. Shared with the
 * coach opener's activity line, so its "at lunch" matches the Today card's idea.
 */
export const nextSlot = (hour: number): { meal: MealType; share: number | 'snack' } | null => {
  const slot = SLOTS.find(s => hour < s.until)
  return slot ? { meal: slot.meal, share: slot.share } : null
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /d/macrofit-mobile && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
cd /d/macrofit-mobile
git add src/lib/nextMeal.ts
git commit -m "Export the next meal slot for the coach opener

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Build the activity block into the coach pack (app)

**Files:**
- Modify: `D:\macrofit-mobile\src\lib\api.ts` (`CoachPack`, ~line 104)
- Modify: `D:\macrofit-mobile\src\lib\coachContext.ts` (imports; `CoachSource` ~line 50; `buildChatContext` signature ~line 55 and its returned `coach` object)

- [ ] **Step 1: Add the field to the pack type**

In `src/lib/api.ts`, add to the imports at the top:
```ts
import type { Activity } from './activity'
```
and inside `export interface CoachPack { ... }`, after `nextMealIdea?: string`, add:
```ts
  /** Today's water, steps and the last week of training. See api/_coach.ts renderActivity. */
  activity?: Activity
```

- [ ] **Step 2: Add the builder**

In `src/lib/coachContext.ts`, add imports:
```ts
import { resolveUpNext } from '@core/utils/trainingProgram'
import { countsAsWorkout, sessionPRs, weeklyGoalFor, weeklyProgress } from '@core/utils/trainingStats'
import type { StepDay } from './healthConnect'
import { stepsSummary, topSetsLine, waterSummary, type Activity } from './activity'
```

Replace:
```ts
type CoachSource = Pick<
  AppState,
  'profile' | 'goals' | 'diary' | 'weightLog' | 'bodyMeasurements' | 'currentWeightKg' | 'recommendation'
>
```
with:
```ts
type CoachSource = Pick<
  AppState,
  | 'profile'
  | 'goals'
  | 'diary'
  | 'weightLog'
  | 'bodyMeasurements'
  | 'currentWeightKg'
  | 'recommendation'
  | 'workoutLog'
  | 'trainingPrograms'
  | 'activeProgramId'
>

/** Steps live in HealthProvider, not the store, so the caller hands them in. */
export interface HealthSteps {
  todaySteps: number | null
  weekSteps: StepDay[]
}

const NO_STEPS: HealthSteps = { todaySteps: null, weekSteps: [] }

/** Today's water, steps and training, as plain values for the pack and the opener. */
export const buildActivity = (state: CoachSource, health: HealthSteps = NO_STEPS, now: Date = new Date()): Activity => {
  const today = getDateString(now)
  const pastMl: number[] = []
  for (let back = 1; back <= 7; back++) {
    const past = state.diary[dayOffset(now, back)]
    if (past) pastMl.push(past.waterIntake ?? 0)
  }

  const log = state.workoutLog ?? []
  const counted = log.filter(countsAsWorkout)
  const weekStart = dayOffset(now, 6)
  const program = state.trainingPrograms.find(p => p.id === state.activeProgramId) ?? null
  const upNext = program ? resolveUpNext(program, today) : null
  const progress = program ? weeklyProgress(log, weeklyGoalFor(program), today) : null

  return {
    water: waterSummary(state.diary[today]?.waterIntake ?? 0, state.goals.water ?? 0, pastMl),
    steps: stepsSummary(health.todaySteps, health.weekSteps, today),
    training: {
      today: {
        planned: upNext?.status === 'train' ? upNext.day.name : null,
        done: counted.find(session => session.date === today)?.name ?? null,
      },
      week: counted
        .filter(session => session.date >= weekStart && session.date <= today)
        .slice(0, 7)
        .map(session => ({
          date: session.date,
          name: session.name,
          topSets: topSetsLine(session.exercises.map(ex => ({ name: ex.lift.name, sets: ex.sets }))),
          prs: sessionPRs(session, log).map(pr => pr.liftName),
        })),
      weeklyGoal: progress ? { done: progress.done, target: progress.goal } : null,
    },
  }
}
```

Note: `dayOffset(now, back)` already exists in this file and returns the `'YYYY-MM-DD'` of `back` days before `now`; `workoutLog` is newest first, so `.slice(0, 7)` keeps the newest.

- [ ] **Step 3: Send it with every chat**

Change the `buildChatContext` signature from:
```ts
export const buildChatContext = (
  state: CoachSource,
  memory: string[],
  mode: 'chat' | 'checkin' = 'chat',
  now: Date = new Date(),
): ChatContext => {
```
to:
```ts
export const buildChatContext = (
  state: CoachSource,
  memory: string[],
  mode: 'chat' | 'checkin' = 'chat',
  health: HealthSteps = NO_STEPS,
  now: Date = new Date(),
): ChatContext => {
```
and in the object it returns under `coach: { ... }`, after the `nextMealIdea` property, add:
```ts
      activity: buildActivity(state, health, now),
```

- [ ] **Step 4: Check no caller passed `now` positionally**

Run: `cd /d/macrofit-mobile && grep -rn "buildChatContext(" app src | grep -v "export const"`
Expected: only `app/chat.tsx` with three arguments (updated in Task 8). If any caller passes a fourth argument, change it to pass `undefined, <now>`.

- [ ] **Step 5: Typecheck**

Run: `cd /d/macrofit-mobile && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
cd /d/macrofit-mobile
git add src/lib/api.ts src/lib/coachContext.ts
git commit -m "Send today's water, steps and training with every coach message

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Wire steps into the chat and the opener (app)

**Files:**
- Modify: `D:\macrofit-mobile\src\lib\coachOpener.ts`
- Modify: `D:\macrofit-mobile\app\chat.tsx` (component body near the other hooks; opener effect ~line 308; send ~line 408)

- [ ] **Step 1: Opener takes activity**

In `src/lib/coachOpener.ts`, change the imports:
```ts
import { suggestNextMeal } from './nextMeal'
```
to:
```ts
import { nextSlot, suggestNextMeal } from './nextMeal'
import { activityLine, type Activity } from './activity'
```
Add `activity?: Activity` to `buildOpener`'s input type:
```ts
export const buildOpener = (input: {
  name: string
  diary: Record<string, DiaryDay>
  goals: MacroGoals
  checkInDue: boolean
  activity?: Activity
  now?: Date
}): Opener => {
```
and directly after the line `if (input.checkInDue) lines.push('Your weekly check-in is ready whenever you are.')`, add:
```ts
  // Before the meal idea, which has to stay last: it introduces the card under the text.
  if (input.activity) {
    const line = activityLine(input.activity, {
      proteinLeft: Math.round(input.goals.protein - (eaten?.protein ?? 0)),
      hour: now.getHours(),
      minute: now.getMinutes(),
      next: nextSlot(now.getHours()),
    })
    if (line) lines.push(line)
  }
```

- [ ] **Step 2: Chat reads steps once, through a ref**

In `app/chat.tsx`, add to the imports:
```ts
import { useHealthSync } from '@/hooks/useHealthSync'
import { buildActivity, type HealthSteps } from '@/lib/coachContext'
```
(`app/chat.tsx` already has `import { buildChatContext, loggedDaysLastWeek } from '@/lib/coachContext'`; extend that line to `import { buildActivity, buildChatContext, loggedDaysLastWeek, type HealthSteps } from '@/lib/coachContext'` instead of adding a second import.)

In the chat screen component, next to its other hooks (before the opener `useEffect`), add:
```ts
  /*
    Steps come from HealthProvider, not the store. Held in a ref so the send callback and the
    opener read the latest reading without being rebuilt every time it refreshes.
  */
  const { todaySteps, weekSteps } = useHealthSync()
  const healthRef = useRef<HealthSteps>({ todaySteps, weekSteps })
  healthRef.current = { todaySteps, weekSteps }
```
(`useRef` is already in this file's `react` import.)

- [ ] **Step 3: Pass it to both builders**

Change:
```ts
    const opener = buildOpener({ name: profile.name, diary, goals, checkInDue })
```
to:
```ts
    const opener = buildOpener({
      name: profile.name,
      diary,
      goals,
      checkInDue,
      activity: buildActivity(useStore.getState(), healthRef.current),
    })
```
and change:
```ts
        buildChatContext(useStore.getState(), useCoachStore.getState().memory, mode),
```
to:
```ts
        buildChatContext(useStore.getState(), useCoachStore.getState().memory, mode, healthRef.current),
```

- [ ] **Step 4: Typecheck and checks**

Run: `cd /d/macrofit-mobile && npx tsc --noEmit && npm test`
Expected: exit 0, `all 19 passed`.

- [ ] **Step 5: On-device check**

Start the dev server (`npm start` in `D:\macrofit-mobile`), open the debug app on the owner's phone, and open the coach:
1. On a day with a planned program session and protein left: the opener shows "<Day name> today, so get N g protein at <meal>." above the meal idea.
2. Ask "I walked 15k steps today, can I eat more?": no calories added; the reply mentions targets coming from weigh-ins.
3. Ask "how active was I today?": with Health Connect connected, the reply uses today's real step count.
If the server has not been deployed (Task 4), items 2-3 are answered by the old prompt: finish Task 4 first.

- [ ] **Step 6: Commit**

```bash
cd /d/macrofit-mobile
git add src/lib/coachOpener.ts app/chat.tsx
git commit -m "Give the coach's opener one activity line and its chats today's steps

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review against the spec

- Spec 0 (server switch, deploy off, verify, flip later) → Tasks 1, 4 (flip to `required` stays a separate owner decision, not in this plan).
- Spec 1.1 (data) → Tasks 5, 7, 8. Water average over days with a diary row, steps null rules, training today/week/weekly goal all covered.
- Spec 1.2 (prompt and rules) → Task 2.
- Spec 1.3 (opener line, thresholds, one line) → Tasks 5, 6, 8 (placement corrected: before the meal idea).
- Spec 1.4 (four evals) → Task 3.
- Spec 4 testing (pure functions with threshold edges) → Task 5's 19 cases.
