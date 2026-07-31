# ADR-004: Whether Chat earns a tab, a FAB, or a header entry

## Status

PROPOSED

## Context

`app/chat.tsx` is registered as a modal at `app/_layout.tsx:82`. It has **five** entry points today:

1. The global glass FAB, `app/(tabs)/_layout.tsx:140-187` (the app's single most prominent control).
2. The Dashboard header `IconButton`, `app/(tabs)/index.tsx:123-130`.
3. A full "AI Nutrition Assistant" promo `Surface`, `app/(tabs)/index.tsx:134-151` — rendered *second* on the dashboard, above `MacroCard`, i.e. an ad for an occasional feature outranks the macro breakdown the screen exists to show.
4. The Diary header `IconButton`, `app/(tabs)/diary.tsx:690-692` (announced as "Open AI Assistant").
5. The Workout header `IconButton`, `app/(tabs)/workout.tsx:1145-1147` (same label).

The FAB (1) and the Dashboard icon (2) are two entry points to the same screen, two lines apart. The a11y labels disagree: the FAB says "Open the nutrition assistant", the two tab headers say "Open AI Assistant". The `Sparkles` glyph means two different destinations on the Dashboard alone — header and promo go to `/chat`, `CoachCard` at `index.tsx:382` goes to `/goals`.

The screen itself has real problems that bear on placement: transcript is component state (`chat.tsx` `messages`), so closing the modal wipes the conversation; failed sends cannot be retried and their error text is fed back to the model as conversation history; the header comment in `_layout.tsx:135-138` records that chat was previously *unreachable* — the FAB was added to fix that, and the four other entries were added on top without removing it.

ADR-001 takes the FAB for logging, which forces this decision now rather than later.

**Reversibility cost.** Moving chat between header slots is line-level (hours). Giving it a tab is a 5→6 slot change with the label-width and padding consequences described in ADR-002 Option D (days, plus permanent bar cost). Removing a tab after users have learned it is worse than never adding it.

## Options considered

### Option A — One header entry, on the nutrition screens only

One-line description: chat lives in the `Screen` `right` slot on Dashboard and Diary; delete the promo card, the Workout header entry and the FAB claim.

Pros:
- Removes 4 of 5 entry points, freeing the Dashboard's second slot (currently 18 lines of promo at `index.tsx:134-151`) so `MacroCard` — the actual content — moves up.
- Frees the `right` slot on Workout for a screen-specific action, and frees the FAB for ADR-001.
- Puts the assistant where its capability actually applies: it logs food, water and weight, none of which are Workout-tab concepts, so the Workout entry was always a false promise.
- One canonical `accessibilityLabel` ("Open the nutrition assistant") instead of two competing strings.
- Costs ~25 deleted lines and zero new components.

Cons:
- Reduces the discoverability of the product's AI story from five doors to two; if the assistant is a growth lever, this is a regression on that axis.
- Header position is out of thumb reach one-handed, on a feature whose pitch is "describe your meal while cooking".
- Does not fix the underlying screen defects (transcript loss, no retry), so the remaining entries lead to a worse experience per visit.
- The `Sparkles` glyph still needs disambiguating from `CoachCard`'s use at `index.tsx:382`.

Estimated dev cost: **0.5 day**.

Concrete failure mode: a user who only ever uses the Workout tab never discovers the assistant at all, and the feature's usage drops enough that the AI story looks dead in analytics regardless of its quality.

### Option B — Keep the FAB for chat; find another home for logging

One-line description: status quo for chat; ADR-001 resolves to Option B or C instead.

Pros:
- Maximum reach for the differentiating feature: available from every tab, in the thumb zone, one tap.
- Zero change; no migration risk, no re-learning.
- The FAB is the only affordance that survives every scroll position, which suits a feature whose value is "ask any time".
- Keeps the entry that was deliberately added to fix chat being unreachable (`_layout.tsx:135-138`).

Cons:
- Gives the app's single most prominent, always-reachable control to a feature used occasionally, while the 3-6×/day action has none — the exact inversion the user reported.
- The FAB covers the bottom-right of the last content row on every scrollable screen ("Cancel workout" at `workout.tsx:860-865`, "Sign out" at `profile.tsx:756-761`), so a tap intended for those opens chat instead — a *destructive* mis-target on the Workout tab.
- Leaves five entry points to one screen unless separately pruned.
- Fires `Haptics.impactAsync` on a plain navigation (`_layout.tsx:150`), which the design rules forbid and which devalues the haptic that confirms a logged set.

Estimated dev cost: **0 days** (but pushes ADR-001 to its 2-3 day option).

Concrete failure mode: the user reaches for "Cancel workout" at the bottom of the Workout tab, lands on the jade circle covering its right edge, and the chat modal slides up over a live session.

### Option C — Give Chat a tab slot

One-line description: replace one of the five tabs (realistically Diary, given its ~70% overlap with Dashboard) with Assistant.

Pros:
- Permanent, thumb-reachable, deep-linkable, and it keeps its own state — which incidentally fixes the transcript-loss problem for free, since a tab is not dismissed.
- Signals the AI as a first-class part of the product rather than an accessory.
- Frees the FAB for logging without any per-tab context logic (ADR-001 Option A becomes simpler).
- No modal presentation, so no `KeyboardAvoidingView` interaction with a sheet.

Cons:
- Costs a tab slot in a full bar, and the only plausible donor (Diary) owns unique content: per-meal detail, `SavedMeals` (`diary.tsx:571-662`), the date navigator, and per-entry serving edits.
- Chat is text-only despite the Dashboard promising voice (`index.tsx:141`), so a permanent tab advertises a capability the product does not have.
- Frequency mismatch: a tab slot is a claim about daily use, and chat is not a daily surface for most users.
- A tab makes the screen's current defects permanent fixtures — the failed-message-fed-back-as-history bug at `chat.tsx:169` is much more visible on a persistent surface.

Estimated dev cost: **2-3 days** plus the permanent bar cost.

Concrete failure mode: Diary is removed to make room; a user who wants to fix yesterday's lunch has nowhere to go, because the Dashboard `MealsCard` only shows today and only shows four of six meal types (`index.tsx:55`).

## Decision

Chat keeps a single header `IconButton` on the Dashboard and Diary only; the promo card at `index.tsx:134-151`, the Workout header entry, and the FAB claim are removed, and the FAB is repointed at logging per ADR-001.

## Why

- Five entry points to one occasional screen, versus zero global entry points for the 3-6×/day action (Context), is the single clearest instance of the reported "features are not in the right places" problem, and only Options A and C reallocate the FAB.
- The assistant's actual capability is logging food, water and weight (Context) — none of which are Workout-tab concepts — so the Workout entry was a promise the destination cannot keep, and pruning it costs nothing.
- Reversibility is hours for a header move and days-plus-permanent-bar-cost for a tab (Context); with chat's transcript and retry defects still unfixed, promoting it to a permanent surface would make those defects more visible, not less.

## Consequences

We accept that the assistant's reach drops from five entry points to two and that it leaves the thumb zone, which will show as a usage drop that must not be misread as a quality signal.

We accept that `CoachCard` at `index.tsx:382` must stop using `Sparkles` (use `Target`) so one glyph means one destination, and that the two competing a11y labels collapse to "Open the nutrition assistant".

This forecloses the assistant-as-tab option in the near term; re-adding it later means taking a slot back from Diary or Progress, both of which own unique content.

**Revisit if** a) chat gains dictation and actually delivers the "log by speaking" promise at `index.tsx:141`, which would make thumb-zone placement matter again, or b) transcript persistence and retry land and per-session chat usage exceeds per-session Diary usage, or c) the assistant becomes the primary logging path (i.e. it wins the ADR-001 fork by outperforming `/food-search` on taps-to-log).
