# MacroFit Mobile — Fix Plan

231 verified findings, sequenced into 17 batches. Order is: user-visible breakage first, then IA moves, then design-system consolidation, then performance, then polish. Batches are grouped by file so they do not collide.

No wall-clock estimates — each batch is sized by its **shape**: the step sequence, and which steps are bounded versus an open-ended edit/verify loop.

## Performance budgets

Targets to hold the work to. Each row names the code mechanism that currently misses it.

### Cold start: process launch → interactive dashboard

- **Target** < 2,000 ms p50, < 3,500 ms p95
- **Today** Rehydrate 40-120 ms + fonts, then serial getSession + loadUserData raced against an 8,000 ms timer. Worst realistic ~8.5 s.
- **Mechanism** app/_layout.tsx:110 `if (!ready) return null` mounts <AuthProvider> (line 115) only after the font+store gate resolves, so the network session restore is strictly serial with AsyncStorage rehydration instead of running in parallel.

### Unbranded blank screen at any point in launch

- **Target** ≤ 250 ms
- **Today** Up to 8,000 ms of empty canvas-coloured screen with no logo, spinner, or text.
- **Mechanism** SplashScreen.hideAsync() at app/_layout.tsx:103 and :107 is keyed on `ready = (fontsLoaded||fontError) && hydrated`, which excludes `loading` and `hydrating`; RootNavigator then returns early (app/_layout.tsx:48) and app/index.tsx renders `null` for that whole window.

### Store rehydrate: AsyncStorage.getItem + JSON.parse

- **Target** < 150 ms at 12 months of daily logging
- **Today** ~1.97 MB parse (~26-40 ms at a GUESSED 50-100 MB/s) growing unbounded; +4 MB if progress photos ever synced down.
- **Mechanism** src/store/useStore.ts:25 declares no `partialize`, no `version`, and no retention window, so every persisted key — including `progressPhotos` (base64 JPEG `dataUrl`, src/core/types:189) — is parsed on every cold start.

### Persisted blob size after 12 months of daily logging

- **Target** < 500 KB
- **Today** ~1.97 MB without photos (diary 1.37 MB + workoutLog 0.54 MB + weightLog 33 KB); up to ~6 MB with 20 synced progress photos — at the Android AsyncStorage cap.
- **Mechanism** src/store/useStore.ts:25 has no `partialize`; `progressPhotos` is in SYNC_FIELDS (AuthProvider.tsx:44) and has no mobile screen; appState.ts:190/203 place no cap on `diary` or `workoutLog`; each FoodEntry denormalizes the full 21-field Food (appState.ts:245-250) at 421-504 bytes measured.

### Store writes per character typed into a form field

- **Target** 0 (commit on blur/endEditing only); ≤ 1 persisted write per committed field
- **Today** 1 full-store serialize + 1 AsyncStorage write per character.
- **Mechanism** app/(tabs)/workout.tsx:216 (weight), :222 (reps), :228 (RPE) and :658 (session rename) call `onChange`/`setState` from `onChangeText`; src/store/useStore.ts:25 persists on every `set()` with no coalescing. app/(tabs)/diary.tsx:323 `commitDraft` already does this correctly and is the pattern to copy.

### Bytes serialized to log one set (type "102.5" + tick Done)

- **Target** < 50 KB
- **Today** 5 characters × ~1.97 MB = ~9.85 MB stringified at 12 months (~4.95 MB at 6 months), plus 5 AsyncStorage writes.
- **Mechanism** Same two mechanisms compounding: per-keystroke `updateSet` at app/(tabs)/workout.tsx:216 and whole-store serialization at src/store/useStore.ts:25.

### Set-grid keystroke → glyph on screen

- **Target** < 100 ms visual; < 5 ms of JS work per character
- **Today** ~3,100 set-object visits + 78 Intl formatter resolutions + ~800 theme selector calls + a ~1 MB stringify per character at 6 months; roughly 30-80 ms of blocked JS on a mid-range Android.
- **Mechanism** `priorRecords` memoizes on `[workoutLog, session.id]` (workout.tsx:675) and `suggestions` on `[exercises, workoutLog]` (workout.tsx:709) — immer gives `workoutLog` a new identity on every `updateSet` (appState.ts:537), invalidating both; every HistoryCard at workout.tsx:1291 is unmemoized and re-runs sessionVolume/sessionSetCount/Intl.

### Completing a set → checkbox fills

- **Target** < 100 ms
- **Today** Same full-screen cascade as a keystroke plus a `Haptics.impactAsync` round trip.
- **Mechanism** app/(tabs)/workout.tsx:231 `handleComplete` → `onChange({completed})` → `updateSet` → new `workoutLog` identity → whole-screen re-render; SetRow/ExerciseCard/HistoryCard are not wrapped in React.memo and per-row handlers plus `numberInputStyle` are fresh objects each render (workout.tsx:586).

### Workout tab focus → first frame, 500 logged sessions

- **Target** < 300 ms
- **Today** Every session mounted eagerly: ~78 cards / ~800 native views at 6 months, ~4,000+ views at 2 years, walked twice before first paint.
- **Mechanism** app/(tabs)/workout.tsx:1291 renders `history.map(...)` inside the `Screen` ScrollView (src/components/Layout.tsx:100), which mounts all children eagerly with no virtualization and no cap. app/lift-picker.tsx:458 and app/food-search.tsx:678 already show the `Screen scroll={false}` + FlatList pattern that works.

### Cloud writes during continuous editing

- **Target** ≤ 2 per minute (leading+trailing throttle at 30 s), skipped entirely when the payload is unchanged
- **Today** One full upsert per 1.5 s pause; ~60 uploads across a 45-minute workout.
- **Mechanism** src/lib/AuthProvider.tsx:137-144 resets a 1,500 ms `setTimeout` on every store change with no minimum interval and no dirty check; `collect()` (:93-98) always copies all 20 SYNC_FIELDS.

### Cloud upload payload, steady state

- **Target** < 200 KB
- **Today** The entire SYNC_FIELDS blob, ~1 MB at 6 months and ~2 MB at 12 months, on every save.
- **Mechanism** src/lib/AuthProvider.tsx:80-91 `saveUserData` upserts `{ user_id, data: collect() }` wholesale; there is no delta, no hash comparison against the last successful save, and no per-collection granularity in the `user_data` schema.

### Store writes per Health Connect import

- **Target** 1 (single bulk merge inside one set())
- **Today** Up to 365 sequential writes, each re-serializing the whole store: ~719 MB stringified at 12 months, plus ~570,000 sort comparisons.
- **Mechanism** app/(tabs)/progress.tsx:675 loops `addWeightEntry` once per weigh-in over a 365-day window (src/lib/health/health.sync.ts:7); each call filters and fully re-sorts `weightLog` (appState.ts:321-322). src/hooks/useHealthSync.ts:95 has the same loop shape.

### Store subscriptions created by theme reads

- **Target** 0 (theme via React context)
- **Today** One subscription per Text / Surface / Button / Pill instance — roughly 800 selector invocations per store write on the Workout tab at 6 months.
- **Mechanism** src/theme/useTheme.ts:13 is `useStore(s => s.darkMode)`, so every themed leaf component is an independent zustand subscriber; `darkTheme`/`lightTheme` are already stable module constants in src/theme/tokens.ts, so nothing but the subscription is needed.

### In-flight USDA requests; repeated-query latency

- **Target** ≤ 1 concurrent request; repeated query served from cache in < 16 ms
- **Today** Several overlapping unaborted requests per search, all downloaded and parsed; no cache; permanently on the shared DEMO_KEY (30 req/min, 1,000 req/day per IP).
- **Mechanism** app/food-search.tsx:275-299 creates no AbortController and its cleanup cancels nothing; src/core/utils/usdaApi.ts (generated) accepts no `signal` and no timeout, and reads its key from `import.meta.env`, which Hermes cannot evaluate — so `USDA_API_KEY` exported at src/lib/env.ts:107 is inert.

### Background timer cost when no rest is running

- **Target** 0 timers idle; 1 Hz while a rest period is counting down
- **Today** 4 Hz forever after the first completed set, including while the user is on other tabs and while the phone is pocketed.
- **Mechanism** src/components/RestTimer.tsx:52-63 sets a 250 ms interval that is never cleared when `left <= 0`; `firedRef` (line 41) already marks the completion moment but only suppresses the haptic, not the timer.

### JS bundle contribution from icons

- **Target** < 40 KB
- **Today** The full lucide-react-native barrel (~1,750 icons) compiled into the Hermes bytecode bundle for ~60 icons actually used.
- **Mechanism** Barrel imports such as app/(tabs)/workout.tsx:12 `import { ... } from 'lucide-react-native'`, repeated across ~20 files; the package exposes per-icon subpaths (`./icons/*`) that are not being used.

---

## Batches

### B0 — Raise the upstream web-repo change set for src/core

**Goal.** Get every generated-file fix into the web repo first, because ~14 downstream mobile fixes are blocked on them. Nothing in src/core/** may be edited here.

**Files.** `src/core/store/appState.ts`, `src/core/utils/calculations.ts`, `src/core/utils/usdaApi.ts`, `src/core/utils/weightTarget.ts`, `src/core/utils/authErrors.ts`, `src/core/utils/bodyComposition.ts`, `src/core/utils/onboarding.ts`, `src/core/types/index.ts`

**Shape.** Bounded, single pass, no code written in this repo. Step 1: enumerate the required upstream changes as one document — resetStore() action; addWeightEntries(entries) bulk merge; addWeightEntry setting currentWeightKg from the newest entry in the log rather than the entry just passed (appState.ts:325-328); WeightEntry.weightKg stored in kg with a unit-aware migration; updateStreak(date) using a local-date yesterday instead of toISOString (appState.ts:387-389); moveFoodEntry / widened updateFoodEntry patch; resumeWorkout(sessionId); reorderExercises + swapExerciseLift; deleteWorkoutTemplate + renameWorkoutTemplate; applyMealTemplate returning inserted ids; streak bump moved inside addFoodEntry/applyMealTemplate/copyMealEntries; denormalized recentFoods: Food[]; usdaApi accepting the API key and an AbortSignal as arguments; USDA servingSize/householdServingFullText mapping; weightTarget etaWeeks derived from etaDays and a local-date goal date; calculateBMR using the mean constant for 'other'; a hoisted module-level Intl.DateTimeFormat in formatDate; Recommendation.anchorSource. Step 2: for each, decide ship-upstream vs mobile-side shim. Step 3: open the tracking issue/PR. Verification is that the regenerated src/core lands in this repo — treat that as an external dependency, not a loop here.

**Needs a decision from you:**

- Who owns the web repo and what is the realistic turnaround — this gates B3 (weight-in-kg) and part of B1 (resetStore) entirely.
- For the weight-in-kg migration: migrate stored entries once on upgrade using the unit recorded at write time, or add weightKg alongside the legacy weight field and read through a compatibility accessor? The second is safer for accounts already synced from web.
- Which upstream items are mobile-only shims we accept as temporary divergence (e.g. a local resetStore that clears keys by name) versus true upstream changes.

### B1 — Account isolation, hydration safety, and the launch gate

**Goal.** Stop the two data-loss failures (cross-account inheritance, defaults overwriting a real server row) and remove the up-to-8-second blank screen. This is the highest-severity batch and touches only three files, so nothing else can collide with it.

**Files.** `src/lib/AuthProvider.tsx`, `app/_layout.tsx`, `app/index.tsx`, `app/login.tsx`

**Shape.** Step 1 (bounded): make flushSave return its promise and await it plus any in-flight save inside signOut, before supabase.auth.signOut(). Step 2 (bounded): add a tri-state hydrationOutcome ('ok' | 'empty' | 'failed') to loadUserData, distinguishing PostgREST PGRST116 from a network/timeout failure; on 'failed' set syncStatus 'error' and hard-block every save for the session. Step 3 (bounded): on sign-out — and on SIGNED_OUT from onAuthStateChange, and when a SIGNED_IN user id differs from the last stored one — call resetStore() (from B0) plus useStore.persist.clearStorage(). Step 4 (bounded): track signingOutRef so an involuntary SIGNED_OUT flushes the pending save with the still-valid userRef and routes to login with a session-expired reason. Step 5 (bounded): hoist AuthProvider above the `if (!ready) return null` gate in app/_layout.tsx so getSession starts in parallel with rehydration, and fold auth into the splash gate (`fontsReady && hydrated && !authLoading`). Step 6 (bounded): replace app/index.tsx's `null` with a branded loading state and correct the stale comment at :15-17; add the blocking retry banner for hydrationOutcome === 'failed'. Step 7 (bounded): keep the login submit button in its loading state while `hydrating` is true. Step 8 (OPEN-ENDED verify loop): exercise sign-out → sign-in-as-different-user, airplane-mode cold start, and forced 8 s timeout on a real device; iterate until no save ever fires for a user whose load did not complete.

**Needs a decision from you:**

- When cloud hydration fails on a cold start, do we (a) block the app behind a retry banner, or (b) render against the locally-rehydrated store in a read-only 'not synced' mode? (b) is friendlier but needs the save-block to be airtight.
- Should sign-out wipe local data unconditionally, or offer 'keep my data on this device for next time'? Unconditional wipe is the only safe default for a shared phone.

### B2 — Shared primitive API additions (prerequisite for later batches)

**Goal.** Land the small set of component-API changes that batches B5-B7 consume, so those batches do not each fork the same primitive. Deliberately pulled ahead of the wider design-system work.

**Files.** `src/components/Layout.tsx`, `src/components/Text.tsx`, `src/components/MacroRing.tsx`, `src/theme/tokens.ts`, `app/(tabs)/_layout.tsx`

**Shape.** Bounded, six independent additions, each verifiable in isolation: (1) `keyboardAvoiding` prop on Screen wiring automaticallyAdjustKeyboardInsets + keyboardDismissMode='interactive' onto the ScrollView at Layout.tsx:100; (2) optional `left`/`onBack` slot on ScreenProps rendered before the title block at Layout.tsx:86; (3) `Field` forwarding its label as accessibilityLabel (Layout.tsx:162); (4) required `label` prop on ProgressTrack applied as accessibilityLabel (MacroRing.tsx:96) — this intentionally breaks all 8 call sites so none is missed; (5) a shared `<InlineError>` carrying accessibilityRole='alert' + accessibilityLiveRegion='polite'; (6) export a `FAB_SPACE` constant from app/(tabs)/_layout.tsx and add it to Layout.tsx:103 bottom padding, and raise dark textMuted to stone[400] / light textMuted to stone[600] in tokens.ts. Verification is a typecheck plus one screenshot pass per theme.

**Needs a decision from you:**

- Raising textMuted changes the look of every caption in the app. Confirm the contrast fix is preferred over introducing a separate `textFaint` token for decoration only.

### B3 — Collapse Health Connect to one client

**Goal.** Delete the duplicate integration that crashes iOS at module load, silently overwrites hand-entered weigh-ins, rewinds current weight to a year ago, and stamps UTC dates. One importer, one dedupe, one bulk write.

**Files.** `src/lib/health/health-connect.client.ts`, `src/lib/health/health.sync.ts`, `src/lib/health/health.types.ts`, `src/lib/health/index.ts`, `src/hooks/useHealthSync.ts`, `src/lib/healthConnect.ts`, `app/(tabs)/progress.tsx`, `app/(tabs)/profile.tsx`, `src/components/StepsCard.tsx`

**Shape.** Step 1 (bounded): delete the entire src/lib/health/ directory. Step 2 (bounded): remove the import Surface at app/(tabs)/progress.tsx:1073-1137 together with handleHealthSync/handleConfirmImport and the three state hooks at :632-689. Step 3 (bounded): extend useHealthSync with the Height and BodyFat reads Progress advertised, and with an 'install' state surfacing openHealthConnectPlayStore; align the requested recordTypes with the four declared in app.json:52-58. Step 4 (bounded): have requestPermissions/hasPermissions return the granted recordType set rather than a boolean; expose grantedSteps/grantedWeight and render per-capability state on Profile — never print 'no new weigh-ins' when the weight permission is missing. Step 5 (bounded): replace the per-entry addWeightEntry loop with the bulk addWeightEntries action from B0, and guarantee currentWeightKg only moves when the newest imported date is newer than the newest existing one. Step 6 (bounded): read imperatively via useStore.getState() inside importWeightHistory and drop the profile/weightLog subscriptions at useHealthSync.ts:35-36; hoist the availability probe into a module-level singleton so StepsCard and Profile share one round trip. Step 7 (bounded): make readSteps distinguish empty from thrown, and give StepsCard a pending / failed / ready branch plus a `refreshing` flag on the Refresh button. Step 8 (OPEN-ENDED verify loop): confirm the Progress tab now mounts on iOS and in Expo Go, and that a partial grant reports honestly on Android.

**Needs a decision from you:**

- Should body-fat records actually be imported (via addBodyMeasurement) or should the body-composition claims simply be removed from the UI? Importing them means deciding what a BodyMeasurement without circumference fields means.

### B4 — Weight stored in kg, with migration

**Goal.** Stop a kg/lbs toggle from silently reinterpreting every historical weigh-in. Blocked on B0. This is the most invasive data change in the plan and must land alone.

**Files.** `src/components/WeightTarget.tsx`, `app/(tabs)/progress.tsx`, `app/(tabs)/profile.tsx`, `app/onboarding.tsx`, `src/store/useStore.ts`

**Shape.** Step 1 (bounded): add `version` + `migrate` to the persist config in src/store/useStore.ts — this must land before any partialize change in B12 so the two migrations do not interleave. Step 2 (bounded): write the one-time migration keyed on the unit recorded at write time; without it, existing accounts are re-interpreted on upgrade. Step 3 (bounded): convert at the input boundary — WeightTarget.tsx:79-84 submits kg; progress.tsx:736-742 converts kg→display when building weightPoints; profile.tsx:552 formats through kgToLbs; onboarding's finish() files the first weigh-in with getTodayString() rather than a UTC date. Step 4 (bounded): delete the local LBS_PER_KG constants in WeightTarget.tsx:16 and profile.tsx and import kgToLbs from @core/utils/calculations, matching progress.tsx:693. Step 5 (bounded): fix the profile unit-toggle path so the goal-weight field text is re-derived from profile.targetWeightKg whenever the unit changes (profile.tsx:518). Step 6 (OPEN-ENDED verify loop): seed a device with kg history, upgrade, toggle to lbs and back, and confirm the chart, the Latest tile, the target card, weightTarget.ts trend/ETA and coachAlerts all agree at every step. Iterate until round-tripping the toggle is a no-op.

**Needs a decision from you:**

- What do we do with entries whose recording unit cannot be determined (e.g. rows that arrived from the web app)? Options: assume the account's current weightUnit, assume kg, or quarantine them behind a one-time 'confirm your units' prompt.

### B5 — One owner for targets (Profile + Goals)

**Goal.** Stop a name typo from silently rewriting the user's calorie and macro targets, add the missing validation, and make /goals the single owner of every numeric target.

**Files.** `app/(tabs)/profile.tsx`, `app/goals.tsx`

**Shape.** Step 1 (bounded): remove the unconditional recalculateGoals() from commitBasics (profile.tsx:249) and from the three Choice handlers (:477, :490, :504). Step 2 (bounded): where recalculation is genuinely warranted (goal or activity change), gate it — compare state.goals against the current formula output and, when the user has diverged or useCoachData().accepted is true, ask before overwriting and name the numbers being replaced. Step 3 (bounded): recompute through caloriesForPace(tdee, goal, |targetRateKgPerWeek|) from src/core/utils/onboarding.ts so the stored pace is honoured rather than a flat ±500. Step 4 (bounded): import validateBasics and validateTarget and run them in commitBasics/commitTargetWeight, keeping the previous value and rendering the returned message via the shared InlineError from B2. Step 5 (bounded): derive the About-you field values from the store rather than capturing them at mount (profile.tsx:227), and have commitBasics patch only the edited field. Step 6 (bounded): render paired feet/inches Fields when heightUnit === 'ft' using feetInchesFromCm/cmFromFeetInches. Step 7 (bounded): replace the body of profile.tsx's 'Targets' Section (:411-435) with the goal-weight Field plus a navigation row to /goals, and move the 'Daily step goal' Field out of the Health Connect section into it. Step 8 (bounded): on goals.tsx add a Weight goal section (goal weight + a pace selector writing targetRateKgPerWeek via signedRate — the pace has no editor anywhere today) and sugar/sodium/water fields; drive the preset anchors and the BMR/TDEE/Suggested row from coach.tdee so the screen stops showing two disagreeing burn figures; snapshot goals in useCoach.accept and render an Undo in the accepted row (:583-595). Step 9 (bounded): clear or re-default targetRateKgPerWeek when the goal changes (profile.tsx:475). Step 10 (OPEN-ENDED verify loop): walk accept-plan → edit every Profile field → confirm the plan survives and the Goals button still reads 'Plan accepted'.

**Needs a decision from you:**

- When body details change, should targets recalculate silently, prompt, or never? Recommendation is prompt-when-diverged, never-when-a-coach-plan-is-accepted — confirm.
- Does the goal weight live on /goals only, or stay duplicated on Profile with a link? The plan assumes /goals owns it and Profile links out.

### B6 — Dashboard: right actions, right day, honest status

**Goal.** Make the screen the app opens on answer 'am I on track' correctly and get the user to the logging action in one tap. Repoints the global FAB, which is why the tabs layout is in this batch and not B2.

**Files.** `app/(tabs)/index.tsx`, `app/(tabs)/_layout.tsx`

**Shape.** Step 1 (bounded): repoint the FAB at app/(tabs)/_layout.tsx:151 to logging via a useSegments() read — /food-search with { meal: inferredFromClock, date } on Dashboard/Diary/Progress, /lift-picker on Workout when activeWorkoutId is set, nothing on Profile. Step 2 (bounded): delete the Haptics.selectionAsync() at :88 and the impactAsync at :150 (plain navigation), and add a light impact to the water quick-add/decrement at index.tsx:562/583 (real commits). Step 3 (bounded): change the meal rows at index.tsx:429 to push /food-search with { meal, date: today } when the row has nothing logged, keeping /diary only for rows with entries, and pass an explicit date param either way. Step 4 (bounded): render any mealType present in mealTotals so Pre-Workout and Post-Workout stop being invisible and the rows sum to the hero. Step 5 (bounded): add an AppState 'change' listener (or a shared useToday() hook) so `today` is state, not a render-time derivation, and re-renders when the app resumes past midnight. Step 6 (bounded): make the hero tone goal-aware — treat progress === 1 as 'good' in every phase, invert for gain/lean_bulk, reserve critical for a real overshoot; keep icon + words. Step 7 (bounded): derive the day-streak display from streak.lastLoggedDate so a broken streak reads 0 with 'Log today to restart'. Step 8 (bounded): either compute the training tile from workoutLog filtered to today or delete it — do not keep rendering a permanent 0. Step 9 (bounded): delete the 'AI Nutrition Assistant' Surface at :134-151 and the header IconButton at :123-130; add a conditional training card (session in progress → elapsed + set count → /workout; otherwise last session + Start workout) and a badge on the Workout tab when activeWorkoutId is set. Step 10 (bounded): label the coach card 'Proposed — not applied' with an Apply action when useCoachData().accepted is false; give CoachCard a non-Sparkles icon. Step 11 (bounded): reorder to Hero → Meals → Macros → Coach → Water → Steps → Weight; drop the duplicate WeightTargetCard from profile.tsx:358 is deferred to B10 to avoid a file collision.

**Needs a decision from you:**

- Context-sensitive FAB per tab (recommended) versus a fixed 'log food' FAB everywhere. The former costs one useSegments() read and matches the tab's primary verb; the latter is more predictable.
- Deleting the 'Ask AI' promo card removes the most prominent surface for the product's differentiator. Confirm the FAB + chat header icon is sufficient discovery.

### B7 — Diary: date correctness and the fast repeat paths

**Goal.** Stop food from landing on the wrong day, and wire up the two repeat shortcuts that already exist in the store but have no UI.

**Files.** `app/(tabs)/diary.tsx`

**Shape.** Step 1 (bounded): seed `date` from useLocalSearchParams and re-sync to `today` on an effect keyed on today, so a hand-off from the Dashboard lands on the right day and an app left open past midnight does not keep pointing at yesterday. Step 2 (bounded): add 'Copy yesterday' beside 'Jump to today' in DateNavigator (calling copyDayEntries) and 'Same as yesterday' on each empty MealCard (calling copyMealEntries, shown only when the previous day has entries for that meal). Step 3 (bounded): call updateStreak() alongside applyMealTemplate at :624 until B0's upstream move lands. Step 4 (bounded): add a meal ChoiceChip row to the expanded EntryRow at :376 (blocked on B0's moveFoodEntry), and a rotating ChevronDown at the trailing edge so the row reads as tappable. Step 5 (bounded): gate deleteMealTemplate behind a confirm and move it off the primary tap surface; give removeFoodEntry a 5-second Removed/Undo snackbar. Step 6 (bounded): show a confirmation with item count plus Undo after applyMealTemplate, and scroll to the affected MealCard. Step 7 (bounded): pass isToday down to DayTotals so 'N kcal left today' becomes 'N kcal under goal' on any other date. Step 8 (bounded): stop snapping sub-0.25 servings silently — either accept small positive fractions or keep the typed value and show 'Minimum 0.25 servings' inline. Step 9 (bounded): render Pre-Workout/Post-Workout cards only when they have entries, behind a single 'More meals' disclosure, and move each card's 'Add food' into the card header next to the kcal total. Step 10 (bounded): wrap StatValue around the denominators at :185 so Fraunces and Figtree stop sitting in the same row.

**Needs a decision from you:**

- Undo-by-snackbar versus confirm-before-delete for logged entries. Snackbar is faster for the common case but needs a place to live in the Screen shell.

### B8 — Food search: complete the flow

**Goal.** Give the search screen a create path, working recents, an abortable/cached network layer and a keyboard that does not cover the commit button.

**Files.** `app/food-search.tsx`, `src/lib/usda.ts`, `src/lib/env.ts`

**Shape.** Step 1 (bounded): add src/lib/usda.ts owning the fetch, reading USDA_API_KEY from env.ts:107 and threading an AbortSignal + timeout (blocked on B0's usdaApi signature change); import searchUSDA from there. Step 2 (bounded): create an AbortController in the effect at :275 and abort it in the cleanup; add an LRU Map<string, Food[]> keyed by the debounced query. Step 3 (bounded): branch the error card at :492 on status — 429/403 → rate-limit copy, network failure → connection copy — and suppress the footer 'No matches' whenever the USDA request is loading or errored (:691). Step 4 (bounded): add a 'Create this food' action to both the empty-state and results footers, opening an inline form that calls addCustomFood then openServingStep — mirroring startCreating/handleCreate at lift-picker.tsx:193-212. Step 5 (bounded): build recents from the diary rather than the id lookup, and filter them by the query instead of returning [] the moment a character is typed. Step 6 (bounded): run the local 106-row search off the raw query and keep the 350 ms debounce for the network effect only. Step 7 (bounded): convert rather than reset in switchUnit (:399) so 2 servings becomes 364 g, not 182 g. Step 8 (bounded): opt into the keyboardAvoiding prop from B2 for the serving-step ScrollView (:535) and pin the commit button in a footer above the keyboard; add autoFocus to the SearchBar TextInput. Step 9 (bounded): add a BackHandler that calls setSelected(null) while the amount step is open and set gestureEnabled: false on the food-search Stack.Screen in app/_layout.tsx:75 for that state. Step 10 (bounded): keep the date in the amount-step subtitle; treat an empty amount field as 'still editing' rather than flashing a critical error; numberOfLines={2} on the header title. Step 11 (bounded): stop seeding the empty-query list with FOOD_DATABASE.slice(0, 25) — show Recent/Your foods plus category chips, or at minimum one representative item per category.

**Needs a decision from you:**

- Custom-food creation form scope: name + serving + the four macros only, or the full 21-field Food shape? Minimal is faster to log against; full matches what USDA and the preset DB carry.

### B9 — Workout: data integrity and destructive-action guards

**Goal.** Stop the set grid from silently recording 0 kg, stop one-tap destruction of logged work, and make a mistyped weight correctable. Correctness only — structure and performance are B10 and B13.

**Files.** `app/(tabs)/workout.tsx`, `src/components/Layout.tsx`

**Shape.** Step 1 (bounded): in handleComplete (:231) commit the placeholder suggestion.weightKg when a non-bodyweight set is completed with a blank weight, or disable Done and say why in the existing accessibilityHint; show the word 'Bodyweight' rather than a blank when suggestion.weightKg === 0. Step 2 (bounded): make Done-with-zero-reps do something visible — focus the reps input and show the hint inline, using the confirmRemove branch at :397-413 as the in-file pattern. Step 3 (bounded): invert the delete guard at :240 so the two-tap confirm fires whenever the row holds real work (reps > 0 || weightKg > 0 || completed) and only a genuinely empty row free-deletes; separate the bin from the tick with spacing.md instead of 4pt. Step 4 (bounded): give the exercise-card X at :522 the same two-tap confirm, worded with the stake, skipped only when the exercise has no sets. Step 5 (bounded): make HistoryCard's expanded sets editable by rendering the existing SetRow against updateSet/removeSet — both take a sessionId and work regardless of activeWorkoutId (appState.ts:537-551), so no upstream change is needed for the edit path. Step 6 (bounded): render a banner when activeSession.date !== getTodayString() offering Finish / Start new. Step 7 (bounded): add a date row to the 'Ready to train?' card defaulting to getTodayString() and passed into startWorkout/applyWorkoutTemplate — both already take date. Step 8 (bounded): seed each new set from the last set of that exercise so a straight 5x5 is one tap per set, and add 44pt −/+ plate steppers flanking the weight cell. Step 9 (bounded): opt the workout ScrollView into B2's keyboardAvoiding prop so the focused row scrolls above the keypad. Step 10 (bounded): change `height: HIT_SIZE` to `minHeight: HIT_SIZE` at :132 so the inputs do not clip at large OS font sizes; label the set-number column 'Set / W' and make the warmup state a visible chip. Step 11 (OPEN-ENDED verify loop): log a full 5-exercise session one-handed on a real device with the keyboard up; iterate until no tap destroys logged work without a confirm and no completed set can hold a 0 the user did not type.

**Needs a decision from you:**

- Correcting a finished session: inline-editable history rows (no upstream change needed) versus a resumeWorkout(sessionId) action (needs B0). Inline editing is available immediately.

### B10 — Workout: session end, rest timer, and live/archive separation

**Goal.** Give the end of a workout a payoff and an escape hatch, and make the rest timer visible when it matters.

**Files.** `app/(tabs)/workout.tsx`, `src/components/RestTimer.tsx`

**Shape.** Step 1 (bounded): put a confirm in front of Finish naming what is being closed (sets, volume, duration, PRs hit) with 'Save workout' / 'Keep training'. Step 2 (bounded): hold the just-finished session id in local state and render a summary card in place of ActiveWorkout — sessionVolume, sessionSetCount, formatDuration and the prSetIds set computed at :684 are all already in this file — with 'Save as template' and 'Done'. Step 3 (bounded): pin the RestTimer as an absolutely-positioned GlassSurface pill above the tab bar, mirroring the FAB geometry from (tabs)/_layout.tsx:157, and add its height to the ScrollView bottom padding while active. This also removes the ~80pt layout shift that fires after every completed set. Step 4 (bounded): fix adjust() in RestTimer.tsx:68 to rebase from now when the deadline has passed (`deadlineRef.current = Math.max(deadlineRef.current, Date.now()) + applied * 1000`) and apply the same clamp to the − direction, then clear firedRef only when the resulting remaining time is > 0. Step 5 (bounded): schedule an expo-notifications local notification for the rest deadline so the alert survives backgrounding, cancelled on dismiss/adjust/next set; keep the haptic for the foreground case. Step 6 (bounded): add expo-keep-awake and call useKeepAwake() inside ActiveWorkout only. Step 7 (bounded): gate the PR block (:1227) and the History block (:1291) on activeSession === null, matching the existing pattern at :1173/:1190. Step 8 (bounded): make lift-picker selection additive with a running count and a single 'Add N exercises' commit, and exclude frequent ids from the All-lifts list when the frequent header is shown (lift-picker.tsx:466). Step 9 (bounded): seed a set row when an exercise is added, and scroll to the new card. Step 10 (bounded): persist the last-used rest length (blocked on B0) and surface long-press rename/delete on template chips (blocked on B0).

**Needs a decision from you:**

- Does the rest timer warrant a notification permission prompt? It is the only feature that needs one, and the prompt has to be asked for at a sensible moment (first completed set, not app launch).

### B11 — Onboarding and auth entry

**Goal.** Stop first-run setup from being destroyable by a hardware back press or a phone call, and give a locked-out user a way back in.

**Files.** `app/onboarding.tsx`, `app/login.tsx`, `app/reset-password.tsx`, `src/lib/AuthProvider.tsx`

**Shape.** Step 1 (bounded): add a BackHandler in onboarding that calls back() and returns true while step > 0. Step 2 (bounded): persist the draft after each successful next() — either straight into profile with onboardedAt left null, or an onboardingDraft slice — and rehydrate every useState initialiser including `step`, with 'Picking up where you left off' on resume. Step 3 (bounded): derive the closing timeline from the calories actually about to be saved ((tdee - plan.calories) * 7 / KCAL_PER_KG) so the 1,200 kcal floor is not promised away, and say so in one line when the floor bit. Step 4 (bounded): fix the 'Other' copy at :455 and the Profile label at :495 to describe what the formulas actually do. Step 5 (bounded): change the closing 'editable under Profile' copy at :670 to match wherever targets actually live after B5. Step 6 (bounded): swap GlassSurface for Surface at :357 (and login.tsx:161, profile.tsx:309, workout.tsx:719) — body paragraphs on glass are a rule violation and compound the textMuted contrast problem. Step 7 (bounded): replace the hand-styled calorie Body at :630-640 with StatValue, and the macro figures at :657-662 likewise. Step 8 (bounded): swap theme.status.good used as a brand accent to theme.brand/brandText throughout onboarding. Step 9 (bounded): add minHeight: HIT_SIZE to the unit toggle at :127 and profile.tsx:163; add the three missing accessibilityLabels at :54, :122, :425; route validation messages through B2's InlineError. Step 10 (bounded): add resetPassword(email) to AuthProvider wrapping resetPasswordForEmail with a macrofit:// redirect, a 'Forgot password?' ghost button under login's submit in mode 'in', and a deep-linked app/reset-password.tsx calling supabase.auth.updateUser — failures through describeAuthError. Step 11 (bounded): add an eye toggle, iOS textContentType, and returnKeyType/onSubmitEditing wiring to the login fields. Step 12 (bounded): adopt a keyboard-avoidance approach that actually works on Android for login, onboarding and chat.

**Needs a decision from you:**

- Password reset needs a deep-link scheme registered and a Supabase redirect URL allow-listed. Confirm macrofit:// is the scheme and that someone can configure the Supabase project.
- Does the onboarding draft persist into the real profile (visible to sync) or into a separate throwaway slice? The first is simpler; the second avoids half-finished profiles reaching the server.

### B12 — Progress: honest windows, missing goal line, component extraction

**Goal.** Stop the Progress tab telling users with months of data that they have none, and reduce a 1,268-line route to reusable pieces. Runs after B3 so the Health Connect card is already gone.

**Files.** `app/(tabs)/progress.tsx`, `src/components/charts/`, `src/components/WeightTarget.tsx`

**Shape.** Step 1 (bounded): distinguish 'no weigh-ins at all' from 'none in this window' — keep the Summary tiles populated from the most recent entry and name it ('Your last weigh-in was 82.4 kg on 18 Jul') with a control that switches to 30d; apply the same to the 'Needs 2 weigh-ins' copy at :1026. Step 2 (bounded): render <WeightTargetCard compact /> at the top of the Weight tab so logging does not require leaving the tab, and correct the empty-state destination copy at :987. Step 3 (bounded): pass goal={profile.targetWeightKg} and a Legend to the weight LineChart, and overlay the least-squares trend from getWeightTargetProgress so noise reads against a line; apply a nice-step routine to the non-zero-baseline y-axis at :222. Step 4 (bounded): apply the same 500 kcal qualification to progress's dayStats that Goals uses, relabel to 'Days fully logged', and suppress the average-vs-goal summary below a 3-day sample with 'Only 1 day logged — not enough to average yet'. Step 5 (bounded): either filter Personal records to the selected window and label them accordingly, or move the card out from under the range control and add a 'Show all N lifts' expander. Step 6 (bounded): route all remaining status text through icon + words + theme.status tokens — never theme.macro.* for status (:1113). Step 7 (bounded): extend the macros and training chart accessibilityLabels with their actual values, and give each VolumeBars row its own accessible + label. Step 8 (bounded): persist tab and range (store or route params) so the Workout tab can deep-link to /progress?tab=training. Step 9 (bounded): make WeightTarget's `compact` genuinely compact — current weight, one status line, the weigh-in field — and keep the Field rendered when loggedToday, pre-filled and labelled 'Update today's weigh-in'. Step 10 (bounded): extract :49-480 into src/components/charts/ and :486-583 into shared Segmented/StatTile, so the charts can be reused on Workout and Diary. Step 11 (bounded): remove the duplicate WeightTargetCard from profile.tsx:358 and reword profile.tsx:542, which currently references a card that would no longer exist.

**Needs a decision from you:**

- Extracting the chart primitives is a large mechanical refactor with no user-visible change on its own. Confirm it is worth doing now rather than after the performance batches.

### B13 — Persistence and sync performance

**Goal.** Cut write amplification at both the local and cloud layers. Must land after B4's persist `version`/`migrate` so the two storage changes do not interleave.

**Files.** `src/store/useStore.ts`, `src/lib/AuthProvider.tsx`, `android/gradle.properties`

**Shape.** Step 1 (bounded, do this first): move the four per-keystroke writers in workout.tsx (:216 weight, :222 reps, :228 RPE, :658 rename) to onEndEditing/onBlur and handleComplete, mirroring diary.tsx:323 commitDraft. This alone removes the hot path and is independent of everything below. Step 2 (bounded): add `partialize` to src/store/useStore.ts:25 dropping progressPhotos (they belong in expo-file-system, referenced by URI — an upstream ProgressPhoto shape change) and dropping activeWorkoutId/fastingSession. Step 3 (bounded): wrap the storage object handed to createJSONStorage so setItem coalesces on a ~1 s trailing timer, flushes on AppState background (mirroring AuthProvider.tsx:149-154), and catches write failures instead of letting them be swallowed by `void` — surface the failure on the Profile sync row. Step 4 (bounded): add AsyncStorage_db_size_in_MB=20 to android/gradle.properties. Step 5 (bounded): add a leading+trailing throttle of 15-30 s on top of the 1,500 ms debounce in AuthProvider.tsx:137-144, keep the background flush, and skip the upload when a cached hash of collect() is unchanged from the last successful save. Step 6 (bounded): implement the retry the Profile copy already promises — backoff on failure plus a NetInfo listener that flushes on reconnect — or change the copy and add a manual 'Retry now'. Step 7 (bounded): useMemo the auth context value on [user, session, loading, syncStatus, hydrating] and useCallback the four methods; move syncStatus into its own small context so a high-churn string does not re-render every consumer of auth identity. Step 8 (OPEN-ENDED measure/tune loop): instrument one persist write at 200 KB / 1 MB / 4 MB with performance.now() on the target low-end device and tune the coalescing interval and retention window against real numbers. Step 9 (bounded, after measurement): add a diary/workout retention window (candidate: 400 days local, older data lives in the cloud row).

**Needs a decision from you:**

- Retention window: how many days of diary and workout history stay on-device? Dropping older data means the cloud row becomes load-bearing for history views, which needs an on-demand fetch path that does not exist yet.
- Progress photos: drop from the mobile persist entirely, or move to expo-file-system with only the URI persisted? The second needs an upstream ProgressPhoto shape change and a web-repo agreement.

### B14 — Render performance

**Goal.** Make the set grid keep up with the keyboard regardless of how much history the user has accumulated, and stop the app degrading as the user succeeds at using it.

**Files.** `app/(tabs)/workout.tsx`, `src/theme/useTheme.ts`, `app/_layout.tsx`, `app/(tabs)/progress.tsx`, `app/(tabs)/profile.tsx`, `app/food-search.tsx`, `app/lift-picker.tsx`, `app/chat.tsx`

**Shape.** Step 1 (bounded): make useTheme a useContext read — resolve darkMode once in app/_layout.tsx and provide the already-stable darkTheme/lightTheme module constant through a React context, so ~800 store subscribers become zero. Drop-in, no call-site changes. Step 2 (bounded): re-key the two invalidating memos in workout.tsx — priorRecords (:675) off workoutLog.length + activeWorkoutId (or computed once into a ref when the session opens), and suggestions (:709) off a workoutLog.length-keyed derivation of closed sessions only. Step 3 (bounded): split the screen so the live session does not share a subscription with history — move history + records into a child component with its own selector. Step 4 (bounded): wrap SetRow, ExerciseCard and HistoryCard in React.memo; hoist per-row handlers into useCallbacks keyed by id (or pass set.id down and have SetRow call onChange(set.id, patch)); move numberInputStyle to two static StyleSheet.create variants at module scope; hoist sessionSetCount/sessionVolume/formatDate into a useMemo inside the memoized card. Step 5 (bounded): virtualize the history list — convert the screen body to a FlatList whose data is history with everything else in ListHeaderComponent, using the Screen scroll={false} pattern already proven at lift-picker.tsx:458 and food-search.tsx:678; keyExtractor={s => s.id}, initialNumToRender={8}. Interim cheaper step if the FlatList conversion is deferred: history.slice(0, 10) with a 'Show all N workouts' ghost button. Step 6 (bounded): gate progress.tsx's workoutLog-derived memos (:759-776) behind useIsFocused() so an unseen tab stops paying for every unrelated write, and wrap its six averages in one useMemo over [dayStats, sessionsInRange]. Step 7 (bounded): change profile.tsx's Section to take children as a function and call it only when open, so ~45 hidden rows and ~25 Intl formats stop being built on every keystroke. Step 8 (bounded): memoize FoodRow/LiftRow with React.memo and stable onPress, hoist renderItem into useCallback, add initialNumToRender/windowSize; debounce the lift search. Step 9 (bounded): in chat.tsx read goals/diary/profile/currentWeightKg imperatively via useStore.getState() inside send() and drop the four subscriptions. Step 10 (OPEN-ENDED measure loop): profile a keystroke in the set grid with 500 seeded sessions on the target device and iterate until the < 5 ms JS budget holds.

**Needs a decision from you:**

- Converting the Workout screen body to a FlatList means giving up the Screen ScrollView shell for that route. Confirm that is acceptable, or accept the cheaper slice(0,10) cap as the shipped answer.

### B15 — Bundle, background cost, and motion

**Goal.** Reduce what the device downloads and what the app burns while the user is not looking at it, and honour Reduce Motion.

**Files.** `src/components/icons.ts`, `src/components/RestTimer.tsx`, `src/components/Button.tsx`, `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `src/components/Glass.tsx`, `src/components/Backdrop.tsx`, `src/theme/tokens.ts`

**Shape.** Step 1 (bounded): add src/components/icons.ts re-exporting only the ~60 used icons through lucide's per-icon subpaths (`lucide-react-native/icons/check`), then repoint the ~20 barrel imports; call sites stay unchanged. Verify by diffing bundle size before and after. Step 2 (bounded): clearInterval in RestTimer.tsx:52-63 once left <= 0 and let the triggerKey effect restart it, and drop the poll from 250 ms to 1000 ms (the deadline-based design at :46 already makes drift a non-issue). Step 3 (bounded): read useReducedMotion() in Button.tsx:63 and animate opacity to 0.85 instead of scale when reduced, at 150 ms per spec; same for the FAB transform at (tabs)/_layout.tsx:167; switch the stack to animation: reduced ? 'fade' : 'slide_from_right' in app/_layout.tsx. Step 4 (bounded): add an `edge` prop to GlassSurface (hairline border + top highlight) and replace the four hand-rolled blur stacks — header, tab bar, FAB, composer. Step 5 (bounded): replace the nine hardcoded colour literals with token reads — Backdrop's six rgba washes derived from the imported jade/stone scales via an alpha helper, #FFFFFF → theme.brandOn, #FAFAF9 → stone[50], and a new shadow token for the two #1C1917 values. Step 6 (bounded): raise the inactive tab label to size 11 / theme.textSecondary. Step 7 (OPEN-ENDED measure loop): only after measuring with the Perf Monitor, tune Android glass — lower theme.glass.intensity and gate experimentalBlurMethod: 'dimezisBlurView' behind a device-class check. Keep all five permitted glass surfaces; change cost, not structure.

**Needs a decision from you:**

- Android glass degradation: is a flat scrim fallback on low-tier devices acceptable, or must the blur render everywhere? The Glass.tsx:29-32 comment says the overlay is already designed to survive without the blur.

### B16 — Shared control library and remaining polish

**Goal.** Delete the seven forks of the chip/segmented pattern, three tile forks and six notice forks that are the mechanism behind most of the a11y and typography findings, then sweep the remaining P3s. Runs last because every earlier batch would otherwise be rebasing on top of it.

**Files.** `src/components/Layout.tsx`, `src/components/Sheet.tsx`, `src/components/Text.tsx`, `app/(tabs)/profile.tsx`, `app/(tabs)/progress.tsx`, `app/goals.tsx`, `app/food-search.tsx`, `app/lift-picker.tsx`, `app/(tabs)/diary.tsx`

**Shape.** Step 1 (bounded): add Chip/Segmented, StatTile, Notice and SearchField to src/components built on the tokens, plus the missing Sheet. Step 2 (OPEN-ENDED replace/verify loop, one call site at a time): delete the seven chip forks, three tile forks, six notice forks and the duplicate SearchBar, screenshotting each screen in both themes after each replacement — this is where the sub-44pt targets, the status-green accents and the missing-Fraunces figures all get fixed as a side effect. Step 3 (bounded): use the new Sheet for the food-search serving step (currently a full-screen state swap at food-search.tsx:524-673). Step 4 (bounded): sweep the remaining StatValue conversions — StepsCard.tsx:79 via a shared exported formatNumber, WeightTarget.tsx:101, goals.tsx:592, and Pill gaining a numeric variant. Step 5 (bounded): normalise the three ad-hoc radii to the token scale (radius.tight for the lift-picker checkbox and progress legend swatch, radius.card for the login tile). Step 6 (bounded): unify the assistant destination's accessibilityLabel across diary.tsx:690 and workout.tsx:1145. Step 7 (bounded): fix the 'kcal to lose' raw-enum caption at goals.tsx:762 with a GOAL_CAPTION map. Step 8 (bounded): move Weight log / Body measurements to Progress and Custom foods / Meal templates to the Diary food sheet, leaving Profile as identity, targets, about-you, integrations, appearance and account — and decide the fate of the account block's position. Step 9 (bounded): add the Account section (change password, delete account) that store review and privacy expectations require. Step 10 (bounded): persist chat history keyed by day, add Retry on failed turns, keep the user's text in a lastAttempt ref, and exclude failed entries when building the history array at chat.tsx:169. Step 11 (bounded): either surface progress photos and fasting read-only, or state plainly in the Profile sync row that they are web-only — silently syncing data the app never shows is the worst option.

**Needs a decision from you:**

- Account deletion needs a server-side edge function to remove the auth user and the user_data row. Confirm someone can deploy it, or the feature ships as a link to the website.
- Moving Custom foods and Meal templates out of Profile changes where users who already learned the app go looking. Confirm the Diary is the right home.
