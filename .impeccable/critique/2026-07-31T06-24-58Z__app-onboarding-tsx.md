---
target: app/onboarding.tsx + Health Connect permission surface
total_score: 25
p0_count: 2
p1_count: 3
timestamp: 2026-07-31T06-24-58Z
slug: app-onboarding-tsx
---
# Critique — onboarding flow and Health Connect permission surface

Target: `app/onboarding.tsx`, with `src/hooks/useHealthSync.ts`, `src/lib/healthConnect.ts`
and the Health Connect section of `app/(tabs)/profile.tsx` as the surrounding surface.

Register: product. No PRODUCT.md or DESIGN.md in the repo; `docs/MOBILE-DESIGN.md` used as
design context instead. Both assessments were run in one head rather than as isolated
sub-agents, so the score is indicative rather than audited.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Granting permission produced no visible change; import needed a second press |
| 2 | Match System / Real World | 3 | "No height on file" shown when the truth was "you refused access" |
| 3 | User Control and Freedom | 3 | Skip prominent, Back works, readings prefilled rather than committed |
| 4 | Consistency and Standards | 2 | Profile offered a settings escape after refusal; onboarding dead-ended on the same state |
| 5 | Error Prevention | 3 | Step list could change length mid-flow and shift every step's meaning |
| 6 | Recognition Rather Than Recall | 3 | Units sit beside their fields; plan preview uses the real calculation functions |
| 7 | Flexibility and Efficiency | 2 | The express lane was invisible to anyone without Health Connect installed |
| 8 | Aesthetic and Minimalist | 3 | "Your goal" puts seven decisions on one screen |
| 9 | Error Recovery | 1 | A refusal produced a button that silently did nothing, permanently |
| 10 | Help and Documentation | 3 | Inline explanations are strong; nothing covered "not installed" |
| **Total** | | **25/40** | **Acceptable — significant improvements needed** |

## Cognitive load

Moderate: 2 of 8 checklist items failed.

- **Chunking** fails on "Your goal": 3 goals + 3 paces + a target field visible at once.
- **Minimal choices** fails on both "Your days" (5 options, each with detail text) and
  "Your goal" (7 decision points).
- Progressive disclosure passes. Pace only appears when the goal is not "maintain".
- Working memory passes. Nothing must be carried between screens; the plan recomputes live.

## Anti-patterns verdict

Not AI slop. The deterministic detector returned `[]`, but it parses HTML/JSX markup and this
is React Native inline styles, so nothing was measured. That is not a clean result.

By inspection the copy is specific in a way generated UI is not ("Pick the line closest to a
normal week, not your best one"), the unit switch rewrites the field so the number keeps
meaning the same body, and the weigh-in import is deliberately deferred until the display unit
is settled. Two tells: a `Sparkles` icon on the welcome card, and a hardcoded `#FFFFFF` on the
one mark on the first screen a user ever sees, which therefore ignored dark mode.

## Priority issues

**[P0] A refused permission left a button that did nothing.** `pullFromPhone` called
`health.connect()` and returned. Health Connect never prompts twice for a refused permission;
`healthConnect.ts` says so in its own doc comment and names `openHealthSettings` as the only
route left. Onboarding never called it. Tap, refuse, tap again: no message, no error, no path.

**[P0] The same path cost a grant two presses.** `pullFromPhone` returned immediately after
`connect()`, and its closure still held the grants from before the sheet opened. A full grant
imported nothing until the button was pressed again, while the primary button still read "Skip".

**[P1] `not_installed` hid the feature everywhere.** Onboarding gated its step on
`availability === 'available'`; Profile gated its whole section the same way. That state is
common and one Play Store tap from fixed, and in it the app never mentioned the feature exists.

**[P1] The step list could change length mid-flow.** `STEPS` was memoised on `availability`,
which is re-probed on every foreground. Installing Health Connect and returning grew the list
from five to six, so every later index named a different screen.

**[P1] Absence was asserted where refusal was the fact.** Partial grants passed the
`!readWeight && !readHeight` gate, so a user who allowed weight and refused height was told no
height was recorded.

**[P2] "Five short questions"** was wrong whenever the phone step existed, with a progress bar
reading "1 of 6" directly beneath it.

**[P2] The 30-day history cap** was disclosed in Profile but not in onboarding, which is where
the promise "your weight trend will work from day one" is actually made.

## What was working

- The deferral of weigh-in history until `finish()`, because `WeightEntry.weight` is stored in
  the profile's display unit and the unit is not settled until the user stops being able to
  change it. Getting this wrong would silently reinterpret kilograms as pounds across every
  trend downstream.
- Existing logged days winning over device readings on import.
- Naming steps rather than indexing them, so the Android and iOS sequences cannot be confused.
- The permission rationale copy, which explains why age and sex are still asked for.

## Fixes applied

- `connect()` returns `HealthGrants` so callers can act on the answer in the same tick.
- `pullFromPhone` grants in one press, and reports a refusal with a route to Health Connect's
  settings.
- `openHealthConnectInstall()` added; onboarding and Profile both offer it on `not_installed`.
- Step list latched when the user leaves Welcome.
- Import results distinguish "not on file" from "not shared", and disclose the 30-day cap.
- Welcome copy corrected to three questions; brand square moved onto `theme.brand` /
  `theme.brandOn`.

## Not fixed

- "Your goal" still presents seven decisions at once. Splitting goal from pace would cost a
  step in a flow whose length is itself a cost; worth a deliberate decision rather than a
  reflex.
- The post-onboarding weigh-in import is still fire-and-forget, so a failure after the user
  reaches the dashboard is silent.
- The gender selector uses `accessibilityRole="button"` where `OptionRow` uses `radio`.
