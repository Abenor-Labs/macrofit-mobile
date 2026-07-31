# ADR-002: Whether Goals stays a separate route

## Status

PROPOSED

## Context

`app/goals.tsx` is a ~900-line pushed route registered at `app/_layout.tsx:81`. It owns the AI coach plan (the product's differentiator), the predicted-vs-measured burn card, the manual calorie field, the Cut/Maintain/Bulk presets and all four macro-gram fields. It is the **only** place calories and macros can be edited.

It has exactly one entry point: the `CoachCard` `<Link href="/goals">` at `app/(tabs)/index.tsx:350` — an unlabelled chevron on a card most users will read as a status readout.

Meanwhile `app/(tabs)/profile.tsx:411-435` renders a section literally titled **"Targets"** containing one field: goal weight. A user hunting for their calorie target opens the screen named Targets, finds a weight box, and leaves. Onboarding closes by telling them the opposite — `app/onboarding.tsx:670` states every number is editable under Profile, which is false.

So "targets" is split across two screens that do not link to each other, and the half that is on Profile is silently rewritten by the other half's inputs: `recalculateGoals()` fires from `profile.tsx:249` (blur of Name/Age/Height), `:477` (goal), `:490` (activity) and `:504` (gender), discarding an accepted coach plan with no prompt.

Also missing entirely: the goal-weight *pace* (`profile.targetRateKgPerWeek`) is set once during onboarding via `signedRate` and has **no editor anywhere in the app**, yet every ETA on the weight card is projected from it.

**Reversibility cost.** Adding an entry point is one line (hours). Merging goals.tsx into another screen is a 900-line relocation plus rewiring `useCoach`, `explainTdee` and the alert rows — 1-2 weeks including regression. Splitting it back out afterwards is the same again.

## Options considered

### Option A — Keep `/goals` as a pushed route; add a second entry from Profile and move the weight goal + pace into it

One-line description: `/goals` becomes the single owner of every numeric target; `profile.tsx:411-435` collapses to a navigation row.

Pros:
- Two entry points, each correct for its context: the Dashboard `CoachCard` is the *contextual* door (it shows the live plan), Profile > Targets is the *settings-hunting* door. Both cost one line each.
- Makes the onboarding promise at `onboarding.tsx:670` true instead of requiring a copy fix that admits the feature is buried.
- Gives the pace selector (`targetRateKgPerWeek`) a home; it currently has none, and every ETA on `src/components/WeightTarget.tsx` is projected from a number the user can never change.
- Kills the two-owners problem: one screen writes `goals`, so `recalculateGoals()` can be removed from Profile's commit handlers without leaving anything unreachable.
- Zero relocation of the 900 lines; the change is one `Section` body swapped for a `Pressable` row and one new "Weight goal" section inside goals.tsx.

Cons:
- Keeps a fourth non-tab route in the stack, so "where do I edit X" still has a route-level answer rather than a tab-level one.
- Two entry points to one screen means two `accessibilityLabel`s to keep consistent.
- The coach is still one tap deep from the Dashboard and invisible from Progress, where a user looking at a week of intake above the goal line most wants it.
- Does not reduce the total screen count.

Estimated dev cost: **1-1.5 days** — ~25 lines removed from `profile.tsx:411-435`, ~60 lines of Weight goal + pace section added to `goals.tsx`, `recalculateGoals()` calls removed from four sites.

Concrete failure mode: a user who never scrolls the Dashboard past the hero and never expands Profile's Targets accordion still never finds the coach — two doors, both of which can be missed.

### Option B — Merge goals.tsx into the Profile tab as a `<Section>`

One-line description: goals becomes the ninth disclosure section of `profile.tsx`.

Pros:
- One canonical location for "my settings and my numbers"; no pushed route to discover.
- Removes a route from `app/_layout.tsx` and one back-navigation affordance (`goals.tsx:429` currently puts its back arrow on the *right*, which is the wrong side).
- Profile is a tab, so the coach becomes reachable in one tap from anywhere instead of two.

Cons:
- Buries a screen with its own glass hero, `ActivityIndicator` loading state, alert rows and a two-column `FigureCell` grid under a collapsed triangle in a nine-section accordion — measurably *worse* discoverability than today's Dashboard card.
- Profile is already 766 lines and the longest screen in the app; adding ~900 more makes the per-keystroke re-render cost (all collapsed sections rebuild their rows on every render, `profile.tsx:546-711`) substantially worse.
- The coach plan is content the user *reads*, not a setting they *toggle* — accordion is the wrong container for a hero.
- Loses the ability to deep-link (`/goals` from a coach alert, a notification, or the Progress goal line).

Estimated dev cost: **1-2 weeks** including the re-render regression.

Concrete failure mode: the accepted coach plan — the thing the product is sold on — renders below the fold inside a closed accordion under "Meal templates", and a new user never sees it at all.

### Option C — Merge goals into the Progress tab as a fifth segment

One-line description: add a "Plan" segment to `progress.tsx`'s existing `Segmented` control alongside Calories/Macros/Weight/Training.

Pros:
- Puts the plan next to the evidence for it — the calorie chart at `progress.tsx:800-822` already draws the goal line the plan sets.
- Solves the finding that Progress shows the goal and the goal line but offers no way to reach the Goals screen (`progress.tsx:835`).
- Progress is a tab, so one tap from anywhere.
- The segmented control already exists; no new navigation primitive.

Cons:
- `progress.tsx` is already 1,268 lines with four chart primitives inlined; adding a 900-line editing surface makes it the largest file in the app by a wide margin.
- Mixes *review* (read-only charts) with *editing* (four macro fields, three presets, an Accept button) behind one segmented control, which is exactly the settings-inside-a-chart-screen problem the Google Fit card already causes at `progress.tsx:1073`.
- The segment state is local (`progress.tsx:621`) and resets to Calories/7d on every tab exit, so the plan would be un-linkable and un-returnable-to.
- Editing targets under a control labelled "Metric" is a category error.

Estimated dev cost: **1 week**.

Concrete failure mode: a user adjusts their protein target, switches to the Weight segment to check a number, comes back and the segmented control has reset to Calories — their edit state and scroll position are gone.

### Option D — Promote Goals/Coach to a sixth tab

One-line description: add a Coach tab to `app/(tabs)/_layout.tsx`.

Pros:
- Maximum discoverability; the differentiating feature gets a permanent slot.
- One tap from anywhere, deep-linkable, keeps its own scroll and state.
- No relocation of the 900 lines.

Cons:
- Breaks the 5-slot bar; six 10px labels in `textMuted` on glass (`_layout.tsx:117-123`) are already the lowest-contrast text in the app, and a sixth makes each ~15% narrower.
- Coach is a weekly-to-monthly action (accept a plan, adjust a target). Giving it the same slot weight as Diary, which is used 3-6× a day, inverts the frequency ranking again — the exact complaint being fixed.
- Takes a slot at the moment the app is trying to *free* slot capacity for training presence.

Estimated dev cost: **1 day** to add, but permanent cost to the bar.

Concrete failure mode: the tab bar becomes unreadable at 6 slots on a 320pt screen and users navigate by icon shape alone, which is precisely the failure the current 10px `textMuted` labels already flirt with.

## Decision

Keep `/goals` as a pushed route, make it the single owner of every numeric target (calories, macros, sugar/sodium/water, goal weight, pace, step goal), and add a second entry point by converting `profile.tsx`'s "Targets" section into a navigation row.

## Why

- Two screens currently claim "targets" and neither links to the other (Context); making `/goals` the sole owner is the only option that lets `recalculateGoals()` be removed from Profile's four commit sites without orphaning an editor.
- The reversibility gap is stark (Context): adding an entry point is hours, merging 900 lines is 1-2 weeks — and three of the five P0 findings in this audit are data-loss bugs that need that engineering time more.
- Coach is a weekly-frequency surface (Context: the plan has a `durationWeeks` field), so it does not earn a tab slot, while Profile is where users demonstrably go hunting for settings — the two-door design matches the two real intents.

## Consequences

We accept that `/goals` remains a pushed route with a back arrow, and that `src/components/Layout.tsx:22` must gain a leading header slot so that arrow moves from the right edge (`goals.tsx:429`) to the left where a back control belongs.

We accept that the coach is two taps from the Dashboard rather than one, and that a user who ignores both the coach card and the Profile row will still never find it.

This forecloses folding the coach into Progress: once Profile's Targets row points at `/goals`, moving the screen again means breaking a link users have learned.

**Revisit if** a) the coach becomes a daily-interaction surface (e.g. it starts issuing daily check-ins rather than multi-week plans), in which case Option D's frequency argument flips, or b) `goals.tsx` is decomposed below ~300 lines, at which point Option C's file-size objection disappears, or c) analytics show fewer than ~20% of users ever reach `/goals` even with two entry points.
