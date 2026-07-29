# MacroFit Mobile — Information Architecture

The user's report: *"some of the features are not on the correct places, which breaks the user usage."* This document is the answer to that, grounded in the audit findings. Decisions with two defensible options are split out into [ADRs](adr/).

## Navigation today

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  MACROFIT MOBILE — NAVIGATION AS IT EXISTS TODAY                             ║
║  (verified against app/_layout.tsx, app/index.tsx, app/(tabs)/_layout.tsx    ║
║   and every route file)                                                      ║
╚══════════════════════════════════════════════════════════════════════════════╝

COLD START
  │
  ├─ app/_layout.tsx  RootLayout
  │     splash gate = fonts + AsyncStorage rehydrate ONLY  (line 100)
  │     auth is NOT in the gate → blank canvas for up to 8s  ⚠ P1
  │     Stack: (tabs) | login | onboarding | food-search(modal) |
  │            lift-picker(modal) | goals | chat(modal)
  │
  └─ app/index.tsx   ◄── THE GATE (single redirect authority; renders null while loading)
       │
       ├─ !user ─────────────────────► app/login.tsx
       │                                 ├ mode toggle: Sign in / Create account
       │                                 ├ ✖ DEAD END: no "Forgot password?" anywhere
       │                                 └ ✖ DEAD END: wrong-password ⇄ already-exists loop
       │
       ├─ onboardedAt === null ──────► app/onboarding.tsx
       │                                 ├ ONE route, 5 steps held in useState (line 178)
       │                                 ├ ✖ Android hardware back = EXIT APP, all answers lost
       │                                 ├ ✖ no draft persistence — OS kill = restart at step 0
       │                                 └ ends: router.replace('/(tabs)')  (line 283)
       │                                    closing copy: "edit anything later in Profile" ← FALSE
       │
       └─ else ──────────────────────► app/(tabs)   ═══════════════════════════╗
                                                                              ║
┌─────────────────────────────────────────────────────────────────────────────╨──┐
│ app/(tabs)/_layout.tsx — GlassTabBar (5 slots) + AssistantButton (1 FAB)        │
│                                                                                │
│   [ Dashboard ] [ Diary ] [ Workout ] [ Progress ] [ Profile ]                  │
│       index      diary     workout     progress     profile                    │
│                                                                                │
│   ● FAB (line 140-187)  ──► /chat        ← the ONE global action, given to      │
│     jade glass circle, every tab           an occasional feature.  ⚠ P1        │
│     ✖ covers bottom-right of last row on every scrollable screen               │
│     ✖ Haptics on plain navigation (lines 88, 150) — rules forbid               │
│   ✖ no badge when activeWorkoutId is set                                       │
└────────────────────────────────────────────────────────────────────────────────┘

TAB 1 ─ app/(tabs)/index.tsx  "Today"          [header ► /chat  (line 123)]
   HeroCard ······················ calories eaten (tone inverted for bulkers ⚠)
   "AI Nutrition Assistant" card ► /chat   ← 2nd slot on the screen  ⚠ P2
   MacroCard ····················· rings
   CoachCard ► /goals  (line 350)  ← THE ONLY DOOR TO /goals IN THE APP  ⚠ P1
   MealsCard rows ► /diary  (line 429)  ← says "Add food", navigates to a screen top
        └ shows 4 of 6 meal types; rows never sum to the hero  ⚠ P2
   WaterCard · StepsCard · WeightTargetCard(compact) · GlanceRow
        └ "Kcal burned" tile reads a field nothing ever writes → permanent 0  ⚠ P1
   ✖ NO training presence at all: no live-session card, no start action

TAB 2 ─ app/(tabs)/diary.tsx  "Diary"          [header ► /chat  (line 690)]
   DateNavigator (own `date` state, never re-synced from today or from params ⚠)
   DayTotals
   6 × MealCard  ── "Add food" ──► /food-search {meal, date}   ← the ONLY correct
        └ Pre/Post-Workout render as dead cards every day        food entry point
   SavedMeals rail (apply / delete templates)
   ✖ copyDayEntries / copyMealEntries exist in the store, reachable from NOWHERE

TAB 3 ─ app/(tabs)/workout.tsx  "Workout"      [header ► /chat  (line 1145)]
   ┌ activeSession ≠ null ────────────────────────────────────┐
   │  GlassSurface hero (name, volume, sets, elapsed, FINISH) │
   │  <RestTimer/> ← INLINE LIST ITEM at line 770             │
   │      ✖ off-screen exactly while running                  │
   │      ✖ first appearance shifts the grid ~80pt            │
   │  ExerciseCard × n → SetRow × n                           │
   │  "Add exercise" ──► /lift-picker {sessionId}             │
   │  Cancel workout (2-tap confirm)                          │
   └──────────────────────────────────────────────────────────┘
   Personal records table  ← ALSO on Progress ▸ Training, different window ⚠
   History (every session ever, unvirtualised, renders DURING a live session ⚠)
   ✖ Finish → session card vanishes, no summary, no undo, cannot reopen

TAB 4 ─ app/(tabs)/progress.tsx  "Progress"    [no header action]
   Segmented: Calories | Macros | Weight | Training   (state resets on every exit)
   Range: 7d | 30d                                    (state resets on every exit)
   ▸ Weight tab
       empty state: "Log your weight from the Profile tab"  ← wrong screen ⚠
       ┌ "Import from Google Fit" Surface (1073-1137) ──────────────────┐
       │  SECOND, CONTRADICTORY Health Connect client (src/lib/health/) │
       │  ✖ P0 overwrites hand-logged weigh-ins                         │
       │  ✖ P0 rewinds current weight to the OLDEST imported record     │
       │  ✖ P1 static Android-only import → crashes the tab on iOS      │
       │  ✖ always rendered, including on iPhone                        │
       └────────────────────────────────────────────────────────────────┘
   ▸ Training tab: volume by muscle + a SECOND personal-records list
   ✖ no link to /goals despite drawing the goal line

TAB 5 ─ app/(tabs)/profile.tsx  "Profile"      [no header action]
   Glass identity header (name, weight, BMI, streak)
   <WeightTargetCard/>  ← DUPLICATE of the Dashboard's card
   ▸ Health Connect  ── "Import weight history" (the SAFE, deduping importer)
        └ contains "Daily step goal" — a numeric target hidden behind a
          device permission; unreachable on iOS  ⚠
   ▸ Targets  ← literally named Targets, holds ONE field: goal weight  ⚠ P1
   ▸ About you  ── blur of Name/Age/Height silently rewrites all goals  ⚠ P1
   ▸ Weight log (20 rows)          ─┐
   ▸ Body measurements              │ content that belongs on Progress
   ▸ Custom foods ("0 saved" — the create path does not exist)  ⚠ P1
   ▸ Meal templates ← also managed in the Diary rail
   ▸ Appearance
   Sync status + Sign out  ← LAST item on the longest screen in the app

PUSHED / MODAL ROUTES
   app/goals.tsx ............ 1 entry (Dashboard CoachCard). Owns calories,
                              macros, coach plan, accept/refresh.
                              ✖ no weight goal, no pace editor
                              ✖ back arrow on the RIGHT (Screen has no left slot)
   app/food-search.tsx ...... entries: Diary MealCard "Add food" only
                              ✖ no "create a food" → hard dead end on no results
                              ✖ hardware back from the amount step discards the search
   app/lift-picker.tsx ...... entry: workout "Add exercise" only
                              ✖ closes after EVERY selection (6 lifts = 6 round trips)
   app/chat.tsx ............. 5 ENTRIES: FAB + index header + index promo card
                              + diary header + workout header
                              ✖ transcript lost on close, no retry

ORPHANS AND DEAD ENDS
   ✖ progressPhotos / fastingSession — synced from the account on every save,
     NO mobile screen renders them at all
   ✖ copyDayEntries / copyMealEntries — implemented, zero UI
   ✖ Custom foods list — UI exists, the list can never be filled
   ✖ /goals — one door; Profile ▸ Targets does not link to it
   ✖ forgot password / change password / change email / delete account — none exist
   ✖ Google Fit import implemented twice with opposite data guarantees
```

## Navigation proposed

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  MACROFIT MOBILE — PROPOSED NAVIGATION                                        ║
║  one job per surface · one owner per number · the daily verb in the thumb zone║
╚══════════════════════════════════════════════════════════════════════════════╝

COLD START
  │
  ├─ app/_layout.tsx
  │     splash gate = fonts + store + AUTH RESOLVED   ← no blank canvas
  │     hydration outcome tracked: ok | empty | failed
  │       └ failed ⇒ blocking retry banner, saves BLOCKED (never overwrite a
  │                  server row from a store that did not load)
  │
  └─ app/index.tsx  GATE
       ├─ !user ────────────► app/login.tsx
       │                        ├ Sign in / Create account
       │                        ├ + "Forgot password?" ──► app/reset-password.tsx (NEW)
       │                        └ + session-expired notice when kicked out mid-task
       │
       ├─ needs setup ──────► app/onboarding.tsx
       │                        ├ hardware back = previous STEP (not app exit)
       │                        ├ draft persisted after each step
       │                        └ closing copy names the real place: /goals
       │
       └─ else ─────────────► app/(tabs)

┌────────────────────────────────────────────────────────────────────────────────┐
│ app/(tabs)/_layout.tsx — same 5 slots, one badge, one CONTEXT-SENSITIVE FAB    │
│                                                                                │
│   [ Today ] [ Diary ] [ Workout•] [ Progress ] [ Profile ]                      │
│                          └ live-session dot when activeWorkoutId ≠ null        │
│                                                                                │
│   ● FAB = THE LOG BUTTON  (ADR-001)                                            │
│       Today / Diary / Progress ──► /food-search {meal: from clock, date: today} │
│       Workout, session live ────► /lift-picker {sessionId}                      │
│       Workout, no session ──────► startWorkout()                                │
│       Profile ─────────────────► hidden                                         │
│   ✔ no haptic on navigation · Screen gains FAB_SPACE bottom padding             │
└────────────────────────────────────────────────────────────────────────────────┘

TAB 1 ─ "Today"  = am I on track, across BOTH halves of the product
   HeroCard ················ goal-aware tone (under-goal is good for a cut,
                             warning for a bulk; exactly-on-goal is always good)
   ▸ Training row (NEW) ····· live session (elapsed + sets) ──► /workout
                             else last session summary / "Start workout"
   MacroCard ··············· rings (moves UP — the promo card is gone)
   CoachCard ──► /goals ····· labelled "Proposed — not applied" until accepted
   MealsCard ─ each row ──► /food-search {meal, date: today}   ← ACTS, not navigates
        └ renders any meal present in mealTotals, so rows sum to the hero
   Water · Steps · WeightTargetCard(compact) ← the ONE daily weigh-in field
   [header] ► /chat

TAB 2 ─ "Diary"  = per-meal detail for ANY day
   DateNavigator ─ seeded from ?date, re-synced when the local day rolls over
   DayTotals ("kcal left today" only when the date IS today)
   MealCards (canonical 4 always; Pre/Post-Workout only when used)
        ├ "Add food" ──► /food-search {meal, date}
        └ "Same as yesterday" ──► copyMealEntries    ← was unreachable
   SavedMeals rail = the ONLY meal-template manager (apply · rename · delete)
   [header] ► /chat

TAB 3 ─ "Workout"  = a LIVE LOGGER during a session, an archive when idle
   ┌ session live ────────────────────────────────────────────┐
   │  Glass hero (name · volume · sets · elapsed)             │
   │  ExerciseCard × n → SetRow × n                           │
   │  ╔══════════════════════════════════════════╗            │
   │  ║ ● PINNED REST TIMER (glass pill,         ║ ← ADR-003  │
   │  ║   above the tab bar, out of flow)        ║            │
   │  ╚══════════════════════════════════════════╝            │
   │  Finish ──► CONFIRM ──► SESSION SUMMARY CARD             │
   │              (volume · sets · duration · PRs hit ·        │
   │               Save as template · Done)                    │
   │  ✔ PR table and History HIDDEN while training            │
   └──────────────────────────────────────────────────────────┘
   idle: Ready to train · Quick start templates ·
         History (10 + "Show all N") · "Records ──► /progress?tab=training"
   [header] free for a screen-specific action

TAB 4 ─ "Progress"  = the REVIEW surface for everything logged
   Segmented + range PERSISTED to route params  (?tab=&range=)
   ▸ Calories | Macros ── "Daily goal" tile ──► /goals
   ▸ Weight
        <WeightTargetCard compact/>   ← log here, don't be sent elsewhere
        chart + goal line + trend line
        Weight log history            ← moved from Profile
        Body measurements             ← moved from Profile
        "Health Connect ──► Profile"  ← LINK, not a second importer
   ▸ Training
        volume by muscle · THE single personal-records table  ← consolidated

TAB 5 ─ "Profile"  = identity · integrations · appearance · ACCOUNT
   ╔═════════════════════════════════════════════════════════╗
   ║ Account (PINNED, above the fold)                        ║
   ║   sync status · email · Change password · Delete account║
   ║   Sign out  ⇒ flush save → clear persisted store → reset║
   ╚═════════════════════════════════════════════════════════╝
   Identity header (name · weight · BMI · streak)
   ▸ Targets ─────────────────► /goals        ← THE SECOND DOOR (ADR-002)
   ▸ About you (validated: age 13-100, height 120-230; ft/in honoured;
                no silent goal rewrite on a name edit)
   ▸ Health Connect ─ the ONE importer (steps + weight + height + body fat)
   ▸ Appearance
   ✖ no weight card · no weight log · no measurements · no food libraries

PUSHED / MODAL ROUTES
   app/goals.tsx  ── SINGLE OWNER OF EVERY NUMBER ──────────────────────────┐
        entries: Today ▸ CoachCard   AND   Profile ▸ Targets                 │
        coach plan (accept · refresh · UNDO)                                 │
        calories · macros · fibre · sugar · sodium · water                   │
        + Weight goal   ← moved from Profile                                 │
        + Pace (kg/week) ← had NO editor anywhere                            │
        + Daily step goal ← was trapped behind a device permission           │
        back arrow on the LEFT (Screen gains a `left` slot)                  │
   ─────────────────────────────────────────────────────────────────────────┘
   app/food-search.tsx ..... entries: FAB · Today meal rows · Diary Add food
                             + autofocus · recents survive typing
                             + "Can't find it? Create a food" ← dead end closed
                             + hardware back = back one step, not discard
   app/lift-picker.tsx ..... entry: FAB (session live) · Add exercise
                             + additive multi-select, one round trip
   app/chat.tsx ............ entries: Today header · Diary header (2, was 5)
                             + persisted transcript · retry on failure
   app/reset-password.tsx .. NEW, deep-linked from login

CLOSED IN THIS PROPOSAL
   ✔ Google Fit import exists ONCE, on Profile, deduping by date
   ✔ /goals has two doors; the onboarding closing copy becomes true
   ✔ rest timer visible while it runs
   ✔ Finish workout has a confirm and a payoff
   ✔ copyDayEntries / copyMealEntries reachable
   ✔ create-a-food exists, so the Custom foods list can be filled
   ✔ password reset · change password · delete account
   ✖ STILL ORPHANED: progressPhotos and fastingSession are synced on every
     save but have no mobile screen — either surface them read-only under
     Profile or say plainly in the sync row that they are web-only.
```

## The tab bar

RECOMMENDATION: keep the same five routes and the same five slots — Dashboard, Diary, Workout, Progress, Profile — but re-scope what each one owns, add a live-session badge to Workout, and repoint the FAB at logging. Do not add a sixth tab and do not swap one out.

Why the current SET is right even though the current CONTENT is wrong

The user's complaint ("features are not in the correct places") is almost entirely about content ownership, not about which destinations exist. Every one of the five routes has a job no other route can do:

- Dashboard is the only cross-domain surface (nutrition + water + steps + weight + — once fixed — training). It is also the only screen with the rings.
- Diary is the only per-meal, any-date surface. It owns the date navigator, per-entry serving edits, and the SavedMeals rail. Deleting it would leave no way to fix yesterday's lunch, because the Dashboard MealsCard only shows today and only shows four of six meal types.
- Workout is the only live-logging surface, and lifting is a hands-busy, one-handed, between-sets context that cannot share a screen with anything else.
- Progress is the only review surface — all four charts live there.
- Profile is the only identity/integration/account surface.

Remove any one of them and a genuinely unique job has nowhere to go. That is the test a tab has to pass.

Why NOT a sixth tab for Coach

Coach is the product's differentiator, and the temptation is to promote /goals. Two reasons not to. First, the bar is already at its legibility floor: inactive labels are 10px in textMuted on glass (_layout.tsx:117-123), which fails AA on every dark surface; a sixth slot makes each label ~15% narrower and pushes navigation onto icon shape alone. Second, frequency. A coach plan carries a durationWeeks field — it is a weekly-to-monthly interaction. Giving it the same slot weight as Diary, which is used 3-6× a day, re-commits the exact inversion being fixed. /goals earns two entry points (Dashboard CoachCard + a Profile Targets row), not a permanent slot.

Why NOT swap Diary out for a Log tab or an Assistant tab

Both proposals free a slot by deleting the only screen that can edit a past day. And a "Log" tab makes the highest-frequency path worse, not better: logging breakfast becomes Log → Food → meal → search → food → confirm (6 taps) versus 3 with a context-sensitive FAB. A verb is not a destination; modelling it as one means every log ends by stranding the user somewhere they then have to navigate out of.

The three changes the bar itself needs

1. Live-session badge on Workout when activeWorkoutId ≠ null. Today a session started and forgotten runs for nine hours with nothing anywhere warning that it is open, and every set logged the next day is filed under the wrong date. Carry it as a shape (a dot plus accessibilityState), never colour alone.
2. Delete Haptics.selectionAsync() at _layout.tsx:88 and Haptics.impactAsync() at :150. Switching tabs and opening chat are navigations, not commits. When moving between tabs feels identical to completing a set, the buzz that confirms "that set is logged" becomes noise — and a user who disables system haptics to escape it loses the confirmations that matter.
3. Raise the inactive label to 11px in theme.textSecondary. The selected state already carries an indicator bar and a weight change, so contrast is free to rise on both states without weakening the active/inactive distinction.

Slot-by-slot job after the moves

  Dashboard  → "am I on track today", across nutrition AND training. Gains the live-session/start row; loses the assistant promo card; meal rows become actions.
  Diary      → per-meal detail for any date. Gains "same as yesterday"; becomes the sole meal-template manager.
  Workout    → a live logger during a session, an archive when idle. Gains a pinned rest timer and a finish summary; loses the full PR table to Progress; hides history mid-session.
  Progress   → review. Gains the weight log, body measurements and the single consolidated PR table; loses the duplicate Google Fit importer; gains persisted tab/range state.
  Profile    → identity, integrations, appearance, account. Loses ~176 lines of content libraries and history; gains a pinned account block and a Targets row into /goals.

## Every move, with tap cost

| Feature | Frequency | From | To | Taps |
|---|---|---|---|---|
| Google Fit / Health Connect weight import (the destructive duplicate) | monthly | `app/(tabs)/progress.tsx:632-689, 1073-1137 (+ src/lib/health/)` | `app/(tabs)/profile.tsx:360-408 (the existing useHealthSync importer — delete, do not move)` | 3 → 3 |
| Primary logging affordance (the global FAB's destination) | per-session | `app/(tabs)/_layout.tsx:140-187 (FAB → /chat)` | `app/(tabs)/_layout.tsx:140-187 (FAB → /food-search on Dashboard/Diary/Progress; /lift-picker or startWorkout on Workout; hidden on Profile)` | 5 → 3 |
| Dashboard meal rows: navigate → act | daily | `app/(tabs)/index.tsx:429 (<Link href="/diary">)` | `app/(tabs)/index.tsx:429 (router.push('/food-search', { meal, date: today }))` | 5 → 3 |
| Calorie and macro target editing (ownership) | monthly | `app/(tabs)/profile.tsx:411-435 (a section literally named 'Targets', holding only goal weight) + the four recalculateGoals() call sites at :249, :477, :490, :504` | `app/goals.tsx (single owner) + a navigation row left behind in profile.tsx` | 999 → 3 |
| Goal weight + the pace every ETA is projected from | monthly | `app/(tabs)/profile.tsx:421-434 (goal weight); nowhere at all (targetRateKgPerWeek — set once in onboarding, no editor exists)` | `app/goals.tsx — a new 'Weight goal' section beside the calorie and macro fields` | 3 → 3 |
| Daily step goal (a numeric target hidden behind a device permission) | once | `app/(tabs)/profile.tsx:388-397 (nested inside the Health Connect Section)` | `app/goals.tsx (with the other numeric targets)` | 4 → 3 |
| Rest timer placement | per-session | `app/(tabs)/workout.tsx:770 (inline list item, above the exercise cards)` | `app/(tabs)/workout.tsx — absolutely-positioned GlassSurface pill above the tab bar` | 2 → 0 |
| Weigh-in capture point | daily | `app/(tabs)/profile.tsx:358 (<WeightTargetCard/>, a duplicate) and app/(tabs)/progress.tsx:987 (empty state pointing users at Profile)` | `app/(tabs)/index.tsx:173 (keep the compact card as the single daily capture point) + a compact card at the top of progress.tsx's Weight tab` | 4 → 1 |
| Weight log history table | weekly | `app/(tabs)/profile.tsx:535-567 (33 lines)` | `app/(tabs)/progress.tsx — Weight tab, under the chart` | 3 → 2 |
| Body measurements + the Navy body-fat estimate | monthly | `app/(tabs)/profile.tsx:569-643 (75 lines)` | `app/(tabs)/progress.tsx — Weight tab (below the weight history)` | 3 → 2 |
| Custom foods management | monthly | `app/(tabs)/profile.tsx:645-677 (33 lines, permanently '0 saved')` | `app/food-search.tsx (the existing 'Your foods' section) + a new create-a-food form in the empty state` | 3 → 2 |
| Meal template management | monthly | `app/(tabs)/profile.tsx:679-712 (34 lines)` | `app/(tabs)/diary.tsx:571-662 (the SavedMeals rail, where templates are created and applied)` | 3 → 1 |
| Full personal-records table | weekly | `app/(tabs)/workout.tsx:1227-1289 (63 lines)` | `app/(tabs)/progress.tsx — Training tab (which already renders a second, differently-formatted PR list)` | 1 → 2 |
| Workout history archive (visibility during a live session) | weekly | `app/(tabs)/workout.tsx:1291-1298 — rendered unconditionally, below the active session` | `app/(tabs)/workout.tsx — gated on activeSession === null, capped to 10 with a 'Show all N workouts' expander` | 0 → 1 |
| Post-workout summary (the payoff for a logged session) | per-session | `nowhere — app/(tabs)/workout.tsx:766 endWorkout() makes the session card vanish` | `app/(tabs)/workout.tsx — a summary card rendered in place of ActiveWorkout after finishing` | 2 → 0 |
| Training presence on the home screen | per-session | `nowhere — app/(tabs)/index.tsx has no workout state at all` | `app/(tabs)/index.tsx — a conditional session card between HeroCard and MacroCard, plus a badge on the Workout tab in app/(tabs)/_layout.tsx` | 2 → 1 |
| 'Kcal burned' dashboard tile | daily | `app/(tabs)/index.tsx:607-612 (reads nutrition.caloriesBurned, a field the workout logger never writes)` | `app/(tabs)/index.tsx — derive from workoutLog filtered to today (session volume or set count), or delete the tile` | 0 → 0 |
| 'Copy yesterday' / 'Same as yesterday' | daily | `src/core/store/appState.ts:270 (copyDayEntries / copyMealEntries — implemented, tested by the web app, reachable from nowhere on mobile)` | `app/(tabs)/diary.tsx — a button beside 'Jump to today' in DateNavigator and a per-card action on empty MealCards` | 15 → 1 |
| Assistant entry points (5 → 1) | weekly | `app/(tabs)/_layout.tsx:140-187 (FAB), app/(tabs)/index.tsx:123-130 (header) and :134-151 (promo card), app/(tabs)/diary.tsx:690-692, app/(tabs)/workout.tsx:1145-1147` | `app/(tabs)/index.tsx and app/(tabs)/diary.tsx header slots only` | 1 → 1 |
| Account block (sync status + sign out) and the missing account actions | monthly | `app/(tabs)/profile.tsx:739-762 — the last item on the longest screen in the app` | `app/(tabs)/profile.tsx — pinned above the fold, directly under the identity header` | 2 → 1 |
| Progress metric/range selection (survivability and deep-linkability) | weekly | `app/(tabs)/progress.tsx:621-622 (local useState, resets to Calories/7d on every tab exit)` | `app/(tabs)/progress.tsx — seeded from and written to route params (useLocalSearchParams), the way food-search.tsx:247 already does` | 3 → 1 |
| Back control position on pushed screens | daily | `app/goals.tsx:428-432 (back arrow in the Screen `right` slot)` | `src/components/Layout.tsx:22 — a new leading `left` / `onBack` slot on ScreenProps, rendered before the title block at line 86` | 1 → 1 |

### Rationale and risk per move

#### Google Fit / Health Connect weight import (the destructive duplicate)

- **From** `app/(tabs)/progress.tsx:632-689, 1073-1137 (+ src/lib/health/)`
- **To** `app/(tabs)/profile.tsx:360-408 (the existing useHealthSync importer — delete, do not move)`
- **Used** monthly · taps 3 → 3
- **Why.** Two controls with the same job in two tabs with opposite data guarantees: the Progress one silently replaces up to a year of hand-entered weigh-ins and rewinds currentWeightKg to the oldest imported record (P0 ×3); the Profile one dedupes by date. It also statically imports an Android-only TurboModule, which kills the whole Progress tab on iOS. A device-import settings flow does not belong inside a chart screen's Weight segment in any case. Delete the Progress implementation and the src/lib/health/ directory; Progress links to Profile instead.
- **Risk.** HIGH — this is a deletion, not a relocation. The Progress importer is the only path that reads height and body-fat records; useHealthSync must be extended with those reads before deletion, or the advertised body-composition import silently disappears. Any user mid-flow on the Progress card loses the entry point they learned. Must ship together with the bulk addWeightEntries action, otherwise the surviving importer still fires one full-store write per weigh-in.

#### Primary logging affordance (the global FAB's destination)

- **From** `app/(tabs)/_layout.tsx:140-187 (FAB → /chat)`
- **To** `app/(tabs)/_layout.tsx:140-187 (FAB → /food-search on Dashboard/Diary/Progress; /lift-picker or startWorkout on Workout; hidden on Profile)`
- **Used** per-session · taps 5 → 3
- **Why.** The app's single most prominent, always-reachable control is given to a feature touched occasionally, while the action performed 3-6×/day has no global affordance at all. Chat retains a header entry (ADR-004).
- **Risk.** MEDIUM — a control whose destination changes by tab is less learnable and its accessibilityLabel changes between tabs. Must not become a dead control on the Workout tab when activeWorkoutId is null (start a session instead). Screen's paddingBottom needs a FAB_SPACE allowance so the last content row stops sitting under it.

#### Dashboard meal rows: navigate → act

- **From** `app/(tabs)/index.tsx:429 (<Link href="/diary">)`
- **To** `app/(tabs)/index.tsx:429 (router.push('/food-search', { meal, date: today }))`
- **Used** daily · taps 5 → 3
- **Why.** The row is labelled 'Add food' and performs a navigation to the top of a full-day diary, where the user must scroll past the date navigator, the totals card and every earlier meal to find that meal's own Add food button. It also drops the date, so arriving from the Dashboard can write into whatever day the Diary tab was last browsed to.
- **Risk.** LOW — one line. Rows that already have entries should keep routing to /diary with an explicit date param, since 'review' is the real intent there; diary.tsx must seed its date state from the param and re-sync on the local date changing.

#### Calorie and macro target editing (ownership)

- **From** `app/(tabs)/profile.tsx:411-435 (a section literally named 'Targets', holding only goal weight) + the four recalculateGoals() call sites at :249, :477, :490, :504`
- **To** `app/goals.tsx (single owner) + a navigation row left behind in profile.tsx`
- **Used** monthly · taps 999 → 3
- **Why.** Two screens claim 'targets' and each holds half. Profile does not link to /goals, so a user looking for their calorie target finds a goal-weight box and leaves — and the onboarding closing copy tells them Profile is the right place. Worse, blurring the Name field on Profile silently rewrites an accepted coach plan with the flat ±500 formula.
- **Risk.** MEDIUM — removing recalculateGoals() from Profile changes behaviour users may have (unknowingly) depended on: goals will no longer track an activity-level change automatically. Where recalculation is genuinely warranted (goal, activity, gender) it must be gated on the stored goals still matching the formula output, or prompted.

#### Goal weight + the pace every ETA is projected from

- **From** `app/(tabs)/profile.tsx:421-434 (goal weight); nowhere at all (targetRateKgPerWeek — set once in onboarding, no editor exists)`
- **To** `app/goals.tsx — a new 'Weight goal' section beside the calorie and macro fields`
- **Used** monthly · taps 3 → 3
- **Why.** A user who opens the screen named Goals finds calories and macro grams and no weight goal; it is buried in a collapsed accordion on Profile between Health Connect and About you. The pace has no editor anywhere in the app, yet every ETA on the weight card and every 'on track' verdict is projected from it.
- **Risk.** MEDIUM — the field must convert display unit → kg on commit and must run validateTarget(profile.goal, currentWeightKg, kg), which Profile currently skips (it accepts a goal on the wrong side of current weight). Changing the goal must also clear or re-default the pace, or the old goal's pace keeps driving projections.

#### Daily step goal (a numeric target hidden behind a device permission)

- **From** `app/(tabs)/profile.tsx:388-397 (nested inside the Health Connect Section)`
- **To** `app/goals.tsx (with the other numeric targets)`
- **Used** once · taps 4 → 3
- **Why.** The section only renders when health.availability === 'available', so on iOS or after a permission revoke the step goal cannot be set or even seen — a user who set 12000 and later revoked permission loses access to their own setting. Every numeric target the user owns should live in one place regardless of platform.
- **Risk.** LOW — a single Field plus its commit handler. The steps tile itself stays on the Dashboard and keeps reading the same profile.stepGoal.

#### Rest timer placement

- **From** `app/(tabs)/workout.tsx:770 (inline list item, above the exercise cards)`
- **To** `app/(tabs)/workout.tsx — absolutely-positioned GlassSurface pill above the tab bar`
- **Used** per-session · taps 2 → 0
- **Why.** The countdown starts at the top of the page while the user is several screens down at the set they just ticked. To read the remaining rest they scroll up and lose their place; to log the next set they scroll back. Its first appearance also shifts the grid ~80pt while the thumb is already moving toward the next weight cell.
- **Risk.** MEDIUM — contends for the bottom of the screen with the FAB and the keyboard; the ScrollView must add the pill's height to paddingBottom while active, or the overlay covers the Done checkbox it exists to follow.

#### Weigh-in capture point

- **From** `app/(tabs)/profile.tsx:358 (<WeightTargetCard/>, a duplicate) and app/(tabs)/progress.tsx:987 (empty state pointing users at Profile)`
- **To** `app/(tabs)/index.tsx:173 (keep the compact card as the single daily capture point) + a compact card at the top of progress.tsx's Weight tab`
- **Used** daily · taps 4 → 1
- **Why.** Four screens touch one number. A user told by the Progress chart to log from Profile scrolls a nine-section accordion looking for a field that was on the home screen all along; and the Weight tab sends you to another tab to record the data the chart exists to plot.
- **Risk.** LOW-MEDIUM — dropping the Profile card requires rewording profile.tsx:542 ('Add one from the card above'), which would otherwise reference a card that no longer exists. Keep the loggedToday branch editable so a mistyped weigh-in can be corrected from the card that recorded it.

#### Weight log history table

- **From** `app/(tabs)/profile.tsx:535-567 (33 lines)`
- **To** `app/(tabs)/progress.tsx — Weight tab, under the chart`
- **Used** weekly · taps 3 → 2
- **Why.** The 20-row weigh-in list is review data. It belongs next to the chart of the same data, not in a settings accordion the user reaches by scrolling past a body-fat estimator.
- **Risk.** LOW-MEDIUM — Progress's tab/range state resets to Calories/7d on every exit, so the relocated history is effectively two taps deep behind a control that forgets. Persist the segment (or move it to route params) in the same change, otherwise this move makes the history feel harder to reach.

#### Body measurements + the Navy body-fat estimate

- **From** `app/(tabs)/profile.tsx:569-643 (75 lines)`
- **To** `app/(tabs)/progress.tsx — Weight tab (below the weight history)`
- **Used** monthly · taps 3 → 2
- **Why.** Measurement capture feeds the body-composition estimate that Goals uses as its TDEE anchor; it is progress tracking, not a setting. Grouping it with the weight chart puts capture and consequence on one screen.
- **Risk.** LOW — self-contained block with its own store selectors. The Profile identity header keeps rendering the resulting bodyComp pill, so the estimate stays visible where users already see it.

#### Custom foods management

- **From** `app/(tabs)/profile.tsx:645-677 (33 lines, permanently '0 saved')`
- **To** `app/food-search.tsx (the existing 'Your foods' section) + a new create-a-food form in the empty state`
- **Used** monthly · taps 3 → 2
- **Why.** The store action and the list UI both exist; the creation screen does not, so Profile advertises a library that can never be filled while food search dead-ends on any homemade meal or local brand. Manage the library where it is used.
- **Risk.** HIGH — this move is blocked until food-search.tsx gains a create path (mirroring startCreating/handleCreate in lift-picker.tsx:193-212). Until then the Profile section must not simply be deleted: web-created foods sync down and this is their only delete affordance. Correct the copy first, move second.

#### Meal template management

- **From** `app/(tabs)/profile.tsx:679-712 (34 lines)`
- **To** `app/(tabs)/diary.tsx:571-662 (the SavedMeals rail, where templates are created and applied)`
- **Used** monthly · taps 3 → 1
- **Why.** Three surfaces for one small feature: you create in the Diary, apply in the Diary, and can delete in either the Diary or Profile. A user who deletes from Profile has no idea it is the same list as the rail. Profile should hold identity, integrations and account — not content libraries.
- **Risk.** LOW — the rail already has the delete affordance. Add a confirm and move the trash icon off the primary tap surface first: it currently sits inside a horizontally scrolling strip, which is the exact context where a stray tap during a fling destroys real setup work.

#### Full personal-records table

- **From** `app/(tabs)/workout.tsx:1227-1289 (63 lines)`
- **To** `app/(tabs)/progress.tsx — Training tab (which already renders a second, differently-formatted PR list)`
- **Used** weekly · taps 1 → 2
- **Why.** Two screens claim the same job with different windows and different formatting, and neither says it is a partial view of the other. Progress is the review surface; Workout should be a live logger. Keep only records set in THIS session on the Workout tab — prSetIds at workout.tsx:684-700 already computes exactly that.
- **Risk.** MEDIUM — Progress's PR card currently ignores the range control and truncates to 4 by recency, so a lifter with twelve lifts sees four. Fix the window and add a 'show all' expander as part of the move, or the consolidated list is worse than the one being deleted.

#### Workout history archive (visibility during a live session)

- **From** `app/(tabs)/workout.tsx:1291-1298 — rendered unconditionally, below the active session`
- **To** `app/(tabs)/workout.tsx — gated on activeSession === null, capped to 10 with a 'Show all N workouts' expander`
- **Used** weekly · taps 0 → 1
- **Why.** Mid-workout, scrolling past your exercise cards to reach 'Add exercise' and 'Cancel workout' dumps you into every session you have ever logged, complete with destructive Delete buttons, while your hands are chalky and you are between sets. It also mounts ~800 native views before the first frame at 6 months of use.
- **Risk.** LOW — mirrors the gating pattern already used for the start card and templates at workout.tsx:1173/1190. If history must stay reachable mid-session, put it behind a collapsed disclosure below Cancel rather than inline.

#### Post-workout summary (the payoff for a logged session)

- **From** `nowhere — app/(tabs)/workout.tsx:766 endWorkout() makes the session card vanish`
- **To** `app/(tabs)/workout.tsx — a summary card rendered in place of ActiveWorkout after finishing`
- **Used** per-session · taps 2 → 0
- **Why.** You finish a hard session, tap the big button, and the screen you were looking at is replaced by an invitation to start another workout. No volume, no duration, no PRs. All four helpers (sessionVolume, sessionSetCount, formatDuration, prSetIds) are already imported and computed in this file.
- **Risk.** MEDIUM — needs the just-finished session id held in local state after endWorkout(). Pair it with a confirm in front of Finish, since one mis-tap on a full-width primary button currently closes a session that can never be reopened.

#### Training presence on the home screen

- **From** `nowhere — app/(tabs)/index.tsx has no workout state at all`
- **To** `app/(tabs)/index.tsx — a conditional session card between HeroCard and MacroCard, plus a badge on the Workout tab in app/(tabs)/_layout.tsx`
- **Used** per-session · taps 2 → 1
- **Why.** Half the product is invisible from the screen the app opens on. A session started and forgotten produces a nine-hour duration in History with nothing anywhere warning that a session is live, and there is no way to start a workout from the landing tab.
- **Risk.** LOW — reads activeWorkoutId, a value already in the store. The badge is a small addition to GlassTabBar; keep it shape-based (a dot plus an accessibilityState) rather than colour-only.

#### 'Kcal burned' dashboard tile

- **From** `app/(tabs)/index.tsx:607-612 (reads nutrition.caloriesBurned, a field the workout logger never writes)`
- **To** `app/(tabs)/index.tsx — derive from workoutLog filtered to today (session volume or set count), or delete the tile`
- **Used** daily · taps 0 → 0
- **Why.** A user finishes a 90-minute session, opens Home, and the training tile reads 0. The one place the two halves of the product should meet reports that no training happened. The design rules forbid rendering a fabricated placeholder number.
- **Risk.** LOW-MEDIUM — wiring workoutLog sessions into diary[date].exercises would be an upstream web-repo change to src/core/store/appState.ts; deriving the tile locally from workoutLog is the mobile-only fix and should be labelled honestly (volume/sets, not kcal).

#### 'Copy yesterday' / 'Same as yesterday'

- **From** `src/core/store/appState.ts:270 (copyDayEntries / copyMealEntries — implemented, tested by the web app, reachable from nowhere on mobile)`
- **To** `app/(tabs)/diary.tsx — a button beside 'Jump to today' in DateNavigator and a per-card action on empty MealCards`
- **Used** daily · taps 15 → 1
- **Why.** People who eat the same breakfast every day are the majority of the target user base, and the one-tap repeat is sitting unreachable in the shared store while they retype the same four foods through search every morning.
- **Risk.** LOW — wiring only, both actions already exist. Show the per-meal button only when diary[shiftISODate(date,-1)] has entries for that meal, and fire the same success haptic applyMealTemplate uses.

#### Assistant entry points (5 → 1)

- **From** `app/(tabs)/_layout.tsx:140-187 (FAB), app/(tabs)/index.tsx:123-130 (header) and :134-151 (promo card), app/(tabs)/diary.tsx:690-692, app/(tabs)/workout.tsx:1145-1147`
- **To** `app/(tabs)/index.tsx and app/(tabs)/diary.tsx header slots only`
- **Used** weekly · taps 1 → 1
- **Why.** Five doors to an occasional feature versus zero global doors for the daily one. The promo card is rendered second on the dashboard, above MacroCard, so an ad outranks the macro breakdown the screen exists to show — and it duplicates the header icon two lines above it. The assistant logs food, water and weight, none of which are Workout concepts.
- **Risk.** MEDIUM — a visible usage drop for the AI feature that must not be misread as a quality signal. CoachCard at index.tsx:382 must stop using Sparkles (use Target) so one glyph means one destination, and the two competing a11y labels must collapse to one string.

#### Account block (sync status + sign out) and the missing account actions

- **From** `app/(tabs)/profile.tsx:739-762 — the last item on the longest screen in the app`
- **To** `app/(tabs)/profile.tsx — pinned above the fold, directly under the identity header`
- **Used** monthly · taps 2 → 1
- **Why.** A user who opens Profile to sign out scrolls past a weigh-in form, a body-fat estimator, a 20-row weight table and two food libraries to reach it. This is also the natural home for the change-password / change-email / delete-account actions the app has none of — and with no forgot-password flow either, a forgotten password is a permanent lockout.
- **Risk.** MEDIUM — sign-out must first be made safe: it currently neither awaits the final save nor clears the persisted store, so the next account on the device inherits the previous user's diary and the debounced auto-save then uploads it to their row (P0). Making sign-out more reachable before fixing that increases the blast radius.

#### Progress metric/range selection (survivability and deep-linkability)

- **From** `app/(tabs)/progress.tsx:621-622 (local useState, resets to Calories/7d on every tab exit)`
- **To** `app/(tabs)/progress.tsx — seeded from and written to route params (useLocalSearchParams), the way food-search.tsx:247 already does`
- **Used** weekly · taps 3 → 1
- **Why.** A user who mainly tracks weight or training volume re-selects their sub-tab on every visit, and nothing can deep-link to it — so the Workout tab cannot send you to /progress?tab=training, and the relocated weight history and body measurements land behind a control that forgets.
- **Risk.** LOW — but it is a prerequisite for the Weight log and Body measurements moves, otherwise those relocations make the data harder to reach than it was on Profile.

#### Back control position on pushed screens

- **From** `app/goals.tsx:428-432 (back arrow in the Screen `right` slot)`
- **To** `src/components/Layout.tsx:22 — a new leading `left` / `onBack` slot on ScreenProps, rendered before the title block at line 86`
- **Used** daily · taps 1 → 1
- **Why.** A back arrow on the right edge is where users expect a confirm or an overflow menu, and it is on the wrong side for a right-handed thumb. Within one app, dismissal is on the left in food-search and lift-picker and on the right in goals. It is also a prerequisite for any future pushed route.
- **Risk.** LOW — additive prop. chat.tsx keeps its X on the right, correctly: a modal close is a different affordance from a back control.

## Decision records

- [ADR-001: Where the primary "log" action lives](adr/001-primary-log-affordance.md)
- [ADR-002: Whether Goals stays a separate route](adr/002-goals-route-ownership.md)
- [ADR-003: Rest timer: pinned overlay vs in-screen vs notification-driven](adr/003-rest-timer-placement.md)
- [ADR-004: Whether Chat earns a tab, a FAB, or a header entry](adr/004-chat-placement.md)
- [ADR-005: Whether Profile splits into Account vs Settings](adr/005-profile-decomposition.md)
