# ADR-001: Where the primary "log" action lives

## Status

PROPOSED

## Context

The app has exactly one always-visible action affordance: the floating button mounted once in `app/(tabs)/_layout.tsx:140-187` (`AssistantButton`). It pushes `/chat`. Chat additionally has four other entry points — the header `IconButton` at `app/(tabs)/index.tsx:123-130`, the full "AI Nutrition Assistant" promo `Surface` at `index.tsx:134-151` (rendered *second on the dashboard*, above `MacroCard`), `app/(tabs)/diary.tsx:690-692` and `app/(tabs)/workout.tsx:1145-1147`. So the occasional feature has five entry points and the daily one has none.

The two actions the user actually repeats have no global affordance at all:

- Log a food, 3-6× per day. From a cold open on the Dashboard: tap Breakfast row → `<Link href="/diary">` at `index.tsx:429` (1) → land at the top of the Diary on `DateNavigator` + `DayTotals`, scroll past Breakfast/Lunch/Dinner cards → "Add food" `Button` at `diary.tsx:559-564` (2) → tap the search field, which has no `autoFocus` (3) → tap a result row (4) → "Add to Breakfast" (5). **5 taps, one scroll, plus typing.**
- Log a set, 15-30× per session. Workout tab (1) → "Start workout" `workout.tsx:1181` (2) → "Add exercise" (3) → tap a lift, `lift-picker.tsx:185-191` closes the modal (4) → "Add set" `workout.tsx:601` (5) → type weight+reps → tick Done (6). **6 taps.**

The design rules restrict glass to a single FAB, so "add a second FAB" is not available. `useSegments()` is already imported and used in `app/_layout.tsx:31`, so a context read costs nothing new.

**Reversibility cost.** Option A is ~40 lines inside one file (`_layout.tsx`) plus a one-line change at `index.tsx:429`; reverting is under two hours. Option C changes the tab count and every screen's bottom padding assumption (`TAB_BAR_SPACE` in `src/components/Layout.tsx:20`, the FAB offset at `_layout.tsx:157`) and is a 2-3 day job to land and the same again to unwind.

## Options considered

### Option A — Context-sensitive FAB: the FAB's verb changes per tab

One-line description: the single glass FAB pushes `/food-search` from Dashboard/Diary/Progress, `/lift-picker` from Workout when `activeWorkoutId !== null`, and hides on Profile.

Pros:
- Cuts logging breakfast from 5 taps to 3 (`/food-search` opens with `{ meal: inferredFromClock, date: getTodayString() }` pre-set, so the meal chip and the date are already correct).
- Cuts "add the next exercise" from 3 taps (scroll to bottom → Add exercise → lift) to 2, and removes the scroll to the bottom of a growing set grid.
- Costs one `useSegments()` read and ~40 lines in one file; no route, no tab, no layout constant changes.
- Keeps exactly one glass floating surface, which is what `docs/MOBILE-DESIGN.md` permits.
- The primary verb genuinely *is* different per tab in this product — the FAB stops being a generic button and becomes the answer to "what do I do on this screen".

Cons:
- A control that changes destination by context is less learnable than a fixed one; the icon has to change with it (Plus/Dumbbell), which costs an icon swap animation.
- Profile has no primary verb, so the FAB must disappear there — an appearing/disappearing control reads as a glitch unless it fades.
- Does not fix the underlying content problem that Dashboard and Diary both claim today's nutrition (`index.tsx:132` vs `diary.tsx:698`).
- Screen-reader users get a control whose `accessibilityLabel` changes between tabs, so heading-to-heading navigation no longer names a stable target.

Estimated dev cost: **0.5-1 day** (~40 lines in `_layout.tsx`, one line at `index.tsx:429`, one `autoFocus` in `food-search.tsx:463`).

Concrete failure mode: the user is on the Workout tab with no active session, taps the FAB expecting "log something", and nothing happens because `activeWorkoutId` is null — a dead control in the most prominent position on screen. Mitigation: when there is no session, the FAB starts one (`startWorkout(defaultWorkoutName(), getTodayString())`, already wired at `workout.tsx:1136-1138`).

### Option B — No FAB; a per-screen primary action in the header `right` slot

One-line description: delete the FAB entirely and put each screen's primary action in the `Screen` component's existing `right` slot (`src/components/Layout.tsx:86`).

Pros:
- One fixed position, one meaning per screen, fully learnable; `accessibilityLabel` is stable per route.
- Frees the bottom-right corner, which today covers the last content row of every scrollable screen — the "Cancel workout" `Button` at `workout.tsx:860-865` and the "Sign out" `Button` at `profile.tsx:756-761` both sit under an opaque jade circle.
- Removes one blur surface from every screen, which on Android means one fewer `dimezisBlurView` pass per frame.
- The slot already exists and is already used on four screens, so there is no new component.

Cons:
- The header is at the top of a one-handed phone; the highest-frequency action in the app moves out of thumb reach. On a 6.7" device the header is ~600pt from the thumb rest.
- The `right` slot is already occupied by the chat `IconButton` on three screens, so this forces ADR-004 to be resolved first.
- Does not reduce tap counts at all — it relocates the same taps.
- The header scrolls under glass on some screens, so it is not always visible; on Workout, where the set grid is long, the primary action would be off-screen exactly when in use.

Estimated dev cost: **0.5 day** (delete `AssistantButton`, add `right` props on 5 screens).

Concrete failure mode: mid-workout with a keyboard up and the set grid scrolled to the bottom, the header is off-screen; the user cannot reach "Add exercise" without dismissing the keyboard and scrolling to the top of the page, which loses their place in the grid.

### Option C — A dedicated "Log" tab slot

One-line description: replace one of the five tabs (or add a centre slot) with a Log destination that fans out to food / weight / workout.

Pros:
- Fixed position, thumb-reachable, and unambiguous — the single most discoverable placement available.
- Makes the tab bar's slot allocation match action frequency instead of screen count.
- Naturally solves the Dashboard/Diary overlap by giving "log" its own home and letting Dashboard be pure status.
- No context-sensitivity, so the a11y label is stable.

Cons:
- The bar is full at five. Adding a sixth breaks the 5-slot rule; replacing one means deleting Diary or Progress, both of which have unique content (the Diary owns per-meal detail and `SavedMeals` at `diary.tsx:571-662`; Progress owns all four charts).
- A Log tab that then asks "food or workout?" *adds* a tap to the highest-frequency path in order to serve the lowest — logging breakfast becomes Log (1) → Food (2) → meal (3) → search (4) → food (5) → confirm (6), i.e. worse than today.
- Touches `TAB_BAR_SPACE` (`Layout.tsx:20`), the FAB geometry (`_layout.tsx:157`) and every screen's bottom padding.
- A tab is a *place*; "log" is a *verb*. Modelling a verb as a destination means the user lands somewhere and has to navigate back out after every log.

Estimated dev cost: **2-3 days** plus regression on all five screens' safe-area padding.

Concrete failure mode: the user taps Log to add a snack, picks Food, logs it, and is left standing on the Log tab rather than back where they were — so every log now ends with a navigation the user has to perform themselves.

## Decision

Repoint the single glass FAB in `app/(tabs)/_layout.tsx` at the current tab's primary logging verb (food on Dashboard/Diary/Progress, lift-picker or start-workout on Workout, hidden on Profile), and deep-link the Dashboard meal rows at `index.tsx:429` straight into `/food-search`.

## Why

- Logging food is a 3-6×/day action currently costing 5 taps and a scroll (Context); Option A takes it to 3 taps for ~40 lines in one file, the only option that reduces the count rather than relocating it.
- The design rules permit exactly one glass floating surface (Context), which rules out running a log FAB and a chat FAB side by side and makes "whose button is it" a real decision rather than a preference.
- Reversibility is measured in hours for Option A versus days for Option C (Context), and this app has five P0 data-correctness defects competing for the same engineering week — the cheap structural fix that unblocks the daily path is the right first move.

## Consequences

We accept that one control means two different things on two different tabs, and that its `accessibilityLabel` and icon must change with it; the label must always name the destination ("Add food to Breakfast", "Add an exercise") rather than a generic "Add".

We accept that the FAB must be hidden on Profile, and that `Screen`'s bottom padding at `src/components/Layout.tsx:103` must gain a `FAB_SPACE` allowance so the last row of every list stops sitting under it.

This forecloses a dedicated Log tab in the near term: once the FAB is the log affordance, moving it into the bar later means re-teaching the gesture and re-doing the padding work.

**Revisit if** a) the tab set changes for any other reason (the padding work is then already paid for), or b) instrumentation shows FAB taps on the Workout tab are more often mis-taps than intentional (i.e. the context switch is not being learned), or c) a third logging verb appears (e.g. cardio) and the per-tab mapping stops being one-to-one.
