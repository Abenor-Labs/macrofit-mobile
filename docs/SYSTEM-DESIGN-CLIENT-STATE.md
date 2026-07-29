markdown
# System Design: MacroFit Mobile client state & sync

## Requirements

### Functional
- **F1 — One store, two platforms.** All business state and every mutation lives in `src/core/store/appState.ts` (627 lines, generated from the web repo). Mobile supplies only the storage adapter: `src/store/useStore.ts:25` wraps `createAppState` in `persist(immer(...))` with `createJSONStorage(() => AsyncStorage)`. No formula may be reimplemented in a component.
- **F2 — Log without a network.** Logging a food, a set, water, or a weigh-in must succeed and survive process death with the radio off. The local store is the source of truth for the session; the cloud is a replica.
- **F3 — Account-scoped restore.** A signed-in user's `SYNC_FIELDS` blob (`src/lib/AuthProvider.tsx:40-46`, 20 keys) round-trips through the `user_data` Postgres row so a new device rebuilds the account. `hydrateStore` (`appState.ts:603`) is the only ingress.
- **F4 — Device-health ingress.** Android Health Connect supplies today's steps, a 7-day step series, and up to 365 days of weigh-ins/height/body-fat (`src/lib/healthConnect.ts`, `src/hooks/useHealthSync.ts`, and a second duplicate client under `src/lib/health/`).
- **F5 — Untrusted third-party ingress.** USDA FoodData Central (`src/core/utils/usdaApi.ts`) and the AI endpoints (`src/lib/api.ts` → `/api/chat`, `/api/analyze-photo`, `/api/recommend`) both feed numbers into the diary. `api.ts` already validates field-by-field and drops anything non-finite; USDA does not get the same treatment.

### Non-functional (real targets)
| Property | Target |
|---|---|
| Cold start, process launch → interactive dashboard | < 2,000 ms p50, < 3,500 ms p95 |
| Unbranded blank screen at any point in launch | ≤ 250 ms (currently up to 8,000 ms) |
| Store rehydrate (`AsyncStorage.getItem` + `JSON.parse`) | < 150 ms at 12 months of data |
| Keystroke in the set grid → glyph on screen | < 100 ms; < 5 ms of JS work per character |
| Committing a set (tick Done) → checkbox fills | < 100 ms |
| Tab switch → first frame, with 500 logged sessions | < 300 ms |
| Persisted blob after 12 months of daily logging | < 500 KB |
| Cloud writes during continuous editing | ≤ 2 per minute, payload < 200 KB steady state |
| Offline | Every write path (food, set, water, weight, profile, goals) succeeds locally, is durable across a kill, and reconciles on reconnect without a silent overwrite |

---

## Scale assumptions

Every number is marked **DERIVED** (read out of the code) or **GUESS** (needs measurement).

| Quantity | Value | Source |
|---|---|---|
| `FOOD_DATABASE` rows | **106** | DERIVED — `src/core/data/foodDatabase.ts` |
| Default food-search list shown with empty query | **25** | DERIVED — `FOOD_DATABASE.slice(0, 25)`, `app/food-search.tsx:313` |
| `LIFT_DATABASE` rows | **86** | DERIVED — `src/core/data/exerciseDatabase.ts:28` |
| `recentFoodIds` cap | **20** | DERIVED — `appState.ts:254` `.slice(0, 20)` |
| `progressPhotos` cap | **20** | DERIVED — `appState.ts:426` |
| `weightLog` cap | **none**; one entry per date, deduped | DERIVED — `appState.ts:321` |
| `diary` cap | **none**; unbounded `Record<date, DiaryDay>` | DERIVED — `appState.ts:190` |
| `workoutLog` cap | **none** | DERIVED — `appState.ts:203` |
| Chart points per view | **7 or 30** | DERIVED — `getLast7Days` / `getLast30Days`, `app/(tabs)/progress.tsx:695` |
| Health import window | **365 days** | DERIVED — `src/lib/health/health.sync.ts:7` |
| Cloud save debounce | **1,500 ms** | DERIVED — `AuthProvider.tsx:48` |
| Cloud load timeout | **8,000 ms** | DERIVED — `AuthProvider.tsx:65` |
| API timeouts | chat 45 s / photo 60 s / recommend 30 s | DERIVED — `api.ts:31-37` |
| Food-search debounce | **350 ms** | DERIVED — `app/food-search.tsx:43` |
| AsyncStorage Android DB ceiling | **6 MB** | DERIVED — library default, no `AsyncStorage_db_size_in_MB` override in `android/gradle.properties` |
| **Food entries logged per day** | **8** | GUESS |
| **Workout sessions per week** | **3** | GUESS |
| **Sets per session** | **20** (5 exercises × 4 sets) | GUESS |
| **Weigh-ins per year** | **365** (daily) | GUESS |
| **Share of logged foods sourced from USDA rather than the 106-row preset DB** | **~70%** | GUESS |
| **Mid-range Android Hermes `JSON.stringify` throughput** | **~50-100 MB/s** on object graphs | GUESS — must be measured before locking budgets 3-6 |

### Measured payload sizes (`node`, real objects from `foodDatabase.ts` + `src/core/types`)
```
FoodEntry, preset food (Food is 21 fields, denormalized per entry)   421 bytes
FoodEntry, USDA food (long name + brand)                             504 bytes
empty DiaryDay wrapper                                                68 bytes
WorkoutSet                                                           113 bytes
WorkoutExercise, 4 sets                                              662 bytes
WorkoutSession, 5 exercises x 4 sets                               3,462 bytes
WeightEntry                                                           90 bytes
```

---

## High-level diagram

```
                                 ┌──────────────────────────────────────────┐
                                 │  UI (expo-router screens + components)   │
                                 │  index / diary / workout / progress /    │
                                 │  profile / goals / chat / food-search    │
                                 └───┬──────────────────────────────┬───────┘
                     sync (selector) │                              │ sync
                                     v                              v
      ┌──────────────────────────────────────────┐   ┌──────────────────────────┐
      │ zustand store  useStore.ts:24            │   │ useTheme()  theme/        │
      │  persist( immer( createAppState ) )      │◄──┤ useTheme.ts:13 is ALSO a │
      │  ~35 actions, all from src/core (GEN)    │   │ store subscription       │
      └───┬───────────────┬──────────────────┬───┘   └──────────────────────────┘
          │               │                  │
  async   │        async  │           async  │  (fire-and-forget, unawaited)
  (every  │        (1.5s  │           (no    │
   set()) │        debounce)          batching)
          v               v                  v
 ┌──────────────────┐  ┌────────────────────────────┐  ┌──────────────────────────┐
 │ AsyncStorage     │  │ AuthProvider.tsx:137-144   │  │ src/hooks/useHealthSync  │
 │ key              │  │  useStore.subscribe()      │  │  + src/lib/healthConnect │
 │ 'macrofit-       │  │  -> collect() 20 fields    │  │  -------- AND ---------- │
 │  storage'        │  │  -> supabase.upsert        │  │  src/lib/health/*  (2nd, │
 │ NO partialize    │  └────────────┬───────────────┘  │  duplicate client)       │
 │ NO version       │               │ async            └──────────┬───────────────┘
 │ NO migrate       │               v                             │ async
 │ 6 MB Android cap │  ┌────────────────────────────┐             v
 └──────────────────┘  │ Supabase                   │  ┌──────────────────────────┐
                       │  auth (AsyncStorage sess.) │  │ Health Connect            │
                       │  user_data.data JSONB      │  │ (TurboModule, Android)    │
                       │  last-writer-wins, no ver. │  └──────────────────────────┘
                       └────────────────────────────┘

          ┌──────────────────────────┐        ┌──────────────────────────────────┐
          │ USDA FoodData Central    │        │ Web API  (EXPO_PUBLIC_API_URL)   │
          │ src/core/utils/usdaApi   │        │ /api/chat /analyze-photo         │
          │ async, NO abort,         │        │ /api/recommend  — src/lib/api.ts │
          │ NO cache, DEMO_KEY only  │        │ async, AbortController + timeout │
          └──────────┬───────────────┘        └───────────────┬──────────────────┘
                     │ async                                  │ async
                     └────────────► food-search.tsx           └──► chat.tsx / goals.tsx
```

Edge legend: **sync** = same-tick, blocks the render; **async** = crosses the bridge or the network. Every async edge out of the store is *unawaited* and *unbatched* today — that is the root of most of the performance section below.

---

## Components

| Component | Responsibility | State | Failure mode when it dies |
|---|---|---|---|
| `createAppState` (`src/core/store/appState.ts`) — **GENERATED** | Every domain mutation: diary, weight log, workout log, templates, goals, streak, onboarding, coach. Deduping by date (`addWeightEntry:321`), single-active-session invariant (`startWorkout:488`). | Stateful, in-memory | Cannot die independently; it *is* the app. Its bugs (UTC `updateStreak:389`, `currentWeightKg` taken from the entry just passed rather than the newest — `:325-328`) surface as silently wrong numbers everywhere downstream. |
| `useStore` persist wrapper (`src/store/useStore.ts:24`) | AsyncStorage adapter + hydration flag (`useStoreHydrated:49`). | Stateful | Rehydrate failure is *handled*: `onRehydrateStorage:30` fires on success **and** failure, so the splash always releases — the user just starts from defaults. Write failure is **not** handled: `setItem` rejection is swallowed, so a full 6 MB quota silently stops persisting until the next cold start reveals the loss. |
| `AuthProvider` (`src/lib/AuthProvider.tsx`) | Session lifecycle, cloud load (`loadUserData:61`), debounced cloud save (`:137`), background flush (`:149`). | Stateful (5 `useState`, 3 `useRef`) | If `loadUserData` times out it `return`s silently (`:67`) — indistinguishable from "no row". The store then holds defaults, `onboardedAt` is null, the user is routed to onboarding, and the debounced save overwrites their real server row 1.5 s later. This is the single most destructive failure in the system. |
| `RootNavigator` / `RootLayout` (`app/_layout.tsx`) | Splash gate, font/store gate, auth routing effect (`:45-58`). | Stateless w.r.t. data | `AuthProvider` is mounted *inside* the `if (!ready) return null` gate (`:110`, `:115`), so auth work is strictly serial after rehydration. Splash is released at `ready` (`:103,:107`) which excludes `loading`/`hydrating` — the blank-canvas window. |
| `useTheme` (`src/theme/useTheme.ts:13`) | Resolve `darkMode` → a module-constant `Theme`. | Stateless value, **stateful subscription** | Every `Text`, `Surface`, `Button`, `Pill` calls it, so each is an independent store subscriber. With 78 mounted history cards that is ~800 selector invocations per store write. It cannot "die", but it converts every unrelated mutation into a whole-tree subscription sweep. |
| `useHealthSync` (`src/hooks/useHealthSync.ts`) | Availability probe (`:62`), permission grant, step reads, weight import **with a date dedupe** (`:93-94`). | Stateful (6 `useState`) | Best-effort by design — unavailable device / missing app / refused permission all resolve to "no data". Its silent failure is that a *partial* grant reads as full success, so `importWeightHistory` reports "nothing new" when the weight permission was actually denied. |
| `src/lib/health/*` (duplicate client) | Second, independent Health Connect path used only by Progress. Imports the TurboModule at module scope (`health-connect.client.ts:2`) and stamps UTC dates (`health.sync.ts:22`). | Stateless functions | Kills the entire Progress tab at module evaluation on iOS and in Expo Go. On Android it silently overwrites hand-entered weigh-ins (no dedupe) and rewinds `currentWeightKg` to the oldest record. **This component should not exist.** |
| `src/lib/api.ts` | Typed, timeout-capped, field-validated client for the three AI endpoints. | Stateless | Correct by construction: every call has an `AbortController` + timeout (`postJson:262-300`) and every reply is validated (`parseAnalyzedFood:312`, `parseRecommendation:386`). Failure = a user-safe `Error` message. This is the reference standard the USDA path should be held to. |
| `src/core/utils/usdaApi.ts` — **GENERATED** | Food search against api.nal.usda.gov. | Stateless | No `signal`, no timeout, no cache, and the key is read via `import.meta.env` which Hermes cannot evaluate — so it is permanently pinned to the shared `DEMO_KEY`. A hung request spins forever with no error card. |

---

## Data flow

### A. Log a food (happy path, from the Dashboard)
1. User taps a meal row on `app/(tabs)/index.tsx:429`. *(Today this navigates to `/diary` and drops the meal + date; the target is a direct push to `/food-search` with `{ meal, date }`.)*
2. `food-search.tsx` renders; local matches against the 106-row `FOOD_DATABASE` are computed **from the debounced query**, so even the in-memory list waits 350 ms.
3. After 350 ms of quiet, `searchUSDA(debounced, 12)` fires (`food-search.tsx:286`). No `AbortController`, so earlier requests continue downloading and parsing.
4. User taps a row → `openServingStep(food)` → the amount step renders with a serving default of 100 g for USDA foods.
5. User taps **Add to Breakfast** → `addFoodEntry(date, { foodId, food, servings, mealType })` (`appState.ts:241`).
6. Inside one `set()`: the day is created if absent, a `FoodEntry` is pushed (**the whole 21-field `Food` is denormalized into the entry** — 421-504 bytes), and `recentFoodIds` is rotated to 20.
7. **sync** — every `useStore` selector re-runs; every `useTheme` consumer re-renders.
8. **async** — persist middleware `JSON.stringify`s the *entire* store and `setItem`s it.
9. **async** — `AuthProvider`'s `useStore.subscribe` (`:138`) resets a 1,500 ms timer; on expiry `collect()` copies all 20 `SYNC_FIELDS` and upserts the whole blob.
10. Caller separately calls `updateStreak()` — a *second* full write cycle (steps 7-9 again). `applyMealTemplate` does not call it at all.

### B. Log a set
1. Workout tab renders. `workout.tsx` subscribes to `workoutLog`; `priorRecords` (`:675`) memoizes on `[workoutLog, session.id]` and `suggestions` (`:709`) on `[exercises, workoutLog]`.
2. User taps the weight cell. Nothing scrolls; the keypad covers the row and the Done tick.
3. Each character fires `handleWeight` (`:214-218`) → `onChange({ weightKg })` → `updateSet` (`appState.ts:537`) → immer produces a **new `workoutLog` array identity**.
4. Per character: whole screen re-renders → every mounted `HistoryCard` re-renders and recomputes `sessionVolume`/`sessionSetCount`/`Intl` date → `priorRecords` invalidates and `getPersonalRecords` walks the whole log → `suggestions` invalidates and runs `suggestNextSet` once per distinct lift → persist `JSON.stringify`s the whole store → AuthProvider resets its timer.
5. User taps the green tick → `handleComplete` (`:231`) → `Haptics.impactAsync` + `onChange({ completed: true })`. **If the weight cell was left blank, `weightKg` is 0** — the row turns green and the lifted number is gone.

### C. Open the app cold
```
1  module scope: SplashScreen.preventAutoHideAsync()          _layout.tsx:25
2  useFonts(5 faces)            ─┐ these two run in parallel
3  useStoreHydrated()           ─┘  AsyncStorage.getItem + JSON.parse of the whole blob
4  ready = (fonts||fontError) && hydrated                     _layout.tsx:100
5  SplashScreen.hideAsync()                                   _layout.tsx:103,107  <-- splash gone
6  ONLY NOW does <AuthProvider> mount                         _layout.tsx:115
7    supabase.auth.getSession()          (AsyncStorage read)
8    loadUserData(userId)                (network, raced against an 8,000 ms timer)
9  RootNavigator effect returns early while loading||hydrating _layout.tsx:48
10 app/index.tsx renders null                                        <-- BLANK CANVAS, up to 8 s
11 loading -> false; hydrateStore has (maybe) run; router.replace('/(tabs)')
```
Steps 6-8 have **no dependency** on steps 2-4 but are gated behind them by component nesting. The splash is released at exactly the wrong moment — one step before the longest wait.

---

## Hot paths & bottlenecks (capacity math shown)

### 1. Persisted blob size — the master variable
Everything else scales off this number.

```
diary, 12 months:
  8 entries/day (GUESS) x 365 = 2,920 entries
  70% USDA @ 504 B + 30% preset @ 421 B  ->  mean 479 B
  2,920 x 479                                    = 1,398,680 B  ~ 1.37 MB
  + DiaryDay wrappers 365 x 68                   =    24,820 B
workoutLog, 12 months:
  3 sessions/week (GUESS) x 52 = 156 sessions x 3,462 B  =   540,072 B  ~ 0.54 MB
weightLog:  365 x 90                             =    32,850 B
customFoods / templates / recents / profile      ~     20,000 B
-----------------------------------------------------------------
Subtotal, no photos, 12 months                   ~ 2,016,000 B  ~ 1.97 MB
6 months                                         ~ 0.99 MB
24 months                                        ~ 3.94 MB
progressPhotos: 20 x ~200 KB base64              ~ 4,000,000 B  ~ 4.0 MB
-----------------------------------------------------------------
Worst realistic case (12 mo + synced web photos) ~ 6.0 MB   <-- AT the Android cap
```
`progressPhotos` is a `ProgressPhoto[]` whose `dataUrl` is a base64 JPEG (`src/core/types:189`), it is in `SYNC_FIELDS` (`AuthProvider.tsx:44`), and there is **no mobile screen that renders it**. It is pure ballast that can single-handedly cross the 6 MB AsyncStorage ceiling, after which `setItem` fails silently and the next cold start rehydrates the last blob that fit.

### 2. Local write amplification — per keystroke
`src/store/useStore.ts:25` has no `partialize` and no write coalescing, so the persist middleware serializes the whole store on **every** `set()`.

```
Typing "102.5" into a weight cell = 5 x handleWeight -> 5 x updateSet -> 5 x full serialize.

  at 6 months  : 5 x 0.99 MB =  4.95 MB stringified + 5 AsyncStorage writes
  at 12 months : 5 x 1.97 MB =  9.85 MB stringified + 5 AsyncStorage writes
  at 24 months : 5 x 3.94 MB = 19.70 MB stringified + 5 AsyncStorage writes

At a GUESSED 50-100 MB/s Hermes stringify throughput, 12 months is
  1.97 MB / 75 MB/s ~ 26 ms of blocked JS *per character*, before the
  AsyncStorage/SQLite bridge write and before any React work.
```
The only true per-keystroke writers are `workout.tsx:216` (weight), `:222` (reps), `:228` (RPE) and `:658` (session rename). `diary.tsx` already commits on blur (`commitDraft`). Moving those four to `onEndEditing`/`onBlur` removes the hot path entirely, independent of the `partialize` fix.

### 3. Render fan-out — per keystroke, Workout tab, 6 months (78 sessions, ~1,560 sets)
```
per character typed:
  full-store re-render (workoutLog identity changed)
    78 HistoryCard renders
      x sessionVolume + sessionSetCount walks   ~ 1,560 set visits
      x Intl.DateTimeFormat construction        =    78 formatter resolutions
  priorRecords invalidated (dep = workoutLog)
      getPersonalRecords over 77 sessions       ~ 1,540 set visits
  suggestions invalidated (dep = workoutLog)
      6 x suggestNextSet, each filter+sort 78   ~   468 session scans
  useTheme subscribers swept                    ~   800 selector calls
-------------------------------------------------------------------
  ~3,100 set visits + 78 Intl resolutions + 800 selectors + a 1 MB stringify
```
At 24 months (~312 sessions) every one of those terms quadruples. The screen degrades **permanently as the user succeeds at using the app** — the exact opposite of the desired curve.

### 4. Health Connect import — the worst single burst
`app/(tabs)/progress.tsx:672-681` loops `addWeightEntry` once per imported weigh-in, with `daysBack: 365` (`health.sync.ts:7`).
```
365 weigh-ins x 1 set() each x full serialize
  at 6 months : 365 x 0.99 MB = 361 MB stringified, 365 AsyncStorage writes
  at 12 months: 365 x 1.97 MB = 719 MB stringified, 365 AsyncStorage writes
Each addWeightEntry also does a filter + full sort of weightLog:
  sum over n=1..365 of O(n log n) ~ 365 x 8.5 x 183 ~ 570,000 comparisons
```
Seconds of frozen JS thread, ANR-eligible. `useHealthSync.ts:95` has the same loop shape (guarded by a dedupe, so usually far fewer entries — but unbounded on first import).

### 5. Cloud write amplification
`AuthProvider.tsx:137-144` resets a 1,500 ms timer on *every* store change, with no throttle ceiling and no dirty check.
```
A 45-minute workout: type, pause to lift (>1.5 s), type again.
  ~20 working sets x ~3 edit bursts each = ~60 pauses > 1.5 s
  60 uploads x ~1 MB (SYNC_FIELDS at 6 months) = ~60 MB over the cellular radio
  each upload also re-stringifies a blob the persist layer just stringified
```
`collect()` (`:93-98`) always copies all 20 keys; there is no delta, no hash comparison, and no minimum interval.

### 6. Chart and list sizes (bounded — **not** bottlenecks)
`getLast7Days`/`getLast30Days` cap every chart at 7 or 30 points; the stacked macro chart is at most 30 × 3 = 90 rects. Food search renders at most 106 preset + 12 USDA rows. Lift picker ranks 86 rows. These are all fine; the unbounded lists are `workoutLog` (`workout.tsx:1291` `history.map` inside a `ScrollView`) and `diary` entries (`diary.tsx:498` `.map` inside a `ScrollView`).

### 7. Cold start
```
step 3  AsyncStorage.getItem + JSON.parse
          1.97 MB at 12 months; Hermes parse ~ 40-120 ms + SQLite read
step 5  splash released here
steps 6-8 START ONLY NOW: getSession (AsyncStorage) + loadUserData
          network fetch raced against setTimeout(8000)   AuthProvider.tsx:65
step 10 app/index.tsx returns null for that whole window
-----------------------------------------------------------------
Blank-canvas duration = getSession + min(fetch, 8000 ms)
Worst case on hotel wifi: ~8.2 s of stone-coloured nothing.
```

---

## Failure scenarios

**1. Offline while logging.**
*What happens today:* Works. `addFoodEntry`/`addSet` are local; persist writes to AsyncStorage; the AuthProvider upsert fails and `syncStatus` flips to `'error'`. **But** `profile.tsx:303` tells the user "Sync failed — will retry" and **nothing ever retries** — there is no backoff, no connectivity listener, and no manual retry control. The write is lost to the server permanently.
*Mitigation:* Implement the promise, or correct the copy. Add a `NetInfo` listener that calls `flushSave()` on regaining connectivity, plus retry-with-backoff on `saveUserData` failure and a manual "Retry now" button. Until then the copy must say what actually happens.

**2. Supabase refresh token expires mid-session.**
*What happens today:* `supabase.ts:40-47` only runs the refresh timer in the foreground, so a phone in a pocket returns with a dead token. `onAuthStateChange` fires `SIGNED_OUT`, `user` → null, and `app/_layout.tsx:49-51` hard-replaces to `/login` mid-task. No explanation, no return path, and the last ≤1.5 s of edits never leave the device. On re-login `loadUserData` overwrites local state with the older server snapshot.
*Mitigation:* Track a `signingOutRef` set only by the user-initiated `signOut`. When `SIGNED_OUT` arrives without it, flush the pending save with the still-valid `userRef` **first**, then route to login with a `reason=session_expired` param so the screen can say "Your session expired — nothing was lost."

**3. Cloud load times out on a fresh install (the data-loss scenario).**
*What happens today:* `loadUserData:63-67` races the query against `setTimeout(8000)`. On timeout `result` is `null` and the function `return`s — **indistinguishable from a genuine no-row result**. `loading` flips false, `onboardedAt` is null locally, the gate routes to onboarding, the user completes 5 steps, and 1,500 ms later the debounced save upserts fresh defaults over months of real data.
*Mitigation:* Replace the silent `return` with a tri-state `hydrationOutcome: 'ok' | 'empty' | 'failed'`. Distinguish a genuine empty row (PostgREST `PGRST116`) from a network/timeout failure. On `'failed'`: set `syncStatus: 'error'`, **hard-block every save for the session**, and render a blocking retry banner instead of routing on a store that never loaded. Invariant to enforce: *no save may ever fire for a user whose load did not complete.*

**4. Two accounts on one device (no reset on sign-out).**
*What happens today:* `signOut` (`AuthProvider.tsx:201`) calls `flushSave()` **without awaiting it**, then `supabase.auth.signOut()`. Nothing clears the store and nothing clears AsyncStorage. User B signs in, sees A's `onboardedAt` so skips onboarding entirely, and lands on A's diary, A's weigh-ins, A's name. The debounced save then writes A's data into **B's** `user_data` row.
*Mitigation:* `await flushSave()` (make it return the promise), then `useStore.persist.clearStorage()` and a `resetStore()` action that reassigns every `SYNC_FIELDS` key to its default (upstream change — `appState.ts` is generated). Do the same in `onAuthStateChange` on `SIGNED_OUT`, **and** when a `SIGNED_IN` user id differs from the previously stored one (covers a crash between sign-out and sign-in).

**5. App killed mid-workout.**
*What happens today:* Mostly survives — `activeWorkoutId` and `workoutLog` are persisted, and `AppState 'change'` flushes to the cloud on background (`AuthProvider.tsx:149-154`). The residual failure is that the *last keystroke* may be in flight, and — because `activeWorkoutId` is also in `SYNC_FIELDS` — a session left open is restored as "Live" days later, with every subsequent set filed under the original `session.date` (`workout.tsx:1126`).
*Mitigation:* Keep `activeWorkoutId` out of the persisted/synced set (or scope it per-device), and add a stale-session banner when `activeSession.date !== getTodayString()` offering Finish / Start new.

**6. AsyncStorage quota exhausted (Android, 6 MB).**
*What happens today:* Silent. `createJSONStorage` `setItem` rejections are swallowed. The app looks healthy until the next cold start rehydrates the last blob that fit — everything logged since is gone, with no error surface anywhere.
*Mitigation:* Three independent levers. (a) `partialize` out `progressPhotos` (~4 MB), which alone caps the realistic size under 1 MB. (b) Raise the ceiling: `AsyncStorage_db_size_in_MB=20` in `android/gradle.properties`. (c) Wrap the storage object so `setItem` catches, surfaces a persistent error state, and reports it on the Profile sync row — a write failure must never be invisible.

**7. USDA rate limit.**
*What happens today:* `src/lib/env.ts:107` exports `USDA_API_KEY` and CI injects it, but `usdaApi.ts` reads `import.meta.env` — unevaluable on Hermes — so every install shares `DEMO_KEY` (30 req/min, 1,000 req/day **per IP**). Behind carrier NAT the budget is spent by strangers. The 429 renders as "check your connection", and "Try again" retries straight into the same limit. Compounding it, the effect at `food-search.tsx:275` has no `AbortController`, so a 14-character query fires several overlapping requests that all download and parse.
*Mitigation:* Add `src/lib/usda.ts` owning the fetch, passing `USDA_API_KEY` from `env.ts` (upstream change: `usdaApi.ts` must accept the key as an argument). Thread an `AbortSignal` + timeout. Add an LRU `Map<string, Food[]>` keyed by the debounced query. Branch the error card on status: 429/403 → rate-limit copy, network failure → connection copy.

**8. Two devices editing the same account.**
*What happens today:* Undefined. `hydrateStore` (`appState.ts:603`) unconditionally overwrites 20 local keys with the server payload, and `saveUserData` unconditionally upserts the whole blob. Last writer wins at *whole-document* granularity — phone edits made while the web app was open are erased wholesale on the next web save, and vice versa.
*Mitigation:* This is the biggest un-designed area. Minimum viable step: add an `updatedAt` to the row and refuse to hydrate a payload older than the local `persist` timestamp without asking. Real fix is per-collection merge (diary keyed by date, workoutLog/weightLog keyed by id) — a shared-core design task, not a mobile one.

---

## Trade-offs taken (what we choose to be bad at, deliberately)

1. **Whole-document sync, not per-record.** The `user_data.data` JSONB blob is one row. This is why the mobile client is ~200 lines of sync code instead of a replication engine. **Cost:** no conflict resolution, no partial recovery, and upload cost scales with total history rather than with the change. We accept this and cap the damage with a throttle + dirty check, not with CRDTs.
2. **Denormalized `Food` inside every `FoodEntry`.** 421-504 bytes per entry instead of ~80. **Benefit:** a diary entry is self-describing forever, even after a USDA row changes or a custom food is deleted — no dangling references, no join at render time. **Cost:** the diary is ~5× larger than it needs to be, and it is the dominant growth term. We keep the denormalization and pay for it with a retention window.
3. **Local-first with no queue.** Writes go to AsyncStorage immediately and to the cloud opportunistically. There is no outbox, no operation log, no replay. **Cost:** an upload that fails while the app is being killed is simply lost. We accept a bounded loss window (≤ the throttle interval) rather than build durable queueing.
4. **Store rehydration is never blocked on the network.** `onRehydrateStorage` releases the gate on failure as well as success (`useStore.ts:28-30`). A corrupt blob costs the user their local data but never a frozen app. **Cost:** it can present defaults as if they were real data — which is precisely why failure scenario 3 must gate *saves*, not *rendering*.
5. **`src/core` is generated and read-only here.** Every formula stays identical to web. **Cost:** ~14 of the correctness fixes in this audit cannot be made on mobile at all and must round-trip through the web repo. We accept the latency rather than fork the domain logic.
6. **A single persisted `darkMode` flag drives theming, deliberately ignoring `useColorScheme()`.** Cross-platform consistency wins over OS integration. **Cost:** the theme is a store subscription, which is what makes `useTheme` a per-render tax on ~800 components. We keep the semantics and fix the *plumbing* by moving the resolved theme into a React context.
7. **Chart windows are hard-capped at 7/30 days.** No pinch-zoom, no all-time view. **Benefit:** every chart has a provably bounded point count, so charts are permanently off the performance risk register. **Cost:** the Weight tab tells a user with 200 weigh-ins they have none, because the 7-day window is empty.
8. **Health Connect is best-effort and Android-only.** Unavailable / not installed / refused all collapse to "no data". **Cost:** a partial permission grant is indistinguishable from success. We fix the *reporting* (per-capability state) without adding a permission state machine.

---

## Open questions (need a real measurement before locking)

1. **Hermes `JSON.stringify` / `JSON.parse` throughput on the target low-end Android device**, for a ~2 MB nested object graph. Every number in budgets 3-6 is derived from a GUESSED 50-100 MB/s. Measure with `performance.now()` around one persist write at three blob sizes (200 KB / 1 MB / 4 MB).
2. **Actual entries/day and sessions/week distribution**, not the p50 guess. The retention-window decision (400 days? 180?) is unanswerable without the p95 user.
3. **Is `AsyncStorage.setItem` genuinely blocking the JS thread**, or does the bridge hop absorb it on New Architecture? If the serialize is the whole cost and the write is free, coalescing matters less than `partialize`. Instrument before choosing.
4. **Does `expo-blur`'s `dimezisBlurView` actually cost a frame on the dashboard's five simultaneous surfaces?** The design doc permits all five. Measure with the Perf Monitor on a mid-tier Android before changing anything structural — the fix may be an intensity tweak, not a removal.
5. **What is the real USDA hit rate and query-repeat rate?** It determines whether the LRU cache is worth anything and whether a per-install key even clears the 1,000/day budget.
6. **Two-device conflict frequency.** If ~0% of users run web + mobile concurrently, last-writer-wins is fine forever and scenario 8 closes. If it is material, the shared core needs a merge strategy and that is a much larger project.
7. **How much of the 6 MB Android ceiling is actually reachable** — is it a hard SQLite cursor limit or a soft default? Confirm by writing a 7 MB blob on a real device before relying on the `gradle.properties` override.
8. **Cold-start p95 in the field**, split into font load / rehydrate / getSession / loadUserData. Without that split we are guessing which of the four to parallelize first.
