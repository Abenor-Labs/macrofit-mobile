---
target: dashboard / home screen
total_score: 24
p0_count: 1
p1_count: 2
timestamp: 2026-07-30T06-39-11Z
slug: app-tabs-index-tsx
---
## Lead finding: two components render unstyled

Meal rows (flexDirection row lost, index.tsx:445) and water quick-add (flex/border/minHeight lost, index.tsx:575) lose their styles at render. Both use function-form `style` on Pressable, same construct that broke the FAB. index.tsx:3-10 documents the same symptom from a different cause previously.

Likely cause: nativewind 4.2.6 wired via jsxImportSource + babel preset + global.css, with zero className usages in app/ or src/. Unverified.

## Design health: 24/40 - Acceptable

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of status | 3 | Progress everywhere; no sync/loading state |
| 2 | Match real world | 3 | Recomp / Lean bulk unexplained but audience-appropriate |
| 3 | Control and freedom | 2 | No date navigation; Today is a title not a control |
| 4 | Consistency | 1 | Two components render unstyled; three doors to same chat |
| 5 | Error prevention | 3 | Minus-250 disabled at zero intake |
| 6 | Recognition over recall | 3 | Goals shown beside actuals |
| 7 | Flexibility | 2 | Meal rows waste captured intent |
| 8 | Aesthetic / minimalist | 2 | 9 stacked cards, calories twice, ad in slot 2 |
| 9 | Error recovery | 2 | FAB water logs instantly, no undo |
| 10 | Help | 3 | Steps and Coach empty states explain themselves |

## Anti-patterns

Hero is the hero-metric template. Nine near-identical rounded cards is the identical-card-grid reflex. Saved from slop by specific copy, honest empty states, display serif numerals.

## What's working

- Stalled callout: interpretation not data, buried seventh
- Status never on hue alone (icon + sentence)
- Thorough accessibility labels on every StatValue

## Priority issues

- P0 Meal rows and water buttons render unstyled. Water tap targets collapse below 44dp.
- P1 Three entry points to chat on one screen (header :132, AI card :152, FAB). Card occupies slot 2.
- P1 All four meal rows route to /diary generically (:444), discarding which meal the user picked.
- P2 Calories stated twice: hero 56pt, macro ring centre 30pt.
- P2 Streak is last, below Steps and Weight, four swipes down.

## Persona red flags

Casey: water targets text-sized; FAB covers KCAL BURNED label; streak/weight four swipes down.
Riley: four meal rows promise four destinations, deliver one; no undo on FAB water.
Sam: broken water buttons under 44x44; Add food link overlaps row-level target.
