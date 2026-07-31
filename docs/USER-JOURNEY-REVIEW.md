# MacroFit — Walking the App as a User

Six people walked six journeys. 115 user-visible problems: **19 block**, 51 confuse, 34 annoy, 11 polish.

---

## The five that would most change how this app feels

### 1. The food loop stops working every afternoon and dead-ends when it does work

**Why.** This is the app's primary function. The USDA key is read as `(import.meta as any).env?.VITE_USDA_API_KEY` — a Vite/web idiom that can never resolve in an Expo build — so every install runs on the shared public DEMO_KEY at 30 requests/hour. Four meals with a couple of searches each exhausts it, and the app then shows 'Check your connection' to a user whose connection is fine. Separately, if the food isn't in either database the search dead-ends in two stacked apologies with zero actions: I verified `addCustomFood` has zero callers anywhere in the app, so the 'Your foods' section reserved at food-search.tsx:301 can never be non-empty. Between the two, a person cannot reliably log a meal.

**Change.** Read the key from an EXPO_PUBLIC_ var or proxy through the app's own backend. Distinguish HTTP 429 from a network error: 'Too many food searches right now — the free lookup limit resets shortly. The food database above still works.' Add an ~8s AbortController timeout so a half-open connection reaches the existing error card (today the 'Try again' button only renders in the error state and is therefore unreachable). Collapse the two no-result messages into one and add a primary 'Add "dal" yourself' button that writes via addCustomFood and drops into the portion step with it selected.

### 2. Reaching for the green tick deletes the set I just typed

**Why.** The 44pt Done tick and the 44pt bin sit 4 points apart at the right edge of every set row (ROW_GAP = 4), exactly where a thumb lands. The confirm guard is inverted for the risky moment: `if (!set.completed || confirmRemove) onRemove()` means a row I have just typed 102.5 x 8 into but not yet ticked deletes on the FIRST tap, silently, with no undo and no message. This is the only place in the app where a normal thumb movement destroys data, and it sits inside the action people repeat twenty times a session with chalky hands.

**Change.** Invert the guard so any row containing a non-zero weight or reps requires the second confirming tap, and only a genuinely blank row deletes instantly. Then separate the targets: at least 16pt plus a divider between the tick and anything destructive, or move deletion to a swipe/long-press. Add a 'Set removed · Undo' line.

### 3. Switching to lbs relabels my whole weight history without converting it

**Why.** Weigh-ins are stored raw in whatever unit was active when entered. After tapping 'lbs': Progress's chart is captioned 'Weigh-ins in lb' and plots 78.1, Profile's Weight log lists '78.1 lbs', and Profile's hero tile and Weight goal card two inches away read 172.2 lbs. Three figures for one body on adjacent cards. Anyone who sees that assumes the app is broken and stops trusting every number in it — which is fatal, because trust in the numbers is the entire product. It also compounds with the two other cross-screen contradictions journeys found: Progress vs Profile weight delta, and coach alerts hardcoding kg while the card above reads lbs.

**Change.** Store every weigh-in in kg and convert only at render, the way WorkoutSet already does. Convert existing rows on migration so no history changes meaning when the toggle flips. Route coachAlerts through the same inDisplayUnit formatter weightTarget.ts already uses.

### 4. My calorie target has one unlabelled door, and the Profile section called 'Targets' does not contain it

**Why.** Four separate journeys got lost looking for this from four directions. I confirmed /goals has exactly ONE entry point in the entire app: a pale jade card fourth down the Dashboard reading 'Coach plan / Cut · 2,198 kcal/day' with a small grey chevron — it reads as a status tile, not a door. Profile's 'Targets' section (subtitle 'Goal 75 kg') opens to reveal one field: Goal weight. No calorie number appears anywhere on Profile. Progress shows a 'Daily goal / 2,252 / kcal' tile that isn't tappable. And setup explicitly promised 'every number is editable under Profile', so the app's own instruction leads to a dead end. This is the number the whole product is about.

**Change.** Rename Profile's section to 'Weight goal' and add a sibling row: 'Daily targets — 2,252 kcal · 169 P / 225 C / 75 F ›' pushing /goals. Make the Progress 'Daily goal' tile a link. Put the effective target at the top of /goals ('You are eating to 2,252 kcal a day') and put a status chip on the coach card — 'Proposed — not applied' vs 'In effect since 12 Sep' — so the screen's biggest number stops being the one that isn't in force.

### 5. The launch and offline story makes a working app look broken

**Why.** First impression on a flaky connection: a wordless logo and spinner for up to 20+ seconds ('Loading your account' exists only as an accessibilityLabel), then a full-screen wall that replaces the entire navigator and says 'This device has not downloaded your data yet, so there is nothing to show offline.' That sentence is false for a brand-new account (there is no data to download) and false for an existing user on the first launch of this build (weeks of data are sitting in AsyncStorage). There is deliberately no way past it, it never retries on its own, Try again returns a pixel-identical screen so people tap repeatedly, and the only other button — Sign out — calls resetStore() with no confirmation, deleting the local copy Profile always confirms before touching. The Not synced banner has the matching problem: it promises 'until it clears' and nothing ever re-attempts.

**Change.** Let a session whose sign-up completed in this launch through to setup. If a local store exists, don't block at all — enter the app with the banner. Only wall a genuinely empty device, reworded: 'We can't reach the server right now, so we can't load your account. Nothing on your account has changed.' plus the signed-in email. Auto-retry on foreground and reconnect; render the last attempt outcome ('Still no connection — last tried 00:07'). Put Sign out behind Profile's confirmSignOut dialog, labelled 'Sign out and clear this device'. Add the wordmark and staged text under the launch spinner.

---

## Regressions from the recent correctness work

### app/_layout.tsx — new full-screen blocking 'Can't reach your account' screen with Try again / Sign out

**Problem.** REVERT THE BLOCK. Four journeys hit this. The body copy is factually wrong from where the user sits in the two most likely cases: a brand-new account has no data to download, and an existing user on the first launch of this build (STORE_OWNER_KEY / LOADED_KEY don't exist yet) has weeks of data on the phone while being told the device is empty. There is deliberately no way past it and it never auto-retries. Try again shows 'Trying…' for up to 8s then returns a pixel-identical screen, so users tap repeatedly with no idea whether it registered. And Sign out — one of only two buttons, on the one screen the user feels trapped on — calls signOut() with NO confirmation, and signOut runs resetStore(), deleting the local copy. Profile confirms this exact action every single time. The correctness goal (don't let people log work against factory defaults) was right; walling everyone including people with nothing to lose was not.

**Action.** 1) Let a session whose sign-up completed in this launch straight through to setup. 2) If a local store exists, do not block at all — enter the app with the Not-synced banner, which is exactly what the banner is for. 3) Only show the screen when there is genuinely no local copy and it isn't a fresh sign-up, reworded as a connection problem with the signed-in email shown. 4) Auto-retry on foreground and NetInfo reconnect with backoff. 5) Track and render the last attempt outcome under the buttons. 6) Reuse Profile's confirmSignOut dialog including the unsynced-changes variant.

**Copy.**

```
Heading: 'Can't reach your account'  Body: 'We can't reach the server right now, so we can't load your account. Nothing on your account has changed.'  Below it: 'Signed in as me@example.com'  Under the buttons after a failed attempt: 'Still no connection — last tried 00:07.'  Ghost button label: 'Sign out and clear this device'
```

### app/_layout.tsx — 'Not synced' banner above the navigator

**Problem.** The copy promises the banner will clear itself and it never does. retrySync only fires from a tap, and the AppState handler's flushSave returns 'skipped' because saving is blocked — so signal comes back, the banner stays, and saving stays off for the rest of the session. Retry has the same no-feedback problem as Try again: it fails silently and the banner looks identical afterwards, so users tap it over and over.

**Action.** Retry automatically on foreground and on a NetInfo reconnect, with backoff. Until that lands, change the last clause so it stops promising something that cannot happen. On success, replace the banner with a short-lived confirmation rather than letting it silently vanish.

**Copy.**

```
Blocked state: 'Not synced — we could not reach your account. Everything you log stays safely on this device. Tap Retry once you have signal.'  On success: 'Synced — 3 changes saved.'
```

### app/(tabs)/profile.tsx — 'Update your targets?' dialog on age/height/goal/activity/gender changes

**Problem.** Three journeys hit this. It fires on things that are not body details at all: commitBasics is the blur handler for Name, Age and Height and calls applyBodyChange unconditionally, so correcting 'Samr' to 'Samir' pops a modal asking whether to recalculate my calories — and so does tapping into Age and tapping out having typed nothing, and it fires twice moving Name to Age. Worse, its stated reason is untrue for almost everyone: setup writes a pace-derived target (TDEE-550 for the default Steady cut) while goalsOriginOf compares against the flat TDEE-500, so a user who has never touched a number is told they set it by hand. And tapping Recalculate silently overwrites water (2,500 to 2,818 ml), fibre, sugar and sodium — none of which the dialog names — so the Dashboard's Water goal moves with no explanation. Preventing silent target rewrites was correct; this implementation accuses the user of something they didn't do, at moments where nothing relevant changed.

**Action.** 1) Only call applyBodyChange when age, height, gender, activity or goal actually changed value; name edits and no-op blurs commit silently. 2) Stamp the source when onboarding saves goals instead of inferring origin, and word the dialog from the stamped source. 3) Restrict recalculation to calories and the three macros — what the dialog names — or name water, fibre, sugar and sodium in the body.

**Copy.**

```
Title: 'Update your targets?'  Body: 'Your targets came from your setup answers. Recalculate them from your new details, or keep what you have?'  Buttons: 'Keep mine' / 'Recalculate'
```

### app/(tabs)/profile.tsx — silent no-op when a coach plan is in effect

**Problem.** The same four controls now do three different things and two of them say nothing at all. Changing Activity from Moderately to Very active either silently rewrites the calorie target, silently does NOTHING when a coach plan is in effect, or pops the dialog. Profile displays no calorie number anywhere, so in the first two cases there is zero feedback either way. The silent-no-op case is the worst thing in this batch: the user made a real change to their body data and the app deliberately ignored it without saying so.

**Action.** Always render an inline confirmation under the control, with an Undo where a value moved.

**Copy.**

```
Recalculated: 'Your daily target moved from 2,252 to 2,647 kcal.' with an Undo.  Coach plan in effect: 'Your accepted coach plan is unchanged. Refresh it on Goals to use your new activity level.' with a link to /goals.
```

### app/(tabs)/profile.tsx — new inline range check on height

**Problem.** The error blames a unit control that does not exist. The field is labelled 'Height (cm)', there is no unit selector attached to it, and the accepted range (120-230) is never stated — while the age error one line away does state its range properly. So the user is told to check something they cannot change and not told what would be accepted.

**Action.** Match the age message's shape and drop the reference to units.

**Copy.**

```
'Height should be between 120 and 230 cm.'
```

### app/(tabs)/progress.tsx — the 'Import from Google Fit' card no longer imports, it points to Profile

**Problem.** The single most-reported item in the entire review — five separate journeys flagged it. Deleting the destructive second importer was absolutely right. Leaving this card behind was not. The title still promises an action, the button is a redirect, and the caption invents a third name: 'Import from Google Fit' / 'Bring past weigh-ins in from Health Connect' / 'Open Profile' — three names for one feature in one card. The body copy ('Days you logged yourself are never overwritten') answers a worry no user has ever had; it reads like a changelog note left in the UI, because that is what it is. And the card renders unconditionally while Profile's Health Connect section is gated on health.availability === 'available', so on iOS or Android without Health Connect the destination does not exist — the user lands at the top of a long Profile screen and finds nothing. The empty state directly above already says 'Log your weight from the Profile tab', so the tab now has two competing destinations.

**Action.** Render the card only when useHealthSync().availability === 'available'. Retitle it to match Profile, relabel the button, deep-link to the Health Connect section expanded and scrolled into view, and delete the overwrite sentence. Better still: drop the card entirely and put the pointer inside the existing 'No weigh-ins yet' empty state, so the tab has one destination. Then mount WeightTargetCard in the space it frees — the Weight tab currently has no on-track verdict and no way to weigh in.

**Copy.**

```
Title: 'Health Connect'  Caption: 'Past weigh-ins are imported on Profile.'  Button: 'Manage in Profile'  (Delete entirely: 'Days you logged yourself are never overwritten.')
```

### app/login.tsx — session-expired notice

**Problem.** The notice is rendered below the email and password fields, so the explanation for why the whole screen changed is the last thing on the card rather than the first. Mid-workout, the live session card, volume, elapsed clock and rest timer are replaced by a login form in one frame, and the 13pt grey line explaining it is under the inputs. It also never mentions the workout specifically, and after signing back in the user lands on the Dashboard rather than the Workout tab, so they have to go and check their sets survived.

**Action.** Move the notice above the Sign in / Create account toggle so it is the first thing read. Add an active-workout variant. Route back to the tab the user was on after a re-sign-in caused by expiry.

**Copy.**

```
Default: 'Your session expired, so you were signed out. Everything you logged is still on this device — sign in to sync it.'  With an active workout: 'Your session expired, so you were signed out. Your workout is still running on this device — sign in to sync it.'
```

### app/login.tsx — submit button stays busy while account data loads

**Problem.** This one is a genuine improvement and should stay: holding the button busy through hydration stops the second tap that trips GoTrue's rate limiter. But it has no ceiling, and it sits on a screen that still has no 'Forgot password?', no password reveal, and two identically-styled, identically-labelled 'Create account' buttons (the mode toggle uses the same Button component as the submit control). So a user who mistyped their password while creating the account can be left tapping a permanently busy button on a screen with no recovery path at all.

**Action.** Keep the busy-through-hydration behaviour. Render the mode toggle as a segmented control or a text link instead of a second primary Button. Add a password reveal toggle and a 'Forgot password?' link calling resetPasswordForEmail, confirming in the existing Message component. Move the 6-character rule out of the placeholder into a permanent helper line so the greyed-out button stops being unexplained.

**Copy.**

```
Mode switch: 'New here? Create an account'  Reset link: 'Forgot password?'  Reset confirmation: 'Check your email — we've sent a link to reset your password.'  Permanent helper under the password field: 'At least 6 characters'
```

---

## Full plan

## MacroFit — product plan

Six people walked six different journeys. They converged on the same walls from different directions, which tells us where the real damage is. The pattern across all six: **the app's correctness work has been good and its honesty has been bad.** Several recent changes fixed invisible data bugs and left behind visible copy that either lies to the user or strands them. Meanwhile the app's two core loops — log a meal, log a set — both have a step in them that destroys work or dead-ends.

I've split this into four bands. Band 0 and Band 1 lose users. Band 2 and Band 3 do not.

---

## BAND 0 — The app destroys work, lies about data, or stops working

These are the ones that end the relationship. Everything here should ship before anything else.

### 0.1 Reaching for the green tick deletes the set I just typed — no warning, no undo
**What happens:** I type 102.5 × 8 with chalky hands, reach for the ✓, and hit the bin 4pt to its right. The row vanishes on the first tap. No dialog, no message, no undo. The guard that exists is backwards: `handleRemove` only asks twice when `set.completed` is already true, so the row that holds unsaved typing is the one that deletes instantly.

`app/(tabs)/workout.tsx:239` — `if (!set.completed || confirmRemove) onRemove()`

**Do:**
1. Invert the guard: any row with a non-zero weight *or* reps requires the second confirming tap. Only a genuinely blank row deletes on first tap.
2. Separate the targets: minimum 16pt plus a divider between ✓ and the bin, or move deletion to a row swipe / long-press entirely (`ROW_GAP = 4` at `workout.tsx:149`).
3. Give the destroyed-work case an undo line: `Set removed · Undo`.

### 0.2 Food search stops working by mid-afternoon and blames my wifi
**What happens:** Morning searches find branded foods. By 3pm every search returns *"Could not reach USDA FoodData Central / Check your connection. Everything above still works offline."* My connection is fine. The key is read as `(import.meta as any).env?.VITE_USDA_API_KEY` — a Vite/web idiom that can never resolve in an Expo build — so **every install in the world runs on the shared public DEMO_KEY at 30 requests/hour.** Four meals with a couple of searches each exhausts it. The app then tells the user to fix their router.

`src/core/utils/usdaApi.ts:5`

**Do:**
1. Read the key from an `EXPO_PUBLIC_` var, or proxy through the app's own backend so a real key ships. This alone restores the core loop.
2. Distinguish HTTP 429 from a network failure. Exact copy for 429: **"Too many food searches right now — the free lookup limit resets shortly. The food database above still works."** Never tell someone to check a connection that is fine.
3. Add an ~8s `AbortController` timeout so a half-open connection resolves into the existing error card. Right now the spinner runs forever and the "Try again" button — which only renders in the error state — is unreachable (`app/food-search.tsx:286`).
4. After ~3s of loading, swap the spinner copy to **"Taking longer than usual — the results below are ready now."**

### 0.3 If the food isn't in either database, the search dead-ends
**What happens:** I search my home-cooked dal. I get two stacked apologies — *"No USDA matches. Try a shorter or more general word."* and directly beneath it *"No matches / Try a shorter word, a brand name, or the plain ingredient."* — and zero actions. My only move is to back out and log something I did not eat.

The store already has `addCustomFood` (`src/core/store/appState.ts:336`) and the search screen already reserves a **"Your foods"** section for it (`app/food-search.tsx:301`). **Confirmed: `addCustomFood` has zero callers anywhere in the app.** That section can never be non-empty.

`app/food-search.tsx:690`

**Do:**
1. Collapse the two no-result messages into one.
2. Add a primary button in the empty state: **`Add "dal" yourself`** → small form (name, serving size + unit, calories, P/C/F) → writes via `addCustomFood` → drops straight into the portion step with it selected.
3. Add a quieter version of the same at the bottom of every result list.

### 0.4 Switching to lbs relabels my whole weight history without converting it
**What happens:** I tap "lbs" in Profile. Now Progress's chart is captioned *"Weigh-ins in lb"* and plots **78.1**; Profile's Weight log lists **"78.1 lbs"**; and Profile's hero tile and Weight goal card — two inches away on the same screen — read **172.2 lbs**. Three figures for one body on adjacent cards. Nobody who sees that trusts another number in this app.

Cause: weigh-ins are stored raw in whatever unit was active when entered (`src/core/store/appState.ts:319`).

**Do:** Store every weigh-in in kg, convert at render only — the way `WorkoutSet` already does. Migrate existing rows so no history changes meaning when the toggle flips.

### 0.5 One wrong digit poisons my PRs forever and there is no way to fix it
**What happens:** I type 1025 instead of 102.5, finish the session, and the expanded history card offers exactly two actions: **"Save as template"** and **"Delete"**. There is no edit. The Personal records block now permanently leads with an est. 1RM of ~1298 kg (`workout.tsx:1227`), and `suggestNextSet` will print *"Target from last time 1027.5 kg"* forever (`src/core/utils/workoutMath.ts:187`). My only escape is *"Delete for good — This deletes the session and every set in it. It cannot be undone."*

`app/(tabs)/workout.tsx:1082`

**Do:**
1. Add **"Reopen session"** to the history card — sets `activeWorkoutId` back so the existing editing UI applies. Cheapest full fix.
2. Flag implausible entries at log time: **"1025 kg — did you mean 102.5?"** when a value exceeds ~3× the lift's previous best.
3. Longer term: make expanded history set rows tappable into the same weight/reps inputs used live.

### 0.6 A mistyped weigh-in poisons every derived number and cannot be corrected from where I typed it
**What happens:** I type 7.8 instead of 78. The only check is `Number.isFinite(value) && value > 0`, so it's accepted. `currentWeightKg` becomes 7.8, and BMI, TDEE, calorie targets, the ETA and every coach sentence follow it. Then the input disappears, replaced by *"Weighed in today"*. The correction path is Profile → expand "Weight log" (six sections down) → trash → re-log.

`src/components/WeightTarget.tsx:81`

**Do:** Range-check against a plausible band and against the last entry, with an inline confirm on large jumps: **"78 kg → 7.8 kg is a big change. Is that right?"** Keep the field visible after logging as an editable row: **`Today: 78.1 kg · Change`**. Profile just gained inline range checks on age and height — weight, which everything derives from, deserves at least the same.

### 0.7 My 47-day streak resets to 1 for no reason I can see
**What happens:** I log a snack after midnight, or I log late in the evening, and the Flame tile drops from 47 to 1. `updateStreak` computes today from local time but yesterday via `.toISOString()` (UTC), so in any timezone offset from UTC the comparison lands on the wrong day.

`src/core/store/appState.ts:388-389` — **reported independently by two journeys.**

**Do:**
1. Compute yesterday with the same local `getDateString` helper used for today. Never `toISOString`.
2. Call `updateStreak` from `applyMealTemplate` too — logging your whole lunch from a saved meal currently doesn't count toward the streak the Dashboard shows (`appState.ts:365-377`).

### 0.8 Error messages name environment variables and LAN IPs in front of the user
**What happens:** A red chat bubble reads: *"Failed: Could not reach http://192.168.1.20:3000/api/chat. Check that EXPO_PUBLIC_API_URL points at an address this device can reach (a LAN IP or a deployed URL, never localhost) and that the server is running."* The Goals screen renders the same strings verbatim under "Get my plan".

`src/lib/api.ts:280`, `app/goals.tsx:466` — **reported by two journeys.**

**Do:** Split thrown errors into a user sentence and a developer detail. Log the detail, render only the sentence. Exact copy:
- offline → **"Couldn't reach the assistant. Check your connection and try again."**
- timeout → **"That took too long. Try again."**
- misconfiguration → **"The assistant isn't available right now."**

---

## BAND 1 — Regressions from the RECENT CHANGES

Every change in this batch fixed a real invisible bug. Several of them paid for it with visible usability, and two of them shipped copy that is factually untrue from where the user sits. Be harsh here: the correctness work stays, the copy and the blocking go.

### 1.1 REVERT THE BLOCK. "Can't reach your account" walls users out over data they either never had or are currently sitting on
`app/_layout.tsx:99-161` — **hit by four separate journeys.**

**What happens:** The entire navigator is replaced by a logo, a heading, and this body: *"This device has not downloaded your data yet, so there is nothing to show offline. Connect and try again — nothing has been lost."* Two buttons: Try again / Sign out.

Three ways that sentence is a lie or a trap:
- **A brand-new account** created ninety seconds ago has no data to download. The explanation is wrong and there is deliberately no way past it.
- **An existing user on the first launch of this build** (`STORE_OWNER_KEY` / `LOADED_KEY` don't exist yet) has weeks of data sitting in AsyncStorage. The screen tells them the device is empty while their data is on it.
- **Sign out — one of only two buttons — calls `signOut()` with no confirmation** (`_layout.tsx:108`), and sign-out runs `resetStore()`. The single escape from a screen the user feels trapped on silently deletes the local copy. Profile confirms this exact action every time (*"Your data is saved to your account, and this device will be cleared."*). The blocking screen does not.
- **Try again gives no result.** It shows "Trying…" for up to 8s and returns to a pixel-identical screen. The user cannot tell whether it tried, failed, or missed the tap, so they tap repeatedly. It never retries on its own.

**Do, in order:**
1. **Let a session whose sign-up completed in this launch straight through to setup.** There is nothing to lose and nothing to overwrite.
2. **If a local store exists, do not block at all** — enter the app with the Not-synced banner. That is what the banner is for.
3. Only when there is genuinely no local copy *and* this isn't a fresh sign-up, show the screen — reworded as a connection problem, with the signed-in email on it:
   > **Can't reach your account**
   > We can't reach the server right now, so we can't load your account. Nothing on your account has changed.
   > Signed in as me@example.com
4. Auto-retry on foreground and on NetInfo reconnect, with backoff.
5. Track the last attempt and render its result under the buttons: **"Still no connection — last tried 00:07."**
6. Put Sign out behind Profile's `confirmSignOut` dialog, including the unsynced-changes variant, and relabel it **"Sign out and clear this device"**.

### 1.2 The "Not synced" banner promises it will clear itself, and it never does
`app/_layout.tsx:63-66`

**What happens:** *"Not synced — we could not reach your account. Everything you log stays safely on this device until it clears."* Nothing ever re-attempts: `retrySync` only fires from a tap, and the AppState handler's `flushSave` returns 'skipped' because saving is blocked. Signal returns, the banner stays, saving stays off for the whole session. And Retry, like Try again, produces no visible result on failure.

**Do:**
1. Retry automatically on foreground and on reconnect.
2. Until that lands, change the last clause. Exact copy: **"Not synced — we could not reach your account. Everything you log stays safely on this device. Tap Retry once you have signal."**
3. On success, replace the banner with a short-lived confirmation — **"Synced — 3 changes saved"** — rather than having it silently vanish.

### 1.3 The "Update your targets?" dialog fires on a name typo, and its stated reason is untrue
`app/(tabs)/profile.tsx:357-372` — **hit by three journeys.**

**What happens:** I fix `Samr` → `Samir` and tap away. A modal: *"Update your targets? / Your calorie and macro targets were set by hand. Recalculate them from your new details, or keep what you have?"* It also fires on a no-op blur (tap into Age, tap out, typed nothing), and twice if I move Name → Age.

Two problems. First, `commitBasics` calls `applyBodyChange` unconditionally — **a name is not an input to any formula.** Second, **"set by hand" is false for almost everyone**: setup writes a pace-derived target (TDEE−550 for the default Steady cut) while `goalsOriginOf` compares against the flat TDEE−500, so a user who has never touched a number is told they typed it.

**Do:**
1. Only run `applyBodyChange` when age, height, gender, activity or goal **actually changed value**. Name edits and no-op blurs commit silently.
2. Stamp the source when setup saves goals, instead of inferring origin. Then word the dialog honestly:
   > **Update your targets?**
   > Your targets came from your setup answers. Recalculate them from your new details, or keep what you have?
   > [Keep mine] [Recalculate]
3. **Name everything Recalculate touches, or stop touching it.** Today it also overwrites water (2,500 → 2,818 ml), fibre, sugar and sodium (`src/core/store/appState.ts:226`). The Dashboard's Water goal moves with no explanation. Restrict it to calories and the three macros — that is what the dialog names.

### 1.4 The same four controls do three different things, two of them silent
`app/(tabs)/profile.tsx:357`

**What happens:** Changing Activity from Moderately to Very active either (a) silently rewrites my calorie target, (b) **silently does nothing at all** if a coach plan is in effect, or (c) pops the dialog. Profile displays no calorie number anywhere, so in (a) and (b) there is zero feedback. Case (b) is the worst: I made a real change to my body data and the app deliberately ignored it without saying so.

**Do:** Always show an inline confirmation under the control.
- Recalculated: **"Your daily target moved from 2,252 to 2,647 kcal."** with an Undo.
- Coach plan in effect: **"Your accepted coach plan is unchanged. Refresh it on Goals to use your new activity level."** with a link to /goals.

### 1.5 The new height error blames a unit control that isn't there, and hides the range
`app/(tabs)/profile.tsx:398`

**What happens:** *"That height looks off. Check the number and the unit."* — on a field labelled **Height (cm)** with no unit control attached. The age error one line away states its range properly.

**Do:** Exact replacement: **"Height should be between 120 and 230 cm."** Drop the reference to units.

### 1.6 The de-fanged Google Fit card is now a card that lies about what it does — five journeys hit it
`app/(tabs)/progress.tsx:1013-1029` — **the single most-reported item in the whole review.**

**What happens:** Title **"Import from Google Fit"**, caption *"Bring past weigh-ins in from Health Connect"*, body *"Importing lives with your other connections, on Profile. Days you logged yourself are never overwritten."*, button **"Open Profile"**. Three names for one feature in one card. The title promises an action and the button is a redirect. And it renders unconditionally, while Profile's Health Connect section is gated on `health.availability === 'available'` (`profile.tsx:572`) — so on iOS, or Android without Health Connect, **the destination does not exist** and the user scrolls the whole Profile screen finding nothing.

The overwrite sentence answers a worry nobody has ever had. It reads like a changelog note left in the UI — because that is what it is.

Deleting the destructive second importer was correct. Leaving this behind was not.

**Do:**
1. Render the card **only** when `useHealthSync().availability === 'available'`.
2. Retitle to match Profile: **"Health Connect"**, caption **"Past weigh-ins are imported on Profile."**, button **"Manage in Profile"** — deep-linked to the Health Connect section, expanded and scrolled into view.
3. Delete the overwrite sentence.
4. Better still: drop the card entirely and put the pointer inside the existing "No weigh-ins yet" empty state, which already says *"Log your weight from the Profile tab"*. One destination per tab.

### 1.7 The session-expired notice is buried below the fields it explains
`app/login.tsx:183-185`

**What happens:** Mid-workout, the live session card, volume, elapsed clock and rest timer are replaced by a login form in one frame. The explanation — *"Your session expired, so you were signed out. Everything you logged is still on this device — sign in to sync it."* — is a 13pt grey line **below** the email and password fields. After signing back in I land on the Dashboard, not the Workout tab, and have to go check my sets survived.

**Do:**
1. Move the notice **above** the Sign in / Create account toggle, so it is the first thing read.
2. When there is an active workout, say so explicitly: **"Your session expired, so you were signed out. Your workout is still running on this device — sign in to sync it."**
3. After a re-sign-in caused by expiry, route back to the tab the user was on.

### 1.8 The launch screen is twenty seconds of a logo and a spinner with no words
`src/components/LaunchScreen.tsx:17` — **reported by two journeys.**

**What happens:** After the native splash, a brand mark and a small spinner on an empty canvas with zero visible text ("Loading your account" exists only as an `accessibilityLabel`). `loading` clears only after `getSession()` — uncapped — plus all of `adoptUser()`, which contains an 8s select and a 15s save. On one bar this reads as a hang.

**Do:** Add the MacroFit wordmark under the mark, then a staged line:
- immediately: **"Getting your data…"**
- after ~5s: **"Still trying — your connection looks slow."**
- after ~12s: add a visible way out — **"Continue offline"** when a local copy exists, otherwise **"Try again"**.

---

## BAND 2 — The app hides its own value

Nothing here is broken. It's all built, and users can't find it. This is where the app feels thin when it isn't.

### 2.1 Your calorie target lives behind one unlabelled door, and the section named "Targets" doesn't contain it
**Four journeys hit this from four directions.** Confirmed: `/goals` has **exactly one** entry point in the entire app.

**What happens:**
- Setup's final screen promises *"Nothing is locked in — every number is editable under Profile."* (`app/onboarding.tsx:670`)
- Profile ▸ **Targets** (subtitle "Goal 75 kg") opens to reveal exactly one field: *Goal weight (kg)*. No calorie number appears anywhere on Profile. (`app/(tabs)/profile.tsx:623`)
- Progress shows a "Daily goal / 2,252 / kcal" tile that isn't tappable — the screen imports no router link at all. (`progress.tsx:769`)
- The only real door is a pale jade card fourth down the Dashboard reading *"Coach plan / Cut · 2,198 kcal/day"* with a small grey chevron. It reads as a status tile, not a door. (`app/(tabs)/index.tsx:350`)

Two wrong turns before stumbling onto it, and many users never will.

**Do:**
1. Rename Profile's section to **"Weight goal"** and add a sibling navigation row: **`Daily targets — 2,252 kcal · 169 P / 225 C / 75 F  ›`** → pushes `/goals`. This makes the onboarding promise true.
2. Make the Progress "Daily goal" tile a link to `/goals`, and add an **"Adjust goals"** ghost action in the Summary card header.
3. Fix the setup copy to name the real place: **"Nothing is locked in — every number is editable later under Profile."** (true once step 1 lands).

### 2.2 The Goals screen shows two big calorie numbers and never says which one I'm eating to
`app/goals.tsx:501`

**What happens:** 56-point **"2,198 / kcal per day"** under "Your coach", above the fold. My actual saved target, 2,252, is in a text field two screens down. Neither carries a label. The only signal is whether a green "Accepted…" line is present — **an absence**, which nobody reads as information. The screen's largest, most authoritative figure is the one that is *not* in effect.

The Dashboard has the same contradiction 300px apart: hero says *"1,410 of 2,252 kcal · 842 kcal left today"*, four cards down *"Coach plan / Cut · 2,198 kcal/day"* (`index.tsx:132`). Two journeys flagged this pair.

**Do:**
1. Put the effective target at the very top of /goals, above the coach card: **"You are eating to 2,252 kcal a day."**
2. Status chip directly on the coach card: **"Proposed — not applied"** / **"In effect since 12 Sep"**.
3. On the Dashboard coach card, when not accepted: **"Suggested — not applied yet"** with a **Use this** action. When accepted: **"This is your current target."**
4. State the override positively in both directions rather than by absence: **"In effect: your numbers (2,600 kcal)"** / **"In effect: coach plan (2,198 kcal)"**, and label the revert **"Go back to the coach plan"** (`goals.tsx:583`).

### 2.3 Accepting the coach plan silently wipes the numbers I just typed
`app/goals.tsx:598`

**What happens:** I typed 2,600 / 175 P / 280 C, pressed Save, got *"Saved. These are now your daily targets."* Then I pressed "Accept plan" to see what it does. My fields silently re-seed to 2,198 / 193 / 219 / 61. No dialog, no undo, no record of what I had. Profile now confirms this exact operation; Goals does not.

**Do:** Confirm before overwriting hand-set targets, naming both sets:
> **Replace your targets?**
> This replaces your 2,600 kcal target with the coach's 2,198 kcal. Your macros change too.
> [Keep mine] [Use the plan]

Then offer an Undo in the success line for a few seconds after.

### 2.4 The screen called "Goals" doesn't contain my goal
`app/goals.tsx:424`

**What happens:** A screen titled Goals opens by prescribing *"Cut for 12 weeks"*. The phase pill isn't tappable. The only levers are three flat presets (Cut/Maintain/Bulk) that change a number without changing the goal — so pressing Refresh re-proposes a cut forever. The actual Lose / Maintain / Gain switch is on **Profile**, inside a collapsed row subtitled "30 · 178 cm". Nothing on Goals hints the direction is set elsewhere, and nothing links there.

Compounding: the pace I chose at setup (Gentle / Steady / Quick) is **unreachable after setup** — grep finds exactly one writer, the onboarding flow (`src/core/utils/onboarding.ts:269`) — while the Weight goal card keeps quoting it: *"5.5 kg to go at your planned 0.5 kg a week."* And after switching Lose → Gain, the stored −0.5 is read as an absolute, so the card quotes a fast-bulk pace the user has never seen.

And the presets ignore the pace entirely — flat −500/+300, unrelated to the −550 Steady cut that produced the saved 2,252 (`goals.tsx:418`).

**Do:**
1. Put the **Lose fat / Maintain / Gain weight** control on /goals, directly above the coach card: **"Tell the coach what you want next."** Changing it triggers a refresh.
2. Put the pace selector next to it, reusing setup's three labelled options and detail copy. Re-ask for pace whenever direction changes.
3. Derive the presets and "Suggested" from `caloriesForPace` with the stored pace, and label them **"Cut at your pace (0.5 kg/wk)"**.
4. Run `validateTarget` (`src/core/utils/onboarding.ts:160`) on Profile's goal-weight field. Today, switching to "Gain weight" leaves the Weight goal card reading *"80.5 kg → 75 kg / 39% of the way / On track: losing 0.4 kg per week"* two inches under a header pill saying **Gain weight** (`profile.tsx:416`). Prompt: **"Your goal weight of 75 kg is below where you are now. Update it?"**

### 2.5 The app knows exactly why I've stalled and never tells me on the screen where I ask
`app/(tabs)/progress.tsx:1132`

**What happens:** `getCoachAlerts` produces precisely the answers I came for — *"Your weight has stopped moving… your calorie target probably needs to change"*, *"Protein is running low…"*. They render in **one place**: `app/goals.tsx:618`, which is not a tab. Progress links to /goals zero times. The Dashboard coach card shows no badge, no warning count, no colour — no hint that three findings are waiting.

**Do:** Surface the top coach alert inline on the Progress Weight tab with a **"See all"** link to /goals, and badge the Dashboard coach card with the warning count.

### 2.6 The Weight tab never says whether I'm on track — and the card that does is mounted everywhere else
`app/(tabs)/progress.tsx:913`

**What happens:** A zoomed chart, then *"Latest 78.1 kg / Entries 2 / Change ↓ Down 0.4 kg"*, then one sentence, then the Google Fit card. No goal weight, no percentage, no ETA, no status, no trend rate.

`WeightTargetCard` renders all of it — goal, % of the way, days countdown, and a status chip ("On track" / "Stalled" / "Going the wrong way"). Its own docstring says it is *"the screen's answer to 'am I actually making progress?'"* (`src/components/WeightTarget.tsx:33-35`). It's mounted on Dashboard and Profile. **Not on Progress.**

**Do:** Mount `WeightTargetCard` non-compact at the top of the Progress Weight tab, above the chart, so the verdict and countdown are read first. That also puts a weigh-in field on the screen that charts weigh-ins — today the only button on that tab says "Open Profile" under a Google Fit header.

### 2.7 The dashboard says "No plan yet" one minute after setup handed me a plan
`app/(tabs)/index.tsx:400`

**What happens:** Setup's final screen: *"Here's your daily target"*, 1,937 kcal with macros. I tap "Start tracking". The fourth Dashboard card is headed **Coach** and reads *"No plan yet — set a phase and a calorie target built from your own data."* `onboarding.finish()` writes goals but leaves `recommendation` null. I can't tell whether my 1,937 target is real.

**Do:** Retitle the empty state so it reads as an upgrade, not a contradiction: **"Your targets are set from your setup answers. Get a coached plan once you've logged a week."**

### 2.8 The fast path for the meal I eat every day is buried where nobody scrolls
`app/(tabs)/diary.tsx:617, 702`

**What happens:** Saved meals render *after* Breakfast, Lunch, Dinner, Snacks, Pre-Workout **and** Post-Workout — ~1,500pt of scrolling. The instructions for creating one (*"Log a meal, then tap its bookmark to save it."*) live in that same bottom card, visible only to someone who already found the feature. The bookmark is a bare unlabelled icon that only appears once the meal has food in it.

And when I do tap my saved lunch: a small buzz, and **nothing on screen changes.** The three items landed in the Lunch card ~1,200pt above me. I assume it missed, tap again, and now I've eaten two lunches.

Confirmed: `copyMealEntries` and `copyDayEntries` exist in the store and **have zero callers** — "copy yesterday's dinner into today" simply doesn't exist for users.

**Do:**
1. Move Saved meals to a horizontal strip directly under the date navigator, above the meal cards.
2. On apply: scroll to the affected meal card, briefly highlight the new rows, and show **"Added to Lunch · 640 kcal"** with an **Undo**. Guard against a rapid second tap. Call `updateStreak`.
3. Replace the naked bookmark with a text **"Save as meal"** action once a meal card has its second entry.
4. Surface `copyMealEntries` as **"Repeat yesterday's lunch"** inside an empty meal card, and `copyDayEntries` as **"Copy a previous day"** on an empty day.

---

## BAND 3 — Daily friction

High-frequency actions that cost more taps, scrolls or keystrokes than they should. Nobody quits over these; everybody feels them.

### 3.1 The Dashboard has three buttons for the chatbot and zero for logging food
**Five journeys reported some version of this.** `app/(tabs)/index.tsx:124, 134, 141`; `app/(tabs)/_layout.tsx:140`

**What happens:** Sparkle icon in the header. A full-width **"AI Nutrition Assistant / Ask AI"** card in the *second* slot, above my macros. A floating jade Sparkles FAB pinned bottom-right — exactly where every food app puts "log food". The same Sparkles glyph on the same screen also means "Coach plan" and goes somewhere else entirely.

Card order is: Eaten today (0 of 1,937) → AI advert → a 192pt macro ring showing the same zero → Coach → Meals. **The first screenful is two renderings of "you have eaten nothing" plus an ad.** Meals — my only route to logging — starts ~700pt down.

And the assistant is the one thing in the app that *cannot* change targets: its tools are log food, remove food, log weight, log water.

**Do:**
1. **Make the FAB log food.** Long-press or a secondary chip for the assistant.
2. **Delete the "AI Nutrition Assistant" card.** It reclaims a prime slot; the header sparkle and the FAB are entry points enough.
3. Move Meals above the macro ring so "Breakfast → Add food" is visible on open.
4. On a completely empty day, collapse hero + ring into one card and lead with **"Nothing logged yet — start with breakfast."**
5. Use a distinct glyph for the coach so one icon doesn't mean two destinations.
6. Have the assistant hand off on target requests: **"I can't change your targets, but here's the screen that does"** + link to /goals.

### 3.2 "Add food" next to Breakfast dumps me at the top of the Diary
**Three journeys.** `app/(tabs)/index.tsx:429`

**What happens:** Each meal row ends with "Add food" in jade semibold — it reads as a button for *that meal*. It's a `<Link href="/diary">`, so I land at the top of the Diary: date navigator, tall totals card, Breakfast, Lunch, Dinner… four scroll flicks to reach Snacks, then a second "Add food" tap.

**Do:** Route the rows to `/food-search?meal=Breakfast&date=<today>` — the modal already accepts both params, and the Diary's own Add food buttons already do exactly this (`diary.tsx:563`). **Halves the taps on the most repeated action in the app.**

### 3.3 The app promises "log by speaking" and "snap a photo"; neither exists
**Two journeys on the mic, one on the camera.**

- Dashboard card subtitle: *"Log meals, water or weight by speaking"* (`index.tsx:141`). The screen it opens is a text box placeholdered "What did you eat?". There is no microphone anywhere in `app/chat.tsx`.
- Setup step 1 lists *"Log meals by searching, snapping a photo or just typing what you ate."* (`app/onboarding.tsx:381`). There is no camera or photo picker anywhere. `postAnalyzePhoto` exists at `src/lib/api.ts:465` and no screen calls it.

**Do (until the features ship):**
- Card subtitle → **"Log food, weight and water by describing it"** (matching the screen it opens).
- Setup copy → **"Log meals by searching for them or just typing what you ate."**

### 3.4 The whole active-workout experience assumes I'm holding the phone
Three related findings, all from the gym floor:

- **The rest countdown scrolls off-screen.** `RestTimer` renders inline between the session card and the exercise list (`workout.tsx:770`). With two exercises, ticking a set on the second one leaves me a screen and a half below the timer. Scrolling up to check it pushes my set rows out of view. The one number I look at every 30 seconds is the one I can't see.
- **The screen locks 30 seconds into a 2-minute rest.** Confirmed: `expo-keep-awake` is not used anywhere in the app. `DEFAULT_REST_SECONDS` is 120. I unlock the phone for every set, twenty times a session, with chalk on my hands.
- **Nothing tells me rest is over.** Only a foreground `Haptics.notificationAsync` and a label change to "Rest complete" (`src/components/RestTimer.tsx:57`). Phone face-down on a bench, screen locked, loud room → I get nothing.

Plus: ticking my first set mounts the timer inline and shoves ~97pt of content down under my thumb, then back up when I dismiss it.

**Do:**
1. `useKeepAwake()` inside `ActiveWorkout` — held only while a session is live, released the moment it ends.
2. Pin the rest timer as a compact floating pill above the tab bar (icon + M:SS + ±30 + dismiss), visible at any scroll position. This also removes the layout jump entirely.
3. Schedule a **local notification with sound** for the rest deadline; cancel on dismiss, ±30s, next completed set, and finish/cancel. Keep the haptic for foreground and make it a repeated pattern, not one light tap.

### 3.5 Every set is six keystrokes, and the tick that would save them is a silent dead button
`app/(tabs)/workout.tsx:291, 338, 468`

**What happens:** The card says *"Target from last time 102.5 kg × 8"* and the new row shows 102.5 and 8 in the weight and reps fields. **They look pre-filled.** They're placeholders — `set.reps` is still 0, so `canComplete` is false, the ✓ renders at 0.4 opacity and is `disabled`. Tapping it does nothing and no message says why. I tapped three times before I understood.

Then set 2 of a 5×5 requires the identical typing as set 1. Roughly 150 keystrokes a session on a decimal pad with sweaty hands. Meanwhile the ✓ — the button I press twenty times a session — is a transparent box with a `theme.border` outline and a `theme.textMuted` glyph at 0.4 opacity, quieter than the 40pt volume figure and the green Live pill.

**Do:**
1. Prefill the row with the suggested weight and reps as **real, selected values**. A set only counts once ticked, so nothing is fabricated — it's still a deliberate confirmation.
2. Add **"+ Repeat last set"** — adds a row already carrying the previous set's numbers, unticked.
3. Add ± steppers next to weight and reps so a plate change never needs the keypad.
4. When the tick is genuinely disabled, show **"Enter reps first"** inline instead of a silent dead button.
5. Give the untouched ✓ a filled or brand-outlined treatment at full opacity; drop the 0.4 dimming in favour of an explicit needs-reps state. Bump the 11pt column headers to 12–13pt at `textSecondary`.
6. Seed one empty set row when an exercise is added (`appState.ts:521` pushes `{ sets: [] }`, and the grid is gated on `sets.length > 0` at `workout.tsx:559`) — one wasted tap per exercise, every session.

### 3.6 The number pad covers the field I'm typing in and the button I need next
Two journeys, two screens. `app/food-search.tsx:663` and `src/components/Layout.tsx:99`.

- **Portion step:** I tap the amount field to change 1 → 1.5. The decimal pad eats the bottom third, including "Add to Breakfast" and the "Adds to your day / 249 kcal" preview I wanted to check. No keyboard avoidance; bottom padding is 32pt + safe area against a ~300pt keyboard. On iOS a decimal pad has no Done key, so I have to discover that tapping dead space dismisses it.
- **Set rows:** the Screen shell wraps children in a plain ScrollView with no `KeyboardAvoidingView` and no `automaticallyAdjustKeyboardInsets` — even though `chat.tsx:323`, `login.tsx:117` and `onboarding.tsx:318` all use one. Any set on the second exercise onward is entered blind.

**Do:** Add `KeyboardAvoidingView` (or `automaticallyAdjustKeyboardInsets`) in the Screen shell and around the portion step; pin "Add to {meal}" as a fixed footer above the keyboard; add a keyboard accessory row with Next / Done. Same treatment for the diary's servings editor (`diary.tsx:387`).

### 3.7 "Finish workout" is loud and instant; "Cancel workout" is quiet and guarded — backwards
`app/(tabs)/workout.tsx:766`

**What happens:** A full-width primary jade **"Finish workout"** sits at the top of the screen, right under the elapsed timer, in the area I'm scrolling and typing in all session. One tap calls `endWorkout()` immediately. Nothing anywhere sets `activeWorkoutId` back. Meanwhile "Cancel workout" — the safer action — is a ghost button at the bottom that asks twice.

Then the payoff moment is inverted too: after fifty minutes of work, the session card unmounts and is replaced by **"Ready to train? — Pick up where you left off"** with a Start workout button. No summary, no total, no duration, no confirmation anything saved. The two PRs I set vanish with the SetRows they lived on (`workout.tsx:415`). The only trace is one collapsed grey History row below the fold.

**Do:**
1. Move Finish below the exercises, where the session actually ends, and confirm with a summary: **"Finish? 14 sets · 8,240 kg · 52 min"**.
2. Show a completion summary on finish — name, duration, set count, total volume, volume vs. last session, and **the PRs set** (reuse `prSetIds` already computed at `workout.tsx:684`). Its Done leaves me on my finished session expanded, not a prompt to train again.
3. Finish pressed with nothing ticked → show Cancel's message instead of filing a permanent *"Evening workout · 0 sets · 0 min"* row: **"Nothing is ticked off yet — discard this session?"** [Discard] [Keep training].
4. Add **"Reopen"** on the most recent history card.
5. Stale session: on mount, if `startedAt` is more than a few hours old, replace the Live pill (currently showing 20:41:07) with **"Still training? This session started yesterday at 7:12pm"** offering Finish / Resume / Discard. When auto-closing, set `endedAt` from the last completed set's timestamp — not `now` — and tell the user it happened (`appState.ts:488` silently stamps it today).

### 3.8 I logged today's breakfast onto yesterday without noticing
`app/(tabs)/diary.tsx:671`

**What happens:** Last night I went back a day to fix dinner and never tapped "Jump to today". This morning the Dashboard says *"Breakfast — Nothing logged"*, I tap it, and the Diary opens **still on Jul 28**, same scroll position, date header possibly off-screen. The food-search modal shows "Breakfast · Jul 28" in 12pt muted grey — which is replaced by "Choose an amount" the instant I pick a food (`food-search.tsx:421-422`). The button reads **"Add to Breakfast"** and never names the day. My eggs land on yesterday and the Dashboard keeps insisting Breakfast is empty.

The assistant has the mirror-image bug: opened from Jul 28's diary, it writes to Jul 29 and says nothing about dates (`app/chat.tsx:179`).

**Do:**
1. Reset the diary's date to today when the tab is focused after being away; always pass an explicit date from Dashboard meal rows.
2. Keep **"Breakfast · Yesterday, Jul 28"** in the portion-step header, and label the button **"Add to Breakfast, Jul 28"** whenever the target day isn't today.
3. Show a visible amber strip across the whole Diary when I'm not on today — not a muted 12pt word.
4. Pass the diary's active date into chat, and have confirmation chips state the day: **"Toast · 2 slices → Breakfast, Jul 28"**.

### 3.9 Removing a logged food is instant, unconfirmed and unrecoverable
`app/(tabs)/diary.tsx:412`

**What happens:** I tap a row to change servings. The panel that opens has minus / number / plus on one line and a red **Remove** on the next — inches from the minus I came for. One mis-tap and last night's dinner is gone. **The whole app has no toast and no undo anywhere.**

Also: nothing indicates a logged row can be edited at all (`diary.tsx:340`) — no chevron, no pencil, no disclosure. My instincts (long-press, swipe) do nothing, so I assumed logged food was final and started deleting-and-re-adding to fix portions.

**Do:**
1. Add an undo snackbar on `removeFoodEntry` — **"Removed Chicken Breast · Undo"**, five seconds. Same for the assistant's `remove_food`, which is even more invisible.
2. Move Remove off the stepper row, or make it a swipe-left on the row with the same undo.
3. Add a chevron (rotating on expand) or a "1 ×" stepper glyph on the right of each row.

### 3.10 The local food list lags my typing and shows apples while I type "chicken"
`app/food-search.tsx:313`

**What happens:** I type c-h-i-c and for 350ms after every pause the list under **"Food database"** is still Apple, Banana, Blueberries — the local search runs off the same debounced string as the network call, and an empty debounced query means "show the first 25". Pure invented latency on a 100-item in-memory list.

Related: foods I log from USDA never appear in **Recent** (`food-search.tsx:321`). Recent resolves ids only against presets and custom foods, so `usda-1750340` silently resolves to nothing. If most of what I eat is branded, Recent is permanently empty and the top of my search screen is a generic list of things I've never eaten.

**Do:**
1. Filter presets/custom/recents off the **raw** query; keep the debounce for `searchUSDA` only.
2. While a query is being typed, don't title an unfiltered dump "Food database" — hide it or label it **"Popular foods"**.
3. Build Recent from the diary (the food object is already fully denormalised inside the entry that logged it), so any source rehydrates. Show the last-used portion on the row so a repeat is one tap.

### 3.11 Progress opens on a calorie chart, contradicts Profile, and can't show me more than 30 days
`app/(tabs)/progress.tsx:58, 614, 678, 704, 748, 770, 772, 190, 211`

Bundle of related honesty problems on one screen:
- **Opens on the wrong question.** Header "Progress", subtitle *"Daily intake against your goal"*, first card is Calories. Weight is the third of four segments. Someone six weeks in is asking about their body. → Default to Weight, or put a persistent weight-trend strip above the tab control.
- **Contradicts Profile.** Progress computes delta only inside the 7d/30d window (*"Down 0.4 kg"*); Profile measures from the all-time first weigh-in and reports a much larger loss plus a progress bar. → Label the Progress figure **"Change in the last 30 days"** and show the since-you-started figure alongside it.
- **Contradicts the coach.** *"Days logged 7/7"* counts a day with one coffee; the coach's alert only counts days above 500 kcal and reports far fewer. → Use the same 500 kcal threshold, or label it **"Days with any entry"**.
- **Six weeks in, I cannot see my first six weeks.** Only 7d and 30d exist; my starting weight — the thing progress is measured *from* — is viewable nowhere. → Add 90d and All. At minimum always plot the starting weigh-in as an anchor.
- **The chart lies about its own confidence.** No zero baseline, auto-scaled to min/max with 18% padding, so a 0.4 kg spread fills the canvas as a steep diagonal. `connectGaps` joins two dots 25 days apart with a straight line implying steady daily change. → Draw the fitted trend line (`weightTarget.ts` already computes it) as the primary mark with raw weigh-ins as faint dots; dash or omit segments spanning more than a few days; annotate **"3 weigh-ins over 25 days"**.
- **PRs are all-time under a header that says "last 7 days"**, and silently cut to 4 lifts. → Caption **"All time"** and add **"See all 8 lifts"** when truncated.
- **PRs never say whether they went up.** *"Bench Press · Jul 12 · 102.5 kg e1RM"* — no previous value, no delta, and "e1RM" is never explained. A PR stuck for a month looks identical to one set yesterday. → **"102.5 kg · +5.0 since Jun 14"**, row opens that lift's history.
- **The goal line is today's target drawn flat across a month.** → Caption the legend **"Goal (current)"**.
- **"You averaged 100 kcal below goal" says nothing about consistency.** Three days at 1,600 and two at 2,700 produce the same sentence as five steady days. And "Avg intake 2,050" above "Days logged 5/7" reads as a 7-day average. → Headline **"3 of 5 logged days within 200 kcal of goal"**, caption the card **"Daily average across your 5 logged days"**.
- **No chart is tappable.** The x-axis prints only the two window edges, so a dot mid-chart can't be attributed to a date at all. → Press-to-inspect showing date and value; label the midpoint.

### 3.12 The Goals back arrow is in the top-right corner
`app/goals.tsx:428` — **two journeys.** A left-pointing arrow rendered in the header's *right* slot. Reach top-left, miss, hunt. Twice per visit.

**Do:** Add a leading slot to the Screen header and move the back control into it. Keep `chat.tsx`'s X on the right — that's a modal close and reads correctly.

---

## BAND 4 — Polish

Real, but nobody churns over them.

- **"Kcal burned" is 0 every day, forever** (`index.tsx:607`, two journeys). Confirmed: `addExerciseEntry` has **zero callers**. My Workout tab and my Dashboard directly contradict each other. The StepsCard right above it already refuses to render rather than show a fake 0 (`index.tsx:167-169`) — apply the same rule. Either derive burn from the day's workout session, or replace the tile with a tappable **"No workout logged → Start one"**.
- **A green tick congratulates me for eating nothing** (`index.tsx:207`). With 0 eaten, `tone` is 'good', so a green Check sits beside "1,937 kcal left today". Suppress until something is logged; show **"Nothing logged yet"** instead.
- **Setup asks my name and never uses it** (`onboarding.tsx:414`). `profile.name` renders in exactly one place: Profile's own header. Use it on the Dashboard (**"Morning, Sam"**) or stop asking.
- **A slipped decimal logs 16,600 kcal without a murmur** (`food-search.tsx:380`). Zero and negatives are caught nicely; the other end isn't. Warn above ~10 servings or ~3,000 kcal: **"That's 100 servings (16,600 kcal). Did you mean 100 g?"** with a one-tap switch to the measured unit.
- **Coach advice is written in kg while the rest of the app is in lbs** (`src/core/utils/coachAlerts.ts:264, 273, 290, 310, 368`). The card above reads 172.2 lbs. `weightTarget.ts` fixed this with `inDisplayUnit`; `coachAlerts` was left behind, so the same app now does it both ways. Route every number through the same formatter.
- **The plan never says when it was made** (`goals.tsx:487`). *"Cut for 12 weeks"* with no start date, creation date or review date. A week later it silently re-fetches (`src/hooks/useCoach.ts:317`), the numbers change mid-scroll and the Accepted line disappears with no announcement. Print **"Built 12 Sep from your 84.0 kg weigh-in. Next review after your weigh-ins on 19 Sep."** and banner any auto-refresh: **"Plan updated just now — your targets are still the previous plan's. Accept to switch."**
- **The plan tells me to use my measured burn, then shows a plan that ignores it** (`goals.tsx:113, 506`). *"The measured number is the better one to plan around"* sits 400px below *"Built around your 2,747 kcal/day predicted burn"*, with a "Low confidence" pill on the same card. Worse, the burn figure is frozen in the plan while the predicted/measured **label** is recomputed live, so the sentence eventually claims a measured basis for a predicted number. Store the anchor source on the recommendation and render the stored label. Below medium confidence, say the measured figure isn't being used yet and what would make it usable: **"Three more fully logged days and we'll plan around your measured burn."**
- **A database value printed as a sentence** (`goals.tsx:762`): *"kcal to lose"*. Map through the `GOAL_LABELS` table Profile already uses: **"kcal to lose fat at your pace"** / **"kcal to hold your weight"**.
- **Setup and Profile use different words for the same choice** (`profile.tsx:100`). Setup: "Lose fat" / "Stay where I am" / "Build muscle". Profile: "Lose fat" / "Maintain" / "Gain weight". Share one label table.
- **The Height unit toggle changes nothing** (`profile.tsx:735`). `profile.heightUnit` is read only by onboarding; after setup no screen reads it. Honour it or remove the control.
- **The warmup toggle is hidden on the set number** (`workout.tsx:262`). A 44pt Pressable on the "1" flips a set to warmup — no chevron, no border, no hint, and the word "warmup" appears nowhere on screen. Brushing it silently removes the set from volume, set count, PRs and progression. Give it a visible "W" chip or a long-press action, plus a one-time **"Warmup sets don't count toward volume."**
- **"Bench Press" appears twice with different numbers** (`workout.tsx:990, 1247`). The database has Bench Press as both Barbell and Dumbbell, Curl twice, Row twice, Calf Raise three times. The picker disambiguates ("Chest · Dumbbell"); history and PRs don't. Append equipment — the data is already on `lift.equipment` in both places.
- **The lift picker closes and nothing changes** (`app/lift-picker.tsx:185`). The new exercise appends below the fold and the ScrollView keeps its offset, so I land on the identical view. Scroll the new card into view, or keep the picker open with a "1 added" counter and an explicit Done.
- **The AI FAB covers "Cancel workout"** (`app/(tabs)/_layout.tsx:157`). At the bottom of the scroll the 56pt FAB covers the right ~74pt of the last control. Aiming there opens the chat. And the Workout screen already has its own Sparkles header button to /chat (`workout.tsx:1145`) — same destination twice on one screen. Hide the FAB while a session is live and drop one of the two.
- **Quick-add water is a full screen down** (`index.tsx:492`) — ~900pt past the hero, the AI card, the macro ring, the coach card and five meal rows. Move it above the ring or collapse it to a one-line row near the hero with +250 inline.
- **Leaving setup halfway throws away every answer** (`onboarding.tsx:178`). Step index, name, age, height, weight, activity, goal, pace and target are all component state; only `completeOnboarding()` writes. A force-quit restarts at "Welcome, 1 of 5", blank. Persist in-progress answers and step index; restore on mount.
- **No way to see the app before handing over age, height and weight** (`app/_layout.tsx:249`). `gestureEnabled: false`, no close or skip on any step, tab bar unmounted, and `validateBasics` hard-requires all three. Offer **"Skip for now — I'll set this up later"** that sets a neutral maintenance target and marks the Dashboard hero **"Targets not set yet — finish setup"** with a link back in.
- **The account screen** (`app/login.tsx`):
  - **Two identical "Create account" buttons** — the mode toggle uses the same `Button` component and label as the submit control (`login.tsx:144-159` vs `190-197`). Tapping the top one just re-selects the mode. Render the toggle as a segmented control or a text link: **"New here? Create an account"**.
  - **No "Forgot password?", no reveal toggle, no confirm field** (`login.tsx:172`). Confirmed: there is no reset route anywhere in `app/`. If the password I typed blind isn't what I think it is, the only thing I ever see again is *"Wrong password, or there is no account for me@example.com yet."* Add an eye toggle and a **"Forgot password?"** link calling `resetPasswordForEmail`, confirming in the existing `Message` component: **"Check your email — we've sent a link to reset your password."**
  - **The submit button greys out with no explanation** (`login.tsx:102`). `canSubmit` needs 6+ characters; that rule appears only in the placeholder, which vanishes as you type. Move **"At least 6 characters"** to a permanent helper line under the field, in the critical colour once touched.

---

## The five things that would most change how this app feels

1. **Make the food loop actually work.** Ship a real USDA key (`usdaApi.ts:5` can never resolve in Expo — every install is on DEMO_KEY at 30/hr), tell the truth on 429, and wire up the `addCustomFood` button that the empty state and the "Your foods" section are both already waiting for. Right now the app's primary function stops working every afternoon and blames the user's wifi, and if your food isn't in a database you cannot log it at all.

2. **Stop the set row from eating my work.** Invert the delete guard at `workout.tsx:239` and put space between the ✓ and the bin. This is the only place in the app where a normal thumb movement destroys data silently, and it's in the loop people repeat twenty times a session.

3. **Make the numbers agree with each other.** Store weigh-ins in kg and convert at render (`appState.ts:319`). Three different bodyweights on adjacent cards is the single fastest way to lose someone's trust in every other figure on screen — and it takes Progress-vs-Profile, coach-alerts-in-kg, and the Dashboard's two calorie goals down with it.

4. **Give the calorie target a front door.** Add a **"Daily targets — 2,252 kcal · 169 P / 225 C / 75 F ›"** row to Profile, make Progress's goal tile a link, and label which of the two big numbers is actually in effect. Four journeys got lost looking for this. It's the number the whole app is about and it currently has one unlabelled door.

5. **Fix the launch and offline story so the app never looks broken when it isn't.** Reword the "Can't reach your account" screen so it stops claiming an empty device, let fresh sign-ups and users with a local copy straight through, confirm before wiping the device, auto-retry on reconnect, and put words under the launch spinner. Today the app's first impression on a flaky connection is a wordless twenty-second hang followed by a wall that lies and a button that deletes your data.


---

## The walkthroughs

### first-run

**Launch.** I tap the icon. The native splash goes, and I get a jade rounded square with three concentric arcs in it, and a small spinner underneath. That is all. No word "MacroFit", no tagline, no text of any kind — "Loading your account" exists only as an accessibility label (src/components/LaunchScreen.tsx:28-31), so I never see it. On my hotel wifi this sat there for what felt like ten seconds (the account fetch has an 8s timeout before it gives up), and for most of that I could not tell whether the app had hung. The very first thing on screen does not tell me what this app is.

**The account screen.** Then it fades to something much better: the mark again, "MacroFit" in big display type, and "Nutrition, training and coaching that adapts to your own data." Now I know what I've installed. Below that a frosted card with two side-by-side buttons — a filled jade one reading **Sign in** and a flat grey one reading **Create account** — then Email ("you@example.com"), Password ("At least 6 characters"), and at the bottom another full-width filled jade button also reading **Sign in**.

I've never used this, so I tap **Create account** at the top. The two swap: now "Create account" is the filled jade one and "Sign in" is grey. But the button at the bottom of the card has *also* changed to "Create account". I am now looking at two identical jade "Create account" buttons, one at the top of the card and one at the bottom, and only the bottom one submits. The first time through I tapped the top one twice, wondering why nothing happened.

I type my email and a password. I fat-finger it and only type five characters. The bottom button goes half-transparent and stops responding. Nothing tells me why — no "6 characters minimum", no red text. The placeholder that said "At least 6 characters" vanished the moment I started typing. I sat there tapping a dead button (app/login.tsx:102). I add a character, it lights up, and I'm through: "Account created. Open the confirmation link we emailed to me@example.com, then sign in." — good, honest copy, and the toggle quietly flips back to Sign in for me. I go to my inbox, click the link, come back, tap Sign in. The button says "Sign in" with a spinner and a line appears: "Restoring your data…". That's reassuring; I don't tap it twice.

Two things worry me while I'm here. The password field is masked with no reveal eye and no confirm field, and there is no "Forgot password?" link anywhere on this screen — and no reset route anywhere in the app. If the password I just invented isn't the one I think it is, my only recorded route back is the error message "Wrong password, or there is no account for me@example.com yet."

**Setup.** Straight into it: a progress bar of five segments, "Welcome" on the left, "1 of 5" on the right. Good — I know how long this is. A sparkle tile, "Let's set up your targets", "Five short questions. We work out what your body burns in a day, then turn that into a calorie and protein target you can actually hit." Then three promises: "Log meals by searching, snapping a photo or just typing what you ate", "Weigh in whenever you like — we read the trend, not the daily noise", "Targets adjust as your weight moves, so they stay honest." I'm sold on the photo one; that's the feature I actually wanted. (There is no photo capture anywhere in the app. `postAnalyzePhoto` exists in the API client and nothing in any screen calls it. I looked for it later on the diary and never found it.)

"Get started". Step 2 of 5, "About you": "These four numbers set every target in the app. Nothing here is shared with anyone." Name (Optional), a three-way male/female/other under "Sex used for the calculation" with the note "Body-fat and calorie formulas differ by sex. 'Other' uses the average of both", Age, Height with a cm / ft-in toggle, Weight with kg / lbs and "Rough is fine. This becomes your first weigh-in." This is the best-written screen in the app. Flipping cm→ft rewrites the numbers instead of blanking them. I put in 32, 180 cm, 185 lbs.

Step 3, "Your days": "Pick the line closest to a normal week — not your best one. Overshooting here is the most common reason a target ends up too high." Five full-width rows, each describing a life rather than a multiplier ("Desk job, driving, little walking. No regular exercise."). I pick Lightly active. Step 4, "Your goal": Lose fat / Stay where I am / Build muscle, then "How fast?" with Gentle / Steady / Quick priced in lbs because that's the unit I chose ("Steady — 1.1 lbs a week"), then an optional "Goal weight (lbs)" which, when I type 170, prints "About 14 weeks at this pace." in green. That is the single most convincing moment in the whole app.

Step 5: "Here's your daily target". "You burn roughly 2487 kcal a day. Eating under that is what moves the scale down." A big green **1,937 kcal** in a box marked "Eat per day", then 145g Protein / 194g Carbs / 65g Fat. Two footnotes: "Nothing is locked in — every number is editable under Profile" (it isn't — calories and macros are edited on a Goals screen you reach through a card on the dashboard; Profile only recalculates them) and "Log for a couple of weeks and the coach re-checks these against your real weight trend." One button: **Start tracking**.

Two things I only found out by accident. There is no skip and no way out — no close button, back-swipe is disabled, and the tab bar isn't there. If I wasn't ready to hand over my age, height and weight, I could not have looked at a single screen of this app. And when my phone rang halfway through step 3 and I came back twenty minutes later, I was at "Welcome, 1 of 5" with every answer gone (`step` and all the field state are plain component state, app/onboarding.tsx:178-193; only `onboardedAt` is persisted, and that's written at the very end).

**Where setup drops me.** The Dashboard tab, header "Today · Jul 29 · Wednesday", with a sparkle button top-right. Scrolling from the top:

1. **Eaten today** — a huge `0`, "of 1,937 kcal", an empty progress bar, and a green tick beside "1,937 kcal left today". A green tick on a day where I have eaten nothing reads like praise for doing nothing.
2. **AI Nutrition Assistant** — "Log meals, water or weight by speaking" and an **Ask AI** button. I tapped it expecting a microphone. It's a text box with the placeholder "What did you eat?" and a Send button. No mic anywhere.
3. **Macros** — a 192pt ring with all three arcs empty and `0` / "kcal today" in the middle, and 0g/145g, 0g/194g, 0g/65g underneath. It's the second card telling me I've eaten nothing today; between them the hero and the ring own the entire first screenful.
4. **Coach** — "No plan yet — set a phase and a calorie target built from your own data." I had a target ninety seconds ago. The setup screen literally said "Here's your daily target: 1,937 kcal", and now the app says I have no plan. Tapping it opens a Goals screen with a "Get my plan" button; the back arrow to escape it is in the *top-right* corner where I look for a menu.
5. **Meals** — finally, the thing I came for. Breakfast / Lunch / Dinner / Snacks, each "Nothing logged" with a jade "Add food" on the right. This is roughly two full scroll flicks below the fold.
6. **Water** — "0 of 2,500 ml" with +150 / +250 / +350 / +500 and a minus. This one works instantly and gives real feedback. I never chose 2,500 and nothing says where it came from.
7. **Weight goal** — since I did type a goal weight, it shows "185 → 170 lbs", "0% of the way from your starting weight", a **98 days left (14 weeks)** countdown tagged "planned pace", and "Weighed in today. Daily weigh-ins make the trend far more reliable." Solid. But a friend of mine who skipped the optional goal weight gets one grey sentence instead — "Set a goal weight to track whether you are heading the right way." — with nothing to tap. No button, no link, no hint that the field lives on the Profile tab.
8. **0 Day streak** / **0 Kcal burned**.

Nowhere on this screen does anything say "start by logging your breakfast". There are three separate ways to reach the AI chat (the header sparkle, the Ask AI card, and a floating jade sparkle button that hovers over the bottom-right corner of the last card) and zero direct ways to log food.

**Logging breakfast.** I look bottom-right for a "+" — that's where every app puts it. What's there is the sparkle FAB, which opens the chat. So I scroll back to Meals and tap the jade **Add food** next to Breakfast. It does not add food. It drops me on the Diary tab at the top, where I have to get past the date navigator and a tall Calories/Protein/Carbs/Fat/Fiber/Sugar/Sodium totals card before I reach a Breakfast card that says "Nothing logged for breakfast yet." and has its *own* "Add food" button at the bottom. Tap that (tap 2) and the real search modal finally slides up: "Add food / Breakfast · Jul 29", a search field "Search foods and brands".

From there it's good. I type "oatmeal", get "Matches" from the built-in database and a "USDA FoodData Central" section that shows "Searching the USDA database…" while it loads. I tap a row (3), get an Amount stepper with Servings / g chips, a Meal row with Breakfast already selected, an "Adds to your day" panel showing 154 kcal and P/C/F chips that update as I step, and a full-width **Add to Breakfast** (4). It buzzes, closes, and I'm on the Diary with the entry there and the totals moved. That part I'd keep.

Four taps and a hunt, for the thing I'll do four times a day — and the tap labelled "Add food" is not the one that adds food.

**Verdict as the person deciding whether to keep it.** The setup flow and the food search are genuinely better than what I've used before. The first screen after setup undoes a lot of that: it opens with two cards of zeros, sells me an AI three times, tells me I have no plan sixty seconds after giving me one, hides the one action I actually came to perform below two screens of scrolling, and promises a photo feature that isn't in the app.

### daily-food

**Cold open — 7:40am, kettle on, phone in my left hand.**

Splash holds, then a branded launch screen, then the Dashboard. Header: "Today / Jul 29 · Wednesday" with a sparkle icon top-right. Under it, the one card I actually want: "Eaten today / **0** of 2,000 kcal", a green check and "2,000 kcal left today". Good. That's honest and it's the number I came for.

Then the screen stops being about me. Card two is an advert: a jade square, "AI Nutrition Assistant / Log meals, water or weight by speaking", and a green **Ask AI** button. Card three is a 192pt donut with "0 kcal today" in the middle and three legends reading "0 g of 150 g", "0 g of 200 g", "0 g of 67 g". So the top of my home screen at 7:40am is a big zero, an ad, and a ring of zeros.

I want to log oatmeal. I look for a plus. There isn't one. There is a fat green circular button floating bottom-right — exactly where every app I've used puts "log food" — and it is the AI chat again (`app/(tabs)/_layout.tsx:140`). Third sparkle icon on the same screen.

So I scroll. Past the ring, past "Coach: no plan yet", and finally "Meals": Breakfast / Lunch / Dinner / Snacks, each with "Nothing logged" and a green "Add food". That's roughly 700pt down — the entire Meals card is below the fold on a 6.1" phone. **Tap 1:** Breakfast.

I land on **Diary** — at the top, not at Breakfast. Date navigator, then a tall totals card (calories, protein, carbs, fat, fiber, sugar, sodium). Scroll again. Breakfast card: "Nothing logged for breakfast yet." and a secondary **Add food** button. **Tap 2.**

A modal slides up: "Add food / Breakfast · Jul 29", a search box… that is not focused. **Tap 3** to put the cursor in it. I type "oatm". For 350ms nothing happens, then — while I'm typing — the list under the heading "Food database" is showing Apple (medium), Banana (medium), Blueberries. The local database is debounced along with the internet call (`app/food-search.tsx:266-269, 313`), so a 100-item in-memory list lags my thumb. Then it snaps to "Matches → Oatmeal (1 cup, cooked), 166 kcal, P 6g C 28g F 4g", and below it a section "USDA FoodData Central" with a spinner: "Searching the USDA database…".

**Tap 4:** Oatmeal. The header changes to "Oatmeal (1 cup, cooked) / Choose an amount" — and the date and meal I was logging into just vanished from the header. Amount card: chips "Servings | g", a minus, a field showing **1**, a plus, caption "Servings of 234 g". Below: Meal chips (Breakfast already selected — six chips wrapping to three rows I don't need). Below that: "Adds to your day / **166** kcal". At the very bottom, **Add to Breakfast**.

**Tap 5.** Buzz. The modal drops away and I'm on the Diary with 166 kcal under Breakfast. That part is genuinely good — the haptic plus the row appearing is enough to know it worked.

**Five taps and a scroll-hunt, twice before I've left the house.**

**The portion step, when I want 1.5.** I tap the field, the decimal pad comes up, I type 1.5 — and the "Add to Breakfast" button is now under the keyboard. There's no keyboard-avoiding view; the ScrollView's bottom padding is 32 + safe area (`app/food-search.tsx:538-543`), nowhere near a 300pt keyboard. On iOS the decimal pad has no Done key, so I have to tap a blank patch of card to dismiss it, then tap Add. Silly input is handled well though: "0" turns the button grey and says "Enter an amount greater than zero." But "100" (I meant 100 g, I was in Servings mode) sails through and books 16,600 kcal with no eyebrow raised.

**Search on bad wifi.** Standing in the kitchen the router is two rooms away. The USDA spinner just… spins. Forever. There's no timeout on the fetch (`app/food-search.tsx:286`), and the Try again button only exists in the error state, so a half-open connection gives me a permanent "Searching the USDA database…". When it does fail properly the copy is good — "Could not reach USDA FoodData Central. Check your connection. Everything above still works offline." — except that it's often not true. The API key is read as `(import.meta as any).env?.VITE_USDA_API_KEY` (`src/core/utils/usdaApi.ts:5`), a Vite/web idiom that can never resolve in Expo, so every install ships on `DEMO_KEY` — 30 requests an hour, 50 a day, shared per IP. Someone logging 4 meals a day with 2-3 searches each burns that before dinner, and then the app tells me my wifi is broken.

**No matches at all** — say I search "dal": preset gives nothing, USDA gives nothing, and I get *two* messages stacked: "No USDA matches. Try a shorter or more general word." and, right below, a big "No matches / Try a shorter word, a brand name, or the plain ingredient." Neither offers me the one thing I need: **add it myself**. `addCustomFood` exists in the store and nothing in the app calls it. So home-cooked food is a dead end — I back out and guess with "Brown Rice (1 cup, cooked)".

**Later — 11am snack.** Dashboard again, scroll again, tap "Snacks"… and I'm dropped at the *top* of the Diary. I now scroll past the totals, Breakfast, Lunch, Dinner to reach Snacks. The row said Snacks; it delivered me to a page (`app/(tabs)/index.tsx:429`).

Also, my almonds came from USDA yesterday. Today they are **not** in "Recent". The recent list resolves ids against the preset table and my custom foods only (`app/food-search.tsx:321`, `src/core/data/foodDatabase.ts:151`), and a USDA id is `usda-1750340`, which resolves to nothing and is silently skipped. So the more I use the internet search, the emptier my Recent list gets — and where Recent should be, I see "Food database → Apple (medium)".

**Fixing last night's dinner.** Diary tab, left chevron. The header now reads "Jul 28" with a small muted "Yesterday" under it, and a "Jump to today" button appears — that's well done. I scroll down past totals, Breakfast, Lunch to Dinner. The chicken row shows name, "113 g", "187 kcal" — and nothing at all suggesting it's interactive. No chevron, no pencil, no swipe hint. I try a long-press (nothing), then a swipe (nothing), then finally tap it and a stepper unfolds with minus / 1 / plus and a **Remove** button. Remove deletes instantly. No "are you sure", no undo, no toast (`app/(tabs)/diary.tsx:412-417`). One mis-tap on a phone I'm holding one-handed and last night's dinner is gone with no way back.

Then I do the dangerous thing: I never tap "Jump to today". Later I open the Dashboard, it says Breakfast — Nothing logged (today), I tap it, and the Diary is **still sitting on Jul 28** because the date is component state that survives tab switches (`app/(tabs)/diary.tsx:671`) — along with my scroll position, so I may not even see the date header. I hit Add food and the modal says "Breakfast · Jul 28", and the moment I pick a food even that disappears, replaced by "Choose an amount" (`app/food-search.tsx:421-422`). The button says "Add to Breakfast". It does not say which Breakfast. I have now logged today's eggs onto yesterday, and the Dashboard will keep telling me Breakfast is empty.

**The lunch I eat every single day.** I want a one-tap repeat. I look on the Dashboard: nothing. I look at the top of the Diary: nothing. I scroll — past totals, Breakfast, Lunch, Dinner, Snacks, Pre-Workout, Post-Workout — about 1,500pt — and there at the very bottom is **Saved meals**: "Log a meal, then tap its bookmark to save it. Saved meals drop into any day in one tap." That instruction is at the bottom of the longest screen in the app, telling me about a bookmark icon I've never noticed, which lives unlabelled in a meal card header and only appears when the meal already has food in it (`app/(tabs)/diary.tsx:476-490`). Two weeks in, I had no idea any of this existed.

Once I do find it: I tap "Standard lunch". A small buzz — and the screen does not change, because everything it just added is 1,200pt above where I'm standing. No toast, no count, no scroll, nothing. I tap it again to be sure. Now I have two lunches. And because applying a template doesn't touch the streak (`src/core/store/appState.ts:365-377`, which never calls `updateStreak`), if the saved meal is all I log today, the Dashboard's "Day streak" tile stays on yesterday's number while my diary is full.

Meanwhile the store has `copyDayEntries` and `copyMealEntries` — "copy yesterday's dinner to today", the exact thing I want — and **no screen in the app calls either of them**. They don't exist as far as any user is concerned.

**Two numbers on my home screen that are lying to me.** "Kcal burned" sits next to my streak in a tile and reads **0**. It always reads 0, for everyone, forever: it sums `day.exercises`, and `addExerciseEntry` is never called from any screen (`src/core/store/appState.ts:284`). I did legs yesterday and logged every set in the Workout tab; the Dashboard still says 0 kcal burned. And the streak itself resets to 1 if the first thing I log on a given day happens after ~7pm (or before ~5:30am, depending where you live), because it compares a local "today" against a UTC-derived "yesterday" (`src/core/store/appState.ts:389`).

**On the recent changes, as a user:** the "Not synced — we could not reach your account. Everything you log stays safely on this device until it clears." banner reads as the app looking after me, not as it being broken — good copy, and the Retry is right there. The "Can't reach your account" full-screen block is the honest call and the wording ("nothing has been lost") is reassuring, though Sign out is the only way past it, which will read as harsh to someone in a lift. The sign-out warning ("Some of what you logged has not reached your account yet… That work would be lost") is exactly right. The Progress tab's card is the odd one: it's still titled **"Import from Google Fit"** with a caption "Bring past weigh-ins in from Health Connect", and then it doesn't import anything — the button just says "Open Profile", and dumps me at the top of a very long Profile screen with no hint where the importer actually is. A card that names an action and doesn't do it reads as a broken button, not a signpost.

And the thing that started it all: the Dashboard promises I can "Log meals, water or weight **by speaking**". There is no microphone anywhere in the app. The assistant is a text box with the placeholder "What did you eat?". It also always logs to *today*, even if I opened it from a Diary sitting on yesterday.

### workout

**Setting: bench press station, 7pm, gym is loud, phone face-up on the bench, hands chalky.**

---

**Screen 1 — Workout tab, nothing running.**

Header reads "Workout". Top right there's a jade sparkle icon (AI chat), and there's a *second* jade sparkle FAB floating over the bottom-right corner — same destination, twice on one screen. Below the header, one white card: **"Ready to train?"** in 20pt Fraunces, then "Pick up where you left off — every lift remembers what you did last time.", then a full-width jade **"Start workout"** button. Below that, a "Quick start" strip if I've saved templates, then **Personal records** (top 5, each row "Bench Press / Best set 225 lbs · Jul 22" with a big est. 1RM on the right), then **History**.

That's clean. I press "Start workout". Tap 1.

**Screen 2 — session live.**

A frosted card takes over the top. A text field holding "Evening workout" (it's after 5pm), a green "Live" pill, then the hero row: **a 40-point "0"** with "LBS VOLUME" under it, "0 / SETS", "00:04 / ELAPSED" ticking. Under that, a full-width jade **"Finish workout"** button — the single most prominent button on the screen, one tap, no confirmation, right where my thumb rests while scrolling.

Below the card: "Nothing logged yet — Add the first lift of the session. Every set is weight × reps, ticked off as you finish it." with **"Add exercise"**. Tap 2.

**Screen 3 — lift picker (modal sheet).**

Back chevron, "Add exercise", a search box, then **two stacked rows of horizontally-scrolling chips** — 12 muscle chips, then 8 equipment chips — eating ~110pt before the first result. Under that, "YOUR LIFTS 6" with my most-trained lifts, then "ALL LIFTS". Bench Press is row 2 of my lifts. Tap 3. Light haptic, sheet slides away.

**Screen 4 — back on the workout, and here's the first thing that stops me.**

The Bench Press card is there: name, "Chest · Barbell", then "Target from last time **102.5 kg × 8**" — but **there are no set rows at all**. No "Set / Weight / Reps / Done" header. Just a "Add set" button. The app knows exactly what I'm about to do — it printed the target one line above — and it still makes me ask for a row. Tap 4.

Now a row appears: `1 | [102.5] | kg | [8] | ✓ | 🗑`. The 102.5 and the 8 are **grey placeholders, not values**. My instinct — the whole reason the target is printed there — is to hit the ✓ and move on. I do. **Nothing happens.** The tick is at 40% opacity and disabled because `reps === 0`, and the screen says nothing about why. No shake, no toast, no "enter reps first". I tap it twice more before I work out that the numbers I'm looking at are ghosts.

So: tap the weight field (tap 5), the decimal pad comes up, type `1 0 2 . 5` (5 keystrokes), tap the reps field (tap 6), type `8`, tap the ✓ (tap 7). Light haptic, row turns pale green, volume jumps to 1808, Sets → 1.

**Eight taps and six keystrokes for one set.** And every subsequent set is the same six keystrokes — the placeholder never becomes a value. I do 15–20 sets in a session. That's ~150 keystrokes to record numbers the app already knows.

**The moment I tick the set, the whole page jumps down about 100 points.** The rest timer has been injected *above* the exercise cards, so everything I was looking at slides out from under my thumb. First time it happens I think I've mis-scrolled.

**Screen 5 — resting.**

The timer is a bordered strip: `⏱ Resting  [−] 2:00 [+] [×]` with a thin progress bar. It's between the session card and the exercise list. With one exercise on screen it's visible — good. It counts down honestly off a wall-clock deadline, so when I switch to Spotify to change the track and come back, **the number is still correct**. Genuinely well done.

Everything else about it is wrong for a gym:

- When rest ends, all I get is a **success haptic and the word "Resting" changing to "Rest complete"**. No sound, no notification, no vibration if the app isn't in the foreground. My phone is face-up on a bench two feet away, I'm chalking up, and the only signal that my rest is over is a colour change on a 22pt number I'm not looking at.
- **There's no keep-awake.** My phone auto-locks at 30 seconds. The rest default is 120. So for the last 90 seconds of every single rest the screen is black and I have to wake and unlock the phone to see the countdown. Twenty times a session.
- The `[×]` dismiss sits 8pt from `[+]`. Hit it and the timer is gone, the page jumps back up 100pt, and **there is no way to restart it** — the only thing that starts it is completing another set.

**Screen 6 — second exercise, and the timer disappears.**

I tap "Add exercise" at the bottom (tap 8), pick Incline Dumbbell Press (tap 9), and the sheet closes back onto... exactly the view I left. The new card was appended to the bottom, off-screen. There is no scroll-to, no toast, nothing on screen changed. For a second I think the tap didn't register and nearly add it twice.

I scroll down to it. Now I'm roughly a screen and a half below the top. I do my set, tick it — **and the rest timer is completely off-screen, pinned way up near the session card**. To see how long I've rested I have to scroll all the way up, which puts my set rows out of view; to see my next set I scroll back down and lose the timer. There is no floating pill, no header badge, nothing. For the second exercise onward, the rest timer effectively does not exist.

**Screen 7 — the typo.**

Set 2 of the incline press: I mean 102.5 and my chalky thumb enters **1025**. Instantly the volume figure balloons to five digits and a green **"New PR — 1025 kg × 8"** trophy pill blooms under the row. The app celebrates the mistake.

*Mid-session*, fixing it is fine: tap the field, `selectTextOnFocus` selects everything, retype. Except — the row is already ticked, and a completed row's inputs are drawn **flat: no border, no background**, so the numbers read as printed text rather than fields. I hesitate for a good few seconds wondering if I have to delete the set and start over.

Which brings me to the thing that nearly ended my session. **The 🗑 sits 4 points from the ✓.** Both are 44pt targets, side by side, at the right edge where my thumb naturally lands. And the confirmation logic is backwards for the exact moment of maximum risk: an *already completed* set asks twice ("Tap the bin again to remove this set"), but a set that is **not yet ticked — i.e. the one I've just spent six keystrokes typing into — is deleted instantly on the first tap.** I typed 102.5 × 8, reached for the tick, drifted 4pt right, and the whole row vanished. No undo, no message. Retype it all.

**Screen 8 — also on the second exercise's typo: while the keyboard is up, I can't see what I'm typing.**

The workout screen has no `KeyboardAvoidingView` (chat, login and onboarding all have one — this screen doesn't). Tapping a weight field on the lower half of the screen brings up the number pad *over* the field. I'm entering a weight into a box I cannot see, and the ✓ I need to press next is behind the keypad too.

**Screen 9 — finishing.**

I scroll back to the top and tap **"Finish workout"**. One tap. No confirmation, no "you logged 14 sets, are you done?".

And then: **the session card just disappears.** In its place, the card that says **"Ready to train? — Pick up where you left off"** with a "Start workout" button. That is the app's entire response to fifty minutes of work: it asks me to start another workout.

No summary. No "8,240 kg, 14 sets, 52 minutes". No "you set 2 PRs today" — even though it knew, because it drew a trophy pill on those sets ten minutes ago and then threw it away. The only trace is a collapsed grey History row below the fold that I have to scroll to and tap to expand.

**Screen 10 — the typo, permanently.**

I expand that history row. There it is: **"Incline Bench Press — 1 × 8 @ 1025 kg"**. Under it: "Save as template" and "Delete". **There is no edit.** The number is frozen. Worse:

- The Personal records list at the top of the tab now permanently leads with an est. 1RM of ~1298 kg.
- Next time I train incline press, "Target from last time" will read **1027.5 kg**, because `suggestNextSet` adds 2.5 to my heaviest completed set.
- My only remedy is **"Delete for good" — "This deletes the session and every set in it. It cannot be undone."** I have to throw away the entire workout to remove one wrong digit.

Also, that history detail reads "Bench Press" and "Bench Press" if I did barbell and dumbbell in the same session — the detail view and the PR list both print only `lift.name`, and the database has "Bench Press" twice, "Curl" twice, "Calf Raise" three times. Two rows, same name, different numbers, no way to tell them apart.

**Screen 11 — I forgot to finish.**

Suppose I'd walked out without tapping Finish. Next evening I open the tab: the card is still there, still wearing a green **"Live"** pill, and the elapsed timer reads **20:41:07**. Nothing offers to close it or asks "did you finish this?". If I just tap "Start workout" for today's session, the store silently stamps `endedAt = Date.now()` on yesterday's — which lands in History as a **"20h 41m"** workout, with no word to me that it happened.

**Two smaller things I noticed all session:**

- The ✓ — the control I press more than any other — is the lowest-contrast thing on the row: an unfilled box with a `textMuted` grey tick on a `border`-grey outline, sitting at 40% opacity until reps are entered. In dark mode that's `#78716C` on `#0C0A09` inside a `#292524` border. At arm's length on a bench, under gym lighting, it's a dark smudge. Everything decorative — the 40pt volume figure, the green Live pill — is louder than the button.
- The column headers ("SET / WEIGHT / REPS / DONE") are 11pt uppercase in `textMuted` with 0.8 letter-spacing. Unreadable from arm's length, though at least the layout is guessable.
- With no signal in the gym basement, the red-bordered **"Not synced — we could not reach your account. Everything you log stays safely on this device until it clears."** banner sits above everything for the whole session. The copy is honest and reassuring and I liked it — but it's ~100pt of permanent chrome pushing the rest timer and my set rows further down an already-tight screen, it never says what "clears" means, and it can't be dismissed.

### progress

SUNDAY MORNING. SIX WEEKS IN. ONE QUESTION: AM I ACTUALLY MAKING PROGRESS?

**Tap 1 — the Progress tab.**

The header says "Progress", and under it, in small muted type, "Daily intake against your goal". That subtitle is the first thing that tells me this screen has decided what I care about, and it isn't what I came for.

Below the header: a segmented control — `Calories | Macros | Weight | Training` — with **Calories** already selected (progress.tsx:614). Under that, a row with a flame icon and the word "last 7 days" on the left, and a second segmented control `7d | 30d` on the right, with 7d selected. So in the top ~180px I have read the phrase "last 7 days" twice and the word "Calories" twice, and I still haven't seen a number.

Then the first card: **"Calories" / "Intake per day, last 7 days"**. A legend — a dark square labelled "Intake", three little dashes labelled "Goal". Then a chart, 152px tall: an area filled to zero, a dashed horizontal line at 2,150, dots on the days I logged, gaps where I didn't. Down the left edge, three tiny 11px figures: `2,500 / 1,250 / 0`. Under the chart, two dates: "Jul 23" on the left, "Jul 29" on the right. That's the entire x-axis. Seven days, two labels, and no way to tell which dot is Wednesday.

I try tapping a dot to see what I ate that day. Nothing happens. There is no touch handling in the chart at all (progress.tsx:190–328) — no tooltip, no press, no callout. The charts are pictures.

Below it, **"Summary"** — three tiles: `Avg intake 2,050 kcal`, `Daily goal 2,150 kcal`, `Days logged 5/7`. Then one sentence: *"You averaged 100 kcal below goal."*

That's the whole calories answer. And it is the wrong shape of answer. I don't want to know my mean — I want to know **how many days I actually hit it**. Averaging 100 under is what you get from three days at 1,600 and two days at 2,700, and that is a completely different six weeks from five days at 2,050. There's no adherence count, no "4 of 7 days within range", nothing. Worse: the card is headed just "Summary" with no caption (progress.tsx:762), so "Avg intake 2,050" sitting directly above "Days logged 5/7" reads like an average over 7 days when it's an average over 5.

And the dashed goal line is drawn at `goals.calories` — my target *right now* (progress.tsx:748). If the coach moved my target three weeks ago, the chart is showing me flat-lining against a number that didn't exist then, silently.

**Tap 2 — the Weight segment.** This is what I came for.

Card: **"Weight" / "Weigh-ins in kg, last 7 days"**. I have three weigh-ins across six weeks, so in a 7-day window I probably have one. One point renders as a single dot floating in the middle of the canvas, with a y-axis reading `79.6 / 78.0 / 76.4` — an axis invented by padding a single value by ±2%. No message. No "one weigh-in can't show a trend."

I hit **30d**. Now maybe two of my three weigh-ins are in range. The chart auto-scales to whatever those two values are, with 18% padding (progress.tsx:211–221) — no zero baseline, ever. Two weigh-ins 0.4 kg apart fill the full 152px as a diagonal cliff. And `connectGaps` is on (progress.tsx:935): it draws one straight confident line from a dot on Jul 2 to a dot on Jul 27, across 25 days where I never stepped on a scale. That line is a claim the app has no evidence for, and nothing on the card says so.

My third weigh-in — the one from week one, my *starting weight* — is simply gone. `weightPoints` only keeps entries inside the window (progress.tsx:670–676), and the longest window is 30 days (progress.tsx:58). Six weeks in, and the app will not show me my first six weeks.

Summary card: `Latest 78.1 kg` · `Entries 2` · `Change ↓ Down 0.4 kg`, and the sentence *"Down 0.4 kg from Jul 2 to Jul 27."*

**Down 0.4.** Six weeks of effort and the screen called Progress tells me 0.4 kg. Meanwhile, when I later land on Profile, the same app tells me I'm "41% of the way from your starting weight" — because that card measures from my all-time first weigh-in and this one measures from whatever survived a 30-day filter. Two screens, one body, two different stories.

And that's it for the Weight tab's actual content. There is **no goal weight, no ETA, no "on track / stalled / going the wrong way", no trend line, no rate**. The app computes all of it — `getWeightTargetProgress` produces a status, a percentage, a countdown in days, and a least-squares kg/week — and puts it in `WeightTargetCard`, whose own docstring says *"This is the screen's answer to 'am I actually making progress?'"* (WeightTarget.tsx:33–35). That card is mounted on the **Dashboard** and on **Profile**. It is not on Progress.

Below the Summary, the last card on the Weight tab: **"Import from Google Fit" / "Bring past weigh-ins in from Health Connect"** — and then the body text says *"Importing lives with your other connections, on Profile. Days you logged yourself are never overwritten."* with a button, **"Open Profile"**.

So I am reading a card that announces an import, then retracts it, then reassures me about an overwrite behaviour I have never encountered and could not have worried about. It reads like a release note that escaped into the UI. And on my iPhone — or any Android without Health Connect installed — I'd tap "Open Profile", arrive, and find nothing about Google Fit anywhere, because that whole section on Profile is gated on `health.availability === 'available'` (profile.tsx:572). The card promises a destination that may not exist.

Here's the sharper problem: on the Weight tab, **"Open Profile" is the only button on the screen**, and it is filed under a header about Google Fit. If I have zero weigh-ins, I get an empty state — *"No weigh-ins yet. Log your weight from the Profile tab. Two entries in the last 7 days draw a trend."* — followed by a Summary card that renders anyway with three dead tiles (`No data yet`, `No data yet`, `Needs 2 weigh-ins`), followed by the Google Fit card. Three cards, an instruction to go somewhere else, a summary of nothing, and not one control that logs a weight.

**Tap 3 — Training.** Are my lifts going up?

First card: **"Volume by muscle" / "Volume load in kg, last 7 days"**. Horizontal bars: `Chest 4,280 kg · 14 sets`, `Back 3,910 kg · 16 sets`, and so on, each bar normalised to the biggest one. So the bar length tells me which muscle got the most tonnage this week. It does not tell me whether that's more than last week, or enough, or too much. There is no comparison to any previous period and no target. It's a picture of what I did, filed under a tab called Progress.

Second card: **"Summary"** — `Sessions 4`, `Total volume 18,240 kg`, `Working sets 62`. Same problem. Big numbers, no reference point.

Third card, and I have to scroll past two full cards to reach it: **"Personal records" / "Best estimated 1RM per lift"**. Four rows:

> Bench Press — Jul 12 — **102.5** kg e1RM
> Back Squat — Jul 9 — **140.0** kg e1RM
> ...

This is the closest thing to my question and it still doesn't answer it. Every row shows a single number and a date. **There is no previous value and no delta.** I cannot tell whether 102.5 is up from 97.5 or has been stuck there for a month — the only hint is a 11px muted date I have to do arithmetic on. "Am I getting stronger" is answered with "here is a number."

And the list is unwindowed. The whole tab above it says "last 7 days", the range control is still sitting at the top of the screen, and `getPersonalRecords` reads my entire history (progress.tsx:704–710). So a PR I set in week one appears under a header that says 7 days, with nothing to say otherwise. It's also silently cut to four lifts — I train eight, and there is no "see all", no count, no indication four are missing.

"e1RM" is never expanded anywhere.

**Now I want to weigh myself.**

On the Weight tab there is no field. The empty state told me "Profile tab", so: **tap 4 — Profile.** Second card down, past my avatar and a `Weight / BMI / Streak` row, is the Weight goal card. It has the big number, the progress bar, the countdown, the status chip — everything the Progress screen didn't have. At the bottom, `Today's weight (kg)` with a field and a **Log** button. Tap the field, type 78, tap Log. **Five taps** for something I'm meant to do every morning.

There's a Dashboard copy of the same card, but it's the **eighth** thing on that screen — below the hero, the AI assistant strip, a 192px macro ring, the coach card, four meal rows, the water card and the steps card (index.tsx:173). Nobody scrolls there to weigh in.

The Log works, at least: the field is replaced by a checkmark and *"Weighed in today. Daily weigh-ins make the trend far more reliable."* Real feedback. But if I fat-finger `7.8` instead of `78`, it takes it — the only check is `value > 0` (WeightTarget.tsx:81) — and the field then vanishes, because I've "logged today". My current weight is now 7.8 kg. My BMI, my TDEE, my calorie target, my ETA and every coach number are poisoned, and the card I logged from offers me no way to fix it. I have to find Profile → "Weight log" (a collapsed section, six sections down) → trash icon → then come back and re-log. The same screen just added a range check on **age** and **height** with a clear inline error. Weight — the one number everything else is derived from — has none.

**And the thing I actually needed, which I never saw.**

The app knows exactly why I might be stalling. `getCoachAlerts` writes sentences like *"Your weight has stopped moving — across the last 24 days (5 weigh-ins) your weight has changed about 0.0 kg a week, which is flat. To keep losing your calorie target probably needs to change."* and *"Protein is running low — you averaged 98.0 g over your last 5 logged days, about 1.3 g per kg of body weight..."* That is the answer to "am I making progress" **with a reason attached**.

Those render in exactly one place: `app/goals.tsx`, which is not a tab. The only door to it is the "Coach plan" card on the Dashboard — and that card shows `Cut · 2,150 kcal/day` and a chevron. **No badge. No warning count. No hint that three findings about my body are sitting behind it.** From the Progress screen, there is not a single link to it. I asked the app why I'm not moving, on the screen named after the question, and the app had the answer and never mentioned it.

One last thing I noticed on the way past: the Dashboard's "Kcal burned" tile has read **0** every single day for six weeks. It sums `diary[date].exercises`, which only manual cardio entries write to; `endWorkout` just stamps `endedAt` on the session (appState.ts:498–502). I've lifted four times a week for six weeks and that tile has never moved.

### goals-and-coach

**Who I am when I open this.** A month in. 30, 178 cm, started at 84.0 kg, this morning's scale said 80.5 kg. Setup asked me to pick a pace and I picked "Steady — the usual choice", so my targets have been 2,252 kcal / 169 P / 225 C / 75 F since day one. I've decided I'm done cutting. I want to eat more. That's the whole errand.

---

**Screen 1 — Profile, because that is where settings live.**

I tap the Profile tab. Top card: a jade circle with a person glyph, my name, and under it "Lose fat · Moderately active". Then three figures — Weight 80.5 kg, BMI 25.4 Overweight, Streak 22 days. Below that the "Weight goal" card: **80.5 kg → 75 kg**, a progress bar reading "39% of the way from your starting weight", a countdown box "**77** days left (11 weeks)", and a green "On track: losing 0.4 kg per week, 5.5 kg to go. About 11 weeks (77 days) to go — around 14 Oct."

Then a stack of collapsed grey rows. The second one is called **"Targets"**, subtitle "Goal 75 kg". That is unmistakably where my calorie target lives. Tap 2. It opens and contains… one field: "Goal weight (kg)" and the note "Leave it empty to track weight without a goal. Your pace is measured from your actual weigh-ins, not from this number."

That's it. A section named Targets, holding one target, and it isn't the one I came for. No link out. No "Daily targets" row anywhere on this screen. I scroll the rest of Profile — About you, Weight log, Body measurements, Custom foods, Meal templates, Appearance, Sign out — and there is no calorie number on this screen at all. (`app/(tabs)/profile.tsx:623-647`)

Wrong turn #1. And it's the wrong turn the app itself taught me: the last card of setup told me "Nothing is locked in — every number is editable under Profile." (`app/onboarding.tsx:670`)

**Screen 2 — Progress, because that's where my numbers are.**

Tap 3, 4. The Calories tab shows a chart with a dashed goal line and, under "Summary", a tile that says **Daily goal / 2,252 / kcal**. There it is. I tap it. Nothing. I tap the dashed line's legend. Nothing. That whole screen imports no router link to goals — the number is printed, not editable. (`app/(tabs)/progress.tsx:769`)

Wrong turn #2.

**Screen 3 — Dashboard, by elimination.**

Tap 5. The hero: "Eaten today / **1,410** of 2,252 kcal" and "842 kcal left today". Immediately below, a card with a Sparkles icon: "**AI Nutrition Assistant** — Log meals, water or weight by speaking" with an "Ask AI" button. I genuinely consider it — I want to change my calories, there's an AI, why not ask it. (It cannot. Its four tools are log food, remove food, log weight, log water. Nothing on the card says so.) Then the macro ring. Then, fourth card down, a pale jade panel with *another* Sparkles icon:

> **Coach plan**
> Cut  ·  2,198 kcal/day        ›

Tap 6. I'm finally on Goals. **Six taps and two dead ends**, and I only got here because I recognised a chevron on what reads like a status readout. This is the only `href="/goals"` in the entire app. (`app/(tabs)/index.tsx:350`)

---

**Screen 4 — Goals.**

Header: "Goals / Your coach plan and your own numbers". The back arrow is a left-pointing arrow in the **top right corner** (`app/goals.tsx:428`), which I reach for twice on the wrong side.

Above the fold, one big glass card:

> Your coach
> **Cut for 12 weeks**                      [Cut ▾ pill]
> # 2,198
> kcal per day
> Built around your 2,747 kcal/day predicted burn
>
> Protein 193 g · Carbs 219 g · Fat 61 g
> Target rate **-0.50** kg per week · losing   |   Duration **12** weeks

So the screen opens by telling me, in 56-point type, to eat 2,198 kcal — 54 fewer than I'm eating now — for twelve more weeks. I came here to stop cutting. There is no control on this screen that changes that. The phase pill says "Cut" and is not tappable. Nothing here asks what I want.

**Which number am I actually eating to?** The big 2,198 is the coach's proposal. My real target, 2,252, is in a text field two full screens of scrolling below. Nothing labels either one. There is no "currently in effect" badge, no "proposed — not applied". The only tell is a green line that would say "Accepted…" if they matched, and its absence is not a signal anyone reads. Meanwhile the Dashboard I just came from printed "of 2,252 kcal" in the hero and "2,198 kcal/day" 300 px lower, both with equal authority. (`app/goals.tsx:501` vs `:708`; `app/(tabs)/index.tsx:132` vs `:344`)

**When was this plan made? When does it update?** Nowhere. `createdAt` is never rendered on this screen. "12 weeks in this phase" — starting when? I have no idea whether this is today's advice or a month-old artifact. (Behind the scenes it silently re-fetches when the plan is 7+ days old and a newer weigh-in exists — `src/hooks/useCoach.ts:317` — so the numbers can and do change under me with zero announcement.)

Scrolling past the coach card: two alert cards, which are the best writing in the app —

> ⚠ **Warning: Your weight has stopped moving** — Across the last 24 days (9 weigh-ins) your weight has changed about -0.1 kg a week, which is flat. To keep losing your calorie target probably needs to change.

Then "Your calorie burn", with a pill reading **"Low confidence"**:

> Predicted **2,747** kcal/day · Mifflin-St Jeor formula   |   Measured **2,685** kcal/day · from your own log
> Days of data **12**   |   Weight trend **-0.35 kg/wk**
>
> "Your measured burn is about 62 kcal a day lower than the formula predicts, from 12 logged days against a weight trend of -0.35 kg a week. **The measured number is the better one to plan around.**"

It tells me to plan around 2,685 — and the plan 400 px above says it was "Built around your 2,747 kcal/day predicted burn". The app just contradicted itself on one scroll. (12 days = "low" confidence, and the plan only trusts measured at medium or high — `app/goals.tsx:113` vs `src/hooks/useCoach.ts:173-178`.)

Then finally, the thing I came for:

> ⚙ **Manual targets**
> The coach only ever recommends. Set anything you like here and press Save — your numbers win until you accept a new plan.
>
> Daily calories (kcal) [ 2252 ]
> Anchor to your formula burn — Your profile puts your burn at 2,747 kcal a day.
> [ 2,247 Cut ]  [ 2,747 Maintain ]  [ 3,047 Bulk ]
> BMR 1,773 · TDEE 2,747 · Suggested 2,247 "**kcal to lose**"

"kcal to lose" is a raw database value printed as a sentence (`app/goals.tsx:762`). And the three preset buttons are flat ±500/+300 — they have nothing to do with the "Steady, 0.5 kg a week" I chose at setup, which would be −550. Tapping "Cut" moves me to a number I never chose.

**I do the thing.** I tap the calories field, clear it, type 2600. I tap Protein and raise it to 175, Carbs to 280. A green line appears: "Balanced: your macros add up to 2,619 kcal." I tap **Save targets**. It becomes **"Saved"** with a tick and the caption changes to "Saved. These are now your daily targets." That is genuinely good — clear, immediate, honest. 3 taps plus typing.

**But now the screen lies to me by omission.** The huge 2,198 is still sitting at the top under "Your coach", unchanged, unmarked. The "Accept plan" button is live. Nothing says "this plan is no longer what you're following". If I want to go back to the coach's numbers later, the only route is that same "Accept plan" button — which reads like agreeing to something new, not like reverting.

**And if I tap it out of curiosity, my 2,600 is gone.** No confirmation, no "this will replace your targets", no undo. The field silently re-seeds to 2,198. (`app/goals.tsx:598`)

---

**Screen 5 — back to Profile, because the coach still thinks I'm cutting.**

The only place to say "I'm not cutting any more" is Profile → **About you** — a collapsed row whose subtitle reads "30 · 178 cm (5'10")". Nothing about that subtitle suggests it contains the switch that governs every calorie number in the app. Tap 7, 8.

Inside: Name, Age, Height, then a horizontal chip row labelled **"Goal"**: `Lose fat` `Maintain` `Gain weight`. (At setup these were called "Lose fat", "Stay where I am", "Build muscle". Different words, same three things.)

While I'm here I notice my name is "Samr". I tap the field, fix it to "Samir", tap away — and get a **modal dialog**:

> **Update your targets?**
> Your calorie and macro targets were set by hand. Recalculate them from your new details, or keep what you have?
> [ Keep mine ]  [ Recalculate ]

I corrected a typo in my name. Nothing about my "details" changed that any formula could use. And "set by hand" is not true — 2,252 came out of the setup flow's pace picker, not my hands. (It reads as manual because setup writes TDEE−550 while the comparison formula computes TDEE−500 — `app/(tabs)/profile.tsx:357-373` against `app/onboarding.tsx:281`. Essentially every cutting or bulking user will be told their targets were "set by hand".) The dialog also fires if I merely tap into the Name field and tap out again having typed nothing — blur is blur. Tap into Name, then into Age, and I get the dialog twice in a row.

If I do tap **Recalculate**: my target jumps to 2,247 flat-500 — not the pace I chose — and it also silently rewrites my water goal from 2,500 ml to 2,818 ml, plus fibre, sugar and sodium, none of which the dialog mentioned (`src/core/store/appState.ts:226-240`). Nothing on Profile shows me the new number. I'd have to go Dashboard → Coach card → scroll, to find out what I agreed to.

Now the actual change: I tap **"Gain weight"**. Same dialog, this time it makes sense. I tap Recalculate. Target becomes 3,047.

But two things quietly break and nobody mentions either:

1. My **goal weight is still 75 kg**, below my current 80.5. The Weight goal card at the top of this very screen keeps saying "80.5 kg → 75 kg" and "On track: losing 0.4 kg per week" while the header pill two lines above now says "Gain weight". Setup would have blocked this ("To gain weight the target has to be above where you are now") — Profile's field accepts anything positive (`app/(tabs)/profile.tsx:416-434`).
2. My **pace is still the cut's pace**. `targetRateKgPerWeek` is written in exactly one place in the entire codebase — the setup flow (`src/core/utils/onboarding.ts:269`). There is no pace editor anywhere in the app. Every ETA is projected from it (`src/core/utils/weightTarget.ts:208`), taken as an absolute value, so the day my measured trend goes quiet the card will tell me "at your planned 0.5 kg a week" — the *fast* bulk pace, which I have never seen, let alone chosen.

To finish the errand: back to Dashboard (9), Coach card (10), **Refresh** (11), read the new plan, **Accept plan** (12). Twelve taps across three screens that don't link to each other, for the single most consequential change a nutrition app supports.

---

**A week later.**

I open the app to see what happened. Dashboard: "Eaten today 1,980 of 3,047 kcal". The coach card says "Lean bulk · 3,047 kcal/day" — consistent, because I accepted. Good.

I tap through to Goals. Because the plan is now 8 days old and I've weighed in since, it silently re-fetches on mount. The Refresh button spins for a second and the numbers change under me — 3,047 becomes 2,980, protein moves, the green "Accepted." line **disappears**, and "Plan accepted" flips back to "Accept plan". Nothing says "your plan was updated". Nothing says my daily targets are still last week's numbers. I have to reconstruct that from a button label changing state. And the Dashboard I just left is now quoting 2,980 while the hero counts against 3,047.

The one alert that would explain any of this — "Your plan is 15 days old" — doesn't fire until day 15, and only ever renders on Goals, the screen behind the one door.

**The assistant.** Three entry points: a floating Sparkles button bottom-right on every tab, a Sparkles icon in the Dashboard header, and the "Ask AI" promo card — the second card on the Dashboard, above my macros. Its opening line is good: "Tell me what you ate, your weight, or your water and I'll log it. Try 'I had 1 cup of oatmeal and 2 eggs for breakfast'." So I know what to ask. But the same Sparkles glyph on the same screen also means "coach plan" and goes somewhere else entirely, and the one thing I spent this session trying to do — change my targets — is the one thing it silently cannot do.

**Recent changes, as a user:** the "Not synced" banner reads as helpful and honest, and the Retry is right there. The full-screen "Can't reach your account" is well written and I'd trust it. The Progress "Import from Google Fit" card is honest but is a card *titled with an action* that doesn't perform it — I tapped its button expecting an import and got teleported to Profile with no scroll-to and no follow-through. The sign-out warning about unsynced work is exactly right. The age/height range errors are good. The "Update your targets?" dialog is the one that hurts: it fires on non-events, and its central claim about where my numbers came from is wrong for most people.

### edges-and-recent-changes

## 00:05, on the train, one bar. I open MacroFit.

**Screen 1 — the launch screen.** The native splash goes as soon as the fonts and my local storage are ready (fast). Then I get `LaunchScreen`: my logo, and a small jade spinner underneath it. No words. Not "Signing you in", not "Loading your data" — nothing. Just a mark and a spinner on an empty canvas.

How long? `loading` is only cleared after `getSession()` **and** the whole of `adoptUser()` finish (`AuthProvider.tsx:616-631`). `adoptUser` includes a Supabase select capped at `LOAD_TIMEOUT_MS = 8000`, and then, if this device held anything unsaved, an `await flushSave()` capped at `SAVE_TIMEOUT_MS = 15000`. `getSession()` itself has no cap at all — on a stalled radio it can hang refreshing a token. So on this train I am looking at a logo and a spinner, with no text, for anywhere between two and twenty-plus seconds. Around second eight I press the home button to check the app hasn't frozen. There is nothing on screen that says "this is slow because you're offline", and nothing that says "still trying".

**Screen 2 — the wall.** Then this appears, filling the entire phone:

> **Can't reach your account**
> This device has not downloaded your data yet, so there is nothing to show offline. Connect and try again — nothing has been lost.
> [ Try again ] [ Sign out ]

I have been logging in this app for weeks. That first sentence is telling me my phone has never seen my data. From where I'm sitting that reads as: *it's gone*. And the reassurance — "nothing has been lost" — is the sentence a system prints exactly when something has been lost. I don't believe it.

Two things make it worse. There is no email on this screen. I share this phone with my partner; I cannot tell whether it is failing to reach *my* account or *theirs*. And there is no third option — no "carry on offline", no "you can still log, we'll sync later". Two buttons, one of which says Sign out, which is the thing I am most afraid to press.

I press **Try again**. The button turns into a spinner ("Trying…"). Eight seconds. Then the button comes back and **the screen is identical**. No "Still can't reach it." No timestamp. No count. I genuinely cannot tell whether it tried and failed or whether my tap missed. I press it three more times. Same nothing. At this point I would put the phone away and assume the app has eaten my data.

Worth naming: this state also catches the *upgrade* cohort. On the first launch of this build, `STORE_OWNER_KEY` and `LOADED_KEY` don't exist yet, so `hasLoadedAccount` is false; one failed select and I'm behind this wall — while my entire diary, weight log and workouts are sitting intact in AsyncStorage on this phone. The app is telling me it has nothing while holding everything. And the escape hatch, Sign out, calls `resetStore()` and deletes it. Unlike Profile's sign-out, **this one shows no confirmation dialog at all** (`_layout.tsx:108-121`) — the one screen where sign-out is the only way out is the one place it doesn't ask.

## Take two — the load half-works. Now the banner.

Different day, same train, but this phone has read my account before. So I get `syncBlocked` instead, and a strip sits above everything:

> ☁️ Not synced — we could not reach your account. Everything you log stays safely on this device until it clears.  **Retry**

This one is good. It's honest, it's in the layout flow rather than floating over my headers, and it answers the only question I care about ("is my logging safe?") in the second sentence. The Dashboard beneath it looks normal — the `Screen` header's top inset is zeroed out so nothing double-pads. The app still feels like the app.

Two problems. First, that banner is roughly 70pt tall on **every screen, every tab, for the whole session**, and it wraps to two or three lines. Second — and this is the real one — **nothing ever retries by itself.** There is no auto-retry anywhere: `retrySync` only fires from a tap. The AppState listener calls `flushSave`, which returns `'skipped'` because `canSaveRef` is false. So I come out of the tunnel, get four bars, and the app sits there not synced until I happen to notice the strip and press Retry. "Until it clears" implies it will clear on its own. It won't.

**I log food while it says Not synced.** I tap Snacks on the Dashboard, land at the top of the Diary, scroll past the date navigator and the big totals card, past Breakfast, Lunch and Dinner, tap Add food on Snacks, search, tap the food, tap "Add to Snacks". Haptic, the sheet closes, the entry is right there in the Snacks card and the day totals move. That part is unambiguous — I know it saved. The banner is still at the top telling me it's on the device only. That's a clean, honest combination.

**Then I tap Retry.** "Retrying…" for up to 8 seconds, then either the banner silently vanishes (no "Synced", no confirmation that the food I just logged went up) or it silently doesn't. Same dead tap as the blocking screen.

## Handing the phone to my partner

They open Profile, scroll all the way to the bottom, tap Sign out. Dialog: *"Sign out? Your data is saved to your account, and this device will be cleared."* Cancel / Sign out. Clear enough, though "this device will be cleared" makes my partner glance at me. They sign in; the store resets, `onboardedAt` is null, they land in onboarding. Fine.

I sign back in. Now the risky bit: this account is not the previous owner, so `LOADED_KEY` was wiped, so if the select fails on this train I get the full-screen **"Can't reach your account"** again — and now it's true, my data really is only on the server. But I don't know that, and the screen still won't tell me whose account it's failing on.

## 00:05, water and a snack

Both land on **today's** date — the new day — because `getTodayString()` is local and recomputed each render. The Diary header says the date and "Today" in jade, so the day is visible if I look. Fine on its own.

What is not fine: logging that snack calls `updateStreak()` (`appState.ts:383-400`), which computes yesterday as `new Date()` minus a day, then `.toISOString().split('T')[0]` — **UTC**, while `today` is local. In any timezone ahead of UTC, at 00:05 that yields the day *before* yesterday. So `lastLoggedDate` ("yesterday") doesn't match, and my streak is reset to `1`. I go back to the Dashboard and the Flame tile that said **47** now says **1**. In IST that happens every single night between midnight and 05:30. Nothing on screen explains it; it just reads as the app losing my history.

Getting to the water buttons is its own annoyance: from the top of the Dashboard I scroll past the hero, the AI assistant card, a 192pt macro ring, the coach card and five meal rows before "Quick add · ml" appears. More than a full screen of scrolling for something I do six times a day. Meanwhile there's a floating Sparkles button pinned above the tab bar — for the chatbot, not for logging.

## Mid-workout, my session expires

I'm three sets into an evening workout, rest timer counting down. The token dies. `RootNavigator` sees `!user` and does `router.replace('/login')` — the entire workout screen, the live volume figure, the running clock, all of it, is replaced by a login form with no warning and no transition.

The login screen does tell me, and the copy is good: *"Your session expired, so you were signed out. Everything you logged is still on this device — sign in to sync it."* But it's a 13pt grey line with a clock icon sitting **below** the email and password fields (`login.tsx:183-188`). Glancing at a login form, I see the form. I'd have to go looking for the explanation of why I'm on it.

I sign in. The button stays busy and says "Restoring your data…" — genuinely good, I know not to double-tap. Then I'm dropped on the **Dashboard**, not back on Workout. I have to tap Workout myself to find out whether my sets survived. (They do — the session is still in `workoutLog`, still Live, and the elapsed clock now includes my login detour.) But nobody told me that.

## The AI assistant, on one bar

Dashboard promotes it three times: a Sparkles button in the header, a whole "AI Nutrition Assistant / Ask AI" card, and the floating jade FAB. I tap it, type "two eggs and toast", tap Send. "Thinking…" for **45 seconds**. Then a red bubble:

> **Failed:** Could not reach http://192.168.1.20:3000/api/chat. Check that EXPO_PUBLIC_API_URL points at an address this device can reach (a LAN IP or a deployed URL, never localhost) and that the server is running.

That is a message for the person who built the app, printed into my chat. Depending on config I might instead get *"Missing EXPO_PUBLIC_API_URL, so the AI features cannot be reached. Set it to your dev machine's LAN IP (e.g. http://192.168.1.20:3000)…"* or *"/api/chat failed (HTTP 502): …"*. Same thing happens on Goals: `coach.error` is rendered verbatim, so the offline coach notice reads *"Could not reach http://…/api/recommend. Check that EXPO_PUBLIC_API_URL … The plan below was calculated on your device instead… Press Refresh once you are back online."*

## Progress → Weight

Tabs are Calories / Macros / Weight / Training, the charts are careful, empty states say what to do. Then at the bottom of the Weight tab:

> **Import from Google Fit**
> Bring past weigh-ins in from Health Connect
> Importing lives with your other connections, on Profile. Days you logged yourself are never overwritten.
> [ Open Profile ]

Three names for one thing in one card: Google Fit in the title, Health Connect in the caption, Profile on the button. And on an iPhone — or any Android without Health Connect — `health.availability !== 'available'`, so Profile renders **no Health Connect section at all** (`profile.tsx:572`). I tap Open Profile, land at the top of Profile, scroll the whole page, and there is nothing there. A card that costs a full slot, does nothing, and sends me to a place that doesn't have what it promised. If I have no weigh-ins yet, the empty state directly above it already says "Log your weight from the Profile tab" — so the tab tells me to go to Profile twice.

## Profile, changing my details

I open "About you" to fix a typo in my name. I tap out of the field and get a modal:

> **Update your targets?**
> Your calorie and macro targets were set by hand. Recalculate them from your new details, or keep what you have?
> [ Keep mine ] [ Recalculate ]

I edited my *name*. `commitBasics` is the blur handler for Name, Age and Height, and it always calls `applyBodyChange` (`profile.tsx:375-414`) — so it fires even when nothing changed. Tab into Age, tab out again without typing: same dialog. It's asking me a consequential question about my calorie targets in response to nothing happening.

The range guards do work, but the copy is uneven. Age: *"Age should be between 13 and 100."* — good. Height: *"That height looks off. Check the number and the unit."* — the field is labelled "Height (cm)", there is no unit control on it, and it never tells me the accepted range is 120–230.

And right below, "Height unit: cm / ft-in" is a live-looking toggle that changes absolutely nothing. `profile.heightUnit` is read only by the onboarding flow; after setup no screen reads it. I flip it and stare at the page waiting for the height to change.

The sync row at the bottom is genuinely well done: icon and words agree, `syncBlocked` outranks a stale "Synced", and the three states ("Not synced — saved on this device only" / "Some changes still waiting to sync" / "Synced") each mean something distinct. The two sign-out dialogs are also clear and correctly different — the unsynced one names the loss and the button says "Sign out anyway".

---

## Every finding

### blocks (19)

<details><summary><b>No "Forgot password?", no password reveal, no confirm field</b> — Account screen</summary>

**Sees.** The password field is `secureTextEntry` with no reveal toggle and no confirmation field on sign-up, and there is no reset link on the screen and no reset route in the app (app/ contains login, onboarding, chat, food-search, goals, lift-picker and the tabs — nothing else). If the password I typed blind isn't what I think it is, the only thing I ever see again is "Wrong password, or there is no account for me@example.com yet."

**Expected.** A "Forgot password?" link, and an eye icon so I can check what I typed while creating the account.

**Fix.** Add a reveal toggle on the password field and a "Forgot password?" link that calls `resetPasswordForEmail`, with a confirmation notice in the same Message component the screen already uses.

`app/login.tsx:172`

</details>

<details><summary><b>A new account on a flaky connection hits a full-screen wall about data it never had</b> — "Can't reach your account" (replaces the whole app)</summary>

**Sees.** If the first read of the account fails, the entire navigator is replaced by: "Can't reach your account — This device has not downloaded your data yet, so there is nothing to show offline. Connect and try again — nothing has been lost." with Try again / Sign out. For an account created ninety seconds ago there IS no data to download, so the explanation is wrong, and there is deliberately no way past it. It never retries on its own.

**Expected.** For a brand-new account, either to be let through (there is nothing to lose) or to be told plainly "We can't reach the server. Check your connection."

**Fix.** Word the screen as a connection problem rather than a missing-download problem, auto-retry on reconnect, and let a session whose sign-up completed in this launch through to setup rather than walling it.

`app/_layout.tsx:137`

</details>

<details><summary><b>If the food isn't in either database, there is nothing I can do — the search dead-ends</b> — Food search (empty results)</summary>

**Sees.** I search for my home-cooked dal. I get "No USDA matches. Try a shorter or more general word." and directly under it a second panel: "No matches / Try a shorter word, a brand name, or the plain ingredient." Two near-identical apologies and zero actions. My only move is to back out and log something that isn't what I ate.

**Expected.** A "Create a food" / "Add it yourself" button in the empty state, so I can type a name and calories once and have it for good. The store already has addCustomFood (src/core/store/appState.ts:336) and the search screen already has a "Your foods" section reserved for it (food-search.tsx:301) — but nothing in the app ever calls addCustomFood, so that section can never be non-empty.

**Fix.** Put a primary "Add \"dal\" yourself" button in the no-results empty state (and a quieter one at the bottom of every result list) that opens a small form — name, serving size + unit, calories, P/C/F — writing via addCustomFood and dropping straight into the portion step with it selected. Also collapse the two stacked no-result messages into one.

`app/food-search.tsx:690`

</details>

<details><summary><b>Reaching for the green tick deletes my set instead, and my typed weight and reps are gone</b> — Active workout — set row</summary>

**Sees.** The 44pt "Done" ✓ and the 44pt bin sit 4 points apart (ROW_GAP = 4, line 149) at the right edge of every set row — exactly where a thumb lands. Worse, the confirm guard is inverted for the risky moment: handleRemove (line 240) only asks twice if `set.completed` is already true. A set I have just typed 102.5 × 8 into but not yet ticked is deleted on the FIRST tap, silently, with no undo and no message.

**Expected.** The tick is the thing I press twenty times a session; the bin is the thing I press once a month. Missing the tick should not destroy the work I just entered. If anything is guarded, it should be the row that has numbers in it.

**Fix.** Swap the guard so ANY row containing typed weight or reps requires the second confirming tap (only a genuinely blank row deletes instantly). Then separate them: push the bin behind a row swipe or a long-press, or move it out of the row entirely and put at least 16pt plus a divider between the tick and anything destructive.

`app/(tabs)/workout.tsx:347`

</details>

<details><summary><b>I typed 1025 instead of 102.5, finished the session, and now I can never fix it — my PR list is wrong forever</b> — Workout tab — History card, expanded</summary>

**Sees.** The expanded history card shows "Incline Bench Press — 1 × 8 @ 1025 kg" and offers exactly two actions: "Save as template" and "Delete". There is no edit anywhere. Meanwhile the Personal records block (line 1227) now permanently leads with an est. 1RM of ~1298 kg, and suggestNextSet (src/core/utils/workoutMath.ts:187) will print "Target from last time 1027.5 kg" the next time I train that lift. My only escape is "Delete for good — This deletes the session and every set in it. It cannot be undone."

**Expected.** One wrong digit should cost me one correction, not the entire workout. And a number I can see is impossible should not be silently enshrined as my personal record and my next target.

**Fix.** Make the expanded history rows editable in place — tap a set line to open the same weight/reps inputs used live. At minimum, add a "Reopen session" action that sets activeWorkoutId back to it so the existing editing UI applies. Separately, flag implausible entries at log time (e.g. > 3× the lift's previous best) with an inline "1025 kg — did you mean 102.5?" before it is committed.

`app/(tabs)/workout.tsx:1082`

</details>

<details><summary><b>By the second exercise the rest countdown is off-screen — I can see my sets or my rest, never both</b> — Active workout — rest timer</summary>

**Sees.** RestTimer is rendered inline between the session card and the exercise list. With one exercise it sits around y≈350 and is visible. With two exercises the second card starts below the fold, so when I tick a set there I am roughly a screen and a half below the timer. The countdown is running, correctly, where I cannot see it. Scrolling up to check it pushes my set rows out of view. There is no floating pill, no header badge, no persistent indicator anywhere.

**Expected.** The rest countdown is the one number I look at every 30 seconds between sets. It should stay on screen no matter where I've scrolled — that's the entire reason I opened the app between sets.

**Fix.** Pin the rest timer: render it as a compact floating pill (icon + M:SS + ±30 + dismiss) anchored above the tab bar, or as a badge in the screen header, so it is visible at any scroll position. The inline card can stay as the expanded form.

`app/(tabs)/workout.tsx:770`

</details>

<details><summary><b>Nothing tells me rest is over unless I happen to be staring at the phone</b> — Active workout — rest timer</summary>

**Sees.** When the countdown hits zero the only signals are a `Haptics.notificationAsync` success buzz and the label changing from "Resting" to "Rest complete" with a green tint. No sound, no local notification. The buzz only fires while the app is in the foreground — if I've switched to my music app or the screen has locked, I get nothing until I come back and the interval catches up.

**Expected.** My phone is face-down on a bench two feet away in a loud room and I'm chalking my hands. I need the phone to tell me rest is over, not to require me to be watching it.

**Fix.** Schedule a local notification for the rest deadline (with sound) when the countdown starts, cancel it on dismiss, on ±30s, on the next completed set, and on finish/cancel. Keep the haptic for the foreground case, and make it a stronger repeated pattern rather than a single light success tap.

`src/components/RestTimer.tsx:57`

</details>

<details><summary><b>The screen goes black 30 seconds into a 2-minute rest and I have to unlock the phone to see the timer</b> — Active workout</summary>

**Sees.** Nothing in ActiveWorkout holds a wake lock — expo-keep-awake is not used anywhere in the app. Default auto-lock is 30s–2min; DEFAULT_REST_SECONDS is 120. So the phone locks for most of every rest period, and I unlock it again for every set. Twenty times a session, with chalk on my hands.

**Expected.** While a workout is live the screen should stay on — that's what every gym app does, because your hands are busy and wet.

**Fix.** Call useKeepAwake() inside ActiveWorkout so the lock is held only while a session is actually live, and released the moment it ends.

`app/(tabs)/workout.tsx:632`

</details>

<details><summary><b>The Weight tab shows a chart and a delta but never says whether I'm on track</b> — Progress → Weight</summary>

**Sees.** A zoomed line chart, then "Latest 78.1 kg / Entries 2 / Change ↓ Down 0.4 kg", then the sentence "Down 0.4 kg from Jul 2 to Jul 27.", then a Google Fit card. No goal weight, no percentage, no ETA, no on-track/stalled status, no trend rate.

**Expected.** The app computes all of this — WeightTargetCard renders goal, % of the way, a days countdown and a status chip ("On track", "Stalled", "Going the wrong way"), and its own docstring at WeightTarget.tsx:33-35 says it is "the screen's answer to 'am I actually making progress?'". It is mounted on Dashboard and Profile but not on Progress.

**Fix.** Mount WeightTargetCard at the top of the Progress Weight tab (non-compact), above the chart, so the verdict and the countdown are the first things read.

`app/(tabs)/progress.tsx:913`

</details>

<details><summary><b>Switching to lbs relabels my whole weight history without converting it</b> — Profile → About you → Weight unit, then Progress → Weight</summary>

**Sees.** Weigh-ins are stored raw in whatever unit was active when they were entered. After tapping "lbs": Progress's chart is captioned "Weigh-ins in lb" and plots 78.1; Profile's Weight log lists "78.1 lbs"; but Profile's hero tile and the Weight goal card both read 172.2 lbs. Three figures for one body on adjacent cards.

**Expected.** Changing a display unit changes labels, not history. Seeing my weight listed as 78 lbs next to a headline of 172 lbs would make me assume the app is broken and stop trusting every number in it.

**Fix.** Store every weigh-in in kg and convert only at render, the way WorkoutSet already does. Convert existing rows on migration so no history changes meaning when the toggle is flipped.

`src/core/store/appState.ts:319`

</details>

<details><summary><b>Personal records show a number but never whether it went up</b> — Progress → Training</summary>

**Sees.** "Personal records / Best estimated 1RM per lift", then rows of lift name, an 11px date, and one figure: "Bench Press · Jul 12 · 102.5 kg e1RM". No previous value, no delta, no arrow, no history.

**Expected.** "Am I getting stronger" needs a comparison. As shown, a PR stuck for a month is visually identical to one set yesterday, and "e1RM" is never explained.

**Fix.** Show the previous best and the change ("102.5 kg · +5.0 since Jun 14"), and make the row open that lift's history.

`app/(tabs)/progress.tsx:1077`

</details>

<details><summary><b>The app knows why I've stalled and never tells me</b> — Progress → anywhere / Dashboard</summary>

**Sees.** getCoachAlerts produces exactly the answers I came for — "Your weight has stopped moving… your calorie target probably needs to change", "Protein is running low…". They render only in app/goals.tsx:618, which is not a tab. The sole entry point is the Dashboard "Coach plan" card, which shows "Cut · 2,150 kcal/day" and a chevron — no badge, no warning count, no colour, no hint that three findings are waiting. Progress links to /goals zero times.

**Expected.** The screen where I ask "am I making progress" should carry the explanation of why, or at minimum a visible "2 things to look at" pointer.

**Fix.** Surface the top coach alert inline on the Progress weight tab with a "See all" link to /goals, and badge the Dashboard coach card with the warning count.

`app/(tabs)/progress.tsx:1132`

</details>

<details><summary><b>The only way to my calorie target is a card that looks like a status readout</b> — Dashboard → /goals</summary>

**Sees.** A pale jade card, fourth down the Dashboard, reading 'Coach plan / Cut · 2,198 kcal/day' with a small grey chevron. It reads as a summary tile, not a door. It is the only `href="/goals"` in the entire app — Profile, Progress, Diary and the assistant contain no route to it.

**Expected.** To find 'my daily calorie target' in Profile, or by tapping the 'Daily goal' number on Progress. Both fail, so the average user takes two wrong turns before stumbling onto the coach card, and many will never find it at all.

**Fix.** Give /goals a second, explicitly labelled door: turn Profile's 'Targets' section into a navigation row reading 'Daily targets — 2,252 kcal · 169 P / 225 C / 75 F ›' that pushes /goals. Also make the Progress 'Daily goal' tile a link.

`app/(tabs)/index.tsx:350`

</details>

<details><summary><b>A section literally called 'Targets' does not contain my calorie target</b> — Profile</summary>

**Sees.** Profile ▸ Targets (subtitle 'Goal 75 kg'). Opening it reveals exactly one field: 'Goal weight (kg)'. No calorie number appears anywhere on the Profile screen, and nothing links out to where they live.

**Expected.** 'Targets' to hold calories and macros. The setup flow explicitly promised 'every number is editable under Profile' (app/onboarding.tsx:670), so this is the app's own instruction leading to a dead end.

**Fix.** Rename to 'Weight goal' and add a separate 'Daily targets' row showing the live calorie/macro figures and navigating to /goals. Then the onboarding promise becomes true.

`app/(tabs)/profile.tsx:623`

</details>

<details><summary><b>Goals shows two big calorie numbers and never says which one I am eating to</b> — /goals</summary>

**Sees.** 56-point '2,198 / kcal per day' under the heading 'Your coach', above the fold. My actual saved target, 2,252, is in a text field two screens of scrolling below. Neither carries a label like 'in effect' or 'proposed'. The only difference is whether a green 'Accepted…' line is present — an absence, which nobody reads as information.

**Expected.** To glance at the screen and know what number they are supposed to hit today. Instead the screen's largest, most authoritative figure is the one that is NOT in effect.

**Fix.** Put a status chip directly on the coach card: 'Proposed — not applied' vs 'In effect since 12 Sep'. And put the current effective target ('You are eating to 2,252 kcal/day') at the very top of the screen, above the coach card.

`app/goals.tsx:501`

</details>

<details><summary><b>On the Goals screen I cannot tell the coach I have stopped cutting</b> — /goals</summary>

**Sees.** A screen titled 'Goals' that opens by prescribing 'Cut for 12 weeks'. The phase pill is not tappable. The only levers are three flat presets (Cut/Maintain/Bulk) that change a number without changing the goal, so pressing Refresh re-proposes a cut forever. The actual Lose/Maintain/Gain switch is on Profile, inside a collapsed row subtitled '30 · 178 cm'.

**Expected.** The screen called Goals to contain their goal. Nothing on it hints that the direction is set elsewhere, and nothing links to where.

**Fix.** Put the Lose fat / Maintain / Gain weight control on /goals, directly above the coach card, with copy like 'Tell the coach what you want next' — and have changing it trigger a refresh.

`app/goals.tsx:424`

</details>

<details><summary><b>The pace I picked at setup can never be changed, and every countdown still projects from it</b> — Profile / Weight goal card</summary>

**Sees.** Setup made a real decision out of pace ('Gentle / Steady / Quick', with 'The usual choice' guidance). After setup the value is unreachable — grep finds exactly one writer, the onboarding flow. The Weight goal card keeps quoting it: '5.5 kg to go at your planned 0.5 kg a week. About 11 weeks (77 days) to go — around 14 Oct.'

**Expected.** To slow down or speed up the plan they committed to. Worse: after switching from Lose to Gain the stored -0.5 is read as an absolute value, so the card will quote 'your planned 0.5 kg a week' — the fast-bulk pace they have never seen, let alone chosen.

**Fix.** Add a pace selector next to the goal control on /goals, reusing the same three labelled options and detail copy as setup. Reset or re-ask for pace whenever the goal direction changes.

`src/core/utils/onboarding.ts:269`

</details>

<details><summary><b>The full-screen block tells me my data was never downloaded — while it is sitting on the phone</b> — Can't reach your account (full-screen)</summary>

**Sees.** The whole app is replaced by: logo, "Can't reach your account", "This device has not downloaded your data yet, so there is nothing to show offline. Connect and try again — nothing has been lost.", and two buttons: Try again / Sign out. No account email, no way past it. On the first launch of this build (STORE_OWNER_KEY and LOADED_KEY don't exist yet) an existing user with weeks of data in AsyncStorage lands here, so the sentence is factually wrong from where they sit — and Sign out, one of only two buttons, calls resetStore() and deletes that local copy with no confirmation.

**Expected.** Either to be let into a read-only version of the app, or to be told plainly which account is unreachable, that the data on this phone is untouched, and what will and will not happen if they sign out.

**Fix.** Show the signed-in email on the screen. Change the body copy so it never claims the device is empty — say what is true: "We can't reach your account right now, so we can't show you an up-to-date copy. Nothing on your account has changed." Put the destructive button behind the same confirmation Profile uses, and label it "Sign out and clear this device". If a local store exists, offer a third option that enters the app read-only rather than blocking outright.

`app/_layout.tsx:137`

</details>

<details><summary><b>Twenty seconds of a logo and a spinner with no words — it reads as a hang</b> — Launch screen</summary>

**Sees.** After the native splash, a brand mark and a small spinner on an empty canvas, with zero text. `loading` only clears after getSession() plus the whole of adoptUser(), which contains an 8s-capped select and a 15s-capped save; getSession() itself is uncapped. On one bar this can be 20+ seconds of nothing.

**Expected.** To know the app is working and why it is slow — and after a few seconds, to be told it is taking longer than usual.

**Fix.** Put a line under the spinner: "Getting your data…". After ~5 seconds swap it for "Still trying — your connection looks slow." After ~12 seconds add a visible way out ("Continue offline" when a local copy exists, or "Try again").

`src/components/LaunchScreen.tsx:17`

</details>

### confuses (51)

<details><summary><b>Setup promises photo logging; there is no camera anywhere in the app</b> — Setup step 1 of 5 ("Welcome")</summary>

**Sees.** The first setup screen lists three things the app does, the first being "Log meals by searching, snapping a photo or just typing what you ate." Nothing in the Diary, the food search modal or the chat offers a camera or a photo picker. `postAnalyzePhoto` exists in src/lib/api.ts:465 and no screen in the app calls it.

**Expected.** A camera or "snap a photo" button on the food-search modal or the meal cards, since that is the headline capability I was sold thirty seconds after installing.

**Fix.** Either ship the photo entry point (a camera button in the food-search header) or cut "snapping a photo" from the welcome copy until it exists.

`app/onboarding.tsx:381`

</details>

<details><summary><b>The dashboard says "No plan yet" one minute after setup handed me a plan</b> — Dashboard (Coach card)</summary>

**Sees.** Setup's final screen reads "Here's your daily target" with 1,937 kcal and macros, and I tap "Start tracking". The fourth card on the dashboard is headed "Coach" and reads "No plan yet — set a phase and a calorie target built from your own data." `onboarding.finish()` writes goals but leaves `recommendation` null, so the card renders its empty state.

**Expected.** The card to reflect the plan I just built, or at least not to contradict the screen I came from. Right now I can't tell whether my 1,937 kcal target is real.

**Fix.** After setup, show the plan the user just accepted in the Coach card (phase from their goal, calories from their answers), or retitle the empty state so it reads as an upgrade — e.g. "Your targets are set from the formula. Get a coached plan once you've logged a week."

`app/(tabs)/index.tsx:400`

</details>

<details><summary><b>Two identical "Create account" buttons; only the bottom one submits</b> — Account screen</summary>

**Sees.** The mode toggle is built from the same `Button` component as the submit control, so after tapping "Create account" at the top I see a filled jade "Create account" at the top of the card and another filled jade "Create account" at the bottom. Tapping the top one just re-selects the mode and clears any message; nothing else happens.

**Expected.** The mode switch to look like a switch (a segmented control or a text link), clearly different from the button that submits the form.

**Fix.** Render the in/up toggle as a segmented control or as a text link ("New here? Create an account"), not as two Buttons that share the submit button's styling and label.

`app/login.tsx:143`

</details>

<details><summary><b>The submit button greys out with no explanation of what's wrong</b> — Account screen</summary>

**Sees.** `canSubmit` requires an email over 3 characters and a password of at least 6, otherwise the button sits at 50% opacity and ignores taps. The 6-character rule only appears as the password field's placeholder, which disappears as soon as I type. Nothing on screen says why the button is dead.

**Expected.** Either an enabled button that tells me what's missing when I press it, or a persistent hint under the password field.

**Fix.** Move "At least 6 characters" to a permanent helper line under the password field, and on a short password show it in the critical colour once the field has been touched.

`app/login.tsx:102`

</details>

<details><summary><b>"Set a goal weight" — but there is nothing on the card to set it with</b> — Dashboard (Weight goal card)</summary>

**Sees.** If I skipped the optional goal weight in setup, this card shows one grey sentence: "Set a goal weight to track whether you are heading the right way." There is no button, no link and no hint that the field is on the Profile tab (app/(tabs)/profile.tsx:278).

**Expected.** A "Set a goal weight" button right there, or at minimum "…in Profile".

**Fix.** Render the no-target state with a button that navigates to Profile's goal-weight field (or an inline field on the card, since the card already has an inline weigh-in field).

`src/components/WeightTarget.tsx:95`

</details>

<details><summary><b>"Log meals, water or weight by speaking" — the assistant is a text box</b> — Dashboard (AI Nutrition Assistant card) → Assistant</summary>

**Sees.** The card's subtitle is "Log meals, water or weight by speaking" with an "Ask AI" button. The screen it opens has the subtitle "Log food, weight and water by describing it" and a keyboard field placeholdered "What did you eat?". There is no microphone control anywhere in app/chat.tsx.

**Expected.** A mic button, or copy that doesn't say "speaking".

**Fix.** Change the card subtitle to match the screen it opens — "Log food, weight and water by describing it" — or add voice input.

`app/(tabs)/index.tsx:141`

</details>

<details><summary><b>The assistant's failure message tells me to configure an environment variable</b> — Assistant</summary>

**Sees.** Any network failure surfaces raw in a chat bubble as "Failed: Could not reach https://…/api/chat. Check that EXPO_PUBLIC_API_URL points at an address this device can reach (a LAN IP or a deployed URL, never localhost) and that the server is running." The Goals screen shows the same class of message under "Get my plan" (app/goals.tsx:466).

**Expected.** "Couldn't reach the assistant. Check your connection and try again." I don't have a LAN IP and I can't restart their server.

**Fix.** Keep the diagnostic detail for logs; show users a plain connection message with a retry. Only surface the env-var text in dev builds.

`src/lib/api.ts:280`

</details>

<details><summary><b>The app calls my setup answers "set by hand" and asks whether to overwrite them</b> — Profile</summary>

**Sees.** Setup saves pace-derived goals (1,937 kcal for a 0.5 kg/week pace) rather than the flat formula value (1,987), so `goalsOriginOf` classifies them as 'manual'. The first time I correct my age or height, a dialog pops: "Update your targets? Your calorie and macro targets were set by hand. Recalculate them from your new details, or keep what you have?" I never set anything by hand.

**Expected.** Either a silent recalculation, or a dialog that says where the targets came from — "Your targets came from setup."

**Fix.** Treat onboarding-derived goals as a known origin (stamp the source when setup saves them) and word the dialog accordingly, e.g. "Your targets came from setup. Recalculate them from your new details?"

`app/(tabs)/profile.tsx:365`

</details>

<details><summary><b>I logged today's breakfast onto yesterday without noticing</b> — Diary → Food search</summary>

**Sees.** Yesterday evening I went back a day to fix dinner and never tapped "Jump to today". This morning the Dashboard says "Breakfast — Nothing logged", I tap it, and the Diary opens still on Jul 28 — same scroll position too, so the date header may be off-screen. I tap Add food, the modal says "Breakfast · Jul 28" in 12pt muted grey, and the instant I pick a food that line is replaced by "Choose an amount" (food-search.tsx:421-422). The button reads "Add to Breakfast" — it never says which day. My eggs land on yesterday and the Dashboard keeps insisting Breakfast is empty.

**Expected.** The Diary snaps back to today when I come to it fresh (or at least when I arrive via a Dashboard meal row, which is unambiguously about today), and the day I am committing to is stated on the commit button.

**Fix.** Reset the diary's date to today whenever the tab is focused after being away, and always pass an explicit date from the Dashboard meal rows. In the portion step, keep "Breakfast · Yesterday, Jul 28" in the header, and label the button "Add to Breakfast, Jul 28" whenever the target day is not today — plus a visible amber strip on the whole Diary screen when I'm not on today, not just a muted 12pt word.

`app/(tabs)/diary.tsx:671`

</details>

<details><summary><b>"Kcal burned" on my home screen is 0 every single day, including days I trained</b> — Dashboard</summary>

**Sees.** A tile sitting next to my streak, dumbbell icon, big number: 0. It was 0 yesterday after a full leg session I logged set-by-set in the Workout tab. It reads 0 for everyone, permanently, because it sums day.exercises and no screen in the app ever calls addExerciseEntry (src/core/store/appState.ts:284). My Workout tab and my Dashboard directly contradict each other.

**Expected.** Either a real number derived from the workouts and steps I actually logged, or the tile not being there at all — the StepsCard right above it already refuses to render rather than show a fake 0 (index.tsx:167-169).

**Fix.** Derive burn from the day's workoutLog session (and Health Connect, as StepsCard does) and show it; if there is no session, replace the tile with a tappable "No workout logged → Start one" rather than a fabricated zero. Same rule the steps tile already follows.

`app/(tabs)/index.tsx:607`

</details>

<details><summary><b>I tap my saved lunch and the screen does nothing</b> — Diary → Saved meals</summary>

**Sees.** "Saved meals" is at the absolute bottom of the Diary, below all six meal cards. I tap "Standard lunch · 640 kcal · 3 items". I feel a small buzz. Nothing on screen changes — the three items it just added are in the Lunch card roughly 1,200pt above me, and neither the totals nor anything in view updates where I can see it. I assume it missed and tap again. Now I've eaten two lunches.

**Expected.** Confirmation I can see: "Added 3 items to Lunch — 640 kcal", or the screen scrolling to the Lunch card so I watch it fill.

**Fix.** On apply, scroll the Diary to the affected meal card and briefly highlight the new rows, plus a short confirmation line ("Added to Lunch · 640 kcal") with an Undo. Guard against a rapid second tap. Also call updateStreak here — right now logging your whole lunch from a template doesn't count towards the streak the Dashboard shows (src/core/store/appState.ts:365-377).

`app/(tabs)/diary.tsx:617`

</details>

<details><summary><b>Typing "1.5" hides the Add button, and the number pad has no way to close itself</b> — Food search → portion step</summary>

**Sees.** I tap the amount field to change 1 to 1.5. The decimal pad slides up and eats the bottom third of the screen — including "Add to Breakfast" and the "Adds to your day / 249 kcal" preview I wanted to check. There's no keyboard-avoiding behaviour; the ScrollView's bottom padding is 32pt + safe area, so I can't scroll the button clear of a ~300pt keyboard. On iOS a decimal pad has no Done/return key, so I have to work out that tapping a blank bit of card dismisses it.

**Expected.** The button stays reachable, or the keyboard has a visible Done. One-handed in a kitchen I should never have to hunt for dead space to tap.

**Fix.** Wrap the portion step in a KeyboardAvoidingView, or pin "Add to {meal}" as a fixed footer above the keyboard, and add an accessory "Done" bar over the number pad. Same treatment for the servings field in the diary's entry editor (app/(tabs)/diary.tsx:387).

`app/food-search.tsx:663`

</details>

<details><summary><b>Foods I get from the internet never show up in Recent, so Recent gets emptier the more I use the app</b> — Food search (empty query)</summary>

**Sees.** I logged "Almonds, raw" from the USDA section yesterday and the day before. Today I open search and it's not under Recent. The Recent list resolves ids only against the built-in preset table and my custom foods, and a USDA id (usda-1750340) resolves to neither, so it's skipped in silence. If most of what I eat is branded or from USDA, Recent is empty and the top of my search screen is "Food database → Apple (medium), Banana (medium), Blueberries" — a generic list of things I have never eaten.

**Expected.** The last things I actually logged, in the order I logged them, whichever source they came from. That's the entire point of Recent.

**Fix.** Store the food object (or the last diary entry) alongside the recent id so any food can be rehydrated — a USDA or assistant-created food is already fully denormalised inside the entry that logged it, so Recent can be built from the diary directly. Bonus: show last-used portion on the recent row so a repeat is one tap.

`app/food-search.tsx:321`

</details>

<details><summary><b>The internet search stops working partway through the day and blames my wifi</b> — Food search</summary>

**Sees.** Morning searches find branded foods fine. By late afternoon every search shows "Could not reach USDA FoodData Central / Check your connection. Everything above still works offline." My connection is perfect. The app is being rate-limited: the key is read via `(import.meta as any).env?.VITE_USDA_API_KEY` — a Vite/web-only idiom with a web-only VITE_ prefix that can never resolve in an Expo build — so every install falls back to the shared public DEMO_KEY (30 requests/hour, 50/day per IP, not the 30/min & 1000/day the comment claims). Four meals a day with a couple of searches each exhausts it.

**Expected.** Search that keeps working, and if it can't, an error that tells me the truth so I don't spend two minutes toggling wifi.

**Fix.** Read the key from an EXPO_PUBLIC_ env var (or proxy through the app's own backend) so a real key ships. Separately, distinguish HTTP 429 from a network failure and say so: "Too many food searches for now — the free lookup limit resets shortly. The database above still works." Never tell someone to check a connection that is fine.

`src/core/utils/usdaApi.ts:5`

</details>

<details><summary><b>On weak wifi the USDA spinner never stops and never offers a way out</b> — Food search</summary>

**Sees.** Standing at the far end of the kitchen, "Searching the USDA database…" with a spinner, indefinitely. There is no timeout on the fetch, so a half-open connection never resolves to the (good) error card, which means the "Try again" button — which only renders in the error state — is never reachable. I either wait, or give up and pick something approximate from the local list.

**Expected.** After a few seconds: "Still trying… / Try again", or the error card that already exists.

**Fix.** Give the fetch an ~8s AbortController timeout that resolves into the existing error state, and after ~3s of loading swap the spinner copy for "Taking longer than usual — the results below are ready now" so I know I can just proceed.

`app/food-search.tsx:286`

</details>

<details><summary><b>The app says I can log "by speaking". There is no microphone anywhere.</b> — Dashboard → Assistant</summary>

**Sees.** "AI Nutrition Assistant / Log meals, water or weight by speaking". Hands covered in egg, I tap Ask AI expecting to talk. I get a text box with the placeholder "What did you eat?" and a keyboard. No mic button exists in app/chat.tsx or anywhere else in the app.

**Expected.** Either voice input, or copy that says what it is.

**Fix.** Change the subtitle to "Log meals, water or weight by typing it in plain English" until voice exists. If voice is coming, gate the promise behind the feature.

`app/(tabs)/index.tsx:141`

</details>

<details><summary><b>The assistant always logs to today, even when I opened it from yesterday's diary</b> — Diary (on yesterday) → Assistant</summary>

**Sees.** I'm on the Diary looking at Jul 28 fixing dinner. I tap the sparkle in the Diary header, say "I also had 2 slices of toast", and it replies as though it's done. It has written it to Jul 29. Nothing on the chat screen mentions a date, and the diary I came from doesn't change.

**Expected.** The assistant to log into the day I was just looking at, or to say plainly "Added to today, Jul 29".

**Fix.** Pass the diary's active date into the chat and log against it; either way, have the confirmation chips state the day ("Toast · 2 slices → Breakfast, Jul 28").

`app/chat.tsx:179`

</details>

<details><summary><b>My day streak resets to 1 for no reason I can see</b> — Dashboard</summary>

**Sees.** Twelve-day streak. One day I don't log until after dinner, and the tile drops to 1. "Yesterday" is computed with toISOString() (UTC) while "today" is computed locally, so anywhere west of UTC an evening first-log compares against the wrong day and the chain breaks; east of UTC it breaks for early-morning logs.

**Expected.** A streak that only breaks when I actually miss a day.

**Fix.** Compute yesterday with the same local getDateString helper used for today. Also call updateStreak from applyMealTemplate — a day logged entirely from a saved meal currently doesn't count.

`src/core/store/appState.ts:389`

</details>

<details><summary><b>The target from last time is printed right there in grey, but tapping Done does nothing and I have to type all six digits myself</b> — Active workout — set row</summary>

**Sees.** The card says "Target from last time 102.5 kg × 8", and a new set row shows 102.5 and 8 as greyed placeholder text in the weight and reps fields. They look pre-filled. But they are placeholders only — set.reps is still 0, so `canComplete` is false, the ✓ renders at 0.4 opacity and is `disabled` (lines 330, 341). Tapping it does absolutely nothing and no message explains why. I tapped it three times before I understood.

**Expected.** The app already knows my target and displays it. Tapping the tick should log exactly what's shown. Failing that, the disabled tick should say why.

**Fix.** Prefill the row with the suggested weight and reps as real, selected values (a set only counts once ticked, so nothing is fabricated — it is still a deliberate confirmation). Or add a "Log 102.5 × 8" one-tap confirm on the row. Either way, when the tick is disabled, show "Enter reps first" inline instead of a silent dead button.

`app/(tabs)/workout.tsx:291`

</details>

<details><summary><b>Every set is six keystrokes, even when it's identical to the one I just did</b> — Active workout — set row</summary>

**Sees.** placeholderFor() correctly finds the previous set's weight and reps — and renders them as placeholder text only. So set 2 of a straight-sets 5×5 requires the same tap-field, type 1-0-2-.-5, tap-field, type 8, tap-tick as set 1. Fourteen touches for the first set of the session, ten for each one after. Across ~15 sets that's roughly 150 keystrokes on a decimal pad with sweaty hands.

**Expected.** Straight sets are the overwhelmingly common case. I'm confirming, not composing — one tap should repeat the last set.

**Fix.** Add a "+ Repeat last set" action that adds a row already carrying the previous set's numbers (unticked). Also give weight and reps ±increment steppers next to the fields so I never need the keypad for a plate change.

`app/(tabs)/workout.tsx:468`

</details>

<details><summary><b>The number pad covers the box I'm typing into and the tick I need next</b> — Active workout — set row</summary>

**Sees.** Screen wraps children in a plain ScrollView with no KeyboardAvoidingView and no automaticallyAdjustKeyboardInsets — even though chat.tsx:323, login.tsx:117 and onboarding.tsx:318 all use one. Tapping a weight field on a set row in the lower half of the screen (i.e. any set of the second exercise onward) brings the decimal pad up over that field. I'm entering a weight blind, and the ✓ I need to press next is also behind the keypad.

**Expected.** The field I tapped should stay visible while I type into it, and I should be able to reach the tick without dismissing the keyboard first.

**Fix.** Add a KeyboardAvoidingView (or set automaticallyAdjustKeyboardInsets on the ScrollView) in the Screen shell so the focused set row scrolls above the keypad, and add a keyboard accessory row with Next / Done.

`src/components/Layout.tsx:99`

</details>

<details><summary><b>"Finish workout" is the biggest button on the screen, takes one tap, and there is no way back into the session</b> — Active workout — session card</summary>

**Sees.** A full-width primary jade "Finish workout" button sits inside the session card at the top of the screen, right under the elapsed timer, in the area I'm scrolling and typing in all session. One tap calls endWorkout() immediately (src/core/store/appState.ts:498) — endedAt is stamped and activeWorkoutId is nulled. Nothing anywhere sets activeWorkoutId back. Meanwhile "Cancel workout", which is the safer of the two, is a quiet ghost button at the very bottom and asks twice. The dangerous action is loud and instant; the cautious one is quiet and guarded.

**Expected.** Ending my session while I'm still mid-workout should at least ask, and if I hit it by mistake I should be able to reopen the session rather than start over and re-add every lift.

**Fix.** Move Finish to the bottom of the session (below the exercises, where the session actually ends) or confirm it with a summary sheet: "Finish? 14 sets · 8,240 kg · 52 min". Add a "Reopen" action on the most recent history card that restores activeWorkoutId.

`app/(tabs)/workout.tsx:766`

</details>

<details><summary><b>I finish fifty minutes of work and the app's response is to ask me to start another workout</b> — Workout tab — immediately after finishing</summary>

**Sees.** endWorkout() nulls activeWorkoutId, the session card unmounts, and the card that renders in its place is "Ready to train? — Pick up where you left off — every lift remembers what you did last time." with a "Start workout" button. No summary, no total, no duration, no confirmation that anything was saved. The two PRs I set are gone from the screen — the trophy pills lived on the SetRows that just unmounted (line 415) and nothing replaces them. The only trace of the session is one collapsed grey History row below the fold.

**Expected.** This is the payoff moment. Tell me what I did: sets, volume, duration, and above all which records I broke — the app already computed all of it.

**Fix.** Show a completion summary on finish (a sheet or an inline card at the top): session name, duration, set count, total volume, volume vs. last session of the same lifts, and a list of the PRs set — reusing the prSetIds already computed at line 684. Give it a "Done" that leaves me on a screen showing my finished session expanded, not a prompt to train again.

`app/(tabs)/workout.tsx:1173`

</details>

<details><summary><b>I forgot to hit Finish; next day the session still says "Live" with 20 hours elapsed, and starting a new one silently ruins it</b> — Workout tab — next day</summary>

**Sees.** activeWorkoutId persists through AsyncStorage, so the session card is still there tomorrow with a green "Live" pill and ElapsedTimer reading 20:41:07 (formatElapsed switches to H:MM:SS past an hour). Nothing prompts me. If I tap "Start workout", startWorkout (src/core/store/appState.ts:488) silently stamps `previous.endedAt = Date.now()` on it — yesterday's workout lands in History as "20h 41m" with no word to me that it happened.

**Expected.** If a session has been open overnight, ask me: "You left Evening workout running yesterday — finish it, or keep going?" And never rewrite my session's duration behind my back.

**Fix.** On mount, if the active session's startedAt is more than a few hours old, replace the Live pill with a prompt: "Still training? This session started yesterday at 7:12pm" offering Finish / Resume / Discard. When auto-closing a stale session, set endedAt from the last completed set's timestamp rather than now, and tell the user it happened.

`app/(tabs)/workout.tsx:760`

</details>

<details><summary><b>The screen called Progress opens on a calorie chart, not on whether I'm making progress</b> — Progress</summary>

**Sees.** Header reads "Progress" with the subtitle "Daily intake against your goal". The first card is "Calories — Intake per day, last 7 days". Weight is the third of four segments and requires a tap to reach.

**Expected.** Someone six weeks in opening Progress is asking about their body, not yesterday's lunch. Bodyweight direction should be the first thing on screen.

**Fix.** Default the tab to Weight, or put a persistent weight-trend summary strip above the tab control so the headline answer is on screen before any tab is chosen.

`app/(tabs)/progress.tsx:614`

</details>

<details><summary><b>Progress says I've lost 0.4 kg; Profile says I'm 41% of the way there</b> — Progress → Weight vs Profile</summary>

**Sees.** Progress computes weightDelta only from weigh-ins inside the 7d/30d window, so it reports "Down 0.4 kg from Jul 2 to Jul 27". Profile's Weight goal card measures from the all-time first weigh-in and reports a much larger loss plus a progress bar.

**Expected.** One number for how far I've come. Two screens giving different answers to the same question makes both untrustworthy.

**Fix.** Label the Progress figure explicitly as window-scoped ("Change in the last 30 days") and show the since-you-started figure alongside it, matching the Profile baseline.

`app/(tabs)/progress.tsx:678`

</details>

<details><summary><b>Six weeks in and I cannot see my first six weeks</b> — Progress (all tabs)</summary>

**Sees.** The only range options are 7d and 30d. Weigh-ins, workouts and diary days older than 30 days are filtered out of every chart and every summary tile.

**Expected.** The whole point of six weeks of logging is seeing six weeks. My starting weight — the thing progress is measured from — is not viewable anywhere on the Progress screen.

**Fix.** Add a 90d and an All range. At minimum, always plot the starting weigh-in as an anchor point on the weight chart regardless of window.

`app/(tabs)/progress.tsx:58`

</details>

<details><summary><b>Three weigh-ins are drawn as a dramatic cliff with a confident line across weeks I never weighed in</b> — Progress → Weight</summary>

**Sees.** The weight chart never uses a zero baseline; it auto-scales to min/max with 18% padding, so a 0.4 kg spread fills the full 152px canvas as a steep diagonal. connectGaps is on, so two dots 25 days apart are joined by one straight line implying steady daily change. A single weigh-in in the window renders as a lone dot with an axis invented by padding it ±2%, with no explanatory text.

**Expected.** The shape of the line should reflect how much the app actually knows. A near-flat six weeks should look near-flat, and unmeasured stretches should not look measured.

**Fix.** Draw the fitted least-squares trend line (weightTarget.ts already computes it) as the primary mark and the raw weigh-ins as faint dots; dash or omit segments spanning more than a few days; annotate the chart with "n weigh-ins over m days" so the reader can discount the shape.

`app/(tabs)/progress.tsx:211`

</details>

<details><summary><b>"You averaged 100 kcal below goal" tells me nothing about whether I hit my target</b> — Progress → Calories</summary>

**Sees.** The Summary card shows Avg intake / Daily goal / Days logged and one sentence about the mean. The card header is bare "Summary" with no caption, so "Avg intake 2,050" sitting above "Days logged 5/7" reads as an average over 7 days when it is over 5.

**Expected.** Three days at 1,600 and two at 2,700 average out to the same sentence as five steady days at 2,050 — completely different adherence. I came to find out how consistent I've been.

**Fix.** Add a "days within range" count (e.g. "3 of 5 logged days within 200 kcal of goal") as the headline, and caption the card "Daily average across your 5 logged days" the way the Macros tab already does.

`app/(tabs)/progress.tsx:772`

</details>

<details><summary><b>Progress says "Days logged 7/7"; the coach says I have 4 fully logged days</b> — Progress → Calories vs Goals</summary>

**Sees.** Progress counts a day as logged if it has one or more entries — a single coffee qualifies. The coach's "Not enough logged data yet" alert only counts days above 500 kcal, so it reports a much lower number for the same period.

**Expected.** Consistent bookkeeping. Being told I logged every day and then told I barely logged anything reads as a bug.

**Fix.** Use the same 500 kcal qualifying threshold in the Days logged tile, or label it "Days with any entry" so the two numbers are visibly measuring different things.

`app/(tabs)/progress.tsx:770`

</details>

<details><summary><b>The PR list is all-time but sits under a header that says "last 7 days"</b> — Progress → Training</summary>

**Sees.** getPersonalRecords reads the entire workout log and is unaffected by the 7d/30d control, which is still visible at the top of the screen. The two cards above it are windowed and captioned "last 7 days". The list is also silently cut to 4 lifts with no count and no "see all".

**Expected.** Everything under an active range filter respects it, or says it doesn't. And if I train eight lifts I should be told four are hidden.

**Fix.** Caption the card "All time" explicitly, and add a count plus a "See all N lifts" row when the list is truncated.

`app/(tabs)/progress.tsx:704`

</details>

<details><summary><b>A card headed "Import from Google Fit" imports nothing and may point at a Profile section that isn't there</b> — Progress → Weight</summary>

**Sees.** Title "Import from Google Fit", caption "Bring past weigh-ins in from Health Connect", then body copy "Importing lives with your other connections, on Profile. Days you logged yourself are never overwritten." and a button "Open Profile". The card renders unconditionally, but Profile's Health Connect section only renders when health.availability === 'available' (profile.tsx:572) — on iOS or an Android without Health Connect, the destination does not exist.

**Expected.** A card promising an import should import, or not exist. The reassurance about overwriting answers a worry the user has never had — it reads like a changelog note left in the UI.

**Fix.** Render this card only when Health Connect is actually available, retitle it "Weigh-ins from Health Connect" with the button labelled "Manage in Profile", and drop the overwrite sentence.

`app/(tabs)/progress.tsx:1015`

</details>

<details><summary><b>Coach advice is written in kg even when the rest of the app is in lbs</b> — Goals</summary>

**Sees.** Every alert sentence hardcodes kg: "you are down about 1.4 kg a week" (line 264), "up about 0.6 kg a week" (273), "changed about 0.0 kg a week" (290), "1.6 g per kg of body weight" (310), "net change of -2.3 kg" (368) — while the card above reads 172.2 lbs and my goal weight is set in lbs.

**Expected.** One unit throughout. weightTarget.ts fixed exactly this with its inDisplayUnit helper; coachAlerts was left behind, so the same app now does it both ways.

**Fix.** Route every number in coachAlerts through the same display-unit formatter weightTarget.ts uses, taking profile.weightUnit.

`src/core/utils/coachAlerts.ts:264`

</details>

<details><summary><b>A mistyped weigh-in is accepted, poisons every derived number, and cannot be fixed from where I typed it</b> — Dashboard / Profile → Weight goal card</summary>

**Sees.** The only check is Number.isFinite(value) && value > 0. Typing 7.8 instead of 78 is accepted, immediately sets currentWeightKg to 7.8, and BMI, TDEE, calorie targets, the ETA and every coach number follow it. The input then disappears — replaced by "Weighed in today" — so there is no way to correct it from that card. The fix is Profile → expand the "Weight log" section (six sections down) → trash icon → re-log.

**Expected.** Profile just gained inline range checks on age and height with clear errors. Weight — the number everything else derives from — should have at least the same protection, plus an obvious edit.

**Fix.** Range-check the weigh-in against a plausible band and against the last entry, showing an inline confirm for large jumps; keep the field visible after logging as an editable "today: 78.1 kg · Change" row.

`src/components/WeightTarget.tsx:81`

</details>

<details><summary><b>"Kcal burned" has read 0 for six weeks of lifting</b> — Dashboard</summary>

**Sees.** A tile at the bottom of the Dashboard showing a dumbbell icon and the figure 0 with the label "Kcal burned". It sums diary[date].exercises, which only manual cardio entries write to; endWorkout (appState.ts:498-502) just stamps endedAt on the session and never touches the diary.

**Expected.** Finishing four workouts a week should move a tile with a dumbbell on it, or the tile should not be there.

**Fix.** Either estimate and write a burn entry when a workout is finished, or replace the tile with something a lifter's data actually feeds — e.g. "Sets this week" from the workout log.

`app/(tabs)/index.tsx:607`

</details>

<details><summary><b>The Dashboard states two different calorie goals 300px apart</b> — Dashboard</summary>

**Sees.** Hero: 'Eaten today 1,410 of 2,252 kcal · 842 kcal left today'. Four cards down: 'Coach plan / Cut · 2,198 kcal/day'. Both look authoritative; neither is qualified.

**Expected.** One goal. They cannot tell which number 'kcal left today' is counting against, so the screen fails its one job of answering 'am I on track'.

**Fix.** When the plan is not accepted, label the coach card 'Suggested — not applied yet' and add a 'Use this' action. When it is accepted, say 'This is your current target'.

`app/(tabs)/index.tsx:132`

</details>

<details><summary><b>Switching to 'Gain weight' leaves my goal weight pointing the other way, and the same screen says both</b> — Profile</summary>

**Sees.** Header pill now reads 'Gain weight · Moderately active'. Two inches below, the Weight goal card still reads '80.5 kg → 75 kg', '39% of the way from your starting weight' and a green 'On track: losing 0.4 kg per week, 5.5 kg to go.' The goal-weight field accepts any positive number with no check.

**Expected.** To be told 'Your goal weight of 75 kg is below where you are now — update it?'. Setup enforces exactly that rule (validateTarget in src/core/utils/onboarding.ts:160); Profile does not.

**Fix.** Run validateTarget on the Profile field, and when the goal direction changes prompt for a new goal weight instead of leaving a contradicting card on screen.

`app/(tabs)/profile.tsx:416`

</details>

<details><summary><b>Correcting a typo in my name pops a dialog asking whether to recalculate my calories — and its reason is untrue</b> — Profile ▸ About you</summary>

**Sees.** After fixing 'Samr' → 'Samir' and tapping away: a modal, 'Update your targets? / Your calorie and macro targets were set by hand. Recalculate them from your new details, or keep what you have? / [Keep mine] [Recalculate]'. It also fires when you tap into the Name field and tap out having typed nothing, and it fires twice if you move from Name to Age.

**Expected.** Nothing at all. A name is not a 'detail' any formula uses. And 'set by hand' is false for almost everyone: setup writes a pace-derived target (TDEE−550 for the default Steady cut) while the comparison uses the flat TDEE−500, so a user who has never touched the numbers is told they typed them.

**Fix.** Only prompt when a field that actually feeds BMR/TDEE (age, height, gender, activity, goal) genuinely changed value. Record where the targets came from rather than inferring it, and word it accordingly ('Your targets came from your setup pace' / '…from a plan you accepted'). Never fire on a no-op blur.

`app/(tabs)/profile.tsx:365`

</details>

<details><summary><b>The same four controls do three different things and two of them say nothing at all</b> — Profile ▸ About you</summary>

**Sees.** Changing Activity level from Moderately to Very active either (a) silently rewrites the calorie target with no message anywhere, (b) silently does nothing at all if a coach plan is in effect, or (c) pops the 'Update your targets?' dialog. Profile displays no calorie number, so in cases (a) and (b) there is zero feedback either way.

**Expected.** To be told what changing their activity level did to the number they eat by. Case (b) is the worst: they made a real change to their body data and the app deliberately ignored it without saying so.

**Fix.** Always show an inline confirmation under the control — 'Your daily target moved from 2,252 to 2,647 kcal' with an Undo, or 'Your accepted coach plan is unchanged — refresh it on Goals to use your new activity level' with a link.

`app/(tabs)/profile.tsx:357`

</details>

<details><summary><b>'Recalculate' also silently changes my water, fibre, sugar and sodium goals</b> — Profile → Dashboard</summary>

**Sees.** The dialog offers to recalculate 'your calorie and macro targets'. Tapping Recalculate also overwrites water (2,500 ml → 2,818 ml at 80.5 kg), fibre, sugar and sodium. The next time they open the Dashboard the Water card's goal has moved with no explanation.

**Expected.** Only what the dialog named. A water goal quietly changing is the kind of thing that makes people distrust every other number.

**Fix.** Either restrict recalculation to calories and the three macros, or name everything it will touch in the dialog body.

`src/core/store/appState.ts:226`

</details>

<details><summary><b>Accepting the coach plan wipes the numbers I just typed, with no warning and no undo</b> — /goals</summary>

**Sees.** I typed 2,600 / 175 P / 280 C, pressed Save, got 'Saved. These are now your daily targets.' Then I pressed 'Accept plan' to see what it does. My fields silently re-seed to 2,198 / 193 / 219 / 61. No dialog, no undo, no record of what I had.

**Expected.** 'This replaces your targets of 2,600 kcal with the plan's 2,198. Continue?' — the same courtesy the app now extends on Profile for the identical operation.

**Fix.** Confirm before overwriting hand-set targets, naming both sets of numbers, and offer an Undo in the success line for a few seconds after.

`app/goals.tsx:598`

</details>

<details><summary><b>After I override the coach, nothing marks its plan as no longer in use and the way back is a button that reads like agreeing to something new</b> — /goals</summary>

**Sees.** Once my numbers differ, the green 'Accepted. Your daily goals now match this plan…' line simply vanishes and the button label flips from 'Plan accepted' back to 'Accept plan'. The coach's 2,198 stays in 56-point type at the top, unmarked.

**Expected.** An explicit state — 'Your own numbers are in effect' with a 'Use the coach's plan instead' action. As built, returning to the plan requires interpreting an absence and a button-label change.

**Fix.** Render the state positively in both directions: 'In effect: your numbers (2,600 kcal)' / 'In effect: coach plan (2,198 kcal)', and label the revert action 'Go back to the coach plan'.

`app/goals.tsx:583`

</details>

<details><summary><b>The plan never says when it was made or when it will next update — and it changes under me without saying so</b> — /goals</summary>

**Sees.** 'Cut for 12 weeks' and 'Duration 12 weeks in this phase' with no start date, no creation date, no next-review date anywhere on the screen. A week later, opening Goals silently re-fetches (src/hooks/useCoach.ts:317): the numbers change mid-scroll, the 'Accepted' line disappears, and nothing announces any of it.

**Expected.** 'Built 12 Sep from your 84.0 kg weigh-in. Next review after your weigh-ins on 19 Sep.' The single most common question about a coach plan is 'is this current?', and the screen cannot answer it.

**Fix.** Print the plan's date and the anchoring data under the headline, plus a 'Plan updated just now — your targets are still the previous plan's. Accept to switch.' banner whenever an auto-refresh replaces a plan the user had accepted.

`app/goals.tsx:487`

</details>

<details><summary><b>The screen tells me to plan around my measured burn and then shows a plan that ignores it</b> — /goals</summary>

**Sees.** 'Your measured burn is about 62 kcal a day lower than the formula predicts, from 12 logged days… The measured number is the better one to plan around.' Four hundred pixels above: 'Built around your 2,747 kcal/day predicted burn' — the formula number. The confidence pill on the same card reads 'Low confidence'.

**Expected.** One story. Either the measured figure is good enough to plan around or it is not; being told both on one scroll makes both readings worthless.

**Fix.** Below 'medium' confidence, change the sentence to say the measured figure is not being used yet and what would make it usable ('three more fully logged days'). Above it, name the same source the plan actually used.

`app/goals.tsx:113`

</details>

<details><summary><b>The plan's burn figure is frozen but its predicted/measured label is recomputed live</b> — /goals</summary>

**Sees.** 'Built around your 2,747 kcal/day measured burn' — where 2,747 is stored in the plan from when it was created, while the word 'measured' is computed from today's data. Once enough days accumulate, the sentence claims a measured basis for a number that was predicted, and the Measured cell right below shows a different figure.

**Expected.** The sentence to describe the plan as it was built. Two numbers on one screen both claiming to be 'measured' is the kind of thing that makes people stop believing the coach.

**Fix.** Store the anchor source on the recommendation and render the stored label, not a live recomputation.

`app/goals.tsx:506`

</details>

<details><summary><b>Try again / Retry give no result at all when they fail</b> — Can't reach your account; Not synced banner</summary>

**Sees.** Tapping Try again shows "Trying…" for up to 8 seconds, then the button returns and the screen is pixel-identical. Same for Retry in the banner. retrySync just sets hydrationOutcome back to 'failed' and re-renders the same thing. The user cannot tell whether it tried, failed, or never registered the tap, so they tap repeatedly.

**Expected.** "Still can't reach it — last tried 00:07." or, on success, "Synced. Everything you logged is on your account."

**Fix.** Track the last attempt outcome and time. Render a line under the buttons: on failure "Still no connection — last tried 00:07"; on success from the banner, replace the banner with a short-lived "Synced — 3 changes saved" confirmation instead of having it silently vanish.

`app/_layout.tsx:144`

</details>

<details><summary><b>Logging a snack after midnight resets my streak from 47 to 1</b> — Dashboard (Day streak tile), Profile (Streak)</summary>

**Sees.** updateStreak computes today from local time but yesterday via `.toISOString().split('T')[0]`, which is UTC. In any timezone ahead of UTC, logging between midnight and the UTC offset yields the day-before-yesterday, so lastLoggedDate never matches and `current` is set to 1. The Dashboard Flame tile drops from 47 to 1 with no explanation.

**Expected.** The streak to increment, because they logged yesterday and are logging today.

**Fix.** Compute yesterday with the same local-date helper used for today (`getDateString(d)` after `d.setDate(d.getDate()-1)`), never toISOString. The Dashboard streak tile should read 48, not 1.

`src/core/store/appState.ts:389`

</details>

<details><summary><b>Error messages name environment variables and LAN IPs in front of the user</b> — Assistant (chat); Goals (coach notice)</summary>

**Sees.** A red chat bubble: "Failed: Could not reach http://192.168.1.20:3000/api/chat. Check that EXPO_PUBLIC_API_URL points at an address this device can reach (a LAN IP or a deployed URL, never localhost) and that the server is running." Other variants read "Missing EXPO_PUBLIC_API_URL…" or "/api/chat failed (HTTP 502): …". Goals renders the same strings verbatim via coach.error.

**Expected.** "I couldn't reach the assistant — check your connection and try again."

**Fix.** Split the thrown errors into a user-facing sentence and a developer detail. Show only the sentence in the chat bubble and the Goals notice: offline → "Couldn't reach the assistant. Check your connection and try again."; timeout → "That took too long. Try again."; misconfiguration → "The assistant isn't available right now." Log the technical text, never render it.

`src/lib/api.ts:280`

</details>

<details><summary><b>"Import from Google Fit" sends me to a Profile section that isn't there</b> — Progress → Weight</summary>

**Sees.** A full card titled "Import from Google Fit", captioned "Bring past weigh-ins in from Health Connect", with an "Open Profile" button. On iOS or any Android without Health Connect, Profile's Health Connect section is gated on `health.availability === 'available'` and never renders — so the user lands at the top of Profile, scrolls the whole page, and finds nothing. Three names for one feature in one card. When there are no weigh-ins, the empty state directly above already says "Log your weight from the Profile tab".

**Expected.** Either an import that works here, or no card at all on a device that cannot import.

**Fix.** Render this card only when `useHealthSync().availability === 'available'`, and title it "Health Connect" to match Profile. Better: drop the card and put the pointer inside the existing "No weigh-ins yet" empty state, so the tab has one destination instead of two.

`app/(tabs)/progress.tsx:1015`

</details>

<details><summary><b>The only escape from the blocking screen wipes the device without asking</b> — Can't reach your account (full-screen)</summary>

**Sees.** "Sign out" on the blocking screen calls signOut() immediately — no dialog. The same action on Profile always confirms ("Your data is saved to your account, and this device will be cleared." / "…That work would be lost."). Sign-out runs resetStore(), so on the upgrade path this deletes the local store the user can't currently see.

**Expected.** The same confirmation they get everywhere else, especially on the screen where they feel trapped and are most likely to press it.

**Fix.** Reuse Profile's confirmSignOut dialog here, including the unsynced-changes variant, and label the button "Sign out and clear this device".

`app/_layout.tsx:108`

</details>

<details><summary><b>Mid-workout, the whole screen becomes a login form with no warning</b> — Workout → Login</summary>

**Sees.** The live session card, volume, elapsed clock and rest timer are replaced by the login form in one frame. The explanation — "Your session expired, so you were signed out. Everything you logged is still on this device — sign in to sync it." — is a 13pt grey line below the email and password fields. After signing back in, the user lands on the Dashboard, not back on the Workout tab, and has to go check the sets survived.

**Expected.** To be told up front why they are looking at a login form, that the workout is still there, and to be returned to it.

**Fix.** Move the session-expired notice above the sign-in/create-account toggle so it is the first thing read, and when there is an active workout say so explicitly ("Your workout is still running on this device."). After a re-sign-in caused by expiry, route back to the tab the user was on.

`app/login.tsx:183`

</details>

### annoys (34)

<details><summary><b>"Add food" on the dashboard opens a list, not the food search</b> — Dashboard (Meals card)</summary>

**Sees.** Each meal row shows "Nothing logged" and a jade "Add food" label with a chevron. Tapping it navigates to the Diary tab at the top, where I have to pass the date navigator and the day-totals card and press a second "Add food" button inside the Breakfast card to reach the search modal.

**Expected.** Tapping "Add food" next to Breakfast opens the food search with Breakfast preselected — the modal already accepts `{ meal, date }` params (app/(tabs)/diary.tsx:563).

**Fix.** Link the meal rows straight to `/food-search?meal=Breakfast&date=<today>`. Halves the taps on the single most repeated task in the app.

`app/(tabs)/index.tsx:429`

</details>

<details><summary><b>Three buttons open the AI chat; none opens food logging</b> — Dashboard</summary>

**Sees.** A sparkle icon button in the header (app/(tabs)/index.tsx:124), an "AI Nutrition Assistant" card with an "Ask AI" button (index.tsx:144), and a floating jade sparkle button pinned bottom-right above the tab bar. The bottom-right position is where I reach for "+ log something", and it hovers over the corner of the last card.

**Expected.** The bottom-right floating button to be the primary logging action, with the assistant as a secondary entry point instead of three of them.

**Fix.** Keep one assistant entry point (the header sparkle) and make the floating action button log food, or give it a two-way choice. At minimum drop the duplicate "AI Nutrition Assistant" card so the Meals card rises above the fold.

`app/(tabs)/_layout.tsx:140`

</details>

<details><summary><b>The only "what do I do now" affordance is two scroll flicks down</b> — Dashboard</summary>

**Sees.** Card order is: Eaten today (0 of 1,937), AI Nutrition Assistant, Macros (a 192pt ring at zero showing 0 kcal again), Coach, then Meals. The first screenful is two different renderings of "you have eaten nothing" plus an AI advert. No copy anywhere tells a brand-new account what to do first.

**Expected.** On a completely empty day, the first thing on screen should be "Log your first meal", not two zeroed progress visualisations.

**Fix.** When today's diary is empty, collapse the hero and the macro ring into one card and promote Meals to the top with a one-line prompt ("Nothing logged yet — start with breakfast").

`app/(tabs)/index.tsx:163`

</details>

<details><summary><b>Leaving setup halfway throws away every answer</b> — Setup (any step)</summary>

**Sees.** Step index, name, age, height, weight, activity, goal, pace and target are all component state. Only `completeOnboarding()` at the end writes anything (line 282). Backgrounding the app long enough for it to be killed, or force-quitting, restarts at "Welcome, 1 of 5" with everything blank.

**Expected.** To come back to the question I was on, with what I'd already typed still there.

**Fix.** Persist the in-progress answers and the step index to the store (or AsyncStorage) on change, and restore them on mount.

`app/onboarding.tsx:178`

</details>

<details><summary><b>There is no way to see the app before handing over age, height and weight</b> — Setup</summary>

**Sees.** The onboarding route is registered with `gestureEnabled: false`, there is no close or skip control on any step, and the tab bar is not mounted. Age, height and weight are hard-required by `validateBasics`. A friend recommended this app and I can't see a single screen of it until I've given my body measurements.

**Expected.** A "Skip for now, I'll set this up later" that drops me on the dashboard with clearly-labelled placeholder targets.

**Fix.** Offer a skip that sets a neutral maintenance target and marks the dashboard's hero as "Targets not set yet — finish setup", linking back into the flow.

`app/_layout.tsx:249`

</details>

<details><summary><b>The only way out of Goals is a back arrow in the top-right corner</b> — Goals</summary>

**Sees.** Goals is a stacked screen with no tab bar; its header renders an ArrowLeft IconButton in the `right` slot. I swiped back instead, which works, but the visible affordance is a left-pointing arrow sitting on the right edge.

**Expected.** A back control on the left of the header, where every other stacked screen on the platform puts it.

**Fix.** Move the back control to the header's left slot (or add a `left` prop to Screen), and pad the bottom for a screen that has no tab bar.

`app/goals.tsx:428`

</details>

<details><summary><b>The first frame is a logo and a spinner with no words for up to eight seconds</b> — Launch</summary>

**Sees.** A jade tile with the ring mark and an ActivityIndicator. "Loading your account" exists only as an accessibilityLabel. This screen is held for the whole session restore, which includes an account fetch capped at 8 seconds (src/lib/AuthProvider.tsx:104).

**Expected.** The app's name under the mark, and a line of text after a second or two so I know it is working and not frozen.

**Fix.** Add the "MacroFit" wordmark under the mark, and after ~2s reveal a visible "Getting your account…" line.

`src/components/LaunchScreen.tsx:17`

</details>

<details><summary><b>A card titled "Import from Google Fit" doesn't import anything</b> — Progress</summary>

**Sees.** Card header "Import from Google Fit", caption "Bring past weigh-ins in from Health Connect", then body copy "Importing lives with your other connections, on Profile." and a button labelled "Open Profile".

**Expected.** A card whose title is the thing it does. Right now the title promises an import and the button is a redirect.

**Fix.** Retitle it to what it is ("Past weigh-ins live on Profile") or remove the card and put the pointer in the weight-history card's empty state.

`app/(tabs)/progress.tsx:1017`

</details>

<details><summary><b>The fast path for the lunch I eat every day is buried where nobody scrolls, and creating one is an unlabelled icon</b> — Diary</summary>

**Sees.** Two weeks in and I didn't know saved meals existed. They render after Breakfast, Lunch, Dinner, Snacks, Pre-Workout AND Post-Workout — about 1,500pt of scrolling. The instructions for creating one ("Log a meal, then tap its bookmark to save it.") are in that same bottom card, i.e. only visible to someone who already found the feature. The bookmark itself is a bare icon in a meal card header with no label, and it only appears once the meal already has food in it (diary.tsx:476-490). Meanwhile copyDayEntries and copyMealEntries exist in the store and no screen in the app calls either — "copy yesterday's dinner into today" simply doesn't exist for me.

**Expected.** For a meal I eat daily: one tap from the Dashboard or the top of the Diary. And when I've just logged a meal, to be offered "Save this as a meal" right there.

**Fix.** Move Saved meals to a horizontal strip directly under the date navigator, above the meal cards, so it is the first thing offered on a fresh day. After a meal card gets its second entry, show a text "Save as meal" action instead of a naked bookmark. Surface copyMealEntries as "Repeat yesterday's lunch" inside an empty meal card, and copyDayEntries as "Copy a previous day" on an empty day.

`app/(tabs)/diary.tsx:702`

</details>

<details><summary><b>Removing a logged food happens instantly, with no confirmation and no undo</b> — Diary → entry editor</summary>

**Sees.** I tap a row to change the servings, and the panel that opens has minus / number / plus on one line and a red-icon "Remove" on the next — inches from the minus button I actually came for. One mis-tap one-handed and last night's dinner is gone. Nothing asks, nothing confirms, nothing offers it back. The whole app has no toast and no undo anywhere.

**Expected.** Either a quick confirm, or — better for something done all day — instant delete with a five-second "Removed Chicken Breast · Undo".

**Fix.** Add an undo snackbar on removeFoodEntry (and on the assistant's remove_food, which is even more invisible). Move Remove away from the stepper row, or make it a swipe-to-delete on the row itself with the same undo.

`app/(tabs)/diary.tsx:412`

</details>

<details><summary><b>Nothing tells me a logged item can be edited — I tried long-press and swipe first</b> — Diary</summary>

**Sees.** A row: "Chicken Breast (cooked, 4 oz)" / "113 g" / "187 kcal", with P/C/F chips under it. No chevron, no pencil, no disclosure of any kind. The whole row is a Pressable that expands a servings editor, but the only place that's stated is the screen-reader label. My instincts — long-press, swipe left — do nothing, so I assumed logged food was final and started deleting-and-re-adding to fix portions.

**Expected.** Some visible affordance that the row does something.

**Fix.** Add a chevron (rotating on expand) or a small "1 ×" stepper glyph on the right of each row, and support swipe-left for delete. A one-time hint line on the first day with entries would cover the rest.

`app/(tabs)/diary.tsx:340`

</details>

<details><summary><b>The home screen has no way to log food above the fold — but it does have two entry points to the chatbot</b> — Dashboard</summary>

**Sees.** Top of the Dashboard: the calories card (good), then a full-width promo — "AI Nutrition Assistant / Log meals, water or weight by speaking" with an "Ask AI" button — then a 192pt donut of zeros. The Meals list, my only route to logging anything, starts around 700pt down and is entirely below the fold. There is no + anywhere. The one big floating action button, bottom-right where every food app puts "log food", opens the chatbot (app/(tabs)/_layout.tsx:140) — a third sparkle icon after the header icon and the promo card.

**Expected.** One thumb-reachable button that starts a food log, given I do this 3-5 times a day.

**Fix.** Make the floating action button log food (long-press or a secondary chip for the assistant), and move Meals above the macro ring so "Breakfast → Add food" is visible on open. Demote the assistant promo to a single line inside the Coach card.

`app/(tabs)/index.tsx:134`

</details>

<details><summary><b>Tapping "Snacks" on the Dashboard drops me at the top of the Diary, not at Snacks</b> — Dashboard → Diary</summary>

**Sees.** I tap the Snacks row (its accessibility label even says "Open diary to add food"). I land on the Diary's date navigator, then a tall totals card, then Breakfast, Lunch, Dinner — four scroll flicks before Snacks appears, then another tap on Add food. Every meal row is the same `<Link href="/diary">`.

**Expected.** Tapping Snacks either scrolls me to Snacks or opens the food search with Snacks preselected — I already told the app which meal I meant.

**Fix.** Route the meal rows straight to /food-search with { meal, date } (that's exactly what the Diary's own Add food buttons do at diary.tsx:563), saving two scrolls and a tap on the most repeated action in the app.

`app/(tabs)/index.tsx:429`

</details>

<details><summary><b>The built-in food list lags my typing and shows apples while I'm typing "chicken"</b> — Food search</summary>

**Sees.** I type c-h-i-c and for 350ms after every pause the list under the heading "Food database" is still Apple (medium), Banana (medium), Blueberries (1 cup) — because the local search runs off the same debounced string as the network call, and an empty debounced query means "show the first 25 of the database". Then it snaps to "Matches". On a 100-item in-memory list this is pure invented latency.

**Expected.** The local matches to filter on every keystroke, instantly, with only the internet section waiting.

**Fix.** Filter presets/custom/recents off the raw query and keep the debounce for searchUSDA only. And while a query is being typed, don't title an unfiltered dump "Food database" — either hide it or label it "Popular foods".

`app/food-search.tsx:313`

</details>

<details><summary><b>A card titled "Import from Google Fit" doesn't import anything</b> — Progress → Body</summary>

**Sees.** Heading "Import from Google Fit", caption "Bring past weigh-ins in from Health Connect" — so I tap the button, which turns out to say "Open Profile", and I'm dropped at the top of a very long Profile screen with no indication of where the importer actually is. The card reads like a broken button.

**Expected.** Either the import happens here, or the card doesn't claim to be an import.

**Fix.** Retitle it as a pointer ("Weigh-ins from Google Fit — set up on Profile") and deep-link to the connections section on Profile rather than the top of the screen. Better still, remove the card and put the pointer inside the weight-chart empty state where someone would actually look for missing data.

`app/(tabs)/progress.tsx:1015`

</details>

<details><summary><b>I add a lift and get a card with no set rows — I have to ask for the row before I can log anything</b> — Active workout — new exercise card</summary>

**Sees.** addExerciseToWorkout pushes `{ sets: [] }` (src/core/store/appState.ts:521), and the SetRow grid plus its column headers are gated on `sets.length > 0` (line 559). So a freshly-added exercise shows the name, "Target from last time 102.5 kg × 8", and a lone "Add set" button — one extra tap before I can enter anything, on every exercise, every session. The same is true of every lift added by a Quick-start template.

**Expected.** I added the exercise because I'm about to do a set. Give me the row.

**Fix.** Seed one empty set row when an exercise is added (and one per lift when a template is applied). It costs nothing — an unticked set contributes no volume and no set count.

`app/(tabs)/workout.tsx:601`

</details>

<details><summary><b>I pick a second lift, the sheet closes, and nothing on screen changes</b> — Lift picker → active workout</summary>

**Sees.** handleSelect fires a light haptic and calls router.back(). The new exercise is appended to the end of session.exercises, which is below the fold, and the workout ScrollView keeps its previous offset. So I land back on exactly the view I left with no visible change and no confirmation. I nearly tapped Bench Press a second time thinking it hadn't registered.

**Expected.** Something should tell me it worked — take me to the lift I just added, or show it.

**Fix.** Scroll the new exercise card into view when the picker returns (ref the card by exercise id), or briefly highlight it. Keeping the picker open with a "1 added" counter and an explicit Done would also let me queue several lifts in one visit.

`app/lift-picker.tsx:185`

</details>

<details><summary><b>Ticking my first set makes the whole page jump under my thumb</b> — Active workout</summary>

**Sees.** RestTimer is inserted into the layout flow above the exercise list, and it renders null until the first working set is completed. So the instant I tick set 1 it mounts and pushes ~97pt (81pt card + 16pt gap) of content down; everything I was looking at slides out from under my finger. It jumps back up the moment I dismiss the timer with the ×, and down again on the next completed set.

**Expected.** Ticking a box should not move the rest of the screen.

**Fix.** Reserve the timer's space (or, better, pin it as a floating pill per the rest-timer finding so it never affects layout at all). If it stays inline, enable maintainVisibleContentPosition on the ScrollView so content under the viewport doesn't shift.

`app/(tabs)/workout.tsx:770`

</details>

<details><summary><b>The button I press most is the hardest one on the screen to see</b> — Active workout — set row</summary>

**Sees.** An untouched Done control is a transparent box with a `theme.border` outline and a `theme.textMuted` tick — in dark mode that's a #78716C glyph inside a #292524 border on a #0C0A09 canvas — and it renders at 0.4 opacity until reps are entered, which is its state right when I'm looking for it. Everything decorative on the screen (40pt volume figure, green Live pill, jade Finish button) is louder than the primary action of the whole flow. The column headers above it are 11pt uppercase textMuted with 0.8 letter-spacing.

**Expected.** At arm's length, sweaty, under gym lighting, the tick should be the most obvious target on the row.

**Fix.** Give the untouched Done control a filled or brand-outlined treatment at full opacity, raise the icon colour to textSecondary or brand, and drop the 0.4 opacity in favour of an explicit "needs reps" state. Bump the grid column headers to 12–13pt at textSecondary.

`app/(tabs)/workout.tsx:338`

</details>

<details><summary><b>My history and my PR list show "Bench Press" twice with different numbers and no way to tell them apart</b> — Workout tab — History detail and Personal records</summary>

**Sees.** The history detail renders only `exercise.lift.name` (line 990) and the PR rows render only `record.liftName` (line 1247). The database has "Bench Press" as both Barbell and Dumbbell (src/core/data/exerciseDatabase.ts:35 and :53), "Curl" twice, "Row" twice, "Calf Raise" three times, "Romanian Deadlift" twice. So after a barbell + dumbbell chest day my history reads "Bench Press / Bench Press" and my PR list has two "Bench Press" rows with wildly different est. 1RMs.

**Expected.** Two different lifts should have two different names. The picker disambiguates them with "Chest · Dumbbell" — history and PRs don't.

**Fix.** Append the equipment wherever a lift name appears outside the picker: "Bench Press · Dumbbell". The data is already on `lift.equipment` in both places.

`app/(tabs)/workout.tsx:990`

</details>

<details><summary><b>The warmup toggle is hidden on the set number, so nobody finds it and anybody can hit it by accident</b> — Active workout — set row</summary>

**Sees.** The "1" under the SET column is a 44pt Pressable that flips the set to a warmup, rendering it as "W". Nothing indicates it is tappable — no chevron, no border, no hint, and the column header just says "Set". Nowhere on the screen does the word "warmup" appear. Meanwhile it's a full 44pt target at the left edge of every row: brushing it silently converts a working set to a warmup, which removes it from volume, from the set count, and from PR and progression calculations.

**Expected.** I'd look for warmup in a menu on the exercise card, not on the set number. And I shouldn't be able to remove a set from all my stats by grazing a number.

**Fix.** Give warmup an explicit labelled control — a small "W" toggle chip with a visible outline, or a "Mark as warmup" action on a row long-press. Whichever it is, make it look like a control, and show a one-line explanation the first time it's used ("Warmup sets don't count toward volume").

`app/(tabs)/workout.tsx:262`

</details>

<details><summary><b>I cannot find out what any single day was</b> — Progress (all charts)</summary>

**Sees.** No chart has any touch handling. The x-axis prints only the two window edges ("Jul 23" and "Jul 29"), so a dot in the middle of a 30-day chart cannot be attributed to a date at all.

**Expected.** Tapping the day I blew past my goal should tell me which day it was and what the number was — that's the whole reason to look at a chart of my own data.

**Fix.** Add press-to-inspect showing date and value for the nearest point, and label at least the midpoint on the x-axis.

`app/(tabs)/progress.tsx:190`

</details>

<details><summary><b>The dashed goal line is today's target drawn flat across a month of history</b> — Progress → Calories</summary>

**Sees.** goals.calories is drawn as one flat dashed line across the whole window, with the legend calling it "Goal". If the coach plan changed my target three weeks ago, the chart shows me missing a target that did not exist on those days.

**Expected.** Either the goal that applied on each day, or an honest label.

**Fix.** Caption the legend entry "Goal (current)", or store goal history and step the line where it changed.

`app/(tabs)/progress.tsx:748`

</details>

<details><summary><b>On the Weight tab there is no way to weigh in — the only button on screen says "Open Profile" under a Google Fit header</b> — Progress → Weight</summary>

**Sees.** With no weigh-ins: an empty state reading "No weigh-ins yet — Log your weight from the Profile tab", then a Summary card that still renders three dead tiles ("No data yet", "No data yet", "Needs 2 weigh-ins"), then the Google Fit card. With weigh-ins: no logging affordance at all. The daily path is Profile tab → tap field → type → Log, five taps; the Dashboard copy of the card is the eighth item down that screen (index.tsx:173).

**Expected.** A weigh-in is a daily action and should be one tap from the screen that charts it.

**Fix.** Put the weigh-in field directly in the Weight tab (the same WeightTargetCard input), and suppress the dead Summary tiles when there are zero entries.

`app/(tabs)/progress.tsx:917`

</details>

<details><summary><b>The Cut/Maintain/Bulk buttons and 'Suggested' ignore the pace I chose, so tapping one sets a target I never picked</b> — /goals</summary>

**Sees.** '[2,247 Cut] [2,747 Maintain] [3,047 Bulk]' and a 'Suggested 2,247' cell captioned 'kcal to lose'. These are flat −500/+300, unrelated to the 'Steady, 0.5 kg a week' picked at setup (which produced 2,252, i.e. −550) or to Gentle (−275) or Quick (−825).

**Expected.** 'Cut' to mean the cut they chose. Picking Gentle and Quick at setup produces two different plans; these buttons collapse them both to the same number.

**Fix.** Derive the presets and 'Suggested' from caloriesForPace with the user's stored pace, and label them 'Cut at your pace (0.5 kg/wk)'.

`app/goals.tsx:418`

</details>

<details><summary><b>Progress prints my calorie goal three times and none of it is tappable</b> — Progress ▸ Calories</summary>

**Sees.** A dashed goal line on the chart, a 'Daily goal / 2,252 / kcal' tile, and 'You averaged 173 kcal below goal.' The screen where I am judging my goal has no way to change it — it imports no router link at all.

**Expected.** To tap the goal I am being measured against and adjust it, especially right after being told I have been under it all week.

**Fix.** Make the 'Daily goal' tile a link to /goals, and add an 'Adjust goals' ghost action in the Summary card header.

`app/(tabs)/progress.tsx:769`

</details>

<details><summary><b>The back arrow on Goals is in the top-right corner</b> — /goals</summary>

**Sees.** A left-pointing arrow rendered in the header's right-hand slot. Every other pushed screen convention on both platforms puts it left.

**Expected.** To reach for the top-left, miss, and hunt. Twice per visit.

**Fix.** Add a leading slot to the Screen header and move the back control into it; keep chat.tsx's X on the right since that is a modal close.

`app/goals.tsx:428`

</details>

<details><summary><b>The app pushes an AI assistant at me three times and it is the one thing that cannot change my targets</b> — Dashboard / Assistant</summary>

**Sees.** A floating Sparkles button on every tab, a Sparkles icon in the Dashboard header, and an 'AI Nutrition Assistant — Ask AI' card as the SECOND card on the Dashboard, above my macros. The same Sparkles glyph on the same screen also means 'Coach plan' and goes somewhere entirely different. Asking it to raise my calories does nothing — its tools are only log food, remove food, log weight, log water.

**Expected.** Someone on a mission to change their targets, staring at a prominent AI button, will try it first. The welcome copy is good about what it CAN do but says nothing about what it cannot.

**Fix.** Demote the promo card, use a distinct glyph for the coach, and have the assistant answer target requests with a real handoff: 'I can't change your targets, but here is the screen that does' with a link to /goals.

`app/(tabs)/index.tsx:134`

</details>

<details><summary><b>A card headed 'Import from Google Fit' does not import anything</b> — Progress ▸ Weight</summary>

**Sees.** Title 'Import from Google Fit', caption 'Bring past weigh-ins in from Health Connect', then body copy explaining that importing lives on Profile, and a button 'Open Profile' that drops you at the top of Profile with the Health Connect section unexpanded and no scroll.

**Expected.** Tapping a card titled with an action performs it. Being redirected — and then having to find the right collapsed section yourself — is worse than the card not existing.

**Fix.** Retitle it 'Weigh-ins from Health Connect' with the caption 'Importing lives on Profile', and have the button deep-link to Profile with the Health Connect section expanded and scrolled into view.

`app/(tabs)/progress.tsx:1015`

</details>

<details><summary><b>The Not synced banner never clears itself, and the copy implies it will</b> — Not synced banner (all tabs)</summary>

**Sees.** "Everything you log stays safely on this device until it clears." Nothing ever re-attempts the load: retrySync only fires from a tap, and the AppState handler's flushSave returns 'skipped' because saving is blocked. Signal comes back, the banner stays, saving stays off for the rest of the session.

**Expected.** The app to notice it is back online and sync, or at minimum to say that syncing needs a tap.

**Fix.** Retry automatically on foreground and on a NetInfo reconnect (with backoff), and while blocked change the last clause to "…until we can reach your account again. Tap Retry once you have signal."

`app/_layout.tsx:63`

</details>

<details><summary><b>Fixing a typo in my name asks whether to recalculate my calorie targets</b> — Profile → About you</summary>

**Sees.** commitBasics is the blur handler for Name, Age and Height and always calls applyBodyChange, even when nothing changed. Tabbing through the Age field without typing pops: "Update your targets? Your calorie and macro targets were set by hand. Recalculate them from your new details, or keep what you have?"

**Expected.** No dialog at all, because nothing that feeds the calorie formula changed.

**Fix.** Only run applyBodyChange when age, height, goal, activity or gender actually differ from the stored value; a name edit (or an untouched blur) should commit silently.

`app/(tabs)/profile.tsx:357`

</details>

<details><summary><b>The Height unit toggle changes nothing anywhere in the app</b> — Profile → About you</summary>

**Sees.** A live-looking cm / ft-in selector. profile.heightUnit is read only by app/onboarding.tsx; after setup, no screen reads it — Profile's field stays "Height (cm)" and the subtitle always shows both. Flipping it produces no visible change.

**Expected.** Height to be displayed in the unit they picked, on this screen at least.

**Fix.** Either honour it — swap the Height field for feet/inches inputs and drop the parenthetical cm from the subtitle — or remove the control from Profile entirely.

`app/(tabs)/profile.tsx:735`

</details>

<details><summary><b>"Add food" on a Dashboard meal row dumps me at the top of the Diary</b> — Dashboard → Meals</summary>

**Sees.** Each meal row ends with "Add food" in jade semibold — it reads as a button for that meal. It is a Link to /diary, so it lands at the top of the Diary screen. To actually add to Snacks the user then scrolls past the date navigator, the tall day-totals card, and the Breakfast, Lunch and Dinner cards to reach that meal's own Add food button. Four taps and a long scroll for the most frequent action in the app.

**Expected.** To land in the food search for that meal.

**Fix.** Route the row to `/food-search` with `{ meal, date }` — the modal already accepts both params — so tapping "Snacks · Add food" opens the search with Snacks preselected. One tap instead of two plus a scroll.

`app/(tabs)/index.tsx:429`

</details>

<details><summary><b>Quick-add water is more than a full screen down the Dashboard</b> — Dashboard</summary>

**Sees.** Above the water card sit the hero, the AI assistant card, a 192pt macro ring with legend, the coach card and five meal rows — roughly 900pt of scrolling before "Quick add · ml" appears. Meanwhile a floating Sparkles button is pinned over the content for the chatbot.

**Expected.** One tap to add a glass of water, several times a day, without hunting.

**Fix.** Move the water card above the macro ring, or collapse it into a one-line row near the hero with the +250 control inline.

`app/(tabs)/index.tsx:492`

</details>

### polish (11)

<details><summary><b>Setup points me at Profile to edit my targets; they're edited on a different screen</b> — Setup step 5 → Profile</summary>

**Sees.** The final setup screen says "Nothing is locked in — every number is editable under Profile." Profile has name, age, height, goal weight and step goal, and only recalculates calories via a dialog. The calorie and macro fields live on the Goals screen, which has no tab and is reachable only by tapping the Coach card on the dashboard.

**Expected.** To find the 1,937 kcal figure where I was told it would be.

**Fix.** Point the copy at the right place ("editable any time under Goals") and add a Goals row to Profile so the screen is reachable without going through the Coach card.

`app/onboarding.tsx:670`

</details>

<details><summary><b>A green tick congratulates me for having eaten nothing</b> — Dashboard (Eaten today)</summary>

**Sees.** With 0 eaten, `tone` is 'good' so the status line renders a green Check beside "1,937 kcal left today". The macro ring below repeats the same zero as "0 / kcal today".

**Expected.** A neutral state on a day with nothing logged, and one card showing today's calories rather than two.

**Fix.** Suppress the tick until something has been logged, and show a prompt ("Nothing logged yet") in place of the status line on an empty day.

`app/(tabs)/index.tsx:207`

</details>

<details><summary><b>Setup asks what to call me and then never calls me it</b> — Setup step 2 → Dashboard</summary>

**Sees.** "What should we call you?" in setup. `profile.name` is rendered in exactly one place in the app: the Profile screen's header (app/(tabs)/profile.tsx:536). The dashboard header just says "Today".

**Expected.** To be greeted by name on the screen I open every day, or not to be asked.

**Fix.** Use the name in the dashboard header ("Morning, Sam") or drop the question.

`app/onboarding.tsx:414`

</details>

<details><summary><b>A slipped decimal logs 16,600 kcal without a murmur</b> — Food search → portion step</summary>

**Sees.** I meant 100 g of oatmeal but I was in Servings mode, so I typed 100. "Adds to your day: 16,600 kcal" appears in a card below the fold, the Add button is happily green, and my Dashboard then reads "14,600 kcal over your goal". Zero and negatives are caught nicely ("Enter an amount greater than zero.") but nothing at the other end is.

**Expected.** A nudge when an amount is obviously wrong.

**Fix.** Warn above ~10 servings or ~3,000 kcal for a single entry — "That's 100 servings (16,600 kcal). Did you mean 100 g?" with a one-tap switch to the measured unit.

`app/food-search.tsx:380`

</details>

<details><summary><b>Tapping Finish on an empty session files a "0 sets, 0 min" workout in my history forever</b> — Active workout → History</summary>

**Sees.** endWorkout unconditionally stamps endedAt, so a session I started by mistake and finished becomes a permanent history row reading "Evening workout · Jul 29 · 0 sets · 0 min" with a volume of 0. cancelWorkout (src/core/store/appState.ts:504) is the one that actually cleans up — and it's the button styled as scary and labelled "Cancel workout", with the confirm text "Nothing is ticked off yet, so this workout will be deleted." The safe-looking button makes the mess; the scary-looking one prevents it.

**Expected.** Finishing a workout in which I logged nothing shouldn't leave a record of nothing.

**Fix.** When Finish is pressed with no completed sets, show the same message Cancel does — "Nothing is ticked off yet — discard this session?" — with Discard / Keep training, rather than silently filing an empty row.

`app/(tabs)/workout.tsx:766`

</details>

<details><summary><b>The AI sparkle button floats over the bottom of my workout, and there are two of them</b> — Active workout — bottom of scroll</summary>

**Sees.** The 56pt AssistantButton sits at bottom-right, 116–172pt up from the screen edge. The Screen shell pads content by TAB_BAR_SPACE + insets.bottom + spacing.xl (~134pt), so when I scroll to the very bottom the FAB covers the right ~74pt of the last control — which during a session is "Cancel workout". Aiming there opens the AI chat instead. And the Workout screen already has its own Sparkles IconButton to /chat in the header (app/(tabs)/workout.tsx:1145), so the same destination appears twice on one screen.

**Expected.** Nothing should sit on top of a button I'm trying to press, and one entry point per destination.

**Fix.** Increase the Screen bottom padding to clear the FAB (or hide the FAB while a workout session is live — I'm not asking the nutrition assistant anything mid-set), and drop one of the two duplicate chat entry points on this screen.

`app/(tabs)/_layout.tsx:157`

</details>

<details><summary><b>A database value is printed as a sentence: 'kcal to lose'</b> — /goals</summary>

**Sees.** Under the Suggested figure: 'kcal to lose'. For other users it renders 'kcal to gain' or 'kcal to maintain'.

**Expected.** 'kcal to lose fat at your pace' / 'kcal to hold your weight'.

**Fix.** Map profile.goal through the same GOAL_LABELS table Profile already uses, and write the caption as a phrase.

`app/goals.tsx:762`

</details>

<details><summary><b>Setup told me every number is editable under Profile</b> — Onboarding (last step)</summary>

**Sees.** 'Nothing is locked in — every number is editable under Profile.' Calories and macros are only editable at /goals, which Profile does not link to; pace is editable nowhere.

**Expected.** The promise to hold. It is the reason for wrong turn #1 a month later.

**Fix.** Either add the Daily targets row to Profile (preferred) or change the copy to name the real place.

`app/onboarding.tsx:670`

</details>

<details><summary><b>The goal I picked at setup is called something else on Profile</b> — Profile ▸ About you</summary>

**Sees.** Setup offered 'Lose fat', 'Stay where I am', 'Build muscle'. Profile offers 'Lose fat', 'Maintain', 'Gain weight'.

**Expected.** The same three words. 'Build muscle' and 'Gain weight' are not obviously the same decision to someone who is deliberately trying to stop cutting without getting fat.

**Fix.** Share one label table between the setup flow and Profile.

`app/(tabs)/profile.tsx:100`

</details>

<details><summary><b>The height error blames "the unit" on a field that only accepts cm, and hides the range</b> — Profile → About you</summary>

**Sees.** "That height looks off. Check the number and the unit." — but the field is labelled "Height (cm)", there is no unit control attached to it, and the accepted range (120–230) is never stated. The age error one line away does state its range.

**Expected.** "Height should be between 120 and 230 cm."

**Fix.** Match the age message: "Height should be between 120 and 230 cm." Drop the reference to units.

`app/(tabs)/profile.tsx:398`

</details>

<details><summary><b>The Dashboard offers the assistant three times and quick logging zero times</b> — Dashboard</summary>

**Sees.** A Sparkles icon button in the header, a full "AI Nutrition Assistant — Ask AI" card in the second slot, and a floating jade Sparkles FAB above the tab bar, all opening /chat. There is no fast path to log food or water.

**Expected.** The most-used action to have the most prominent affordance.

**Fix.** Keep the FAB (available from every tab) and drop the Dashboard card, reclaiming a prime slot. If a FAB is wanted on the Dashboard, make it "+ Log food".

`app/(tabs)/_layout.tsx:140`

</details>
