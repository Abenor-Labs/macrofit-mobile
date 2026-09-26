# Onboarding and food rules: design

**Date:** 2026-09-26 (Saturday)
**Step:** 2 of the onboarding + diet work, the final spec
**Branch at time of writing:** `training-and-audit`
**Repos:** `D:\Macro-tracker` is the source of truth for `src/types`, `src/utils`, `src/data`,
`src/store/appState.ts` and the Vercel `api/`. `D:\macrofit-mobile` is the Expo app. Its
`src/core/` is a generated copy (`scripts/sync-core.mjs`), so nothing in this spec is edited
there. Every "shared" file below is edited in the web repo and pulled across with
`npm run sync:core`.

**Based on:** the "user" design, which ranked first (131.5). It takes these ideas from the other
two designs:

| From | Idea taken |
| --- | --- |
| mvp | The server-side mid-turn diet (a rule set earlier in a turn applies to a later offer), the one-call shortcut closed after a refusal, `catalogFor` filtering staples but never foods the user named, `TDEE_CONFIDENCE_DAYS` exported from `tdee.ts`, the `useNotifications` re-plan on profile change, the date-string weekday helper, the deterministic Monday test matrix, `palak paneer` as a vegetarian protein starter, and gym time seeding `trainingDayTime` |
| rules | An explicit `capabilities` flag gates the tool, `diet` is a required argument so the compiler lists every caller, rules can only tighten (a union, so no priorities), date-range rules for Purattasi and Sabarimala, a `may contain` marker plus an unknown-food rule, the lexicon checked against the audited table, a client-side re-check of offers, tighten-now / loosen-needs-a-tap, the `dataOrigin` filter on workout reads, and one shared `calorieFloor` |

Where the judges found flaws in all three designs, the fixes are listed at the end of each section
under **Fixed from review**.

---

# Part 1: for the owner

## 1. Summary in plain words

### What a new user sees

Setup becomes four short parts on a checklist, one question per screen, about three minutes:

1. **Basics.** Phone first: on Android, one tap connects Health Connect. Height, weight, past
   weigh-ins, steps and workout days then arrive pre-filled. After that come sex, age, height and
   weight on scroll rulers (no typing), which days you train and at what time, and how much you
   move in a normal day.
2. **How it works.** One screen: "Your body uses about 2,550 kcal a day. Week 1 we start from
   that guess. By week 2 your weigh-ins show what you really burn. From week 3 it's dialled in."
3. **Goal.** Lose / stay / build. Then a target-weight ruler, then a pace ruler. The daily
   calories and the "reach 66.5 kg around 14 Jan" date change as you move it.
4. **Food & routine.** How you eat, which meats you eat, how often, any veg days (with "egg on
   those days?" and "fish on those days?"), allergies, a usual breakfast, meal times, and how much
   protein.

Every answer is saved the moment it is given. Close the app halfway and it reopens on the same
question.

### What everyone gets: the same food rules everywhere

Once the app knows how someone eats, **every place that suggests food follows the same rule, from
one shared piece of code**:

- the Today "next meal" card;
- the meal reminders, which are planned a week ahead and use each day's own rule;
- the coach's opening line;
- the coach's meal cards, checked on the server so the AI cannot slip one through;
- the food search, where foods that break today's rule are moved down and labelled, never hidden
  from someone who types their name.

**Nothing ever stops you logging.** The diary records what was eaten, including the chicken
biryani at a wedding on a Monday.

When you tell the coach something ("no egg on Mondays", "veg for Purattasi till 17 Oct",
"allergic to peanuts"), it changes the structured rules, not a note. A stricter rule is saved at
once with an Undo. A looser one ("egg is fine on Mondays now") shows a card you tap to save,
because a misheard loosening could put meat in front of a vegetarian.

### Your friend's Monday

The friend eats chicken and fish two or three days a week, never beef or pork, and on Mondays eats
no meat, no fish, and not even egg.

- **Setup.** On "Any days you keep veg?" they tap **M**. Two small follow-ups appear: "Egg on
  those days?" **No egg**. "Fish on those days?" **No fish**. The screen repeats it back:
  *"Mondays: no meat, no fish, no egg."*
- **Sunday, 9 pm.** The phone plans Monday's reminders with Monday's rule. Monday's 9:30
  breakfast nudge (if they turned nudges on) says "Idea: Pesarattu ×2 + Coconut chutney", never
  egg dosa.
- **Sunday, 10 pm.** They ask the coach "what should I have for breakfast tomorrow?" The coach is
  told in plain words that tomorrow is Monday, a veg day. If it offers egg dosa anyway, the server
  refuses the card and the coach offers a veg plate in the same reply.
- **Monday, 8 am.** The Today card reads "Breakfast idea · veg day". Swapping keeps it veg.
- **Monday lunch.** They search "dosa". Egg dosa appears below the plain dosas, labelled "Not on
  Mondays", and they can still log it.
- **Monday night.** They log the chicken biryani they ate at a party. It logs, with no lecture.
- **Tuesday.** Chicken curry is back in their ideas.
- **Friday.** After chicken on Tuesday and Wednesday and fish on Thursday, they have had their "2 to 3
  days" of non-veg. Friday's ideas lean on egg, paneer and dal. Chicken is still in search.
- **Any day.** "This month I'm veg for Purattasi till 17 Oct" gives a rule saved at once with an
  Undo chip, and every surface stays veg until 17 Oct.

### Decisions I made for you (each is one line to change)

1. The section names are plain words: **Basics / How it works / Goal / Food & routine**, standing
   in for MacroFactor's Basics / Notice / Goal / Program style.
2. On "Which of these do you eat?", beef and pork start **unticked**. Offering beef fry to someone
   who doesn't eat it offends; not offering it to someone who does costs nothing.
3. On a veg day the default is **no egg, no fish**, and each is one tap to change. If fish is
   allowed, prawns and crab are too.
4. Meal-time nudges stay **off** by default, as today, with one switch on the meal-times screen.
5. The name question moves to the last screen and is optional.
6. The website keeps its current setup for now. Web users get the food-rules prompt when they open
   the phone app.
7. Allergies are filtered by food name and a hand-checked table, and the copy says "home recipes
   vary, always check". It never says "safe".
8. Existing users keep their targets. Nothing changes until they re-run setup or accept a coach
   proposal.
9. Sleep data is not read, because nothing would use it.

### Cost

About **10.5 working days**, in two app updates. The first update (after about 7 days) puts the
food rules on every surface, adds a "Food & diet" page, and brings the coach tool. The friend can
be protected from that point. The second (about 3.5 days later) brings the new setup. See
section 9.

---

# Part 2: for engineers

## 2. Onboarding, screen by screen

### 2.1 Rules for every screen

- **One question per screen.** Each has a title, one "why" line, one control, and a primary button
  pinned above the bottom safe-area inset. Containment bugs recur, so check this on a device.
- **Single-choice lists auto-advance** 250 ms after the tap, with `Haptics.selectionAsync()`.
  Multi-select screens and rulers use the button.
- **Every screen has a valid default** except sex (B2), goal (G1) and "How do you eat?" (F1),
  which take one tap. Where "nothing" is a real answer, the button label is the skip: it reads
  "No such days", "Nothing" or "I don't work out" until something is picked, then "Continue".
- **Rulers replace typing.** Tapping the big number opens a numeric field, as an accessibility
  fallback. Rulers are bounded, so the validation errors in `validateBasics` cannot happen.
- **Back.** The top-left arrow and Android back go to the previous screen. From a section's first
  screen they go to the checklist. From the checklist, Android back behaves as the system expects.
- **Saving.** Every change goes to the draft store (2.9) when the control settles, which for a
  ruler is momentum end, not every tick.
- **Health Connect prefill** shows as a small chip, "From Health Connect" or "From your steps".
  Changing the value removes the chip. Nothing asks "are you sure".

### 2.2 Home checklist

Title: **"Let's set up MacroFit"**. Sub-line: "4 short parts, about 3 minutes. Answers save as you
go."

| Row | Label | Sub-label |
| --- | --- | --- |
| 1 | Basics | You and your phone |
| 2 | How it works | What to expect in the first weeks |
| 3 | Goal | What you want and how fast |
| 4 | Food & routine | How you eat, breakfast, protein |

- Each row shows a tick when done and a "Next" badge on the current one.
- The primary button reads "Start", then "Continue: Goal" and so on. Finished rows can be tapped to
  revise.
- The checklist appears first and after each section.
- After the app is killed, it opens here with "Welcome back", and Continue returns to the exact
  screen.
- Rows can be done in any order, but the button always offers the next unfinished one. "Start
  tracking" (the Plan screen) needs all four done.

### 2.3 Basics

| # | Question | Control | Default | Skip | Health Connect prefill |
| --- | --- | --- | --- | --- | --- |
| B1 | Let your phone fill this in? | "Connect Health Connect" button, text button "I'll enter it myself" | none | the text button | this screen does the reading (section 7) |
| B2 | You are... | Man / Woman / Prefer not to say (auto-advance) | none, one tap | no | no (Health Connect has no sex) |
| B3 | How old are you? | Ruler 13-100, step 1 | 25 (re-run: profile age) | no | no |
| B4 | How tall are you? | Ruler in ft/in (48-90 in) with a cm toggle (120-230) | Health Connect height; else 5'7" / 5'2" / 5'5" by B2 | no | yes |
| B5 | What do you weigh? | Ruler 30-250 kg (66-550 lb), step 0.1, kg/lb toggle | Health Connect latest; else 70 / 58 / 64 kg by B2 | no | yes, plus the weigh-in count |
| B6 | Which days do you usually work out? | Weekday chips M T W T F S S | Health Connect pattern; else none | the button reads "I don't work out" until a day is picked | yes, days with 2+ sessions in 4 weeks |
| B7 | Usually around what time? | Ruler of half-hour slots, 05:00-23:00 | Health Connect median start; else 18:00 | shown only when B6 has days | yes |
| B8 | Apart from workouts, how much do you move in a day? | 4 rows (auto-advance) | band from the 28-day step average; else "Some walking" | no | yes, preselection plus evidence |

**B1 copy.** Title "Let your phone fill this in?". Why: "Health Connect has your height, weight
history, steps and workouts. We read them once to fill in the next screens. You can change
anything."

- After the read, it shows a receipt that is honest for each permission, reusing the existing
  "not shared" versus "nothing on file" wording:
  - `✓ Height 5'7"`
  - `✓ Weight 72.4 kg · 3 days ago`
  - `✓ 46 weigh-ins since March: your trend works from day one`
  - `✓ About 6,200 steps a day over 4 weeks`
  - `✓ 11 workouts in 4 weeks, mostly Mon/Wed/Fri evenings`
- A missing item reads "No height on file: you'll pick it next" or "Height wasn't shared: you'll
  pick it next".
- When refused, it shows the existing "open Health Connect settings" copy. When not installed:
  "Get Health Connect" plus the skip.
- The screen exists only where `availability` is `available` or `not_installed`. That is latched
  when Basics starts, which keeps the existing `lockedSteps` reasoning (onboarding.tsx:229-245).

**B5.**
- Hint: "Morning, before breakfast, is most accurate. Rough is fine."
- When the phone reading is older than 14 days, the title becomes "Last on your phone: 74.0 kg on
  12 Aug. Still right?" and the ruler starts there.
- Caption when weigh-ins were found: "+46 past weigh-ins will be added."

**B8 rows**, preselected from the step band (under 5k / 5-7.5k / 7.5-10k / 10k+) with the line
"Your phone: about 6,200 steps a day":

- "Mostly sitting": desk job, travel by bike or car
- "Some walking": errands, stairs, on your feet now and then
- "On my feet a lot": shop, teaching, hospital, lots of walking
- "Physical work": site, farm, delivery, carrying loads

`activityLevel = activityFrom(movement, trainingDays.length)` in shared `onboarding.ts`. It stores
the same `ActivityLevel` the web and every formula already use, so nothing downstream changes:

| movement \ training days | 0 | 1-2 | 3-4 | 5+ |
| --- | --- | --- | --- | --- |
| sitting | sedentary | lightly | lightly | moderately |
| some | lightly | lightly | moderately | moderately |
| on_feet | moderately | moderately | very | very |
| physical | very | very | extra | extra |

### 2.4 How it works (the owner's "Notice", one screen)

**N1** comes after Basics. Title: **"How your numbers get accurate"**.

- **Hero:** "About 2,550 kcal".
- **Caption:** "What your body uses in a day: our starting guess from your age, height, weight and
  activity."
- The number is `calculateTDEE(calculateBMR(draftProfile, kg), activityFrom(...))`, rounded to 50.

A timeline of three steps on a vertical line. The copy comes from the shared
`expectationFor({ tdee, weighIns, weighInSpanDays })`, which reads the thresholds from `tdee.ts`
(see 8.3):

1. **This week:** "We start from this guess. Log what you eat; rough is fine."
2. **Week 2:** "Once you have 10 days of meals and weigh-ins at least 10 days apart, we measure
   what you really burn. The guess usually moves by 100-300 kcal. That's normal, not a mistake."
3. **Week 3 onwards:** "Dialled in. At 21 logged days the measurement is solid, and each weekly
   check-in nudges your target in small steps."

- **Conditional line**, shown only when Health Connect gave at least 2 weigh-ins spanning 10 or
  more days in the last 4 weeks: "Your phone already has 46 weigh-ins, so we only need about 10
  days of meals."
- **Footer:** "What helps most: weigh in 3 or more mornings a week, before breakfast."
- **Button:** "Got it".
- The copy never says TDEE, maintenance or deficit.

### 2.5 Goal

**G1 "What do you want to do?"**
- Rows use the existing `GOAL_CHOICES` copy (Lose fat / Stay where I am / Build muscle) and
  auto-advance.
- "Stay where I am" shows "Eat about 2,550 a day" under it and skips G2 and G3.

**G2 "What's your first target weight?"** (lose) or **"What weight are you building to?"** (gain)
- A ruler.
- Default for lose: `max(current × 0.92, weight at BMI 23)`, rounded to 0.5 kg. For the friend
  (72 kg, 170 cm) that is max(66.2, 66.5) = **66.5 kg**. Default for gain: current + 3 kg.
- Live line: "5.5 kg to go, about 8% of your weight."
- The ruler is bounded on the correct side of the current weight, so `validateTarget` cannot fail.
- Secondary link: "No target, just a direction", which clears the target.

**G3 "How fast?"** Target and pace live on one screen, both updating the result live.

- **Top chip:** "Target: 66.5 kg ✎". Tapping it opens the G2 ruler in a sheet. With no target it
  reads "No target · add one".
- **Pace ruler** (the same Ruler component) in kg/week, snapping to 0.05:
  - **Lose.** The range is 0.25%-1.0% of body weight per week. The recommended value is 0.5%,
    rounded to 0.05 (72 kg gives **0.35 kg/week**). It is shown as a highlighted tick labelled
    "Recommended" with a haptic detent, and it is preselected.
  - **Zone label under the thumb:** below 0.4% "Relaxed"; 0.4-0.65% "Recommended"; 0.65-0.85%
    "Faster: hungrier days"; above 0.85% "Aggressive: short phases only".
  - **Gain.** The range is 0.1%-0.5% per week and the recommended value is 0.25%. It is also shown
    per month ("about 0.8 kg a month"), because 0.18 kg a week means nothing to most people.
- **Readout under the ruler:** "0.35 kg a week · 0.5% of your weight".
- **Live result card,** recomputed on every snap:
  - "**Eat 2,169 kcal a day**" (large)
  - "385 less than your body uses (2,554)"
  - "Reach 66.5 kg around **14 Jan 2027**" (16 weeks)
  - Beyond 52 weeks: "in about 14 months. A closer first target may feel better."
  - With no target: "About 1.5 kg a month".
- **Floor.** The ruler's upper end is cut where the calories would cross `calorieFloor(gender)`
  (1,200 for women, 1,500 otherwise; see 8.3). At that end it says: "This is as fast as we'll go.
  Below 1,500 kcal isn't worth the hunger."
  - If even the slowest pace would cross the floor (a small person with a low burn), the pace is
    set to the fastest the floor allows. The card says "Your budget is already near the minimum,
    so this goes slowly", and the date uses that effective pace.
- **Stored:** `profile.targetWeightKg` and the signed `targetRateKgPerWeek`, exactly as today. The
  percentage is only for display.

All arithmetic lives in one shared pure function, so the Goals screen can reuse it later and the
two cannot disagree:

```ts
// D:\Macro-tracker\src\utils\onboarding.ts
export interface PaceRange { min: number; max: number; recommended: number; step: 0.05; floorLimited: boolean }
export const paceRange = (goal: WeightGoal, currentKg: number, tdee: number, gender: UserProfile['gender']): PaceRange

export interface GoalPreview {
  kcal: number                 // caloriesForPace(tdee, goal, kgPerWeek, calorieFloor(gender))
  kgPerWeek: number            // as chosen
  effectiveKgPerWeek: number   // after the floor; equal to kgPerWeek unless floorLimited
  pctPerWeek: number           // of current weight, one decimal
  vsBurn: number               // kcal - tdee, signed
  zone: 'relaxed' | 'recommended' | 'faster' | 'aggressive'
  weeks: number | null         // horizonFor(target - current, effectiveKgPerWeek).weeks
  endDate: string | null       // 'YYYY-MM-DD', today + horizonFor(...).days
}
export const goalPreview = (i: {
  tdee: number; goal: WeightGoal; gender: UserProfile['gender']
  currentKg: number; targetKg?: number; kgPerWeek: number; today: string
}): GoalPreview
```

`caloriesForPace` (onboarding.ts:197) gains an optional fourth argument, `floor =
MIN_DAILY_CALORIES`. The web's call is unchanged, and mobile passes `calorieFloor(gender)`.

### 2.6 Food & routine (the owner's "Program style")

**F1 "How do you eat?"** Auto-advance, no default: one tap. No skip, because this is the answer
every surface depends on.

| Row | Detail |
| --- | --- |
| Vegetarian | No meat, fish or egg |
| Eggetarian | Vegetarian, plus eggs |
| Non-veg | Chicken, mutton, fish: some or all |
| Vegan | No meat, egg, milk, curd or ghee |
| Jain | Vegetarian, no onion, garlic or root vegetables |

**F2 "Which of these do you eat?"** (non-veg only)
- Why: "Untick anything you never eat. We'll never suggest it."
- Chips: Chicken ☑ · Mutton ☑ · Fish ☑ · Prawns & crab ☑ · Egg ☑ · Beef ☐ · Pork ☐.
- Unticked chips become `never`. Continue.

**F3 "How often do you eat non-veg?"** (non-veg only)
- Why: "So ideas match your week: no chicken every day if you don't buy it every day. Eggs don't
  count."
- Auto-advance. Options: Almost every day (7) / 4-5 days a week (5) / **2-3 days a week (3)** /
  Once a week or less (1). The option matching the F4 answer is suggested: 7 minus the number of
  veg days, rounded down to an option.

**F4 "Any days you keep veg?"** (non-veg), or **"Any days you skip eggs?"** (eggetarian)

- Why: "Many homes skip non-veg on certain days. Tap them and meal ideas stay veg on those days."
- Control: seven day chips, Monday to Sunday, multi-select.
- Once a day is picked (non-veg only), two inline segments appear under the chips. Both are part of
  the same answer ("what a veg day means at home"), so this stays one question.
  - "Egg on those days?" **[No egg]** / [Egg is fine]. Hidden when egg is in `never`.
  - "Fish on those days?" **[No fish]** / [Fish is fine]. Hidden when fish is in `never`.
    "Fish is fine" also allows prawns and crab.
- A live echo sentence built by the shared `describeVegDays(...)`:
  - "Mondays: no meat, no fish, no egg."
  - "Mondays and Thursdays: no meat or fish; egg is fine."
  - "Tuesdays: no egg." (eggetarian)
- The button reads "No such days" (`vegDays = []`) until a day is picked, then "Continue".
- Footnote: "Veg for a season, like Purattasi or Sabarimala? Or fast on some days? Tell the coach,
  or add it later in Profile › Food & diet."

**F5 "Anything you can't eat?"**
- Why: "Allergies, or foods you avoid for health. We keep them out of meal ideas. Home recipes vary,
  so always check."
- Chips: Peanuts · Cashew & other nuts · Milk & curd · Wheat (gluten) · Soy · Sesame (ellu, til) ·
  Fish · Prawns & shellfish · Egg. Chips the F1 answer already excludes are hidden.
- The button reads "Nothing" (the default) until a chip is picked.

**F6 "What's a usual breakfast for you?"**
- Why: "Your meal ideas start from this on day one."
- A grid of plates from the new shared `D:\Macro-tracker\src\data\breakfastPlates.ts`, filtered
  with the everyday rules (`checkFood(..., date: null)`, section 5). A vegetarian never sees Egg
  dosa, even here.

| Plate | Items | ~kcal |
| --- | --- | --- |
| Idli | in043 ×3 + in038 + in053 | 360 |
| Dosa | in045 ×2 + in038 + in053 | 525 |
| Pongal | in050 + in038 + in053 | 450 |
| Upma | in049 + in053 | 300 |
| Pesarattu | in137 ×2 + in053 | 420 |
| Poha | in052 | 205 |
| Chapati & curry | in001 ×2 + in065 | 355 |
| Puttu | in027 | 195 |
| Appam | in026 ×2 | 240 |
| Ragi malt | in156 | 150 |
| Oats | g003 | 165 |
| Egg dosa | in139 ×2 + in053 | 530 |
| Omelette & bread | in086 + g004 ×2 | 340 |
| Just coffee | in111 | 95 |
| I skip breakfast | (sets `skipsBreakfast`) | |

- Up to 3 can be picked. A picked tile shows its kcal and −/+ on the main item's count.
- No default. The skip falls back to the diet-filtered starters.

**F7 "When do you usually eat?"**
- Three rows: Breakfast 9:30 / Lunch 1:30 / Dinner 8:30, the `notificationPrefs` defaults (or the
  current values on a re-run). A tap opens the existing `@react-native-community/datetimepicker`,
  as `app/notifications.tsx` does.
- The breakfast row is hidden when `skipsBreakfast` is set.
- Switch: "Nudge me if I haven't logged by then", default off.
- Button: "Looks right".

**F8 "How much protein should we aim for?"** See 8.2.

### 2.7 Your plan

- **Big:** "2,169 kcal a day · 130 g protein", with a small Carbs 250 g / Fat 72 g row.
- **Lines:**
  - "This is your week-1 target. We'll tune it from your weigh-ins."
  - `describeDiet(diet, 'short')`: "Mondays stay fully veg; meal ideas follow that."
  - "First check-in: about a week from now, once you've logged a few days."
- **Optional field:** "What should the coach call you?" (the name moves here).
- **"Start tracking"** runs `finish()`. It commits everything in one pass, in this order:
  1. `updateProfile(answersToProfile(answers))`. The profile goes first, as today, because
     `addWeightEntry` reads its unit. The patch now includes `diet`, `routine` and `proteinLevel`.
  2. `addWeightEntry({ date: getTodayString(), ... })`. **Bug fix:** onboarding.tsx:433 uses
     `new Date().toISOString().slice(0, 10)`, which writes *yesterday's* date for anyone finishing
     before 05:30 IST.
  3. The Health Connect weight history import, fire-and-forget. This is the existing code at
     onboarding.tsx:447-455, kept for the unit reason explained at :407.
  4. `updateGoals({ calories, protein, carbs, fat, proteinPct, carbsPct, fatPct })` from
     `planTargets` (8.1).
  5. `useNotificationPrefs.getState().set({ breakfastTime, lunchTime, dinnerTime, meals })`. When a
     training time exists, it also sets `trainingDayTime` to the training time minus 60 minutes,
     clamped to 07:00 or later.
  6. `onboardingDraft.clear()`, then `completeOnboarding()`, then `router.replace('/(tabs)')`.

### 2.8 Path lengths

| Person | Question screens | Taps (approx.) | Time |
| --- | --- | --- | --- |
| Vegetarian on iOS, no training | 15 (B2-B6, B8, N1, G1-G3, F1, F5-F8) + Plan | ~20 | ~2 min |
| The friend (Android, Health Connect, non-veg, trains) | 20 (B1-B8, N1, G1-G3, F1-F8) + Plan | ~28 | ~3 min |

Add one checklist stop between sections (one tap each). This is in the same range as
MacroFactor's own setup, and most taps accept a prefilled answer. The length is still the first
thing to check on the friends' phones (risk 1).

### 2.9 Saving as you go

A new device-local store, `D:\macrofit-mobile\src\store\onboardingDraft.ts`. It uses zustand
`persist` on AsyncStorage under the key `macrofit-onboarding-draft`, the same pattern as
`notificationPrefs.ts`:

```ts
export interface OnboardingDraft {
  v: 1
  ownerId: string                 // useAuth().user?.id ?? 'guest'
  screen: ScreenId | 'home'
  done: SectionId[]
  phoneStep: boolean | null       // latched when Basics starts
  answers: Partial<SetupAnswers>  // shared type, see 3.1
  health?: HealthPrefill          // see 7.1, so a resume never re-queries
  startedAt: number
  updatedAt: number
}
```

- **Keyed by owner.** A draft whose `ownerId` differs from the signed-in user is discarded on
  load. So `resetStore` (useStore.ts) and `AuthProvider`, both being edited by other agents now,
  need no change. `useAuth()` is only read.
- **Nothing touches the synced profile before Finish.** A half-answered profile would trip the
  `profileWasAnswered` inference in `hydrateStore` (appState.ts:859-867) on another device, mark
  setup done, and leave that person with half-set targets.
- **Route.** `app/onboarding.tsx` stays the single route. The root layout checks
  `segments[0] === 'onboarding'` (app/_layout.tsx:377), so no folder restructure. It becomes a
  thin screen router over `src/onboarding/screens/*.tsx`.
- **Flow logic.** The pure flow logic sits in `D:\macrofit-mobile\src\onboarding\flow.ts`:
  `SECTIONS`, `visibleScreens(section, answers, env)`, `nextScreen(at, answers, env)`,
  `sectionComplete(section, answers, env)` and `firstUnanswered(...)`. It uses type-only imports,
  so Node can test it (9.3).

### 2.10 Re-running setup, and existing users

- **Profile › Setup** (the existing `resetOnboarding`, profile.tsx:1470) seeds a fresh draft from
  the current profile, diet included. A re-run is then mostly Continue taps.
- **New route `app/food-rules.tsx`** ("Food & diet") reuses the F1-F6 screen components. It has
  two modes:
  - `?walk=1` steps through F1-F6 one screen at a time, then shows the summary. The Today card uses
    this mode.
  - The default mode is a summary list. Each row opens its one screen:
    - How you eat
    - Never eat
    - Veg days
    - Veg periods (add/remove a from-to stretch)
    - Fast days (weekday chips)
    - Allergies
    - Usual breakfast
    - Training days & time
  - Writes go through `applyDietPatch` (5.1), so a whole `DietProfile` is always written.
- **Entry points:**
  - a Profile "Food & diet" row in the "Your numbers" group next to "About you" (profile.tsx:896).
    Its subtitle is `describeDiet(diet, 'short')` or "Not set";
  - the coach receipt chip's "Edit" link;
  - the Today card (3.4).

**Fixed from review**
- Training days are real weekdays plus a time (B6/B7), not a count bucket. They feed the coach
  ("trains Mon/Wed/Fri ~18:30") and seed `trainingDayTime`.
- "Notice" is the expectation screen, as in MacroFactor, not a food section.
- The Plan screen is one route, with no deep-link resume.
- The web `ACTIVITY_CHOICES` mapping is untouched, because B8 still produces an `ActivityLevel`.

---

## 3. Data model

### 3.1 Types

All in `D:\Macro-tracker\src\types\index.ts`, next to `Food` (:1) and `UserProfile` (:94).
Every new field is optional on the existing interfaces.

```ts
// ---------- What a food contains, as far as rules care ----------
export type FoodTag =
  | 'egg' | 'dairy' | 'honey'
  | 'chicken' | 'mutton' | 'beef' | 'pork'
  | 'meat'        // meat of unknown kind: sausage, salami, turkey, "non-veg thali"
  | 'fish' | 'shellfish'
  | 'root'        // onion, garlic, ginger, potato, other roots/tubers, mushroom: what Jain food leaves out
  | 'peanut' | 'tree_nut' | 'gluten' | 'soy' | 'sesame'

export interface Food {
  // ...existing fields
  /** Set only on foods outside the catalog (chat and photo estimates). Catalog foods are looked up by id. */
  diet?: FoodTag[]
}

// ---------- How a person eats ----------
export type DietBase = 'vegetarian' | 'eggetarian' | 'non_vegetarian' | 'vegan' | 'jain'
export type Animal = 'chicken' | 'mutton' | 'beef' | 'pork' | 'fish' | 'shellfish' | 'egg'
export type Allergy = 'peanut' | 'tree_nut' | 'dairy' | 'gluten' | 'soy' | 'sesame' | 'fish' | 'shellfish' | 'egg'
/** Date.getDay(): 0 = Sunday ... 6 = Saturday. The UI shows Monday first. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** A dated veg period: Purattasi, Sabarimala vratham, Lent. */
export interface VegStretch {
  from: string          // inclusive local 'YYYY-MM-DD'
  to: string            // inclusive
  eggOk: boolean        // meat and all seafood are always off in a stretch
  label?: string        // "Purattasi"
}

export interface DietProfile {
  v: 1
  /** Undefined = not stated yet (e.g. the coach heard an allergy first). Filters as non-veg; starters as veg. */
  base?: DietBase
  never: Animal[]                               // every day, on top of the base
  vegDays: Weekday[]                            // weekly days kept veg
  vegDayAllows: { egg: boolean; fish: boolean } // both false = fully veg. fish covers shellfish too
  stretches: VegStretch[]
  nonVegPerWeek?: 1 | 3 | 5 | 7                 // soft: ranks ideas, never filters. Eggs don't count
  allergies: Allergy[]
  fastDays: Weekday[]                           // no meal ideas and no meal nudges on these days
  source: 'setup' | 'profile' | 'coach'
  updatedAt: number
}

// ---------- Routine and protein ----------
export type MovementLevel = 'sitting' | 'some' | 'on_feet' | 'physical'
export type ProteinLevel = 'easy' | 'recommended' | 'high'
export interface UsualItem { foodId: string; servings: number }

export interface Routine {
  trainingDays?: Weekday[]   // [] = does not train
  trainingTime?: string      // 'HH:MM'
  movement?: MovementLevel
  usualBreakfast?: UsualItem[]
  skipsBreakfast?: boolean
}

export interface UserProfile {
  // ...existing fields
  diet?: DietProfile          // undefined = never asked (existing users, web signups)
  routine?: Routine
  proteinLevel?: ProteinLevel // undefined = never chosen; computed as 'recommended'
}
```

Shared setup answers, in `D:\Macro-tracker\src\utils\onboarding.ts`. `OnboardingAnswers` (:267)
stays as it is so the web page compiles unchanged:

```ts
export interface SetupAnswers extends OnboardingAnswers {
  diet?: DietProfile
  routine?: Routine
  proteinLevel?: ProteinLevel
  mealTimes?: { breakfast: string; lunch: string; dinner: string }  // → notificationPrefs, never the profile
  mealNudges?: boolean                                              // → notificationPrefs.meals
}
// answersToProfile(a: OnboardingAnswers & Partial<SetupAnswers>) passes diet, routine and proteinLevel through when present.
```

**Rule for the new shared modules.** `diet.ts`, `foodDiet.ts`, `targets.ts`, `breakfastPlates.ts`
and the new helpers in `onboarding.ts` use `import type` for types only, and import no module with
runtime side effects. Then Node can run them directly (9.3). The handful of existing
`import { Type }` lines on the same path change to `import type`: foodDatabase.ts:1,
indianFoods.ts:1 and calculations.ts:1. All three import only types, so this is behaviour-free.

### 3.2 Where each thing lives

| Data | Lives in | Synced? | Why |
| --- | --- | --- | --- |
| `diet`, `routine`, `proteinLevel` | `profile` (nested) | yes, via the existing `profile` key | profile is stored whole, so old clients keep nested keys |
| Meal times, nudge switch, `trainingDayTime` | `notificationPrefs` | no (device) | reminders already read them there, so there is no second copy |
| Setup draft | `onboardingDraft` store | no (device) | see 2.9 |
| Catalog food tags | `src/data/foodDiet.ts` (code) | n/a | fixing the table fixes every old diary entry |
| Tags on estimates | `Food.diet` inside `FoodEntry.food` copies | yes | the copy already travels with the entry |
| Today-card dismissed flag, last weigh-in import date | AsyncStorage keys | no | per device |

### 3.3 Sync

- **No new top-level key.** `SYNC_FIELDS` (AuthProvider.tsx:148), the `hydrateStore` list
  (appState.ts:823-830), the persist version and Supabase are all unchanged.
- **Shallow updates.** `updateProfile` is `Object.assign(state.profile, updates)` (appState.ts:298),
  which is shallow. So every diet write sends a whole object:
  `updateProfile({ diet: applyDietPatch(profile.diet, patch, source) })`. No caller may write
  `{ diet: { base } }` (risk 5).
- **Defensive reads.** Reads go through `normalizeDiet(raw): DietProfile | undefined`, which fills
  missing arrays and drops unknown enum values. `applyDietPatch` spreads the previous object, so
  fields a future version adds survive an older writer.
- **No change to `hydrateStore`.** An `updatedAt` merge was considered and rejected for now,
  because it changes shared sync semantics while other agents are editing the auth and sync path.
  The residual risk is risk 9.

### 3.4 Existing users

- **No rules until they choose.** `profile.diet === undefined` means no rules, which is exactly
  today's behaviour for ideas built from their own history. Nobody is sent back through setup, and
  `onboardedAt` is kept.
- **Veg-safe starters.** The only change they notice unprompted is that *starter* ideas (foods they
  have never logged) and the coach's staples become veg-safe until they answer (5.2, step 0). A
  non-veg newcomer sees fewer chicken starters until F1 is answered. This is intentional.
- **A dismissible Today card,** new `src/components/DietPromptCard.tsx` on `(tabs)/index`:
  - Copy: "Meal ideas can follow how you eat: veg days, eggs, no beef. 20 seconds."
  - It opens `/food-rules?walk=1`.
  - It is shown when `onboardedAt` is set, `diet` is undefined, and it has not been dismissed on
    this device.
- **Diet-like coach memory is shown, not parsed.** Coach memory is device-local (`coachStore`).
  Facts matching `/veg|egg|meat|beef|pork|chicken|fish|allerg|jain|vegan|fast/i` are shown at the
  top of the walk: "You told the coach: 'Vegetarian; eats eggs'". The user confirms by tapping the
  answers. On save, the app offers "Remove these notes from the coach's memory?", so only one
  source remains.
- **Targets stay put.** Existing targets are never recomputed automatically.

### 3.5 Old clients

| Client | Diet data | Coach | On-device surfaces |
| --- | --- | --- | --- |
| New APK, new server | read and written | `set_diet` offered; offers guarded | all filtered |
| New APK, old server (only before the deploy) | read and written | no `set_diet`, so the coach falls back to `remember`; the client re-checks offers (5.5 #9) | all filtered |
| Old APK, new server | preserved through sync (nested in profile) | **byte-identical prompt and tools**, because nothing is sent without `capabilities` | unfiltered until updated; the in-app update screen (`app/update.tsx`) prompts |
| Web (current), new server | preserved on save (nested) | unchanged (web chat sends no pack) | no diet UI (later phase) |

**Fixed from review**
- `DietBase` no longer reuses `'egg'`, so `never.includes(base)` bugs cannot happen.
- Meal times have one home.
- There is no memory regex anywhere.
- The draft needs no `resetStore` edit.
- `recalculateGoals` is not touched. The mobile Profile only calls it when `goalsOriginOf` says
  'formula' (profile.tsx:564), and pace-derived goals read as 'manual'.

---

## 4. Food diet tags

### 4.1 Table design

New file `D:\Macro-tracker\src\data\foodDiet.ts`. It has one row for **every** catalog food, in the
`INDIAN_FOOD_ALIASES` style, compact enough to review on one screen:

```ts
/** Space-separated tags. A leading '?' means "may contain": the recipe often has it, not always. */
export const FOOD_DIET: Readonly<Record<string, string>> = {
  in038: '?root',           // sambar: onion and garlic are seasoning a Jain cook leaves out
  in043: '',                // plain plant food
  in139: 'egg',
  in046: 'root ?dairy',     // masala dosa: potato filling is definite; ghee is optional
  // ...
}
// Parsed once at load into Map<string, { has: ReadonlySet<FoodTag>; may: ReadonlySet<FoodTag> }>.
```

**When "may" counts.** It is kept deliberately narrow so it cannot starve anyone's ideas (the
flaw found in the "rules" design):
- a `may` tag counts only when the app **proposes a food the person has not logged recently**
  (starters, staples, setup tiles, coach offers of non-usual foods);
- a `may` **allergy** always counts in proposals, and is labelled in search;
- a food the person logged in the last 14 days is **their** version. A Jain user's own sambar is
  fine, even though the catalog's sambar is `?root`.

### 4.2 The catalog, audited

**Size.** The catalog is **246 foods**: 86 in `BASE_FOOD_DATABASE` (foodDatabase.ts) plus 160 in
`INDIAN_FOOD_DATABASE` (indianFoods.ts). Earlier notes said "266"; that count included the 20
exercises in the same file.

**Rows with an animal tag** (44 rows). This list is what the owner should eyeball:

| Tag | Ids |
| --- | --- |
| chicken (12) | m001 Chicken breast, m008 Chicken thigh, ff005 Chipotle bowl (chicken), in022 Chicken biryani, in074 Chicken curry, in075 Butter chicken, in076 Chicken tikka, in077 Tandoori chicken, in078 Chicken 65, in099 Chicken momos, in149 Chettinad chicken, in150 Pepper chicken |
| meat, kind unknown (2) | m004 Turkey breast, ff004 Subway 6" Turkey |
| mutton (3) | in023 Mutton biryani, in079 Mutton curry, in080 Keema |
| beef (5) | m002 and m003 Ground beef, m005 Steak, ff001 Burger (plain), in151 Kerala beef fry |
| pork (2) | m006 Pork tenderloin, m007 Bacon |
| fish (7) | s001 Salmon, s002 Tuna, s004 Tilapia, s005 Cod, in081 Fish curry, in082 Fish fry, in148 Meen kuzhambu |
| shellfish (2) | s003 Shrimp, in083 Prawn curry |
| egg (10) | m009 Egg, m010 Egg whites, in084 Egg curry, in085 Egg bhurji, in086 Masala omelette, in087 Boiled egg, in132 Egg kothu parotta, in139 Egg dosa, in152 Egg roast, sw001 Banana protein pancake |
| egg + dairy + fish (1) | ff003 Caesar salad (the dressing has egg yolk, parmesan and anchovy) |

**Rows where the category misleads.** This is why category alone can never decide:
- egg filed under Meat & Poultry: m009, m010, in084-in087, in152;
- non-veg filed under Grains & Cereals: in022, in023, in139;
- non-veg filed under Fast Food: in099, in132, ff001, ff003, ff004, ff005;
- and the USDA mapper files egg under Dairy (usdaApi.ts:45).

**Ambiguous rows, and the decision taken:**

| Id | Food | Row | Why |
| --- | --- | --- | --- |
| in007, in008 | Naan, Butter naan | `gluten dairy ?egg` | many restaurant naans use egg |
| in131 | Kerala parotta | `gluten ?egg` | some recipes add egg |
| sw002 | Ice cream | `dairy ?egg` | custard bases |
| g005 | Pasta | `gluten ?egg` | fresh pasta |
| in018, in019, in052 | Lemon rice, Tamarind rice, Poha | `?peanut` (+ `?root` for the onion) | peanuts are the usual tempering |
| in101 | Murukku | `?sesame` | ellu murukku |
| in143 | Idli podi | `sesame` | |
| in100, l006, sn007 | Masala peanuts, Peanut butter, Celery with PB | `peanut` | |
| b003 | Almond milk | `tree_nut` (**not** dairy) | |
| sn004 | Hummus | `sesame` | tahini |
| sn003 | Protein bar | `dairy soy ?peanut ?tree_nut` | |
| d009, b005 | Whey, Protein shake | `dairy` | |
| in038, in039, in146, most curries and poriyals | Sambar, Rasam, Vatha kuzhambu... | `?root` | onion and garlic are seasoning that Jain cooks leave out |
| in006, in062, in066, in067, in072, in097, in088, in091, in092, in104, in157, in046, in089, in119, v003, v004, ff002, sn005 | potato, onion, carrot and sweet-potato dishes | `root` | the root *is* the dish |
| in003, in050, in122, in124, in140, in114, in115, in118, in123 | ghee- and milk-based dishes | `dairy` | |

The rest are plain rows: fruit, vegetables, dals, rice, idli and dosa batter, chutneys. Gluten goes
on wheat, maida, rava and semiya rows. Dairy goes on paneer, curd, milk, ghee, cheese and butter
rows.

### 4.3 Foods outside the catalog

`foodTags(food)` in `D:\Macro-tracker\src\utils\diet.ts` returns
`{ has, may, known: boolean }`, memoised per food object. The lookup order is:

1. **Catalog id.** `FOOD_DIET[food.id]` (or `foodId`). A catalog copy inside an old
   `FoodEntry` has the catalog id, so it is always looked up and never trusted from the copy.
2. **`food.diet`.** Set on chat and photo estimates from the model's `contains` list (6.3), and
   later on web custom foods.
3. **Name keywords.** Matched whole-token on the lower-cased name, so "eggplant" never matches
   "egg" and "chickpea" never matches "chicken". The keyword lists live in the same file:

| Tag | Words |
| --- | --- |
| egg | egg, eggs, omelette, omelet, anda, mutta, muttai, motte, guddu, mayo, mayonnaise |
| chicken | chicken, kozhi, koli, kodi, murgh, murg |
| mutton | mutton, lamb, goat, aattu, keema, kheema, gosht, boti, paya, nalli |
| beef | beef, steak, veal, pothu, hamburger |
| pork | pork, bacon, ham, pepperoni, panni |
| meat | meat, sausage, salami, turkey, duck, "non veg", nonveg |
| fish | fish, meen, machli, machhi, chepa, mathi, nethili, vanjaram, ayala, bangda, karimeen, surmai, rohu, katla, pomfret, vaval, salmon, tuna, sardine, mackerel, anchovy, cod, tilapia |
| shellfish | prawn, prawns, shrimp, eral, royyalu, chemmeen, jhinga, crab, nandu, squid, kanava, lobster, mussel, kallumakkaya, clam, oyster |
| dairy | milk, curd, thayir, perugu, mosaru, dahi, paneer, cheese, ghee, butter, cream, lassi, buttermilk, mor, raita, kheer, payasam, khoya, whey, yogurt |
| peanut | peanut, groundnut, verkadalai, chikki |
| tree_nut | almond, badam, cashew, kaju, pista, pistachio, walnut |
| gluten | wheat, atta, maida, rava, sooji, semiya, roti, chapati, naan, paratha, parotta, bread, bun, pav, puri, poori, bhatura, samosa, pasta, noodles, cake, biscuit |
| soy | soy, soya, tofu, edamame |
| sesame | sesame, ellu, til, tahini |
| root | onion, garlic, ginger, potato, aloo, carrot, beet, beetroot, radish, mullangi, yam, mushroom |
| honey | honey |

**Negators** (checked first):
- "eggless" and "egg free" cancel egg;
- "peanut butter", "almond butter" and "cocoa butter" are not dairy;
- "coconut milk", "almond milk", "soy milk" and "oat milk" are not dairy, and add their nut or soy
  tag instead.

4. **Dish words make a food unknown, not veg.** These are biryani, pulao-with-meat markers,
   kebab/kabab, shawarma, tikka, lollipop, 65, cutlet, puff(s), momo(s), roll, frankie, kothu,
   burger, pizza, sandwich and fried rice. If one appears without an animal keyword **and without
   a veg marker** (veg, vegetable, paneer, gobi, mushroom, soya, aloo, dal, plain, kuska), the food
   is **unknown**. So a photo-logged "Biryani" (category Grains) is no longer read as veg on a
   Monday.
5. **Category fallback,** only when no animal word matched:
   - Meat & Poultry gives `meat`;
   - Fish & Seafood gives `fish`;
   - Dairy gives `dairy`.
6. **Known veg.** The food is known veg (`has` empty, `known: true`) when either:
   - its category is plain (Fruits, Vegetables, Legumes, Nuts & Seeds, Oils & Fats, Beverages,
     Condiments); or
   - its name contains a curated **veg-evidence word**: idli, dosa, uttapam, pesarattu, adai,
     appam, puttu, idiyappam, paniyaram, upma, pongal, poha, sambar, rasam, kootu, poriyal, avial,
     kuzhambu (without a fish word), dal, sundal, kosambari, chapati, roti, phulka, rice, sadam,
     curd rice, thayir sadam, chole, rajma, khichdi, kichadi, payasam.
7. **Otherwise unknown** (`known: false`). This covers Custom, Snacks, Fast Food, Sweets and Grains
   names with nothing recognisable.

**Sources:**
- **USDA and Open Food Facts** rows go through steps 3-7 by name. Their category guesses are never
  read on their own.
- **Chat and photo estimates** carry the model's `contains` list.
- **Open Food Facts label data** (`ingredients_analysis_tags`, `allergens_tags`) is a
  **follow-up**, not v1. Packaged foods are only ever *searched*, and an unknown one is never
  proposed on a restricted day.

### 4.4 Checks

`D:\macrofit-mobile\scripts\check-diet.mjs` asserts the following (see 9.3 for how it runs):

- Every catalog id, read from the source text of `foodDatabase.ts` and `indianFoods.ts`, has a
  `FOOD_DIET` row, and every tag parses.
- Every `Meat & Poultry` and `Fish & Seafood` row carries an animal or egg tag.
- **The lexicon agrees with the table.** Running steps 3-7 on every catalog name and every
  `INDIAN_FOOD_ALIASES` entry gives the same meat, fish, shellfish and egg flags as the table, or
  `unknown`. It never gives "veg" for a row the table calls non-veg. The audited table is the
  lexicon's test set.
- A one-off `node scripts/print-food-diet.mjs` prints the 44 animal rows and the ambiguous rows for
  the owner to eyeball, which takes about 10 minutes.

---

## 5. Enforcement

### 5.1 The shared module

`D:\Macro-tracker\src\utils\diet.ts` is pure and synchronous, with no React and no I/O. It syncs to
mobile `src/core/utils/diet.ts`, and the API imports it as `'../src/utils/diet'`, the same way
`_catalog.ts` imports the food database.

```ts
export type Purpose = 'suggest' | 'search'

export interface DietFood { id?: string; foodId?: string; name: string; category: FoodCategory; diet?: readonly FoodTag[] }

export type DietVerdict =
  | { ok: true; overBudget?: boolean; note?: string }        // note: "May have peanuts" in search
  | { ok: false; reason: 'allergy' | 'never' | 'base' | 'day' | 'fast' | 'unknown'; label: string }

export function checkFood(
  food: DietFood,
  diet: DietProfile | undefined,
  /** The local 'YYYY-MM-DD' the food would be EATEN on. null = everyday rules only (setup tiles, protein examples). */
  date: string | null,
  opts: {
    purpose: Purpose
    /** Logged by this person in the last 14 days: their own version, so 'may' tags are ignored. */
    familiar?: boolean
    /** Distinct non-veg days in the 6 days before `date`, and whether `date` already has one. */
    nonVeg?: { daysBefore: number; today: boolean }
  },
): DietVerdict

export const isAllowed = (food: DietFood, diet: DietProfile | undefined, date: string | null, purpose: Purpose = 'suggest'): boolean =>
  checkFood(food, diet, date, { purpose }).ok

export const weekdayOf = (date: string): Weekday          // [y,m,d] = split → new Date(y, m-1, d).getDay(); never new Date(string)
export function ruleFor(diet: DietProfile | undefined, date: string | null): DayRule   // memoised per (diet object, date)
export function isFastDay(diet: DietProfile | undefined, date: string): boolean
export function forStarters(diet: DietProfile | undefined): DietProfile               // diet ?? STARTER_SAFE_DIET; base ?? 'vegetarian'
export const STARTER_SAFE_DIET: DietProfile                                           // base 'vegetarian', nothing else
export function foodTags(food: DietFood): { has: ReadonlySet<FoodTag>; may: ReadonlySet<FoodTag>; known: boolean }
export function nonVegDays(diary: Record<string, DiaryDay>, date: string): { daysBefore: number; today: boolean }
export function rankForDiet<T>(items: T[], food: (t: T) => DietFood, diet: DietProfile | undefined, date: string): { item: T; verdict: DietVerdict }[]  // stable, allowed first
export function describeDiet(diet: DietProfile | undefined, form: 'short' | 'long'): string   // "Non-veg, never beef or pork · Mondays fully veg"
export function describeDay(diet: DietProfile | undefined, date: string): string | null       // "Monday: veg day (no meat, fish or egg)" | null
export function describeVegDays(days: Weekday[], allows: { egg: boolean; fish: boolean }, base: DietBase): string
export function normalizeDiet(raw: unknown): DietProfile | undefined
export function applyDietPatch(prev: DietProfile | undefined, patch: DietPatch, source: DietProfile['source'], now?: number): DietProfile
export function isLooser(prev: DietProfile | undefined, next: DietProfile): boolean
export function parseDietPatch(raw: unknown, today: string): DietPatch | null            // validates set_diet input

export interface DietPatch {
  base?: DietBase
  neverAdd?: Animal[]; neverRemove?: Animal[]
  vegDays?: Weekday[]                                  // the full new list
  vegDayAllows?: Partial<{ egg: boolean; fish: boolean }>
  addStretch?: VegStretch; clearStretches?: boolean
  allergiesAdd?: Allergy[]; allergiesRemove?: Allergy[]
  nonVegPerWeek?: 1 | 3 | 5 | 7 | null
  fastDays?: Weekday[]                                 // the full new list
}
```

### 5.2 Semantics

`checkFood` evaluates these steps in order. The first failure wins, and its label is what the UI
shows:

0. **No diet.** `diet === undefined` gives `ok`. This is today's behaviour for foods from the
   person's own history. Callers that propose foods the person has **never logged** pass
   `forStarters(diet)` instead: starters, coach staples and the setup tiles when the diet is
   unset. So nobody who hasn't answered is offered chicken or egg.
1. **Tags.** `t = foodTags(food)`. `may` counts only when `purpose === 'suggest' && !familiar`,
   except for allergies (step 2).
2. **Allergy.** Any `has` tag, or in suggest mode any `may` tag, in `allergies` gives
   `{reason:'allergy', label:'Has peanuts'}`. In search mode a `may` hit is `ok` with
   `note: 'May have peanuts'`.
3. **Never.** Any tag in `never` fails with "You don't eat beef". The generic `meat` tag also
   fails whenever `never` holds any of chicken, mutton, beef or pork, because an unknown meat could
   be the one they avoid.
4. **Base.** The excluded groups are:

   | Base | Excluded |
   | --- | --- |
   | vegetarian | meat, fish, egg |
   | eggetarian | meat, fish |
   | vegan | meat, fish, egg, dairy, honey |
   | jain | meat, fish, egg, root, honey |
   | non-veg (or base unset) | nothing |

   Here meat means chicken, mutton, beef, pork and meat, and fish means fish and shellfish. The
   labels are "Has egg", "Not vegetarian", "Has dairy", "Has onion or roots".
5. **Day rule.** Rules only ever *add* exclusions: the day's excluded set is the union of the base
   and the day. `weekdayOf` builds the local calendar date from the string, so it gives the same
   answer on a phone in IST and on Vercel in UTC.
   - A stretch covering `date` excludes meat and fish, plus egg unless `eggOk`. Label: "Veg for
     Purattasi (till 17 Oct)".
   - Otherwise, when `weekdayOf(date)` is in `vegDays`, the day excludes meat, fish unless
     `vegDayAllows.fish`, and egg unless `vegDayAllows.egg`. Label: "Not on Mondays".
   - `date === null` skips this step.
6. **Unknown food on a tightened day.** In suggest mode, when the day's rule excludes more than the
   base does and `t.known === false`, the food fails with "Not sure what's in this".
   - This applies only on *tightened* days. A vegetarian's own unrecognised home dishes stay in
     their everyday ideas, because their history is veg by construction. This fixes the flaw
     found in both the "user" and "rules" designs.
   - The friend's custom "Special thali" is kept out of Monday ideas only.
7. **Fast day.** In suggest mode, `weekdayOf(date)` in `fastDays` fails with "Fast day".
8. **Soft non-veg budget.** In suggest mode, all of these must hold: `nonVegPerWeek` is set, the
   food has meat or fish (egg doesn't count), `nonVeg.daysBefore >= nonVegPerWeek`, and today has
   no non-veg yet. Then the result is `{ ok: true, overBudget: true }`. Callers skip it in starters
   and rank it down in history (−20 score). It never filters, so a light logger who never trips it
   loses nothing.

### 5.3 Examples (these are the test cases in 9.3)

The friend's diet is `{ base:'non_vegetarian', never:['beef','pork'], vegDays:[1],
vegDayAllows:{egg:false, fish:false}, nonVegPerWeek:3 }`:

| Food | Mon 28 Sep, suggest | Tue 29 Sep, suggest | Mon 28 Sep, search |
| --- | --- | --- | --- |
| in139 Egg dosa | ✗ Not on Mondays | ✓ | ✓ ranked last, "Not on Mondays" |
| in087 Boiled egg | ✗ Not on Mondays | ✓ | label |
| in074 Chicken curry | ✗ Not on Mondays | ✓ (overBudget after 3 non-veg days) | label |
| in081 Fish curry | ✗ Not on Mondays | ✓ | label |
| in151 Kerala beef fry | ✗ You don't eat beef | ✗ You don't eat beef | label every day |
| in043 Idli | ✓ | ✓ | ✓ |
| custom "Special thali" (Custom, no keyword) | ✗ Not sure what's in this | ✓ | ✓ |
| photo "Biryani" (Grains) | ✗ unknown (dish word) | ✓ | ✓ |
| photo "Veg biryani" | ✓ | ✓ | ✓ |

Other cases:
- **Vegetarian.**
  - in007 Naan as a starter or staple: ✗ ("?egg" counts for an unfamiliar food).
  - Naan from their own history: ✓.
- **Jain.**
  - in046 Masala dosa: ✗ (potato, definite).
  - in038 Sambar from their own history: ✓.
  - Sambar as a starter: ✗.
- **Peanut allergy.**
  - in019 Tamarind rice: ✗ in suggest; ✓ in search with "May have peanuts".
- **Stretch.**
  - Purattasi `{from:'2026-09-17', to:'2026-10-17', eggOk:false}`: egg dosa is ✗ on Wed 30 Sep and
    ✓ on 18 Oct.
- **Diet undefined.**
  - Egg dosa from the person's own history: ✓.
  - Egg dosa as a starter (`forStarters`): ✗.

### 5.4 Policy, the same everywhere

| What the app does | Rule |
| --- | --- |
| **Proposes** food: ideas, reminders, coach offers, opener, staples, setup tiles | `purpose: 'suggest'`: disallowed foods are **dropped** |
| **Browses** the catalog with an empty query ("Food database") | disallowed foods are **hidden** (they were never asked for) |
| **Searches**: typed query, recents, your foods, templates | **ranked** allowed-first (stable) and **labelled**, never hidden |
| **Logs**: search, chat `log_food`, photo, templates, next-meal "Log" | **never blocked**; an allergy hit shows one line on the serving step ("Has peanuts: you listed a peanut allergy") |

### 5.5 Every surface

`diet` is a **required key** in the options of every suggesting function (`{ diet: DietProfile |
undefined, ... }`), so `tsc` lists every caller that forgets it.

| # | Surface | File | Mode | Change |
| --- | --- | --- | --- | --- |
| 1 | Next-meal engine | `src/lib/nextMeal.ts` (:60, :91, :119, :167, :202) | suggest | See the list below |
| 2 | Today card | `src/components/NextMealCard.tsx` (:41) | suggest | See the list below |
| 3 | Coach opener | `src/lib/coachOpener.ts` (:25, :33, :54) | suggest | `buildOpener({ ..., diet, routine })`; adds the one clause "Monday: veg day." before the idea; also uses `input.now` for "today" instead of `getTodayString()` (:33) |
| 4 | Coach pack | `src/lib/coachContext.ts` (:108-119, :156, :185-209) | suggest | See the list below |
| 5 | Reminders | `src/lib/reminderPlan.ts` (:48-59, :194-219) | suggest | See the list below |
| 6 | Reminder scheduler | `src/hooks/useNotifications.ts` (:85, :104-112) | | Passes `profile.diet` and `profile.routine`; the subscribe check adds `next.profile !== prev.profile`, so a rule change re-plans the queued week |
| 7 | Food search | `app/food-search.tsx` (:427-611) | browse / search | See the list below |
| 8 | Diary templates | `app/(tabs)/diary.tsx` (:520-575) | search | A template whose entries fail for the viewed date shows the first label ("Egg · Monday") under its kcal line; still tappable |
| 9 | Chat | `app/chat.tsx` (:308, :466-476) | suggest | Passes diet to `buildOpener`; see the list below; `set_diet` handling (6.5) |
| 10 | Setup tiles and protein examples | `src/onboarding/screens/*` | suggest, `date: null` | Filtered with everyday rules |
| 11 | Coach staples | `api/_catalog.ts` (:26, :52) | suggest | See the list below |
| 12 | Coach offers | `api/_coach.ts` (:318) + `api/chat.ts` (:117-160) | suggest | See 6.4 |
| 13 | USUAL FOODS in the prompt | `api/_coach.ts` (:527) | | Rows failing today are kept (the model needs them to log) but marked "(not today: veg day)" |
| — | `log_food`, photo, manual add | | | **Never blocked.** Tags are attached (6.3) |

**1. Next-meal engine** (`src/lib/nextMeal.ts`):
- New signature: `suggestNextMeal(diary, goals, now, opts: { diet; routine?; offset? })`.
- It returns `null` on a fast day.
- It checks each history candidate with `familiar: true` **before** the `atThisMeal.length >= 2`
  decision at :202, so a Monday whose breakfast history is all egg still falls back to starters.
  That was the placement flaw found in the "mvp" design.
- Starters go through `forStarters(diet)`. Starters and usual-breakfast items that are overBudget
  are skipped.
- `score()` subtracts 20 for overBudget history items.
- `routine.usualBreakfast` seeds the Breakfast pool when there are fewer than 2 history items at
  that meal.
- `skipsBreakfast` drops the Breakfast slot.
- `in057` Palak paneer is added to the Lunch and Dinner `STARTERS`, so vegetarians get a protein.

**2. Today card** (`src/components/NextMealCard.tsx`):
- Passes `profile.diet` and `profile.routine`.
- The memo gains a `dayPart` key from a new `src/hooks/useDayPart.ts`. It returns
  `${getTodayString()}:${slotIndex}` and is refreshed on foreground and every 60 s. So a card
  computed on Sunday night is not still showing on Monday morning, which was a gap found in all
  three designs.
- The subtitle reads "Breakfast idea · veg day" when `describeDay` is non-null.

**4. Coach pack** (`src/lib/coachContext.ts`):
- `suggestNextMeal(..., { diet, routine })`.
- `usualFoods` rows gain `allowedToday: boolean` and `label?`.
- The pack gains the fields listed in 6.1.

**5. Reminders** (`src/lib/reminderPlan.ts`):
- `PlanInput` gains `diet` and `routine`.
- :204 calls `suggestNextMeal(diary, goals, when, { diet, routine })`. `when` is the *future* slot
  time, so Saturday's plan for Monday uses Monday's rule.
- Meal nudges are skipped on fast days. The breakfast nudge is skipped when `skipsBreakfast` is
  set.

**7. Food search** (`app/food-search.tsx`):
- One `dayDiet` is built from the `date` param (:429).
- With an empty query, "Food database" (:552) hides disallowed foods.
- Recent (:523-534), Your foods (:509) and typed Matches (:521), plus the remote rows (:479-500),
  go through `rankForDiet`.
- `FoodRow` (:318) gets an optional `note` shown in the meta line in muted-warning tone ("Not on
  Mondays", "Has egg", "May have peanuts").
- The serving step shows the allergy line.

**9. Chat** (`app/chat.tsx`): the client re-checks server offer items for the offer's date. If any
item fails, the whole card is dropped and the line "I left out Egg dosa: not on Mondays." is
appended. This covers a new APK talking to an old server.

**11. Coach staples** (`api/_catalog.ts`): `catalogFor(message, usualIds, allowStaple, limit)`
takes a required `allowStaple: ((f: Food) => boolean) | null`.
- It is applied to `STAPLE_IDS` only. It is **never applied to foods the user named**, so "I ate
  chicken biryani" on a Monday still resolves to in022, and it is never applied to their usual
  ids.
- The server passes `null` unless the pack has the `diet` capability, so old clients get
  byte-identical output.
- With the capability, a staple must be allowed today **or** tomorrow, under
  `forStarters(pack.diet)`.

**Fixed from review**
- Unknown foods no longer pass on veg days (they are blocked when proposed on tightened days only).
- Never-asked users no longer get chicken starters.
- The history filter sits before the fallback decision.
- The card refreshes across midnight.
- Proposals, browsing and search each have their own rule instead of one "sort last" for
  everything.

---

## 6. Coach

### 6.1 Pack and capability gating

`CoachPack` gains these fields, in `api/_coach.ts` (:49) and in the mobile `CoachPack`
(`src/lib/api.ts` :105, which is being edited by another agent now, so this lands after theirs):

```ts
capabilities?: ('diet' | 'set_diet')[]   // new clients send both
diet?: DietProfile | null                // null = capable client, not set yet
today?: string                           // client-local 'YYYY-MM-DD'
tomorrow?: string
nonVegDays?: number                      // distinct days with meat/fish in the last 7
routine?: { trainingDays?: string; trainingTime?: string; usualBreakfast?: string }  // pre-rendered, "Mon, Wed, Fri"
protein?: { level: ProteinLevel; gPerKg: number; grams: number }
```

- **Old clients are untouched.** Everything below happens only when
  `pack.capabilities?.includes(...)`. Old APKs and the web send no capabilities and get today's
  prompt and tools **byte for byte**. This is verified by a snapshot (9.2 A5).
- **The server never uses its own clock for a weekday.** Vercel runs in UTC, 5.5 hours behind
  IST. If `today` is missing, no day rule is applied.

### 6.2 Prompt changes (`buildCoachPrompt`, `api/_coach.ts` :445)

**With the `diet` capability**, a FOOD RULES block goes above MEMORY. It is built by
`describeDiet`, `describeDay` and `nonVegDays`, and it replaces the hint "respect it, e.g. never
offer meat to a vegetarian" at :504:

```
FOOD RULES (the app enforces these; an offer that breaks them is refused)
  Eats: chicken, mutton, fish, prawns, egg. Never: beef, pork.
  Non-veg about 2-3 days a week; had it on 2 of the last 7 days.
  Weekly veg day: Monday (no meat, fish or egg).
  Allergies: none. Fast days: none.
  Usual breakfast: Idli x3, Sambar, Coconut chutney.
  TODAY Mon 28 Sep: VEG DAY (no meat, fish or egg).
  TOMORROW Tue 29 Sep: normal.
```

- Today and tomorrow are spelled out, so the model never works out a weekday itself.
- When `diet` is null: "FOOD RULES: not set yet. Before offering meat or egg, ask how they eat and
  save the answer with set_diet. If MEMORY states their diet, follow it and ask once whether to
  save it as food rules."

**Other prompt edits:**
- The PROFILE line gains "Trains Mon, Wed, Fri around 18:30 · protein target 130 g (1.8 g/kg)".
- HOW TO ACT rule 4 (:537) becomes: "...favouring USUAL FOODS and respecting FOOD RULES for the
  day the meal is for (use for_day 'tomorrow' for tomorrow's meals)."
- Rule 5 (:538) becomes: "Diet facts (veg days, stopped eggs, no beef, an allergy, veg for
  Purattasi/Sabarimala/Lent, fast days) → set_diet, not remember. Other lasting facts → remember.
  Logging is never restricted: if they ate chicken on a veg day, log it with no comment. FOOD
  RULES outrank MEMORY on diet."
- The `remember` description (:234) changes from "diet (vegetarian, eggetarian, no beef),
  allergies, ..." to "dislikes, routine, household cooking. Diet rules and allergies go to
  set_diet." This change only applies when `set_diet` is offered: the description is built per
  request.
- The check-in line (:483) "Keep protein at 1.6-2.2 g per kg" becomes "Keep protein near their
  target (PROFILE). For vegetarians don't push above it; raise it with their own foods (dal,
  sundal, curd, paneer, pesarattu, milk). Lower protein on veg days is expected; judge the weekly
  average."

### 6.3 Tools

**New `set_diet`.** It is offered only when `capabilities` includes `'set_diet'`; otherwise an old
APK would drop the action while the model said "saved". `api/chat.ts:102` changes
`tools: COACH_TOOLS` to `tools: toolsFor(context)`.

```
set_diet: "Update the user's FOOD RULES when they state a LASTING diet fact: veg/eggetarian/
non-veg/vegan/Jain, what they never eat, days without non-veg or egg ('no meat or even egg on
Mondays'), whether fish is fine on those days, a veg period with dates, how often they eat
non-veg, allergies, fast days. Not for one-off events ('didn't have chicken today'). Send only
what changed."
properties (all optional):
  base: enum [vegetarian, eggetarian, non_vegetarian, vegan, jain]
  never_add, never_remove: enum[] [chicken, mutton, beef, pork, fish, shellfish, egg]
  veg_days: enum[] [mon..sun]            // the FULL new list; names, not numbers
  veg_day_egg_ok, veg_day_fish_ok: boolean
  stretch: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', egg_ok: boolean, label: string }
  clear_stretches: boolean
  allergies_add, allergies_remove: enum[] [peanut, tree_nut, dairy, gluten, soy, sesame, fish, shellfish, egg]
  non_veg_per_week: enum [1, 3, 5, 7]
  fast_days: enum[] [mon..sun]           // the FULL new list
```

`resolveAction('set_diet')` works like this:
- `parseDietPatch(input, pack.today)` validates every enum.
- A stretch must have `from ≤ to`, `to ≥ today`, and span at most 120 days.
- `next = applyDietPatch(pack.diet, patch, 'coach')`. When nothing changed it is refused with
  "nothing changed".
- Otherwise it returns
  `{ tool:'set_diet', input:{ patch, summary: describeDiet(next,'long'), looser: isLooser(pack.diet, next) } }`.
- `describeAction` gives "Saved food rule: Mondays: no meat, fish or egg." or, when looser,
  "Shown as a card with Save, NOT saved yet: allow egg on Mondays."

**`isLooser` returns true when any of these holds:**
- the base moves toward non-veg;
- an item leaves `never` or `allergies`;
- a veg day or fast day is removed;
- `vegDayAllows` flips to true;
- a stretch is cleared or shortened.

`nonVegPerWeek` changes are never "looser", because the rule is soft. The first rules for someone
with none are always tightening.

**`offer_meal`** gains an optional `for_day: 'today' | 'tomorrow'` (default today).
- The client card shows "Tomorrow's breakfast" and its Log button logs to tomorrow's date.
- `MealOffer` gains `date?: string`.

**`log_food`** gains an optional `contains` (enum[] of `FoodTag`, with `[]` meaning plain plant
food). It is used only without `food_id`.
- `fromEstimate` (`api/_catalog.ts` :142) sets
  `diet = union(inferred from name, contains)` on the `LoggableFood`.
- The photo prompt (`api/_photo.ts`) gains the same field.
- The mobile parser keeps `diet` when every tag is valid, and `analyzedFood.ts` copies it onto the
  `Food`.

### 6.4 Server guard

- **Running diet** (`api/chat.ts` :117-133). The tool calls are resolved in order.
  - After a `set_diet` that is **not looser**, `context.coach.diet = next` before the next call is
    resolved. So "No egg on Mondays. What should I have now?" is guarded in the same turn.
  - A looser change is not adopted, because it is not saved until the user taps.
- **Offer check.** A new `dietRefusal(name, input, context): string | null` in `_coach.ts` runs
  before `resolveAction` for `offer_meal`. That keeps `resolveAction`'s signature.
  - Every item is checked with `checkFood(item, pack.diet, day, { purpose:'suggest', familiar:
    usualIds.has(id) })`, where day is `pack.today` or `pack.tomorrow` according to `for_day`.
  - **Any** failure refuses the **whole** offer, because a plate with its main removed is not a
    plate. The refusal text is specific: "Refused: Egg dosa breaks their food rule (Monday is
    fully veg). Offer a veg meal." It replaces the generic `REFUSED` (:426) for this case.
  - The guard runs only with the `diet` capability, and does nothing when `pack.diet` is null.
- **Retry without a third model call.** `chat.ts` already makes a second (summary) call whenever
  anything was refused, because `refused > 0` closes the one-call shortcut at :143. That also
  covers the "mvp" judges' point that the model's own text must not describe a denied egg.
  - When the **only** refusals were diet refusals, that same summary call is given
    `tools: [OFFER_MEAL]` and `max_tokens: 700`.
  - If it returns an `offer_meal`, the offer goes through the same guard. When it passes, it is
    added to `actions`.
  - If the call returns a tool call with no text, the reply is a server template: "Monday is a veg
    day for you, so here's a veg idea instead:".
  - The total stays at two model calls inside the 25 s edge budget. The latency concern the judges
    raised about the "user" design's third call is gone.
- **What the guard never touches:**
  - `log_food` is never refused for diet. An allergy hit only adds "note: contains peanut, which
    they listed as an allergy" to `describeAction`, so the reply can mention it once.
  - `propose_targets` is unchanged, including its protein floor of ≥ 30 g.
  - `calorieFloor` moves to shared `targets.ts`, and `_coach.ts` re-exports it (8.3).

### 6.5 Client handling (`app/chat.tsx`, beside :469)

- **Tightening** (`looser: false`): `updateProfile({ diet: applyDietPatch(current, patch, 'coach')
  })` is applied at once. The patch is re-applied to the *current* diet rather than trusting the
  server's copy, in case it changed. The reply shows a chip, "Food rule saved: Mondays fully veg ·
  Undo · Edit". Undo restores the saved `previous` with a new `updatedAt`, and Edit opens
  `/food-rules`.
- **Loosening** (`looser: true`): a card like `TargetProposal` shows the summary and a **Save**
  button.
- `coachStore` `ChatEntry` gains
  `dietChange?: { patch: DietPatch; summary: string; looser: boolean; previous?: DietProfile; appliedAt?: number }`.
- `src/lib/api.ts` `ChatAction` gains `{ tool: 'set_diet'; input: { patch; summary; looser } }`,
  and `parseChatAction` (:591) gains a case that validates with the shared `parseDietPatch`. This
  is about 8 lines, landed after the current `api.ts` work.

### 6.6 Evals (`D:\Macro-tracker\scripts\eval-coach.ts`)

Six new scenarios, each checking what the coach *did*:

1. On Monday 28 Sep, the friend asks "what for dinner?". The offer has no meat, fish or egg.
2. On Sunday night: "breakfast tomorrow?". The offer is for tomorrow and has no egg.
3. "I stopped eating eggs" is applied as a tightening.
4. "I eat beef now" is looser, so it comes back as a card.
5. "Veg for Purattasi till 17 Oct" creates a stretch.
6. "Had chicken biryani" on a Monday is logged as in022 with no lecture.

The existing "veg" scenario stays.

**Fixed from review**
- There is now a server-side running diet (a flaw in the "user" design).
- `for_day` closes the Sunday-night hole found in all three designs.
- Offers are refused whole and retried, not trimmed.
- There is no third model call.
- Old clients see no prompt change, including the "not set yet" line.
- There is no model-driven or regex memory migration.

---

## 7. Health Connect

### 7.1 At setup (screen B1)

B1 uses one permission sheet (the existing `health.connect()`). On a grant, the reads run in
parallel behind one spinner, targeting under 2 s. The results are collected into a `HealthPrefill`
stored in the draft:

```ts
export interface HealthPrefill {
  readAt: number
  heightCm: number | null
  weight: { kg: number; date: string } | null
  weighIns: number                 // days not already in weightLog
  weighInsSince: string | null
  weighInSpanDays: number          // for the N1 conditional line
  stepAvg: number | null           // 28 days, days > 500 steps, today excluded; null under 7 days
  stepDays: number
  training: { days: Weekday[]; time: string | null; sessions: number } | null
  allowed: { height: boolean; weight: boolean; history: boolean; steps: boolean; exercise: boolean }
}
```

| Read | Function | Notes |
| --- | --- | --- |
| Height | `readLatestHeightCm` (healthConnect.ts:425) | existing |
| Weight + date | **new** `readLatestWeight(): Promise<{ kg; date } \| null>` | A new function rather than a change to `readLatestWeightKg` (:446), whose callers in `useHealthSync` stay untouched |
| Weigh-in count | `readWeightHistory` (:554) | Only counted here. It is written in `finish()`, as today, for the unit reason at onboarding.tsx:407 |
| Steps | `readSteps(28)` (:333) | Averages days with more than 500 steps (a zero day means the phone wasn't carried). Needs at least 7 days before a movement band is suggested |
| Workouts | **new** `readExerciseSessions(days = 28)` | Returns `{ start, end }[]` of sessions of 15 minutes or more. It **drops MacroFit's own writes** (`metadata.clientRecordId` starting `macrofit-workout-`, or `metadata.dataOrigin` equal to our application id), otherwise `writeExerciseSession` output would come back as "your training" |

`trainingPatternFrom(sessions)` is a pure helper in shared `onboarding.ts`. It returns the weekdays
with 2 or more sessions in the 4 weeks and the median start time, rounded to 30 minutes. It
prefills B6 and B7.

**Permission change.** In `src/lib/healthPermissions.js` (:101), `ExerciseSession` goes from
`'write'` to `'readwrite'` (still optional tier).
- `HealthGrants` gains `readExercise` (plus `NO_GRANTS`, `getGrants` and `missingGrantLabels`),
  and it is **not** part of `isFullyGranted`.
- The manifest is regenerated at prebuild, so this needs the new APK.
- The build is sideloaded, so there is no Play Console health-permission declaration to update.
- If the grant is refused, only the B6/B7 prefill is lost.

### 7.2 On app open

1. **New weigh-ins.** Once per calendar day, on foreground, when `readWeight` is granted,
   `useHealthSync` runs `readWeightHistory(profile, 14)`.
   - It adds days not already in `weightLog`, and days the user logged themselves always win (the
     existing rule at useHealthSync.ts:237-247).
   - MacroFit's own writes come back with the same dates and are skipped by that rule.
   - The last run date is a device-local AsyncStorage key.
   - This makes a smart scale "just work" after setup instead of needing the Profile import button.
2. **Steps**, which already refresh on foreground (`probe`, :160-199). No change.
3. **No workout import** on open (see 7.3).

### 7.3 Deliberately not done

- **Importing Health Connect workouts into the log.** `countsAsWorkout` (trainingStats.ts:16)
  needs completed sets, so imported sessions would sit as empty workouts. Importing them as
  `DiaryDay.exercises` with calories would raise the web budget: `netCalories = calories −
  caloriesBurned` (calculations.ts:98), counted twice against the activity multiplier. v1 uses
  workouts only to prefill training days and time. This is owner question 2.
- **Steps or burned calories in the daily target.** Steps reach the estimate once, through the B8
  movement band the user confirms. The weight-trend calibration absorbs real activity after that.
  A target that moves every day confuses exactly these users.
- **Sleep**, which nothing would use, and every extra switch in the Health Connect sheet lowers how
  much people grant.

---

## 8. Protein targets

### 8.1 Shared maths: new `D:\Macro-tracker\src\utils\targets.ts`

```ts
export const calorieFloor = (gender: string | undefined): number => (gender === 'female' ? 1200 : 1500)  // moved from api/_coach.ts:277
export const referenceKg = (weightKg: number, heightCm: number): number                              // min(weight, 25 × (height/100)²)
export const proteinFor = (i: {
  weightKg: number; heightCm: number; goal: WeightGoal; base: DietBase | undefined
  level: ProteinLevel | undefined; trainingDays: number
}): { gPerKg: number; grams: number; refKg: number }                                                  // grams rounded to 5
export const planTargets = (i: {
  tdee: number; goal: WeightGoal; kgPerWeek: number | undefined; gender: UserProfile['gender']
  weightKg: number; heightCm: number; base: DietBase | undefined; level: ProteinLevel | undefined; trainingDays: number
}): Pick<MacroGoals, 'calories' | 'protein' | 'carbs' | 'fat' | 'proteinPct' | 'carbsPct' | 'fatPct'>
```

**Protein, in grams per kg of reference weight** (`referenceKg` caps a heavy user at the BMI-25
weight, so a 100 kg, 175 cm person is computed at 76.6 kg):

| Base | Easy | Recommended | High |
| --- | --- | --- | --- |
| non-veg, or base not set | 1.2 | 1.6 | 2.0 |
| eggetarian | 1.2 | 1.5 | 2.0 |
| vegetarian, Jain, vegan | 1.2 | 1.4 | 1.8 |

- **Recommended** gets +0.2 on a cut with 3 or more training days, capped at 2.0.
- **Easy** is 1.2, not the "user" design's 1.0. That was thin for a cut, and 1.2 is still well
  above ICMR's ~0.83.
- **The rest of the plan:**
  - Calories are `caloriesForPace(tdee, goal, kgPerWeek, calorieFloor(gender))`.
  - Fat is `max(0.6 g × refKg, 30% of kcal)`, because Indian cooking oil and coconut make 25%
    unrealistic.
  - Protein is capped at 40% of kcal, and carbs take the remainder.
  - The `*Pct` fields are recomputed from the grams, so screens that read percentages agree.

**Worked examples:**
- **The friend** (72 kg, 170 cm, non-veg, cut, 3 training days): 1.8 × 72 = **130 g**. Calories
  2,169 (TDEE 2,554 minus 385), fat 72 g (30% of kcal beats 0.6 × 72 = 43 g), carbs 250 g.
- **A 60 kg vegetarian woman** (30, 160 cm, "some walking", no training, cut at 0.30 kg/week):
  1.4 × 60 = **85 g**. Today's setup (onboarding.tsx:334) gives protein as 30% of her 1,442 kcal,
  which is 108 g (1.8 g/kg). That is not realistic from dal, curd and paneer.

### 8.2 Screen F8, "How much protein should we aim for?"

Why: "Protein keeps you full and protects muscle while you lose fat. More only helps if you can
actually eat it."

The rows show live grams. These are the figures for the 60 kg vegetarian:

- "Easy · 70 g": "Close to what you eat now. A fine start."
- **"Recommended · 85 g"** (preselected): "Add curd, dal or paneer to one more meal."
- "High · 110 g": "For serious gym training. Needs paneer, soya or whey most days."

Below the rows: **"What 85 g looks like for you:"**. The chips are computed from catalog rows that
pass `checkFood(..., date: null)` for their diet, never typed by hand:
- Pesarattu ×2 · 16 g
- Curd 1 katori · 5 g
- Paneer 100 g · 18 g
- Sundal 1 katori · 7 g
- Moong dal 1 katori · 8.5 g
- Toned milk 1 glass · 6.4 g

Under the chips: "Together about 60 g; rice, chapati and sambar through the day make up the
rest." Non-veg users also see Boiled egg · 6.3 g and Chicken curry 1 katori · 21 g.

The screen stores `profile.proteinLevel`. The grams go into `goals.protein` through `planTargets`.

### 8.3 Engine changes

| File | Change |
| --- | --- |
| `src/utils/targets.ts` (new) | As above |
| `api/_coach.ts` :277 | `calorieFloor` imported from `targets.ts` and re-exported, so no other import changes |
| `src/utils/onboarding.ts` | `caloriesForPace(..., floor = MIN_DAILY_CALORIES)`. Mobile passes `calorieFloor(gender)`, so setup can no longer give a man the 1,200 kcal target the coach would refuse to propose. The web call is unchanged |
| `src/utils/tdee.ts` :171 | `export const TDEE_CONFIDENCE_DAYS = { low: 10, medium: 14, high: 21 } as const` replaces the inline numbers, and `MIN_WEIGHT_SPAN_DAYS` is exported. `expectationFor` reads both, so the N1 copy cannot drift from the maths |
| `src/utils/localRecommendation.ts` :99 | `LocalRecInput` gains `proteinG?: number`, which overrides `weight × config.proteinGPerKg` and the rationale text ("protein at your chosen 130 g a day"). **`PHASE_CONFIG` is unchanged**, so web recommendations do not move |
| mobile `app/(tabs)/index.tsx` :530, `src/hooks/useCoach.ts` :304 | Pass `proteinG: proteinFor({ ...profile, level: profile.proteinLevel }).grams` |
| `src/utils/coachAlerts.ts` :50, :295-310 | `low_protein` fires when the average is below `min(0.8 × goals.protein, 1.6 × refKg)`. It is never stricter than today, and it stops nagging a vegetarian on a deliberate 85 g target |
| `api/_coach.ts` :483 | Check-in line as in 6.2 |

`recalculateGoals` (appState.ts:311) and the web Profile save are **not** changed.

### 8.4 Existing users

Nothing is recomputed. A new protein number reaches them only when they re-run setup, accept a
coach plan (which uses `proteinFor` on mobile), or accept a check-in proposal.

---

## 9. Build plan

### 9.1 Order and releases

1. **Web repo:** the shared core and the server. Deploy to Vercel. This is safe for every client,
   because everything is gated on the pack's `capabilities`.
2. **APK 1, "food rules everywhere",** about day 7. It covers all the enforcement, the coach
   client, the Food & diet page, the Today card, and the Profile row. The friend can set their
   Monday rule from here, through Profile or the coach.
3. **APK 2, "new setup",** about day 10.5. It covers the rulers, the flow, Health Connect workout
   reads, and the daily weigh-in import. The manifest changes for `ExerciseSession` read, so it
   must be an APK build.

### 9.2 Tasks

| # | Task | Files | Days | Verified by |
| --- | --- | --- | --- | --- |
| A1 | Types | `D:\Macro-tracker\src\types\index.ts` | 0.25 | `npx tsc --noEmit` (web), `npm run typecheck` (mobile) |
| A2 | Food tag table (246 rows) + `import type` fixes | `src\data\foodDiet.ts` (new), `foodDatabase.ts:1`, `indianFoods.ts:1`, `utils\calculations.ts:1` | 1.0 | check-diet completeness and lexicon cross-check; owner eyeballs the printout of the 44 animal rows and the ambiguous rows |
| A3 | Diet engine + lexicon | `src\utils\diet.ts` (new) | 0.75 | check-diet: the 5.3 matrix in UTC, Asia/Kolkata and America/Los_Angeles; `applyDietPatch`/`parseDietPatch` round trip; `isLooser` cases |
| A4 | Targets and setup maths | `src\utils\targets.ts` (new), `onboarding.ts` (SetupAnswers, activityFrom, paceRange, goalPreview, expectationFor, defaultTargetKg, trainingPatternFrom, caloriesForPace floor arg), `src\data\breakfastPlates.ts` (new), `tdee.ts`, `localRecommendation.ts`, `coachAlerts.ts` | 0.75 | check-diet cases: friend (male, 28, 72 kg, 170 cm, "some walking", 3 training days) gives TDEE 2,554, 2,169 kcal, 130 g protein, 72 g fat, 250 g carbs, end date 2027-01-14; 60 kg vegetarian gives 85 g; floor case; web `tsc` |
| A5 | Coach server | `api\_catalog.ts`, `api\_coach.ts`, `api\chat.ts`, `api\_photo.ts`, `scripts\eval-coach.ts` | 1.0 | 6 new eval scenarios pass; a one-off script shows `buildCoachPrompt` and the tool list for a no-capabilities context are **identical** before and after; deploy |
| B1 | Test harness | mobile `scripts\check-diet.mjs`, `scripts\ts-resolve.mjs`, `package.json` `test` | 0.25 | `npm test` green |
| B2 | Suggestion surfaces | `src\lib\nextMeal.ts`, `src\components\NextMealCard.tsx`, `src\hooks\useDayPart.ts` (new), `src\lib\coachOpener.ts`, `src\lib\coachContext.ts`, `src\lib\reminderPlan.ts`, `src\hooks\useNotifications.ts`, `app\chat.tsx:308` | 0.75 | check-diet runs `suggestNextMeal` on the friend's 14-day diary for Mon and Tue 08:00 and 13:00 (no egg or meat on Monday; chicken back on Tuesday; egg-only breakfast history on Monday still yields a starter); diet-undefined starters are veg; `tsc` shows no missed caller |
| B3 | Logging surfaces + coach client | `app\food-search.tsx`, `app\(tabs)\diary.tsx`, `app\chat.tsx`, `src\store\coachStore.ts`, `src\lib\api.ts` (after the other agents' work lands), `src\lib\analyzedFood.ts` | 0.75 | Device (phone date set to Monday): search "dosa" puts egg dosa last with a label; in the coach, "no egg on Mondays, what should I eat now?" gives a saved rule, an Undo chip and a veg card in one reply; "egg is fine now" gives a Save card |
| B4 | Setup controls (part 1) + Food & diet page | `src\components\setup\` (QuestionScreen, ChoiceList, ChipGroup, WeekdayChips, OptionRow moved from onboarding.tsx:63), `src\onboarding\screens\` F1-F6, `app\food-rules.tsx` (new), `src\components\DietPromptCard.tsx` (new), `app\(tabs)\profile.tsx` (row near :896) | 1.25 | Device: walk mode from the Today card; the summary list edits each rule; diet-like memory shown; the bottom button clears the inset on a small phone |
| — | **APK 1** | | **≈ 6.75 cumulative** | |
| C1 | Ruler + time + checklist | `src\components\setup\Ruler.tsx` (virtualised FlatList of 1-unit segments with 10 minor ticks, `snapToInterval`, selection haptic per tick, `accessibilityRole="adjustable"`, tap-to-type), `TimeRow.tsx`, `SetupChecklist.tsx` | 0.75 | Device on the lowest-end friend phone: a 30-250 kg ruler scrolls without dropped frames; TalkBack increment and decrement work |
| C2 | Draft store, flow, remaining screens, finish | `src\store\onboardingDraft.ts` (new), `src\onboarding\flow.ts` (new), `src\onboarding\screens\` B1-B8, N1, G1-G3, F7, F8, Plan; `app\onboarding.tsx` rewritten as the router | 1.75 | check-diet: `visibleScreens` path lengths match 2.8 for the two personas; device: kill the app on G3 and reopen on G3 with the same values; a different account discards the draft; finish writes the profile, weight (local date), history, goals and notificationPrefs |
| C3 | Health Connect | `src\lib\healthPermissions.js`, `src\lib\healthConnect.ts` (`readLatestWeight`, `readExerciseSessions`, `readExercise` grant), `src\lib\healthPrefill.ts` (new), `src\hooks\useHealthSync.ts` (`readPrefill`, daily weigh-in import) | 0.75 (workout read ≈ 0.4 of it is the cut line) | Device: the receipt shows correct "not shared" and "nothing on file" wording per permission; MacroFit-written sessions are not counted; a new scale reading appears on the next day's open |
| C4 | Device QA | | 0.5 | Monday walk-through (1) on a real Monday date; a reminder planned on Saturday for Monday; an old APK against the new server; layout containment (tab bar, rows staying horizontal) |
| — | **APK 2** | | **≈ 10.5 total** | |

### 9.3 How the tests run with no new dependencies

- `scripts\ts-resolve.mjs` is about 15 lines. It uses `module.registerHooks` (Node 24 is
  installed): extensionless relative imports retry with `.ts`, and `@core/` maps to `src/core/`.
- `npm test` becomes
  `node scripts/check-auth-link.mjs && node --import ./scripts/ts-resolve.mjs scripts/check-diet.mjs`.
- `check-diet.mjs` imports the **real** synced modules (`src/core/utils/diet.ts`, `targets.ts`,
  `onboarding.ts`, `src/lib/nextMeal.ts`, `src/onboarding/flow.ts`), following the rule of
  `check-auth-link.mjs`: never test a copy.
- It sets `process.env.TZ` to each of UTC, Asia/Kolkata and America/Los_Angeles in turn, so the
  weekday cases prove the date-string rule.

### 9.4 Coordination with the agents working now

- **`AuthProvider`, storage, `api/_auth`:** not touched. The draft reads `useAuth().user` only.
- **`src/lib/api.ts`:** two additions (the `CoachPack` fields and the `set_diet` and `contains`
  parsing) land **after** the current edits are merged.
- **`resetStore` (useStore.ts):** not touched, thanks to the ownerId-keyed draft.
- **`api/chat.ts`:** edits the tool list, the loop and the summary call only. It has no auth
  changes.

---

## 10. Risks

1. **Setup length.** It is about 20 question screens for the friend, against "light and easy". The
   mitigations:
   - auto-advance;
   - prefilled defaults and the button-as-skip pattern;
   - checklist progress and resume.

   Measure where people stop (the section reached, from the draft). If Food & routine loses
   people, F5 and F7 can move to the Food & diet page.
2. **A mis-tagged food.** One egg in a "veg" idea costs trust. The mitigations:
   - the complete table, with the lexicon checked against it;
   - the owner's eyeball of the 44 animal rows;
   - unknown foods never proposed on tightened days;
   - `may` markers for the naan/parotta class.
3. **Jain and allergy false confidence.** Home recipes vary, and root and allergen tags are
   approximate. The copy never says "safe", only "kept out of ideas; always check". Jain users with
   little history may see few starters (most savoury rows are `?root`). They will see honest empty
   cards rather than wrong ones.
4. **The wrong weekday.** Vercel is UTC. All weekday maths goes through `weekdayOf(dateString)` on
   the client's `today`/`tomorrow`, and it is tested in three timezones.
5. **Shallow `updateProfile`.** A partial `diet` object would wipe the rest. Every write goes
   through `applyDietPatch`, and code review rejects any direct `{ diet: {...} }` write.
6. **The model misreading a one-off as a rule** ("didn't have chicken today"). The tool description
   says "lasting", a tightening can be undone in one tap, and a loosening needs a tap.
7. **Latency.** The diet retry reuses the existing summary call, but a refused turn now spends its
   second call writing a card as well as text. Watch `eval-coach` timings. If the budget is tight,
   drop the retry and keep the specific refusal text.
8. **Old APKs stay unfiltered on the device** until updated (the server cannot fix on-device ideas).
   Their coach is unchanged. The update screen prompts, and the friends are few.
9. **Whole-blob last-write-wins.** A stale web tab or old device that saves after the diet was set
   can drop `profile.diet`, as it can any field today. If this is seen, the fix is an `updatedAt`
   merge for `profile.diet` in `hydrateStore`. It is left out now because the sync path is being
   edited in parallel.
10. **Full fast days bias the measured burn.** A 0 kcal day falls below `MIN_QUALIFYING_CALORIES`
    (tdee.ts:12) and is skipped while its weight loss still counts. Mitigation (later): count a day
    in `fastDays` with nothing logged as a qualifying 0 kcal day.
11. **The ruler on low-end phones.** It is virtualised in 1-unit segments. Test on the friends'
    actual phones before APK 2.
12. **Parallel edits.** The `api.ts` additions wait for the current work, and this is scheduled into
    B3.

---

## 11. Questions for the owner

Each one changes what gets built. The default is what gets built if there is no answer.

1. **Search on a veg day:** keep non-veg visible but moved down with a "Not on Mondays" label
   (default), or hide it completely?
2. **Health Connect workouts:** use them only to fill in training days and gym time (default), or
   also add them to the Activity log? Adding them costs about 1 day. They would show as workouts
   with no sets, and on the website they would add calories to the day's budget.
3. **Veg seasons (Purattasi, Sabarimala):** set through the coach and the Food & diet page
   (default), or also as a chip on the setup veg-days screen?
4. **Fasting days:** is "no meal ideas and no meal nudges on those days" enough (default)? Or do you
   want fasting-food ideas (sabudana, fruit, milk)? That adds a fasting mode and about 8 new
   catalog foods, roughly 1.5 days.
5. **Protein defaults:** vegetarians 1.4 g/kg (about 85 g at 60 kg), non-veg 1.6, plus 0.2 when
   cutting with 3 or more training days, all on a BMI-25 reference weight. Existing users are
   unchanged until they re-run setup. OK?
6. **Releases:** ship the food rules first (APK 1, about day 7) so your friend is covered sooner,
   then the new setup (APK 2, about day 10.5)? Or wait and ship one APK at the end?
