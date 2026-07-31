# ADR-005: Whether Profile splits into Account vs Settings

## Status

PROPOSED

## Context

`app/(tabs)/profile.tsx` is 766 lines and holds nine disclosure `Section`s plus a glass identity header, a duplicated `WeightTargetCard` and a sync/sign-out block. In order: identity header, `<WeightTargetCard />` (line 358), Health Connect, Targets, About you, Weight log, Body measurements, Custom foods, Meal templates, Appearance, and finally the account block with Sign out (lines 739-762).

So a user who opens Profile to sign out or switch to dark mode scrolls past a weigh-in form, a body-fat estimator, a 20-row weight table and two food-library lists to reach it. The one thing every user eventually needs is dead last on the longest screen in the app.

Most of that content is misfiled rather than merely long:

- `<WeightTargetCard />` at line 358 is a duplicate of `<WeightTargetCard compact />` on the Dashboard (`index.tsx:173`); meanwhile Progress's weight empty state at `progress.tsx:987` tells users to "log your weight from the Profile tab", pointing at the slower of the two.
- **Weight log** (535-567, 33 lines) and **Body measurements** (569-643, 75 lines) are history and data capture that belong next to the weight chart on Progress.
- **Custom foods** (645-677, 33 lines) lists a library that can never be filled — there is no create-a-food path anywhere (`food-search.tsx:690`), so the section's "0 saved" copy describes a feature that does not exist.
- **Meal templates** (679-712, 34 lines) duplicates management already present in the Diary rail (`diary.tsx:571-662`), which is where templates are actually applied.
- **Targets** (411-435) holds goal weight only, while calories and macros live on `/goals` — see ADR-002.
- The **Daily step goal** field is nested inside the Health Connect section (line 388), so it renders only when Health Connect is installed *and* granted — on iOS, or after a permission revoke, a numeric target the user set becomes unreachable.

There is also no account management at all: no change password, no change email, no delete account (`profile.tsx:756` is the end of the file). Combined with the absent forgot-password flow at `login.tsx:204`, a forgotten password is a permanent lockout.

Performance is coupled to this: collapsed `Section`s still build all their rows on every render (`profile.tsx:546-711`), so typing one character into the Height field rebuilds ~45 hidden rows and ~25 `Intl` date formats that are never shown.

**Reversibility cost.** Moving a `Section` between screens is a copy-paste of a self-contained block plus its store selectors — half a day each, reversible in the same. Splitting Profile into two *routes* means a new file, a new stack entry and a navigation decision users learn — 2-3 days, and unwinding it later re-teaches the navigation.

## Options considered

### Option A — Redistribute content; Profile becomes identity + settings + account, pinned account block

One-line description: keep one Profile screen but move Weight log and Body measurements to Progress, Custom foods and Meal templates to the food/diary surfaces where they are used, drop the duplicate weight card, move the step goal to Targets, and move the account block to the top.

Pros:
- Removes ~176 of 766 lines (~23%) from the screen, and specifically removes every *content library* — Profile ends up holding identity, targets link, about-you, integrations, appearance and account, which is a coherent single job.
- Puts each item where the user is already thinking about it: weight history next to the weight chart, meal templates next to the meal cards, custom foods next to food search (where creation will live).
- Sign out and sync status move above the fold, so the most-needed action stops being last.
- Fixes the step-goal-unreachable-on-iOS defect by moving one `Field` out of a platform-gated section.
- Cheap and incremental: each section is a self-contained block with its own store selectors, so it can move one at a time without a big-bang migration.

Cons:
- Progress gains ~110 lines on a file already at 1,268 lines with four chart primitives inlined — it needs its own extraction work first or it becomes the new dumping ground.
- Custom foods cannot move until a create-a-food path exists in `food-search.tsx`; until then the section either stays (lying) or disappears (removing a delete affordance for foods the web app can create).
- Still one long screen, so a user looking for "appearance" still scrolls past About you and Health Connect.
- Does not add change-password / delete-account, which is a separate gap.

Estimated dev cost: **2-3 days** across five independent moves, each shippable alone.

Concrete failure mode: Weight log moves to Progress, but Progress's tab state resets to Calories/7d on every exit (`progress.tsx:621`), so a user who goes to look at their weigh-in history has to re-select the Weight segment every single time — the history feels harder to reach than before.

### Option B — Split into two routes: `/profile` (identity + account) and `/settings`

One-line description: Profile keeps the identity header, targets and account; everything configurable moves to a pushed `/settings` route.

Pros:
- Each screen has one job and a short scroll; "where do I change units" has a single obvious answer.
- Matches the platform convention users already know from iOS/Android system apps.
- Lets the account block (sign out, and the missing change-password / delete-account) be a compact, always-visible group rather than the tail of an accordion.
- Reduces the per-render cost of each screen roughly in half without touching the `Section` render strategy.

Cons:
- Adds a route and a navigation decision on a tab that is visited rarely — the user now has to guess whether "Weight unit" is Profile or Settings, and the honest answer is that it could be either.
- Does not solve the actual misfiling: Weight log, Body measurements, Custom foods and Meal templates are wrong on *both* screens, because they belong on Progress and Diary.
- Two screens both reachable only from one tab means the deepest item is now three taps from anywhere.
- Adding a route needs a leading back-slot on `Screen` (`Layout.tsx:22` has no `left`), so it drags in a shared-component change.

Estimated dev cost: **2-3 days**, and it can be undone only by re-teaching the navigation.

Concrete failure mode: a user goes to Settings looking for their goal weight (it is a setting, surely), finds only units and appearance, and concludes the app cannot set a goal weight — the same class of failure the Targets/Goals split already produces.

### Option C — Status quo, fixed only for ordering and render cost

One-line description: keep every section where it is; move the account block to the top and make `Section` lazy (`children: () => ReactNode`, called only when open).

Pros:
- Smallest possible change: two edits, no content moves, no cross-screen coordination.
- Fixes the measurable performance defect (~45 hidden rows and ~25 `Intl` formats rebuilt per keystroke) in isolation.
- Zero migration risk — nothing a user has learned moves.
- Leaves the engineering week free for the five P0 data-correctness findings.

Cons:
- Leaves "Custom foods (0 saved)" advertising a feature that does not exist, and leaves Progress pointing users at Profile for a weigh-in the Dashboard already offers.
- Leaves the step goal unreachable on iOS and after a permission revoke.
- Leaves two owners for meal templates and two weight cards, which is a direct instance of the reported problem.
- Profile stays the longest screen in the app and keeps growing as features land.

Estimated dev cost: **0.5 day**.

Concrete failure mode: a user who created foods on the web opens Profile to delete a bad one, finds "Custom foods — 0 saved" because the mobile store never received them, and concludes their web data is gone.

## Decision

Redistribute Profile's content to the screens where it is used (Option A), keep it as a single route, and pin the account block above the fold — do not split into a second Settings route.

## Why

- The problem is misfiling, not length (Context): Weight log, Body measurements, Custom foods and Meal templates are wrong on Profile *and* would be wrong on a Settings screen, so Option B relocates the symptom without touching the cause.
- Each section is a self-contained block with its own store selectors (Context), so Option A is five independent half-day moves that can ship one at a time, whereas Option B is a single 2-3 day change that must land whole.
- Sign out is the one action every user eventually needs and it is currently last on the longest screen (Context); moving the account block up is a prerequisite for the missing change-password and delete-account work regardless of which option wins.

## Consequences

We accept that Progress must absorb ~110 lines and therefore needs its chart primitives (`progress.tsx:49-480`) and `Segmented`/`StatTile` (486-583) extracted into `src/components/` first, and that its tab/range state must persist (or move to route params) so the relocated weight history is not two taps deep behind a control that resets.

We accept that Custom foods cannot move until `food-search.tsx` gains a create-a-food path, and that until then its "0 saved" copy must be corrected rather than left as-is.

We accept that Profile stays one long screen, and that `Section` should become lazy (`children` as a function) regardless, since that fix is orthogonal and cheap.

This forecloses a `/settings` route in the near term: once content is redistributed, the remainder is short enough that a second route would be mostly empty.

**Revisit if** a) account management grows past ~4 rows (change password, change email, delete account, export data, privacy), at which point an Account route earns its own place, or b) Progress refuses the relocated content because its own file size becomes unmanageable, or c) a second user-facing configuration surface appears (e.g. notification preferences from ADR-003's follow-up) that has no natural home on any tab.
