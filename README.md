# MacroFit Mobile

Native iOS/Android client for MacroFit — nutrition tracking, strength training, and a
coach that builds targets from your own logged data rather than a formula alone.

Built with **React Native 0.86** (Expo SDK 57, expo-router). Real native views, Hermes,
New Architecture enabled.

---

## Quick start

```bash
npm install
cp .env.example .env      # then fill it in
npm start                 # syncs shared logic, then starts Metro
```

Then press `a` for Android or `i` for iOS, or scan the QR code with a dev build.

To produce native projects and build locally:

```bash
npx expo prebuild --platform android   # generates ./android
npm run android                        # gradle build + install
```

`android/` and `ios/` are git-ignored on purpose: they are generated from `app.json`
(Continuous Native Generation), so configuration lives in exactly one place. If you want
to hand-edit Kotlin/Swift, delete those entries from `.gitignore` and the folders become
yours to maintain.

## Environment

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `EXPO_PUBLIC_API_URL` | Base URL of the deployed web app, which hosts the AI endpoints |
| `EXPO_PUBLIC_USDA_API_KEY` | USDA FoodData Central key (defaults to `DEMO_KEY`) |

`EXPO_PUBLIC_API_URL` must be a LAN IP or a deployed URL — **not** `localhost`. On a
phone or emulator, `localhost` means the device itself, not your dev machine. This is the
single most common setup mistake.

## Shared business logic

Every formula, database and store action is shared with the web app. `src/core/` holds a
vendored copy of the web project's pure logic:

```
src/core/types          all shared types
src/core/utils          BMR/TDEE, body composition, coach alerts, workout math
src/core/data           food and lift databases
src/core/store          the zustand state creator, used by both platforms
```

**Do not edit anything under `src/core/`.** It is generated. Edit the originals in the
web repository, then re-sync:

```bash
npm run sync:core
```

`start`, `typecheck` and `export` run the sync automatically. The script expects the web
repository checked out as a sibling directory:

```
parent/
  Macro-tracker/        # web app — source of truth for shared logic
  macrofit-mobile/      # this repo
```

If it is not there, `sync:core` fails loudly and the committed copy in `src/core` is used
as-is, so the app still builds. Only the platform layer differs between the two apps: the
web store persists to `localStorage`, this one to `AsyncStorage`.

## Architecture

```
app/                 expo-router routes
  (tabs)/            dashboard, diary, workout, progress, profile
  login.tsx          auth
  goals.tsx          coach plan + manual targets
  chat.tsx           AI assistant
  food-search.tsx    food picker (local + USDA + custom)
  lift-picker.tsx    lift picker
src/components/      design-system primitives (Glass, Text, Button, MacroRing, Layout)
src/theme/           tokens + useTheme
src/store/           zustand store wired to AsyncStorage
src/lib/             supabase client, API client, auth provider
src/core/            GENERATED — shared logic, see above
```

Design rules live in [`docs/MOBILE-DESIGN.md`](docs/MOBILE-DESIGN.md) and are binding:
warm stone neutrals, a jade brand, Fraunces for every number the user reads as data, and
native blur used only where something genuinely floats above content.

The macro palette is not a taste decision — it was validated for lightness band, chroma
floor, colour-vision separation, normal-vision separation and contrast across all pairs
in both light and dark. Substituting a "nicer" hex silently breaks that.

## Scripts

| Script | Does |
|---|---|
| `npm start` | sync shared logic, start Metro |
| `npm run android` | sync, then build and install on Android |
| `npm run typecheck` | sync, then `tsc --noEmit` |
| `npm run export` | sync, then produce a production bundle |
| `npm run sync:core` | refresh `src/core` from the web repo |
