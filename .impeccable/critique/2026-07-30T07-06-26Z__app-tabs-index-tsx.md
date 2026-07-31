---
target: dashboard / home screen
total_score: 28
p0_count: 0
p1_count: 2
timestamp: 2026-07-30T07-06-26Z
slug: app-tabs-index-tsx
---
## 28/40 - Good (was 24, Acceptable)

| # | Heuristic | Was | Now | Note |
|---|---|---|---|---|
| 1 | Visibility of status | 3 | 3 | unchanged |
| 2 | Match real world | 3 | 3 | unchanged |
| 3 | Control and freedom | 2 | 2 | still no date navigation |
| 4 | Consistency | 1 | 3 | unstyled components gone |
| 5 | Error prevention | 3 | 3 | unchanged |
| 6 | Recognition over recall | 3 | 3 | unchanged |
| 7 | Flexibility | 2 | 3 | meal rows carry intent; water buttons work |
| 8 | Aesthetic / minimalist | 2 | 3 | one less card, and it was the advert |
| 9 | Error recovery | 2 | 2 | FAB water still logs with no undo |
| 10 | Help | 3 | 3 | unchanged |

Consistency did the heavy lifting. 3 not 4 because meal rows now behave differently by state: filled opens diary, empty opens picker.

## Duplication got worse

Removing the AI card pulled Macros up a slot, so 700 at 56pt and 700 at 30pt now sit in the same screenful. Previously a card apart. Direct consequence of the fix.

## Priority issues

- P1 Calories printed twice in one viewport. Ring centre should carry protein remaining (29 of 182 g) instead.
- P1 Stalled verdict still seventh. Only sentence telling the user to act, four swipes down.
- P2 FAB covers KCAL BURNED label, renders as KCAL BURNE. Same class as docs/adr/001 and 004.
- P2 No date navigation. Today is a title, yesterday unreachable.
- P2 Water logged from FAB has no undo; the minus control is four swipes away.

## Improved

- Meal rows: tapping Dinner opens picker headed "Dinner - Jul 30". Two taps saved per meal.
- Water quick-add restored as four 44dp targets.
- Advert removed from above the day's numbers.

## Persona re-check

Casey: quick-add tappable, meals one tap. Verdict and streak still four swipes down; FAB clips a label.
Riley: four-rows-one-destination resolved. New edge: rows behave differently by content with no visual cue.
Sam: 44dp targets restored. Add food text nested inside row-level target, now cosmetic not functional.
