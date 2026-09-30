# 1.4.3: whole-day coach and speed round 2 — design

**Date:** 2026-09-29
**Branch:** `whole-day-coach-and-speed`, cut from `main` at the 1.4.2 release
**Repos:** `D:\macrofit-mobile` (the Expo app) and `D:\Macro-tracker` (the Vercel `api/`, and the
source of truth for `src/core`). Nothing here edits `src/core`, so no core sync is needed.
**Decided in brainstorming:** 1.4.3 is the whole-day coach plus speed; activity is context only,
never calories; the opener gets at most one activity line; speed uses targeted, measured fixes, not
the React Compiler; MacroFit stays a nutrition and training app, and other health data enters only
where it improves the coach.

---

# Part 1: for the owner

## What users get

**The coach sees the whole day.** Until now it knew food and weight. In 1.4.3 it also knows today's
water against the goal, today's steps against the usual, and the last week of training, including
what is planned today. It uses that to shape *what* and *when* to eat, never *how much*:

- "Leg day today, so get 40 g protein at lunch."
- Asked "I walked 15k today, can I eat more?", it explains that targets come from weigh-ins, and
  suggests where the day's carbs fit best, without adding calories.
- It mentions water only when you are behind.

**The opener gains one line, only when it matters.** Training day beats water, which beats a big
step day. On an ordinary day the opener is unchanged.

**The app gets faster where it is still slow.** Measured on the owner's OnePlus 10T with the
production renderer:

| What | 1.4.2 | 1.4.3 target |
|---|---|---|
| Diary: changing the day (content) | 105–146 ms | ≤ 50 ms |
| First open of Profile / Diary | 361 / 156 ms | instant (pre-built) |
| Today, first draw at launch | 687 ms | ≤ 300 ms |
| Late frames while changing the day | 24% | ≤ 10% |
| Switching to an open tab | 20–32 ms | stays ≤ 35 ms |

## Before any of this: put the new server live

The coach 1.4.2 shipped with talks to a server whose newest six commits (the coach itself, Indian
dish names from photos, private progress photos, an account-overwrite fix, and the sign-in
requirement) are most likely not deployed. They are on no remote, and this laptop's Vercel CLI is
not logged in. 1.4.2's opener works either way (the phone builds it); memory and meal cards need
the new server.

The sign-in requirement cannot go live yet: 1.4.1 phones do not send a login and would lose the
coach and photo logging. So it becomes a switch, `AI_REQUIRE_AUTH`, deployed **off**, and turned on
once most installs are on 1.4.2 or later.

**Needs the owner:** a way to deploy (`vercel login` once on this laptop, or the git remote Vercel
builds from).

## Cost

About 4.5 working days: server switch and deploy half a day, coach 1.5 days, speed 2.5 days.

---

# Part 2: for engineers

## 0. Server prerequisite (Macro-tracker)

1. `api/_auth.ts`: `requireAiCaller` enforces a signed-in user only when
   `process.env.AI_REQUIRE_AUTH === '1'`. With it off: a request with a valid token gets that user's
   limits as now; a request with no token, or with an invalid or expired one, is let through as
   before 2156bdc. (Rejecting a bad token while the switch is off would cut off exactly the 1.4.2
   users whose session lapsed, for no protection the switch is not already giving up.)
2. Deploy HEAD with the variable unset.
3. Verify: a request with body `{}` and no token returns 400 (not 401); on the phone, telling the
   coach "remember I don't eat beef" shows a Remembered note.
4. Flip `AI_REQUIRE_AUTH=1` later, as its own decision, when adoption allows.

## 1. Whole-day coach

### 1.1 Data (mobile)

`CoachPack` in `src/lib/api.ts` gains an optional block; the server's pack type in `api/_coach.ts`
mirrors it.

```ts
activity?: {
  water: { todayMl: number; goalMl: number; avg7Ml: number }
  steps: { today: number; avg7: number } | null
  training: {
    today: { planned: string | null; done: string | null }
    week: { date: string; name: string; topSets: string; prs: string[] }[]
    weeklyGoal: { done: number; target: number } | null
  }
}
```

Built by a new pure function `buildActivity(state, health, now)` in `src/lib/coachContext.ts`:

- **water:** `todayMl` from `diary[today].waterIntake`; `goalMl` from `goals.water`; `avg7Ml` is the
  mean over the previous 7 days that have any diary row (0 if none).
- **steps:** from `HealthProvider` (`todaySteps`, `weekSteps`). `null` when Health Connect is not
  connected, permission is missing, or `todaySteps` is null. `avg7` is the mean of `weekSteps`
  excluding today.
- **training.today:** from the active program via `resolveUpNext(program, today)`: `planned` is the
  day's name when status is `train`; `done` is the name of a session logged today that
  `countsAsWorkout`. Both null with no active program and no session.
- **training.week:** sessions from the last 7 days (today included) that `countsAsWorkout`, newest
  first. `topSets` is the heaviest completed set of up to three exercises, by exercise volume:
  `"Squat 100×5, RDL 80×8, Leg press 160×10"`. `prs` are the lift names from `sessionPRs`.
- **training.weeklyGoal:** from `weeklyProgress` for the active program; null without one.

Steps are not in the store, so `useCoachData` reads `useHealthSync()` and passes
`{ todaySteps, weekSteps }` to `buildActivity`. The pack is rebuilt only when its inputs change
(the existing `useMemo` pattern).

Size: at most 7 one-line sessions; the block stays under ~400 tokens.

### 1.2 Prompt (server, `api/_coach.ts`)

When `pack.activity` is present, render an `ACTIVITY` section after `RECENT DAYS`: water (today /
goal, 7-day average), steps (today, usual) or "not connected", today's training, and the week's
sessions. When absent (1.4.2 phones, the web app), omit the section.

Rules added to the system prompt:

1. Activity never changes calorie targets. Targets come from the weigh-in trend (the energy
   block). If asked to eat back steps or workouts, explain this briefly and help place the day's
   existing calories and carbs instead.
2. Use training to shape protein, carbs and recovery meals: protein spread across meals on
   training days, carbs around the session, a recovery meal after it.
3. Mention water only when today is below pace.
4. When steps are "not connected", never estimate them. Suggesting Health Connect once is allowed.

### 1.3 Opener line (mobile, `src/lib/coachOpener.ts`)

A pure `activityLine(activity, input, now): string | null`, appended after the existing lines.
The first match wins:

1. **Training today** (`planned` or `done`) and protein still to go:
   - next slot Breakfast, Lunch or Dinner (the `nextMeal.ts` slots): `"{name} today, so get {X} g
     protein at {meal}."`, where X = protein left × the slot's share, rounded to 5, clamped 20–50;
   - next slot Snacks: `"{name} today. Have a protein snack before dinner."`
2. **Water behind:** hour ≥ 12, and `todayMl < 0.6 × goalMl × (hour − 7) / 15`:
   `"{today} L of {goal} L so far. Have a glass with {next meal}."` (litres to one decimal).
3. **Big step day:** `today ≥ 8000` and `today ≥ 1.5 × avg7`:
   `"{k}k steps already, well above your usual {avg}k. Keep water up tonight."`
4. Otherwise null.

Skipped entirely when `goals.water` is 0 (for rule 2) or `steps` is null (for rule 3).

### 1.4 Evals (Macro-tracker `scripts/eval-coach.ts`)

Four cases added, each with a pack containing `activity`:

| Case | Must | Must not |
|---|---|---|
| Leg day planned, 90 g protein left, asks "what's lunch?" | protein-forward South Indian lunch | raise calories |
| 15k steps, asks "can I eat more today?" | explain weigh-in targets, place carbs | add calories for steps |
| 15:00, 0.6 L of 3 L water, asks "what's a good snack?" | answer, plus one water nudge | lecture repeatedly |
| steps null, asks "how active was I?" | say steps aren't connected | invent a step count |

Existing cases must still pass.

## 2. Speed round 2

### 2.1 Measurement, made repeatable

This session measured by hand-editing `node_modules` and app preferences. Replace that with:

- **`src/lib/perf.tsx`:** `PerfProbe({ id, children })` wraps children in a React `Profiler` and
  logs `[perf] id phase actualMs +sincePressMs` when `process.env.EXPO_PUBLIC_PERF === '1'`, and
  otherwise returns children unchanged. `markPress(name)` records the press time. The flag is
  inlined at build time, so release bundles carry no probe.
- **`metro.config.js`:** with `EXPO_PUBLIC_PERF=1`, resolve
  `../implementations/ReactFabric-prod` to `ReactFabric-profiling` (a production renderer that
  still reports `Profiler` timings).
- **`scripts/perf-run.mjs`:** starts Metro with `--no-dev --minify` and the flag, reverses device
  port 8081 to it (the debug app always loads `localhost:8081`), sets `js_dev_mode_debug=false` in
  the debug app's preferences via `run-as`, launches, runs fixed tap sequences (tab round-trips,
  three Diary day changes), collects `[perf]` lines from logcat, prints a table, and restores the
  preferences. Tap coordinates default to 1080×2400.
- **Lessons from this session, encoded in the script:** never send key events to keep the screen
  awake (a key event while the app has no focused window gets it killed for ANR); use
  `adb exec-out` for binary pulls; check the screen is awake and unlocked before each run and stop
  with a message if not.

Probes: each tab screen, each Diary section, each Today card, and app launch to first Today commit.

### 2.2 Fixes, one commit each

Each commit message carries the before/after numbers from `perf-run`. A fix that does not move its
target is reverted.

1. **One shared theme.** `src/theme/useTheme.ts` gains `ThemeProvider`, which resolves the theme once
   (the existing store, appearance and colour-scheme logic), and a root `ThemeContext`.
   `useTheme()` returns `ThemeOverride` if set, else the root context: one `useContext` instead of
   three store subscriptions and a colour-scheme listener per text and button. `ThemeProvider` is
   mounted at the top of `app/_layout.tsx`, above every navigator and modal; any `useTheme` call in
   the root layout component itself uses the resolver directly. `ThemeScope` is unchanged.
2. **Icons and the date bar.** `src/components/icons.ts` re-exports each lucide icon the app uses
   wrapped in `React.memo` (their props are primitives, so the memo holds), and call sites import
   from it. `DateNavigator` is wrapped in `React.memo` (its props are stable: `date`, `today`,
   `setDate`), removing its ~10 ms re-render in Diary's deferred pass. `Button` and `IconButton` are
   not memoised: inline `onPress` and child elements would defeat it.
3. **Pre-built tabs.** After Today's first commit and `InteractionManager.runAfterInteractions`, the
   tabs layout preloads Diary, then Profile a second later, with the navigator's `preload` (confirm
   the expo-router 57 API at implementation). `freezeOnBlur` freezes them once built. Memory is
   checked before/after with `dumpsys meminfo`; if the increase is over 40 MB, Profile is dropped
   from preloading.
4. **Today's first draw.** Probe each card; cards below the first screen render one frame later
   behind a `useFirstFrameDone()` gate. Target ≤ 300 ms to first commit.
5. **Late frames.** Capture a Perfetto trace (gfx, view, sched) over three Diary day changes and
   read which thread misses the deadline. The suspect is the Dimezis blur behind the header and tab
   bar re-sampling content that changes under it; `needsOffscreenAlphaCompositing` layers and card
   elevation are secondary suspects. The fix is chosen from the trace, not in advance.

## 3. Release order

1. Server: auth switch, deploy with it off, verify (section 0).
2. Server: activity section and rules, evals green, deploy.
3. App: activity pack and opener line.
4. App: speed fixes, each measured.
5. Version 1.4.3 (versionCode 13), prebuild, release build, `check-release-apk.mjs`, install over
   the owner's app, owner check, publish on the owner's go.
6. Later, separately: `AI_REQUIRE_AUTH=1`.

## 4. Testing

- `tsc --noEmit` in both repos; `scripts/eval-coach.ts` for the coach.
- `activityLine` and `buildActivity` are pure; test them with fixed inputs: each rule's threshold
  edge, the one-line limit, null steps, zero water goal, no program.
- `perf-run` tables before and after each speed commit.
- On the owner's phone: the coach opener on a training day, a water question, a steps question;
  tabs and Diary by hand.

## 5. Risks

- **Server deploy route unknown.** Blocks section 0; the owner provides it.
- **`preload` API.** If expo-router 57 does not expose it for tabs, fall back to mounting Diary only
  with `lazy: false` after measuring the startup cost, or drop fix 3.
- **ThemeProvider placement.** A component rendered outside the provider would get no theme. The
  provider sits above everything in the root layout; a dev-only warning fires if the context is
  missing.
- **Health Connect gaps.** Many Indian bands do not write to Health Connect; steps are then null and
  the coach says so rather than guessing.

## 6. Out of scope

React Compiler (its own trial later), sleep, heart rate, glucose and cycle data (product focus), the
web app sending activity, iOS.
