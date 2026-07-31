# Reported issues — design

**Date:** 2026-07-31
**Branch:** `fix/health-connect-crash-and-workout-logging`
**Scope:** ten user-reported defects, grouped into seven tracks.
**Revision 2** — incorporates the impeccable critique
(`.impeccable/critique/2026-07-31T04-08-34Z__rpowers-specs-2026-07-31-reported-issues-design-md.md`,
27/40) and four decisions taken after it.

### Decisions taken after review

1. **Weight logging goes in the FAB**, not a new dashboard card. The dashboard already
   scores 28/40 with an open P1 for duplication; a seventh card makes it worse.
2. **~120 bundled Indian dishes ship alongside Open Food Facts.** OFF is a packaged-goods
   catalogue and returns uncooked dal for "dal", which fails the exact user who reported
   the issue.
3. **USDA and Open Food Facts merge into one "More results" section.** Five sections
   breaches the cognitive-load ceiling and duplicates every loading, error and empty state.
4. **No code before repro** for the two defects with unconfirmed root causes (onboarding
   not shown, keyboard glitch).

---

## 0. Constraints that shape everything below

### 0.1 `src/core/` is generated

`scripts/sync-core.mjs` deletes and re-copies `src/core/` from `D:\Macro-tracker\src` on
every `npm start`, `npm run typecheck` and `npm run export`. Three of the nine issues live
in files under `src/core/`. Editing them here is silently reverted on the next run.

**Decision:** shared-logic changes are made in `D:\Macro-tracker\src`, then pulled across
with `npm run sync:core`. One source of truth; the web app gets the same fixes. The web
repo is on branch `claude/food-macro-tracker-app-NmYBH` and is clean apart from two
untracked binaries.

Files touched in the web repo:

| Web repo path | Why |
| --- | --- |
| `src/store/appState.ts` | unit defaults, `onboardedAt` inference |
| `src/utils/usdaApi.ts` | `import.meta` is Vite-only and breaks on native |
| `src/utils/openFoodFacts.ts` (new) | Indian food coverage |
| `src/utils/foodApiConfig.ts` (new) | per-platform API key injection |

### 0.2 Things only the user can do

1. **Supabase dashboard → Authentication → URL Configuration → Redirect URLs:**
   add `macrofit://auth/callback`. Without it Supabase rejects the redirect and the
   confirmation link keeps landing on the website. This cannot be done from code.
2. **Native rebuild** (`npm run android`) after Track B, D and the plugin changes — they
   alter `AndroidManifest.xml` and add a native module.

### 0.3 Google Fit, stated honestly

Google's Fit REST/Android APIs were retired on 2026-06-30 and the Fit app is being wound
down in favour of Health Connect. "Show up in Google Fit" is therefore delivered by
writing to Health Connect, which is what Fit itself now reads from. If the user has not
enabled *Fit → Settings → Sync Fit with Health Connect*, nothing this app does can make
the number appear in Fit. That caveat belongs in the UI copy, not in a promise.

---

## Track A — Shared core (web repo → sync)

### A1. Default units: kg and ft/in

`DEFAULT_PROFILE` currently reads `weightUnit: 'lbs'`, `heightUnit: 'cm'`. New default:
`weightUnit: 'kg'`, `heightUnit: 'ft'` — the combination Indian users actually use.

Only *new* profiles are affected. `zustand/persist` merges, so an existing user's stored
`weightUnit` survives, and hydrated server data overwrites the default anyway. No
migration is needed and none will be written: silently rewriting a US user's stored `lbs`
to `kg` would change every number on their screen without asking.

Two follow-on defects the default exposes:

- **`app/onboarding.tsx:319-324`** — `pullFromPhone()` hard-sets `setHeightUnit('cm')` and
  `setWeightUnit('kg')` after a Health Connect read. With `ft` as the default this
  silently flips the user off the unit they were shown. Fix: keep the selected unit and
  convert the imported value into it.
- **`app/(tabs)/profile.tsx:714-723`** — the height field is hardcoded `Height (cm)` and
  `commitBasics()` parses it as centimetres regardless of `profile.heightUnit`. A user on
  `ft` sees a cm box under a ft/in preference. Fix: render feet + inches inputs when
  `heightUnit === 'ft'`, converting through the existing `cmFromFeetInches` /
  `feetInchesFromCm` helpers in `@core/utils/onboarding`.

### A2. USDA API key is read through a Vite-only global

`src/core/utils/usdaApi.ts:5`:

```ts
const API_KEY = (import.meta as any).env?.VITE_USDA_API_KEY ?? 'DEMO_KEY'
```

`import.meta` does not exist under Metro/Hermes. On mobile this always resolves to
`DEMO_KEY` — shared across every caller on the same IP, capped at 30 req/min and 1000
req/day, so `EXPO_PUBLIC_USDA_API_KEY` has never been used and searches intermittently
fail as "Could not reach USDA FoodData Central".

**Fix:** a tiny shared config module the platform layer writes once at startup.

```ts
// src/utils/foodApiConfig.ts  (web repo)
let usdaApiKey = 'DEMO_KEY'
let userAgent = 'MacroFit'
export const configureFoodApis = (next: { usdaApiKey?: string; userAgent?: string }) => { ... }
export const getUsdaApiKey = () => usdaApiKey
export const getUserAgent = () => userAgent
```

Web calls it with `import.meta.env.VITE_USDA_API_KEY`; mobile calls it from
`src/lib/env.ts`'s `USDA_API_KEY` in `app/_layout.tsx`. No platform global is read from
inside `src/core/` ever again — which is the rule `sync-core.mjs` already documents and
this file was quietly breaking.

### A3. Indian food — bundled dishes plus Open Food Facts

Two halves, because they answer different questions. Open Food Facts is a **packaged-goods**
catalogue: it knows Amul butter and Britannia biscuits, and it returns bags of uncooked dal
for "dal". A daily Indian food log is mostly **home-cooked**, which only a composition table
covers.

#### A3a. Bundled dish database

Roughly 120 entries appended to `FOOD_DATABASE` in the web repo's `src/data/foodDatabase.ts`,
id-prefixed `in###` so they never collide with the existing `f###`/`v###`/`g###` series.

Scope is the high-frequency daily set, not a cookbook:

- **Breads:** roti/chapati, phulka, paratha (plain, aloo), naan, bhatura, puri, thepla
- **Rice:** plain cooked rice, jeera rice, curd rice, lemon rice, pulao, veg biryani,
  chicken biryani
- **Dals and legumes:** toor, moong, chana, masoor, rajma, chole, sambar, dal makhani
- **South Indian:** idli, plain dosa, masala dosa, uttapam, upma, pongal, medu vada,
  coconut chutney, rasam
- **Curries and sides:** paneer butter masala, palak paneer, shahi paneer, aloo gobi,
  bhindi masala, mixed veg curry, egg curry, chicken curry, butter chicken, fish curry,
  keema
- **Snacks and street:** samosa, pakora, poha, dhokla, vada pav, pav bhaji, bhel puri,
  chaat, momos
- **Dairy and drinks:** curd/dahi, buttermilk, lassi (sweet, salted), masala chai,
  filter coffee, paneer (raw), ghee
- **Sweets:** gulab jamun, rasgulla, jalebi, kheer, halwa, laddu, barfi

Serving sizes are stated in the units people actually use — "1 roti (40 g)",
"1 katori (150 g)", "1 idli (35 g)" — because a gram-only serving forces exactly the mental
arithmetic the app exists to remove. Values follow IFCT 2017 (Indian Food Composition
Tables, NIN Hyderabad) where it covers the item, and standard recipe composition where it
does not.

**Accuracy caveat, stated in the data not just here:** a home-cooked curry varies by 30%+
with the cook's oil hand. These are reference values, not measurements. Entries carry
`brand: undefined` and rely on the existing serving-size editor for adjustment.

New `FoodCategory` values are **not** introduced — the existing enum
(`Grains & Cereals`, `Legumes`, `Dairy`, …) already covers every dish above, and adding to
that union would ripple through `guessCategory`, the diary filters and the web app.

#### A3b. Open Food Facts

New `src/utils/openFoodFacts.ts` in the web repo.

- Endpoint: `https://in.openfoodfacts.org/cgi/search.pl` — the India-scoped catalogue,
  which is where Amul, Britannia, Haldiram's, Maggi, MTR and the rest live. Falls back to
  `https://world.openfoodfacts.org` when the India query returns nothing.
- Params: `search_terms`, `search_simple=1`, `action=process`, `json=1`, `page_size`,
  and an explicit `fields=` list so the response stays small.
- **A `User-Agent` header is mandatory** — Open Food Facts blocks unidentified clients.
  Format: `MacroFit/<version> (contact)`. Supplied through `getUserAgent()`.
- Nutriments are per 100 g, so the mapped `Food` uses `servingSize: 100, servingUnit: 'g'`,
  matching how USDA results are already mapped.
- Rows with no `energy-kcal_100g` are dropped, same as the USDA mapper.
- Timeout: 6 s via `AbortController`. A slow third source must not hold the list.

#### A3c. One merged remote section

`app/food-search.tsx` currently lists four sections and would list five. It drops to four
by **merging both remote sources into one**:

```
Recent
Your foods
Matches            <- local preset DB, now including the Indian dishes
More results       <- USDA + Open Food Facts, merged and ranked
```

- One `remote` state replaces `usda`, holding both sources' results plus a per-source
  status. One spinner, one error row, one empty row.
- The error row degrades per source: both failed reads "Could not reach the online food
  databases"; one failed is not surfaced at all, because the user got results.
- Each row carries a small provenance label (`USDA` / `Open Food Facts`) so the source is
  discoverable without being a heading.
- Ranking: exact name match first, then whichever source answered, then shorter names —
  a query for "dal" should not open with "Dal, dehydrated, industrial".
- The existing `requestRef` guard is kept and applied per source, so a slow reply for
  "chi" cannot overwrite a fast one for "chicken".

This deletes the `usda-loading` / `usda-error` / `usda-empty` row kinds in favour of
`remote-loading` / `remote-error` / `remote-empty`.

### A4. Onboarding not shown — hypothesis, guard, escape hatch

Routing itself is correct: `app/index.tsx:32` and `app/_layout.tsx:309` both send
`onboardedAt === null` to `/onboarding`, and `RootNavigator` stays mounted so a later
sign-in is caught.

The one place `onboardedAt` is set without the user finishing setup is
`src/core/store/appState.ts:623`:

```ts
if (state.onboardedAt === null && (state.weightLog.length > 0 || Object.keys(state.diary).length > 0)) {
  state.onboardedAt = Date.now()
}
```

Any server row with a single weigh-in or a single diary day marks setup complete. A
tester who signed up on the **website** first — which writes a row — then installed the
app would skip onboarding entirely. That matches "I heard onboarding isn't shown".

This is a hypothesis, not a confirmed diagnosis. **No code ships until it is reproduced.**

**Repro, step 0, before anything else:**

1. Fresh emulator or a device with the app uninstalled.
2. Create the account on the **website** first, so a `user_data` row exists with a weigh-in.
3. Install the app, sign in with that account.
4. Observe whether `/onboarding` is reached.

If setup is skipped, the hypothesis holds. If setup is shown, the cause is elsewhere and
change 3 below (the provenance log) becomes the whole of the first commit.

Then three changes, in order of confidence:

1. **Tighten the inference.** Require evidence that setup actually happened: the profile
   must differ from `DEFAULT_PROFILE` on at least one of `age`/`heightCm`/`gender`, *or*
   there must be more than one weigh-in / diary day. A single default-profile weigh-in is
   not proof of a completed setup.
2. **Escape hatch.** A `Re-run setup` action in Profile → App. A mis-inference currently
   has no way out; the user is stuck with a 30-year-old 175 cm profile they never entered.
3. **Instrumentation.** A `__DEV__`-only log recording which branch set `onboardedAt`
   (flow / inference / hydration), so the next report is diagnosable instead of guessed at.

---

## Track B — Health Connect

### B1. Permissions are checked by count, not by identity

`src/lib/healthConnect.ts:74` and `:86`:

```ts
return Array.isArray(granted) && granted.length > 0
```

Grant Weight and refuse Steps and the app reports "Connected" while `readSteps` returns
`[]` forever. This is the direct cause of "target steps calculated but completed is 0",
and of "check the Health Connect permission as well".

**Fix:** compare the granted set against the requested set, per permission, and return a
structured result rather than a boolean:

```ts
export interface HealthGrants {
  readSteps: boolean
  readWeight: boolean
  readHeight: boolean
  writeWeight: boolean
  readHistory: boolean
}
```

`useHealthSync` exposes it; `StepsCard` and Profile render what is actually missing and
offer `openHealthConnectSettings()` (already exported by the library, currently unused)
rather than re-requesting a permission Android will not re-prompt for.

### B2. Steps are read as raw records instead of aggregated

`readSteps` calls `readRecords('Steps', …)` and sums by day. Three problems:

- **Double counting.** Two sources writing the same walk (phone sensor + a watch) both
  return records; summing them inflates the day. Health Connect's `aggregateRecord` with
  `COUNT_TOTAL` de-duplicates by priority, which is exactly what Fit and "Only What's
  Needed" do.
- **Pagination.** `readRecords` pages at 1000 records and the code never follows
  `pageToken`. A phone writing a record per minute exceeds that inside a day.
- **`aggregateRecord`, `aggregateGroupByDuration` and `aggregateGroupByPeriod` are all
  already exported by `react-native-health-connect@3.5.3`** (verified in
  `lib/typescript/index.d.ts`) and none of them are used.

**Fix:**

- `readTodaySteps()` → `aggregateRecord({ recordType: 'Steps', timeRangeFilter })`,
  reading `COUNT_TOTAL`.
- `readSteps(days)` → `aggregateGroupByPeriod({ recordType: 'Steps', timeRangeSlicer: { period: { days: 1 } }, … })`.
- Keep the existing `readRecords` implementation as a fallback when aggregation throws,
  so a provider that does not support it degrades rather than showing zero.

### B3. Steps never refresh

`useHealthSync` probes once in a mount effect. `StepsCard` lives on the dashboard tab,
which stays mounted for the life of the process, so after the first read the number is
frozen until the user taps Refresh.

**Fix:** refresh on `AppState` → `active` and on tab focus (`useFocusEffect`), throttled
to one read per 60 s so tab-flicking does not hammer the provider.

### B4. Three independent copies of the hook

`useHealthSync()` is called separately by `StepsCard`, `app/(tabs)/profile.tsx` and
`app/onboarding.tsx`. Each instance runs its own availability probe, its own permission
check and holds its own state, so connecting from Profile leaves the dashboard card
showing "Not connected" until it happens to re-probe.

**Fix:** hoist the state into a `HealthProvider` mounted in `app/_layout.tsx`;
`useHealthSync()` becomes a context read with the same public shape, so no call site
changes.

### B5. History beyond 30 days

Android 14+ restricts reads to the last 30 days unless
`android.permission.health.READ_HEALTH_DATA_HISTORY` is granted.
`readWeightHistory(profile, 365)` therefore silently returns at most a month, and the
onboarding copy promises "any weigh-ins already recorded".

**Fix:** declare and request the history permission; when it is refused, say "the last 30
days" instead of promising a year.

### B6. Write-back: weight → Health Connect

`src/lib/healthPermissions.js` models read access only —
`healthRuntimePermissions()` hardcodes `accessType: 'read'`. The manifest consequently
carries no `WRITE_*` permission and `insertRecords` is never called, which is why a weight
logged in MacroFit never reaches Health Connect or Fit.

**Fix:** restructure the single list into `{ recordType, access: 'read' | 'readwrite' }`,
so both `healthManifestPermissions()` and `healthRuntimePermissions()` keep deriving from
one place — the invariant that file exists to protect. Weight becomes `readwrite`; Steps
and Height stay `read`.

New `writeWeightKg(kg, date)` in `src/lib/healthConnect.ts`:

```ts
await hc.insertRecords([{
  recordType: 'Weight',
  time: atNoonLocal(date).toISOString(),
  weight: { unit: 'kilograms', value: kg },
  metadata: {
    clientRecordId: `macrofit-weight-${date}`,
    clientRecordVersion: Date.now(),
  },
}])
```

**`clientRecordId` is not optional.** Without it every call appends a new row: edit today's
weight three times and Health Connect holds three Weight records for the same instant, Fit
shows an arbitrary one, and `readWeightHistory` re-imports the mess on the next sync. A
matching `clientRecordId` makes Health Connect treat the insert as an **upsert**, and
`clientRecordVersion` decides which write wins. One record per calendar day, forever.

`atNoonLocal(date)` rather than "now": the record's instant must be stable across edits, and
midnight would land a weigh-in on the previous day in some timezones.

**Deletion follows.** `removeWeightEntry` currently only mutates the store, so a deleted
weigh-in survives in Health Connect and in Fit. The weight-log UI calls
`deleteWeightKg(date)` → `deleteRecordsByUuids(recordType, [], ['macrofit-weight-<date>'])`,
which is exactly what the `clientRecordIdsList` parameter exists for.

**Loop guard:** entries imported *from* Health Connect are tagged
`notes: 'Imported from Health Connect'` (`healthConnect.ts:251`). Write-back skips those.
Only a weigh-in the user typed is written out.

**Feedback.** The write is fire-and-forget from the weigh-in UI, never from the store —
`src/core/` must not import a native API, and a failed write must not fail the local log.
But fire-and-forget must not mean silent: the confirmation snackbar states the outcome
("Logged 72.4 kg · saved to Health Connect" / "Logged 72.4 kg · couldn't reach Health
Connect"), so the user is never left guessing whether the sync they asked for happened.

---

## Track C — Signup confirmation link opens the app

Four gaps, all in the mobile layer:

1. **`src/lib/supabase.ts:23`** — no `flowType`. supabase-js defaults to `implicit`, which
   returns tokens in a URL *fragment*; native deep links commonly drop fragments.
   Set `flowType: 'pkce'` so the redirect carries `?code=` in the query.
2. **`src/lib/AuthProvider.tsx:759`** — `supabase.auth.signUp({ email, password })` passes
   no `options.emailRedirectTo`, so GoTrue falls back to the project's Site URL, which is
   the website. Pass `emailRedirectTo: Linking.createURL('/auth/callback')` →
   `macrofit://auth/callback`. Same for `resendConfirmation` (`:791`, `options.emailRedirectTo`).
3. **No deep-link handler.** Add one in `AuthProvider`: `Linking.getInitialURL()` for a
   cold start plus a `Linking.addEventListener('url', …)` subscription, parsing `code` and
   calling `supabase.auth.exchangeCodeForSession(code)`.

   Failures get **their own state and their own copy**, not `sessionEndedReason`. That
   channel's only message is "Your session expired, so you were signed out. Everything you
   logged is still on this device" — shown after a stale confirmation link it is simply
   false, and it sends the user hunting for data loss that did not happen. New
   `confirmationError`, with messages that name the real cause:

   | GoTrue `error_code` | Copy |
   | --- | --- |
   | `otp_expired` | "That confirmation link has expired. Send yourself a new one." |
   | `access_denied` | "That link has already been used. Try signing in." |
   | anything else | "We couldn't confirm your email from that link. Try signing in, or send a new link." |

   Every branch leaves the "Resend confirmation email" button on screen, so the error is
   never a dead end.
4. **`app/auth/callback.tsx`** — a branded "Confirming your email…" screen so the link has
   somewhere to land while the exchange runs, registered in the Stack with
   `animation: 'fade'`.

`app.json` already declares `"scheme": "macrofit"` and the generated manifest already has
the `VIEW` / `BROWSABLE` intent-filter for it, so no native config change is needed.

**Not doing:** Android App Links (`https://` → app). That needs an `assetlinks.json`
served from the website's domain and a verified digital asset link. Worth doing later; the
custom scheme fixes the reported problem now.

---

## Track D — Keyboard

Confirmed on food search (serving amount), onboarding (height/weight), and login. Fixing
systemically rather than per screen.

**Repro gate, before the native dependency lands.** The root-cause reading below assumes
edge-to-edge is active on the reporting device. That is an assumption, and adding a native
module on an assumption is the expensive kind of mistake. Record first: Android version,
and whether the window actually resizes when the IME opens. Steps 3 and 4 below (`Field`
and `app.json`) are safe regardless and ship first; steps 1 and 2 wait on the reading.

**Root cause.** React Native 0.86 on Android 15+ is edge-to-edge by default. Under
edge-to-edge, `android:windowSoftInputMode="adjustResize"` — which the generated manifest
does set — no longer resizes the window; the app is expected to consume the IME inset
itself. Meanwhile every screen uses:

```tsx
<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
```

`behavior={undefined}` on Android is a no-op. So on Android nothing at all avoids the
keyboard, and the visible symptoms are the field being covered and the layout jumping as
the ScrollView re-measures.

**Fix:**

1. Add `react-native-keyboard-controller` and mount `<KeyboardProvider>` in
   `app/_layout.tsx` above `AuthProvider`. It handles the edge-to-edge IME inset on both
   platforms and gives synchronised, frame-accurate avoidance instead of the two-phase
   jump `KeyboardAvoidingView` produces.
2. Replace the three `KeyboardAvoidingView` uses with `KeyboardAwareScrollView`
   (`app/login.tsx:117`, `app/onboarding.tsx:413`) and wrap the food-search serving step's
   `ScrollView` (`app/food-search.tsx:535`).
3. **`src/components/Layout.tsx:177`** — `fontVariant: ['tabular-nums']` is applied to a
   `TextInput`. `fontVariant` is not supported on Android `TextInput`; combined with the
   Fraunces display face and `textAlign: 'center'` it produces the cursor and re-measure
   glitches on exactly the numeric fields reported. Drop it from `Field`; keep it on
   `StatValue`, which is a `Text` and where it is both valid and needed.
4. Add `"softwareKeyboardLayoutMode": "pan"` under `expo.android` in `app.json` as the
   belt-and-braces fallback for devices where the inset API misbehaves.

Requires a native rebuild. Verified: `react-native-keyboard-controller` supports the New
Architecture, which this app has enabled — this is a compatibility item to confirm against
the installed Expo SDK 57 before committing to it, and the `app.json` + `Field` fixes stand
on their own if it does not fit.

---

## Track E — Weight logging: findable, and synced

### E1. It exists; nobody can find it

The weigh-in field lives in `WeightTargetCard`, which renders on Progress → Weight and in
Profile. The dashboard shows only `WeightVerdict`, and
**`src/components/WeightTarget.tsx:120` returns `null` when no goal weight is set** — so a
user who skipped the optional goal-weight question in onboarding sees *nothing* about
weight on the home screen. That is the whole of "where is the weight logging in the app??".

**Fix: the FAB, not a new card.**

`app/(tabs)/_layout.tsx:375` already has a floating `Plus` button that expands to log food
and water (`fabBottom + 68` positions a second action above it). Weight becomes the third
action in that menu.

```
        ┌──────────┐
        │ ⚖ Weight │   <- new
        │ 💧 Water │
        │ 🍽 Food  │
        └──────────┘
             ⊕
```

Why this and not a card:

- The dashboard gains **nothing**. Its open P1s — calories printed twice, the verdict
  buried seventh — are untouched rather than worsened.
- Logging is already what the FAB means. Food, water and weight are the three things this
  app records; splitting one of them onto a card would be the inconsistency.
- It is reachable from every tab, not just the dashboard, which is strictly better than
  the card would have been.

The cost, stated: weight is one tap deeper than a card would make it, and it is behind a
menu rather than in sight. Mitigated by the two changes below.

**`WeightVerdict` still stops returning null.** With no goal weight it renders a single
line — "No weigh-in yet today · Last 72.9 kg, 3 days ago" — that opens the weight tab.
This is the discoverability fix; it is one line, not a card, so the dashboard's card count
does not move.

**Undo.** Logging weight raises a snackbar with an Undo action, matching what the previous
dashboard critique asked for on FAB water and did not get. `SnackbarProvider` is already
mounted in `app/_layout.tsx:390`. Undo reverses the store write **and** the Health Connect
record, via `deleteWeightKg`.

**ADR.** `docs/adr/001-primary-log-affordance.md` governs what the FAB is for. Adding a
third action is within its spirit but changes its content, so it gets an amendment section
rather than a silent edit.

**Past dates.** Both the FAB sheet and the weigh-in field default to today but accept a
date, because "weighed this morning, logging it tonight" currently forces the user to log
it as today and corrupt the trend the feature exists to measure. The existing
`DateNavigator` component is reused.

### E2. Two-way sync

Read direction already works (import). Write direction is Track B6. Once wired:

- Logging a weight in MacroFit inserts a `Weight` record into Health Connect.
- Records imported from Health Connect are never written back.
- The UI states the real dependency: "Saved to Health Connect. Google Fit shows it if Fit
  is set to sync with Health Connect." Not "synced to Google Fit", which we cannot promise.

---

## Track F — Dark theme

### F1. What is actually wrong

Measured from `src/theme/tokens.ts:134`:

| Token | Value | Problem |
| --- | --- | --- |
| `canvas` → `surface` → `surfaceRaised` → `border` | `#0C0A09` → `#1C1917` → `#221F1D` → `#292524` | 4–6% relative-luminance steps. Elevation is invisible; cards do not read as cards. |
| `bloom.top` / `bottom` | jade at 0.22 / 0.20 alpha | Over a *warm* near-black (hue ≈ 30°) a jade wash mixes to olive. This is the "colours I didn't like". |
| `brand` | `jade[600]` `#0C8261` | 2.7:1 against `surface`. Used as a **button fill** in dark mode, while `brandText` is the bright `jade[400]`. A dark fill and a bright link for the same brand in one screen. |
| `status.warning` / `critical` | `#F59E0B` / `#F87171` | Tailwind defaults sitting next to a hand-validated macro palette. |
| `macro.fiber` | `#9851B2` | ≈ 3.5:1 on `surface` — under the 4.5:1 floor the palette claims to hold. |

### F2. What changes

- A re-derived neutral near-black elevation ladder with real 8–12% steps, so
  `canvas < surface < surfaceRaised` are distinguishable without a border doing the work.
- `brand` moves to the light tonal step (`jade[400]`/`jade[500]`) with a dark `brandOn`,
  matching what `brandText` already does and what both Material 3 and HIG specify for dark
  containers.
- Bloom alpha cut to ≈ 0.10 and hue-matched to the new ladder, so the wash reads as depth
  rather than as a colour cast.
- Macro and status hues re-run through the contrast validator described in the README, for
  all pairs in dark mode: lightness band, chroma floor, CVD separation, normal-vision
  separation, and contrast against the new surface. Any hex that fails is adjusted, not
  eyeballed.

### F3. Tokens are not enough — the consumers matter

`tokens.ts` only declares the values. Three other files decide what the user sees, and
retuning tokens alone will not land the change:

- **`src/components/Backdrop.tsx`** — the three `LinearGradient` circles that actually paint
  `bloom.top`, `.counterweight` and `.bottom`. At 420px across and 0.22 alpha they cover
  most of the viewport, which is why the cast reads as a cast rather than as depth.
- **`src/components/Glass.tsx`** — `glass.overlay` at `rgba(28,25,23,0.55)` sits over
  `canvas` `#0C0A09`, so an in-content card is barely 3% lighter than the page behind it.
  This is the single largest contributor to "not properly dark": the cards are not
  separating, so the whole screen reads as one flat brown field. The overlay has to move
  with the new ladder, not stay pinned to the old `stone[900]`.
- **`expo-system-ui`** — already a dependency and unused. The native root background should
  be set to the new `canvas` so the cold-start frame does not flash a different dark.

**Light theme is not touched.** Only `darkTheme` changes; `workoutTheme` is already a
separate cool-grey ladder and stays as it is.

Verification: before/after screenshots of dashboard, diary, goals and progress in dark
mode, scored with the same impeccable critique already in `.impeccable/critique/`. The
Goals screenshot the user supplied is the "before" for this track.

---

## Track G — `/api/recommend` returns 504

Reported with a screenshot:

```
/api/recommend failed (HTTP 504): An error occurred with your deployment
FUNCTION_INVOCATION_TIMEOUT bom1::kqj4c-1785470216889-8eadf8fda7a4
```

Three separate defects in one screen.

### G1. The retry guarantees the timeout it was meant to survive

`api/recommend.ts` (web repo) declares `export const config = { runtime: 'edge' }` and
`MODEL_TIMEOUT_MS = 20000`, with the comment *"Give up on the model well inside Vercel's
edge limit so the fallback still ships."* The intent is right and the whole handler is
wrapped in a `try/catch` that serves `buildLocalRecommendation` on any failure.

Line 465 breaks it:

```ts
{ timeout: MODEL_TIMEOUT_MS, maxRetries: 1 }
```

**The OpenAI SDK's `timeout` is per attempt, not per call.** With one retry the worst case
is 20s + backoff + 20s ≈ 41s. Vercel's edge runtime kills the invocation at 25s. So
whenever the first attempt times out — precisely the case the local fallback exists for —
the platform terminates the function before `catch` can run, and the client gets a 504
instead of a plan.

The model is `Qwen/Qwen3-235B-A22B-Instruct-2507` generating up to `max_tokens: 800`. A
first-attempt timeout is not an edge case for a 235B model; it is a normal Tuesday.

**Fix:**

- `maxRetries: 0`. A retry inside a 25s budget was never affordable.
- `MODEL_TIMEOUT_MS` to 12000, leaving room for prompt assembly, JSON parsing, validation
  and the response write.
- An outer `AbortSignal.timeout(18000)` on the handler so no future edit can overrun the
  platform limit again.
- The comment gets the arithmetic written into it, so the next person changing `maxRetries`
  sees why they cannot.

Region note: `bom1` is Mumbai and Nebius is EU-hosted, which adds cross-region latency to
every round trip. Worth pinning the function region nearer the provider, but it is a
contributing factor, not the cause. The retry is the cause.

### G2. A Vercel trace ID is shown to the user

`src/lib/api.ts:226` `describeFailure` pastes the response body straight into a
user-visible string. For a platform-level 504 that body is Vercel's own error text, so the
user reads `FUNCTION_INVOCATION_TIMEOUT bom1::kqj4c-1785470216889-8eadf8fda7a4`.

**Fix:** map status classes to human copy before falling back to the body excerpt.
`502` / `503` / `504` → "The coach is taking too long to answer right now." `429` → "Too
many requests just now. Try again in a minute." `5xx` otherwise → "The coach service hit an
error." The raw detail is kept, but behind `__DEV__` and in the thrown error's `cause`,
where a developer can still reach it and a user is not made to read it.

### G3. The same sentence is printed twice, under the wrong icon

In `app/goals.tsx`, `rec.rationale` renders at line 552 — and for a local plan that
rationale already reads *"…calculated on your device from your own numbers, without AI, so
it is a plain formula rather than a coached judgement."* Line 556 then renders a Notice
saying *"The plan below was calculated on your device instead, so it is a plain formula
rather than a coached judgement."* Same claim, same screenful, twice. This is the exact
duplication anti-pattern already logged as P1 against the dashboard.

The icon is `WifiOff` and the copy ends *"Press Refresh once you are back online."* The user
is online. The request reached Mumbai and came back. Telling someone with full signal that
they are offline sends them to reboot their router over a server-side timeout.

**Fix:**

- The Notice states only what the rationale does not: that the coach was unreachable and
  Refresh will retry. It never re-explains what a local plan is; the rationale owns that.
- Icon and copy branch on cause. Server error → `ServerCrash`, "The coach service didn't
  answer in time." Genuine network failure → `WifiOff`, "You appear to be offline."
  Distinguished by whether an HTTP status came back at all.

---

## Documentation debt this uncovers

Three files currently state things that are not true, and each belongs in the same commit
as its fix:

- **`README.md`** documents `EXPO_PUBLIC_USDA_API_KEY` as a working variable. A2 shows it
  has never been read on mobile.
- **`.env.example`** says the same, at length.
- **`README.md`** states `android/` and `src/core` are gitignored. `android/` is;
  `src/core` is **not** (`git ls-files src/core` returns tracked files). That is fortunate
  rather than unfortunate — it means a bad `npm run sync:core` shows up in `git diff`
  instead of vanishing — but the README should say what is true, and Track A depends on
  that safety net.

## Build order

Dependency-ordered, each step independently shippable. Steps 0 and 1 need no rebuild.

0. **Repro gate** — reproduce onboarding-not-shown (A4 step 0) and record the keyboard
   device readings (Track D). No code.
1. **G** — `/api/recommend` 504. Smallest diff, highest visible impact, and it is broken in
   production right now. `maxRetries: 0` in the web repo; error mapping and the duplicate
   notice in the app.
2. **A2 + A3** — food API config, Indian dish data, Open Food Facts, merged "More results".
   Pure additions, no rebuild.
3. **A1 + A4** — unit defaults, the ft/in field in Profile, the `pullFromPhone` unit bug,
   onboarding guard. Sync core, run typecheck.
4. **B1 + B2 + B3 + B4** — permission identity, step aggregation, refresh on focus, shared
   provider. Rebuild. This is the fix for "steps are 0".
5. **B5 + B6 + E1 + E2** — history permission, weight write-back with `clientRecordId`,
   delete sync, FAB weight action, undo snackbar. Rebuild.
6. **C** — deep link. Needs the Supabase allow-list entry to test end to end.
7. **D** — keyboard. Own commit; adds a native dependency, gated on step 0.
8. **F** — dark theme, including `Backdrop`, `Glass` and `expo-system-ui`. Last, so
   screenshots are taken against the finished UI.

## Out of scope

- Android App Links / `assetlinks.json`. Needs a verified `assetlinks.json` on the web
  domain; the custom scheme fixes the reported problem without it.
- Nutrition write-back to Health Connect. Only weight was asked for.
- Any change to `lightTheme` or `workoutTheme`.
- Migrating existing users' stored unit preferences. Silently rewriting a US user's `lbs`
  to `kg` would change every number on their screen without asking.
- Pinning the Vercel function region nearer Nebius. Contributing factor to G1, not the
  cause; worth a follow-up measurement.
