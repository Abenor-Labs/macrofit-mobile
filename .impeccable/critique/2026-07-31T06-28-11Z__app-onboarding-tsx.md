---
target: app/onboarding.tsx + Health Connect permission surface
total_score: 32
p0_count: 0
p1_count: 0
timestamp: 2026-07-31T06-28-11Z
slug: app-onboarding-tsx
---
# Critique — onboarding and Health Connect, after the 10cca20 fixes

Re-score of the same target following the P0/P1 fixes from the first run. Same rubric, same
in-head method (no isolated sub-agents), so the comparison is like-for-like.

## Design Health Score

| # | Heuristic | Was | Now | What moved it |
|---|-----------|-----|-----|----------------|
| 1 | Visibility of System Status | 2 | 3 | One press grants and imports; refusal and not-installed both report. Post-onboarding import still silent |
| 2 | Match System / Real World | 3 | 4 | "Not shared" no longer reported as "not on file"; question count matches the progress bar |
| 3 | User Control and Freedom | 3 | 3 | Unchanged. Import still cannot be re-run once it reports nothing |
| 4 | Consistency and Standards | 2 | 3 | Onboarding and Profile now answer refusal and not-installed identically. Gender selector still uses the wrong a11y role |
| 5 | Error Prevention | 3 | 4 | Step list latched; joins the unit deferral, bounds validation and existing-days-win |
| 6 | Recognition Rather Than Recall | 3 | 3 | Unchanged |
| 7 | Flexibility and Efficiency | 2 | 3 | The express lane is reachable from every state that can reach it |
| 8 | Aesthetic and Minimalist | 3 | 3 | "Your goal" still puts seven decisions on one screen |
| 9 | Error Recovery | 1 | 3 | Every dead end now has a route out. Not 4: healthConnect.ts swallows all errors to null, so a transient read failure still reads as "no data" |
| 10 | Help and Documentation | 3 | 3 | Not-installed now explains what Health Connect is. No searchable help exists |
| **Total** | | **25** | **32/40** | **Good — solid foundation, weak areas named** |

## Cognitive load

Unchanged at moderate, 2 of 8 failed. Chunking and minimal-choices both still fail on
"Your goal": 3 goals + 3 paces + a target field visible together. This was left deliberately;
splitting it costs a step in a flow whose length is itself the cost.

## Why the first number was low

Three heuristics carried almost the whole deficit, and one defect drove all three. A refused
permission produced an inert button, which is an Error Recovery 1 by definition, a Visibility
failure because the press produced no feedback, and a Consistency failure because Profile
handled the same state correctly. Six of the fifteen missing points traced to that single
path.

## What is still open

- "Your goal" presents seven decisions at once.
- The post-onboarding weigh-in import is fire-and-forget; a failure after the user reaches the
  dashboard is silent, and the promise was made on the previous screen.
- `healthConnect.ts` resolves every error to null by design, so "we could not read" and "there
  is nothing to read" are the same answer to every caller.
- Gender selector uses `accessibilityRole="button"` where `OptionRow` uses `radio`.
- The deterministic detector still cannot measure this file: it parses markup, and this is
  React Native inline styles.
