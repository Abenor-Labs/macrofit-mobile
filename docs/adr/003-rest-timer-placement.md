# ADR-003: Rest timer — pinned overlay vs in-screen vs notification-driven

## Status

PROPOSED

## Context

`<RestTimer>` is rendered as an ordinary list item at `app/(tabs)/workout.tsx:770`, immediately after the session `GlassSurface` and *before* the exercise cards. It starts when a working set is ticked (`workout.tsx:796-804` bumps `restKey`) and renders nothing until then.

The consequence: you tick set 3 of your fourth exercise — several screens down the scroll — and a 120-second countdown starts at the very top of the page, off-screen. To read the remaining rest you scroll up, losing your place in the set grid; to log the next set you scroll back down. The one component that must be visible while lifting is the one that is not.

Second, because the timer renders nothing until triggered, its first appearance pushes every exercise card down ~80pt — while the user's thumb is already travelling toward the next set's weight cell. This repeats after every manual dismiss.

Third, the alert is foreground-only. `RestTimer.tsx:52-63` polls a wall-clock deadline every 250ms and fires `Haptics.notificationAsync` when it crosses zero. Put the phone down, and the haptic fires against a suspended JS thread — the countdown value survives (it is deadline-based, `RestTimer.tsx:46`) but the alert does not. The interval also never stops: it keeps waking the JS thread 4×/second forever, including while the user is on the Diary tab and while the phone is in a pocket.

The design rules explicitly permit glass for "the tab bar, FAB, modals/sheets" — floating chrome — so a pinned glass pill is inside the rules; the current inline list-item placement arguably is not (it is an item in a long list).

**Reversibility cost.** Pinning is ~30 lines inside `workout.tsx` plus a `paddingBottom` adjustment; hours to reverse. Adding `expo-notifications` means a new native dependency, an Android 13+ `POST_NOTIFICATIONS` runtime permission, an iOS permission prompt and a new app-store privacy disclosure — days to add, and a dependency that is politically hard to remove once shipped.

## Options considered

### Option A — Pinned glass overlay above the tab bar

One-line description: absolutely position the timer as a `GlassSurface` pill at `bottom: Math.max(insets.bottom, 8) + 74`, mirroring the FAB geometry at `_layout.tsx:157`, so it floats over the scrolling set grid.

Pros:
- The countdown is visible regardless of scroll position — it answers "how long left?" with zero taps instead of a scroll-up-and-back-down round trip.
- Removes the ~80pt layout shift entirely: the overlay is out of flow, so exercise cards never move under the user's thumb.
- Sits in the thumb zone, so ±30s and dismiss are reachable one-handed with chalky hands.
- Glass floating chrome is explicitly permitted by `docs/MOBILE-DESIGN.md`; it is the same material as the tab bar it sits above, so it reads as chrome rather than content.
- ~30 lines, entirely inside `app/(tabs)/workout.tsx`; no new dependency, no permission, no native module.

Cons:
- Occupies ~64pt of the bottom of the screen while running, which is exactly where the set grid's Done checkbox often is — the ScrollView's `paddingBottom` must grow while active, or the overlay covers the control the timer exists to follow.
- Competes for the bottom-right corner with the FAB (see ADR-001), so one of the two has to move or the pill has to stop short of the FAB's 56pt circle.
- Still foreground-only: the user who pockets the phone gets no alert.
- Another blur surface composited every frame on a screen that already has one (`workout.tsx:719`), which on Android means a second `dimezisBlurView` pass.

Estimated dev cost: **0.5-1 day**.

Concrete failure mode: a user with the keyboard up typing reps has the keypad, the pinned timer and the tab bar stacked at the bottom; the timer is sandwiched and its ±30s controls are unreachable until the keyboard is dismissed.

### Option B — Sticky inside the session card

One-line description: move `<RestTimer>` inside the session `GlassSurface` at `workout.tsx:719-767` and make that surface stick to the top of the scroll.

Pros:
- No new floating layer; reuses the glass card that already exists and is already the session's identity.
- No conflict with the FAB or the tab bar at the bottom of the screen.
- Elapsed time, volume, set count and rest countdown all read as one status block, which is conceptually right — they are all "state of this session".
- No layout shift, because the card is already in the layout at a fixed height.

Cons:
- The session card is tall (name field, three-figure row, Finish button — ~200pt). Sticking all of it consumes a third of the viewport permanently, leaving very little room for the set grid the user is typing into.
- Requires `Screen` (`src/components/Layout.tsx:100`) to expose a sticky-header slot or give up its `ScrollView`, which is a shared-component change touching every screen.
- Puts the destructive "Finish workout" button permanently on screen and permanently under the thumb, which is the opposite of what the one-tap-irreversible-finish finding wants.
- Top of screen is out of thumb reach one-handed, so ±30s becomes a two-hand operation.

Estimated dev cost: **1-2 days** (shared `Screen` change plus regression on 5 screens).

Concrete failure mode: on a 5.4" phone with the keypad up, a sticky 200pt session card plus a 44pt set row plus the keyboard leaves roughly one visible set row — the user cannot see the exercise they are logging.

### Option C — Notification-driven

One-line description: schedule a local notification (with sound) for the rest deadline via `expo-notifications`, cancelling it on dismiss/adjust/next set; keep the in-screen timer wherever it is.

Pros:
- Solves the actual use case the timer was built for: tick the set, put the phone down or switch to a podcast, and get told when rest is over. Today it never buzzes.
- Works with the screen locked, which matters because `expo-keep-awake` is absent and auto-lock (often 60s) is shorter than a 120s rest.
- Wall-clock accurate by construction — the OS owns the schedule, so JS throttling is irrelevant.
- Lets the 250ms interval at `RestTimer.tsx:52` be cleared once the countdown finishes, removing a permanent 4Hz background wake.

Cons:
- New native dependency plus two runtime permission prompts (Android 13+ `POST_NOTIFICATIONS`, iOS alert authorisation), asked at the worst possible moment — mid-workout, on the first set the user ever completes.
- Does nothing for the in-app case: a user who *is* looking at the screen still cannot see the countdown, because it is still off-screen at `workout.tsx:770`.
- Notifications must be cancelled on dismiss, on ±30s, on completing another set, on finishing the workout and on cancelling the workout — five cancellation paths, each a chance to leave a stale buzz that fires 20 minutes after the session ended.
- Adds an app-store privacy/permission disclosure and a settings surface the app does not currently have.

Estimated dev cost: **2-3 days** including permission flow and the five cancellation paths.

Concrete failure mode: the user declines the notification permission prompt on their first set. There is no in-app fallback (the timer is still off-screen) and no path back to the OS settings, so the rest timer is now silently useless forever.

### Option D — Pinned overlay now, notification as a follow-up

One-line description: ship Option A, then layer Option C behind an explicit opt-in once the in-app case is correct.

Pros:
- Fixes the in-app case for zero new dependencies and lands in under a day.
- Defers the permission prompt to a moment the user chooses (a "Notify me when rest ends" toggle on the pinned pill) rather than ambushing them mid-set.
- The pinned pill is the natural host for that toggle, so the second phase has somewhere to live.
- Lets the interval cleanup (`RestTimer.tsx:52-63`) ship with phase one regardless.

Cons:
- Two changes instead of one, so the backgrounded-user case stays broken for however long phase two takes.
- Carries both option sets' cons for the phase-one window (bottom-of-screen contention, plus no background alert).
- Risks phase two never shipping, leaving a toggle-shaped hole.

Estimated dev cost: **0.5-1 day** phase one, **2-3 days** phase two.

Concrete failure mode: phase two is deprioritised and the timer permanently only works while the user stares at it — the exact behaviour that made the feature useless.

## Decision

Pin the rest timer as a `GlassSurface` pill anchored above the tab bar in `app/(tabs)/workout.tsx`, add its height to the ScrollView's bottom padding while active, and treat local notifications as a separately-scoped follow-up gated behind an explicit in-pill opt-in.

## Why

- The countdown is currently off-screen precisely when it is running (Context), and Option A is the only option that fixes visibility without touching the shared `Screen` component or adding a native dependency.
- Glass floating chrome is explicitly permitted for exactly this class of surface (Context), so pinning is inside the design rules while the current in-list placement is arguably outside them.
- Reversibility is hours for a pinned overlay and days-plus-a-permanent-permission-disclosure for notifications (Context), so the cheap fix should land before the expensive one is committed to.

## Consequences

We accept that the pinned pill contends for the bottom of the screen with the FAB (ADR-001) and the keyboard; the pill must sit left of the FAB's 56pt circle, and the ScrollView must gain the pill's height as `paddingBottom` while `remaining > 0`.

We accept that a user who pockets their phone still gets no alert until the follow-up ships, and that the 250ms interval must be cleared at `RestTimer.tsx:52-63` once `left <= 0` regardless of which option lands.

This forecloses making the session card sticky, because two pinned surfaces (a sticky header and a floating pill) on one 5.4" screen leaves no room for the set grid.

**Revisit if** a) the follow-up notification work is deprioritised past one release, in which case the value of the pinned-only timer should be re-measured against just shipping Option C, or b) the FAB is removed from the Workout tab entirely, freeing the bottom-right corner and allowing a wider pill, or c) `expo-keep-awake` is added and the screen no longer locks mid-rest, which weakens Option C's strongest argument.
