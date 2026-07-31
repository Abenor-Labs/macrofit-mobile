---
target: reported-issues implementation plan
total_score: 27
p0_count: 2
p1_count: 2
timestamp: 2026-07-31T04-08-34Z
slug: rpowers-specs-2026-07-31-reported-issues-design-md
---
Critique of the implementation plan at `docs/superpowers/specs/2026-07-31-reported-issues-design.md`, scored against the end state it proposes.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Fixes the big status lie (HC "Connected" when it is not). But HC weight write-back is fire-and-forget with no success/failure feedback, and the 60s steps-refresh throttle is silent. |
| 2 | Match System / Real World | 3 | kg + ft/in is the right real-world pairing for the audience. "Open Food Facts" as a section header is a database name, not user language, repeating the existing "USDA FoodData Central" problem. |
| 3 | User Control and Freedom | 3 | Adds the missing escape hatch (Re-run setup). But no undo on the new dashboard weigh-in, and deleting a MacroFit weigh-in leaves the Health Connect record behind. |
| 4 | Consistency and Standards | 2 | Adds a fourth food-source section without unifying the three that exist. `heightUnit: 'ft'` default is only half-plumbed: `HEIGHT_CM_RANGE` validation copy still says cm. ADR-001 governs the dashboard's primary log affordance and Track E changes it without amending the ADR. |
| 5 | Error Prevention | 3 | Permission-identity fix kills a whole class of silent failure; the `readwrite` restructure preserves the manifest/runtime invariant. But no `clientRecordId` on HC inserts. |
| 6 | Recognition Rather Than Recall | 3 | Weight prompt shows last value; HC grants named explicitly rather than counted. |
| 7 | Flexibility and Efficiency | 3 | Dashboard weigh-in saves two taps; aggregation is faster than paging records. No path to log a weight for yesterday from either affordance. |
| 8 | Aesthetic and Minimalist Design | 2 | The dashboard already scores 28/40 with an open P1 for duplication. This plan adds a card and un-nulls another, and never reads the existing critique. |
| 9 | Error Recovery | 2 | No undo on the new weigh-in. HC write failure is invisible. Deep-link errors are routed through `sessionEndedReason`, whose copy is about session expiry. |
| 10 | Help and Documentation | 3 | The two manual steps are documented well. README still claims `EXPO_PUBLIC_USDA_API_KEY` works, which A2 proves it never has. |
| **Total** | | **27/40** | **Good, lower band** |

## Cognitive Load

3 of 8 checklist items fail. Moderate.

- **Single focus** fails: the dashboard gains a card on a screen already flagged for competing elements.
- **Visual hierarchy** fails: the "Stalled" verdict is still seventh; the plan adds above-fold competition without moving it.
- **Minimal choices** fails: food search would carry five sections (Recent, Your foods, Matches, USDA, Open Food Facts). Over the four-group ceiling.

## Anti-Patterns Verdict

**LLM assessment.** No AI-slop tells in the plan. It commits to specific hex values, names real files and line numbers, and states trade-offs instead of hedging. The dark-theme section resists the obvious reflex ("fitness app, therefore dark navy and neon green") by deriving from measured contrast rather than category. Two soft spots: "Open Food Facts" as a literal section heading is a data-source label leaking into UI, and the new dashboard weigh-in row is heading straight for the identical-card-grid pattern that screen already has.

**Deterministic scan.** `npx impeccable detect --json app src/components` returned `[]`. This is not a clean bill of health: the detector matches HTML/JSX markup patterns (utility classnames, `background-clip: text`, glass cards). This codebase is React Native with inline style objects and no className anywhere, so the detector has essentially no signal on it. Treat the zero as "not measured", not "not present".

**Visual overlays.** Not run. No viewable page.

## Overall Impression

The diagnosis is strong and the file-level specificity is unusual for a plan. Every root cause is traced to a line number, and two of them (permission counted by length, `import.meta` under Metro) are genuine finds that would not have surfaced from reading the symptom.

The weakness is that it is nine fixes wearing a trench coat, not one design. It never opens `.impeccable/critique/`, which already scores the dashboard 28/40 and names two open P1s that Track E walks directly into. And it ships changes for two defects it cannot reproduce.

Single biggest opportunity: decide what comes **off** the dashboard before deciding what goes on.

## What's Working

- **Track B1 is the real fix.** `granted.length > 0` meaning "connected" is the root of both "steps are 0" and "check the HC permission". Replacing a boolean with a per-permission struct fixes the symptom and the lie at the same time, and `openHealthConnectSettings()` is already exported and unused, so the recovery path costs nothing.
- **The `src/core` constraint is caught before it bites.** Three of nine fixes live in a directory that `npm start` deletes. A plan that missed this would have produced work that silently reverted on the next run.
- **The Google Fit caveat is stated honestly.** "Fit shows it if Fit is set to sync with Health Connect" rather than "synced to Google Fit". The plan declines to promise something it cannot deliver, in UI copy and in the spec.

## Priority Issues

### [P0] Health Connect write-back will duplicate records

**Why it matters:** `insertRecords` with no `metadata.clientRecordId` appends a new row on every call. Edit today's weight three times and Health Connect holds three Weight records for the same instant. Google Fit then shows an arbitrary one, and MacroFit's own `readWeightHistory` re-imports the mess on the next sync. This turns the headline fix into a data corruption path.

**Fix:** set `metadata: { clientRecordId: 'macrofit-weight-<YYYY-MM-DD>', clientRecordVersion: <ms> }`. Health Connect treats a matching `clientRecordId` as an upsert. Also wire `removeWeightEntry` to `deleteRecordsByUuids` / `deleteRecordsByTimeRange` so a deleted weigh-in does not survive in Fit.

**Suggested command:** `/impeccable harden`

### [P0] Two fixes ship without a reproduction

**Why it matters:** Track A4 says outright "this is a hypothesis, not a confirmed diagnosis" and then ships three changes. Track D fixes the keyboard without knowing the Android version or whether edge-to-edge is actually active on the reporting device. If the hypothesis is wrong, the code lands, the bug persists, and the next report is harder to diagnose because the ground moved.

**Fix:** written repro steps before code, for both. Onboarding: fresh emulator, create the account on the **website** first so a server row exists, install the app, sign in, observe. Keyboard: capture Android version and confirm the IME inset behaviour on the actual device. Add the `__DEV__` `onboardedAt` provenance log as step one, not step three.

**Suggested command:** `/impeccable audit`

### [P1] The plan makes the dashboard's known P1 worse

**Why it matters:** `.impeccable/critique/2026-07-30T07-06-26Z__app-tabs-index-tsx.md` scores the dashboard 28/40 with two open P1s: "Calories printed twice in one viewport" and "Stalled verdict still seventh, only sentence telling the user to act, four swipes down". Track E adds a weigh-in card **and** un-nulls `WeightVerdict`, so a user with no goal weight now sees a verdict box and a weigh-in row where they previously saw neither. More above-fold competition, verdict still buried.

**Fix:** state what leaves the dashboard. Either the weigh-in becomes a FAB action rather than a seventh card, or `WeightVerdict` and the weigh-in row merge into one component that renders the verdict when there is a target and the prompt when there is not. Never both.

**Suggested command:** `/impeccable distill`

### [P1] Five sections in food search

**Why it matters:** Recent, Your foods, Matches, USDA FoodData Central, Open Food Facts. Nobody searching for "paneer" is choosing a data source. Two remote sources also means two loading spinners, two error rows and two empty states on one list, all of which can be on screen at once.

**Fix:** collapse USDA and Open Food Facts into one "More results" section, merged and ranked, with a small source label on the row for provenance. One loading state, one error state, one empty state. This also fixes the Match-Real-World score.

**Suggested command:** `/impeccable distill`

### [P2] Deep-link errors reuse the session-expiry channel

**Why it matters:** the plan routes confirmation-link failures through `sessionEndedReason`, whose only copy is "Your session expired, so you were signed out. Everything you logged is still on this device." Shown after a stale confirmation link, that is simply wrong and sends the user looking for data loss that did not happen.

**Fix:** its own state and its own copy, naming the real cause: link already used, link expired, or link belongs to a different account.

**Suggested command:** `/impeccable clarify`

## Persona Red Flags

**Priya (project persona: Indian user, kg + ft/in, mostly home-cooked).** Searches "dal". Open Food Facts returns branded packets of *uncooked* dal, because it is a packaged-goods catalogue. Searches "roti", gets frozen supermarket rotis with the wrong macros. She is the exact person who filed this issue, and the deselected bundled dish database is the thing that would have served her. The plan names this consequence honestly, which is right, but it means issue #2 is only half-fixed for the reporter.

**Jordan (First-Timer).** Signs up, taps the confirmation email, now lands in the app (fixed). Connects Health Connect, grants only Steps, and is now told exactly which permissions are missing (fixed). Logs a weight. Nothing tells them it reached Health Connect, nothing tells them it failed, and Google Fit shows nothing because Fit-to-HC sync is off by default. They conclude the sync is broken.

**Alex (Power User).** Weighed in this morning, forgot to log it, opens the app tonight. New dashboard affordance is today-only. Progress → Weight is today-only. The only path is Profile → Weight log, which offers delete but no edit and no add-for-a-past-date. Logs it as today, which corrupts the trend calculation the whole feature exists to produce.

## Minor Observations

- **Dark theme names tokens, not consumers.** The bloom actually renders in `src/components/Backdrop.tsx` (three `LinearGradient`s) and the muddiness comes largely from `glass.overlay` / `chromeOverlay` in `src/components/Glass.tsx`. Retuning `tokens.ts` alone will not land the change.
- **`expo-system-ui` is a dependency and unused.** The new ladder should set the native root background so the cold-start flash matches the canvas.
- **`heightUnit: 'ft'` is half-plumbed.** `HEIGHT_CM_RANGE` validation copy in `profile.tsx` still says "between X and Y cm" to a user who is entering feet.
- **README and `.env.example` document `EXPO_PUBLIC_USDA_API_KEY` as working.** A2 proves it never was. Both belong in the same commit as the fix.
- **Onboarding copy promises a year of weigh-ins.** B5 shows it is 30 days without the history permission. The copy fix is listed under B5 but not cross-linked to `app/onboarding.tsx:509`.
- **No rollback note for Track A.** `src/core` is committed (confirmed via `git ls-files`), so a bad `sync:core` is visible in `git diff`. The plan should say so, because the README claims the directory is gitignored, and it is not.
- **No undo on the new weigh-in**, repeating the FAB-water pattern the previous dashboard critique already logged as P2. `SnackbarProvider` is already mounted in `app/_layout.tsx`.

## Questions to Consider

- What if the weigh-in were not a card at all? The FAB already exists and already logs water. "Log" with two choices is one affordance instead of a seventh row.
- Does food search need to name its sources, or does it need one ranked list that just answers the question?
- If Priya's actual query is "2 rotis and dal", is the answer a better search, or is it the natural-language logging the app already has an AI endpoint for?
