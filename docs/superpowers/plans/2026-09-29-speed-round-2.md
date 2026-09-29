# Speed Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hit the 1.4.3 speed targets on the owner's OnePlus 10T with the production renderer: Diary day content ≤ 50 ms, first visits to Diary and Profile instant, Today's first draw ≤ 300 ms, late frames during a day change ≤ 10%, open-tab switches still ≤ 35 ms.

**Architecture:** First make measurement repeatable: probes that exist only when `EXPO_PUBLIC_PERF=1`, a Metro alias to React Native's profiling renderer, and one script that drives the phone and prints the numbers. Then five fixes, one commit each, each measured before and after; a fix that does not move its number is reverted.

**Tech Stack:** Expo 57 / React Native 0.86 (Fabric), expo-router 57 (bundles its own react-navigation), react-native-screens `freezeOnBlur`, Reanimated 4, lucide-react-native, zustand, adb, Perfetto.

**Spec:** `docs/superpowers/specs/2026-09-29-whole-day-coach-and-speed-design.md` (section 2). Plan A (`2026-09-29-whole-day-coach.md`) is independent; Task 9 here releases both.

**Baseline (production renderer, measured 2026-09-28):** Diary day change urgent 16-25 ms + content 105-146 ms; first visits Diary mount 156 ms, Profile mount 361 ms; Today first render at launch 687 ms; 24% janky frames over a day-change run; open-tab switch commit 20-32 ms after the tap.

---

## File map

- Create `src/lib/perf.tsx` — `PERF`, `PerfProbe`, `markPress`. No-ops unless `EXPO_PUBLIC_PERF=1`.
- Modify `metro.config.js` — profiling-renderer alias under the flag.
- Modify `app/(tabs)/_layout.tsx` — per-tab probes (flag only), prefetch (Task 6).
- Modify `src/components/GlassTabBar.tsx`, `src/components/DateNavigator.tsx` — `markPress`.
- Modify `app/(tabs)/diary.tsx`, `app/(tabs)/index.tsx` — section/card probes.
- Create `scripts/perf-run.mjs` — the measuring run.
- Create `docs/perf/2026-09-29-speed-round-2.md` — baseline and every result.
- Modify `src/theme/useTheme.ts`, `app/_layout.tsx` — shared theme (Task 3).
- Create `scripts/memo-icons.mjs`, generated `src/components/icons.ts`; import rewrites across `app/` and `src/` (Task 4).
- Modify `src/components/DateNavigator.tsx` — `React.memo` (Task 5).
- Create `src/hooks/useFirstFrameDone.ts`; modify `app/(tabs)/index.tsx` (Task 7).
- Modify `src/components/Material.tsx`, `src/components/Layout.tsx` — only if the trace points there (Task 8).

---

### Task 1: Repeatable measurement

**Files:**
- Create: `src/lib/perf.tsx`
- Modify: `metro.config.js`
- Modify: `app/(tabs)/_layout.tsx` (the `<Tabs ...>` element)
- Modify: `src/components/GlassTabBar.tsx` (`onPressIn`, ~line 183)
- Modify: `src/components/DateNavigator.tsx` (back and forward `onPress`)
- Modify: `app/(tabs)/diary.tsx` (sections in `DiaryScreen`'s return)
- Create: `scripts/perf-run.mjs`

- [ ] **Step 1: The probe module**

Create `src/lib/perf.tsx`:

```tsx
import React, { Profiler } from 'react'

/**
 * Render timing on a real phone, at production speed. On only in a build made with
 * EXPO_PUBLIC_PERF=1 (scripts/perf-run.mjs does that): the variable is inlined at build time,
 * so a release bundle carries no probe and no Profiler.
 *
 * Lines look like `[perf] diary update 12.3ms @4521 +140ms after diary`: which subtree, which
 * phase, render time, commit time since JS start, and time since the last tap marked with
 * markPress().
 */
export const PERF = process.env.EXPO_PUBLIC_PERF === '1'

let pressAt = 0
let pressName = ''

export const markPress = (name: string): void => {
  if (!PERF) return
  pressAt = performance.now()
  pressName = name
  console.log(`[perf] press ${name}`)
}

const onRender = (id: string, phase: string, actual: number, _base: number, _start: number, commit: number): void => {
  const since = pressAt ? ` +${Math.round(commit - pressAt)}ms after ${pressName}` : ''
  console.log(`[perf] ${id} ${phase} ${actual.toFixed(1)}ms @${Math.round(commit)}${since}`)
}

export const PerfProbe: React.FC<{ id: string; children: React.ReactNode }> = PERF
  ? ({ id, children }) => (
      <Profiler id={id} onRender={onRender}>
        {children}
      </Profiler>
    )
  : ({ children }) => <>{children}</>
```

- [ ] **Step 2: The profiling renderer under the flag**

Replace the last line of `metro.config.js`:

```js
module.exports = getDefaultConfig(__dirname)
```

with:

```js
const config = getDefaultConfig(__dirname)

/*
  Production React strips <Profiler> timing. React Native ships a profiling build of its
  renderer that keeps it at production speed, so a measuring run (EXPO_PUBLIC_PERF=1, see
  scripts/perf-run.mjs) resolves the shim's production renderer to that one instead.
*/
if (process.env.EXPO_PUBLIC_PERF === '1') {
  const upstream = config.resolver.resolveRequest
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const name = moduleName.endsWith('/implementations/ReactFabric-prod')
      ? moduleName.replace(/ReactFabric-prod$/, 'ReactFabric-profiling')
      : moduleName
    return (upstream ?? context.resolveRequest)(context, name, platform)
  }
}

module.exports = config
```

- [ ] **Step 3: Tab probes and press marks**

In `app/(tabs)/_layout.tsx`, add the import:
```ts
import { PERF, PerfProbe } from '@/lib/perf'
```
Above `export default function TabsLayout()`, add:
```tsx
/** Only in a measuring build: wraps each tab in a Profiler. Undefined otherwise, so nothing wraps. */
const PERF_SCREEN_LAYOUT = PERF
  ? ({ children, route }: { children: React.ReactNode; route: { name: string } }) => (
      <PerfProbe id={route.name}>{children}</PerfProbe>
    )
  : undefined
```
and change:
```tsx
      <Tabs screenOptions={TAB_SCREEN_OPTIONS} tabBar={renderTabBar}>
```
to:
```tsx
      <Tabs screenLayout={PERF_SCREEN_LAYOUT} screenOptions={TAB_SCREEN_OPTIONS} tabBar={renderTabBar}>
```

In `src/components/GlassTabBar.tsx`, add `import { markPress } from '@/lib/perf'` and make `onPressIn` start with the mark:
```tsx
              onPressIn={() => {
                if (focused) return
                markPress(route.name)
                switchedRef.current = false
```

In `src/components/DateNavigator.tsx`, add `import { markPress } from '@/lib/perf'`, then change the back button's handler:
```tsx
          onPress={() => onChange(shiftISODate(date, -1))}
```
to:
```tsx
          onPress={() => {
            markPress('date-back')
            onChange(shiftISODate(date, -1))
          }}
```
and in the forward button's `onPress`, add `markPress('date-forward')` as its first line.

- [ ] **Step 4: Diary section probes**

In `app/(tabs)/diary.tsx`, add `import { PerfProbe } from '@/lib/perf'` and wrap the sections in `DiaryScreen`'s return:

```tsx
      <PerfProbe id="diary:nav">
        <DateNavigator date={date} today={today} onChange={setDate} />
      </PerfProbe>
      <PerfProbe id="diary:totals">
        <DayTotals day={day} />
      </PerfProbe>
```
```tsx
      <PerfProbe id="diary:saved">
        <SavedMeals date={shownDate} />
      </PerfProbe>
```
and in the meal-card `.map`, wrap each card (the key moves to the probe):
```tsx
      ).map((meal, index) => (
        <PerfProbe key={meal} id={`diary:${meal}`}>
          <MealCard
            meal={meal}
            date={shownDate}
            entries={byMeal.get(meal) ?? []}
            teach={index === 0 && day.entries.length === 0 && isNewUser}
          />
        </PerfProbe>
      ))}
```
(keep the existing explanatory comment above `teach`).

- [ ] **Step 5: The run script**

Create `scripts/perf-run.mjs`:

```js
#!/usr/bin/env node
/**
 * Measures the app at production JS speed on a connected Android phone.
 *
 *   node scripts/perf-run.mjs
 *
 * Starts Metro with --no-dev --minify and EXPO_PUBLIC_PERF=1 (probes on; metro.config.js swaps in
 * React Native's profiling renderer), points the debug app at it, turns the debug app's JS dev
 * mode off, runs fixed tap sequences, and prints every [perf] line grouped by run. Then it puts
 * the debug app's preferences and the port forward back.
 *
 * Needs: the debug build (com.macrofit.app.dev; `npm run android` builds it) installed, adb
 * connected, and the phone unlocked with its screen on, showing Today. Taps are for a 1080×2400
 * screen (OnePlus 10T).
 *
 * Never keep the screen awake with key events: a key event while the app is still launching (no
 * focused window) gets the app killed with "Input dispatching timed out".
 */
import { execFileSync, spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PKG = 'com.macrofit.app.dev'
const ACTIVITY = `${PKG}/com.macrofit.app.MainActivity`
const PORT = 8082
const PREFS = `shared_prefs/${PKG}_preferences.xml`
const TAB = { index: [108, 2292], diary: [324, 2292], profile: [972, 2292] }
const DAY_BACK = [150, 468]

const serial =
  process.env.ADB_SERIAL ??
  execFileSync('adb', ['devices'], { encoding: 'utf8' })
    .split('\n')
    .map(line => line.trim().split('\t'))
    .find(([, state]) => state === 'device')?.[0]
if (!serial) {
  console.error('No adb device. Connect the phone (USB, or adb pair + adb connect) and run again.')
  process.exit(2)
}

const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' })
const tap = ([x, y]) => adb('shell', 'input', 'tap', String(x), String(y))
const perfLines = () =>
  adb('logcat', '-d', '-s', 'ReactNativeJS:V')
    .split('\n')
    .filter(line => line.includes('[perf]'))
    .map(line => line.slice(line.indexOf('[perf]')).trim())

const assertAwake = () => {
  const power = adb('shell', 'dumpsys', 'power')
  const window = adb('shell', 'dumpsys', 'window')
  if (!/mWakefulness=Awake/.test(power) || /isKeyguardShowing=true/.test(window)) {
    throw new Error('The phone is asleep or locked. Unlock it, leave the screen on, and run again.')
  }
}

const waitFor = async (test, seconds, what) => {
  for (let i = 0; i < seconds; i++) {
    if (await test()) return
    await sleep(1000)
  }
  throw new Error(`Timed out after ${seconds}s waiting for ${what}`)
}

const metro = spawn(
  'npx',
  ['expo', 'start', '--dev-client', '--no-dev', '--minify', '--clear', '--port', String(PORT)],
  { env: { ...process.env, EXPO_PUBLIC_PERF: '1', CI: '1' }, shell: true, stdio: 'ignore' },
)

const cleanup = () => {
  try { adb('shell', `run-as ${PKG} rm -f ${PREFS}`) } catch {}
  try { adb('reverse', '--remove', 'tcp:8081') } catch {}
  if (process.platform === 'win32') {
    try { execFileSync('taskkill', ['/pid', String(metro.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
  } else {
    metro.kill()
  }
}

const main = async () => {
  assertAwake()
  if (!adb('shell', 'pm', 'list', 'packages', PKG).includes(PKG)) {
    throw new Error(`${PKG} is not installed. Build it once with: npm run android`)
  }

  console.log('Starting Metro in production mode with probes...')
  await waitFor(
    async () => (await fetch(`http://127.0.0.1:${PORT}/status`).then(r => r.text()).catch(() => '')).includes('running'),
    180,
    'Metro',
  )
  // Bundle before the app asks, so the phone does not sit on its splash past its screen timeout.
  console.log('Bundling (about a minute on a cold cache)...')
  await fetch(`http://127.0.0.1:${PORT}/index.bundle?platform=android&dev=false&minify=true`).then(r => r.text())

  // The debug app always loads localhost:8081, whatever it was last pointed at.
  adb('reverse', 'tcp:8081', `tcp:${PORT}`)
  // React Native reads these at launch: request dev=false&minify=true.
  execFileSync('adb', ['-s', serial, 'exec-in', `run-as ${PKG} sh -c 'cat > ${PREFS}'`], {
    input:
      '<?xml version="1.0" encoding="utf-8" standalone="yes" ?>\n<map>\n' +
      '<boolean name="js_dev_mode_debug" value="false" />\n' +
      '<boolean name="js_minify_debug" value="true" />\n</map>\n',
  })

  assertAwake()
  adb('shell', 'am', 'force-stop', PKG)
  adb('logcat', '-c')
  adb('shell', 'am', 'start', '-n', ACTIVITY)
  await waitFor(() => perfLines().some(line => line.startsWith('[perf] index')), 90, 'the first Today render')
  await sleep(4000)
  const results = [{ label: 'launch', lines: perfLines() }]

  const run = async (label, taps) => {
    assertAwake()
    adb('logcat', '-c')
    for (const [target, pause] of taps) {
      tap(target)
      await sleep(pause)
    }
    results.push({ label, lines: perfLines() })
  }
  await run('first visits', [[TAB.diary, 2500], [TAB.index, 2500], [TAB.profile, 2500], [TAB.index, 2500]])
  await run(
    'tab round-trips',
    Array.from({ length: 3 }, () => [[TAB.diary, 2000], [TAB.index, 2000], [TAB.profile, 2000], [TAB.index, 2000]]).flat(),
  )
  await run('diary days', [[TAB.diary, 2500], [DAY_BACK, 1500], [DAY_BACK, 1500], [DAY_BACK, 2000]])

  const meminfo = adb('shell', 'dumpsys', 'meminfo', PKG)
  const pssKb = meminfo.match(/TOTAL(?: PSS)?:?\s+(\d+)/)?.[1]

  for (const { label, lines } of results) {
    console.log(`\n== ${label}`)
    for (const line of lines) console.log(line.startsWith('[perf] press') ? `  ${line}` : `      ${line}`)
  }
  console.log(`\nmemory (PSS): ${pssKb ? `${Math.round(Number(pssKb) / 1024)} MB` : 'unknown'}`)
}

main()
  .catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
  .finally(() => {
    cleanup()
    process.exit()
  })
```

- [ ] **Step 6: Typecheck**

Run: `cd /d/macrofit-mobile && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Prove the harness on the phone**

Owner: phone unlocked, screen on, debug app installed. Run: `cd /d/macrofit-mobile && node scripts/perf-run.mjs`
Expected: four sections (`launch`, `first visits`, `tab round-trips`, `diary days`) with `[perf] press ...` lines followed by indented render lines, and a memory line. If `launch` has no `[perf] index` line within 90 s: the app is loading a dev bundle; check `adb logcat -d | grep -i "Unable to load"` and that port 8081 is reversed.

- [ ] **Step 8: Prove the release bundle carries no probe**

Run: `cd /d/macrofit-mobile && npx expo export --platform android --output-dir "$TEMP/perf-check" >/dev/null && grep -c "\[perf\]" "$TEMP"/perf-check/_expo/static/js/android/*.hbc || true`
Expected: `0`.

- [ ] **Step 9: Commit**

```bash
cd /d/macrofit-mobile
git add src/lib/perf.tsx metro.config.js "app/(tabs)/_layout.tsx" src/components/GlassTabBar.tsx src/components/DateNavigator.tsx "app/(tabs)/diary.tsx" scripts/perf-run.mjs
git commit -m "Measure render speed on the phone with one command

scripts/perf-run.mjs runs the debug app at production JS speed with React
Native's profiling renderer, taps through fixed sequences and prints what
each tap cost. The probes exist only in a build made with
EXPO_PUBLIC_PERF=1; release bundles carry none.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Record the baseline

**Files:**
- Create: `docs/perf/2026-09-29-speed-round-2.md`

- [ ] **Step 1: Run twice and keep the second run**

Run: `cd /d/macrofit-mobile && node scripts/perf-run.mjs > "$TEMP/perf-baseline.txt"` twice (the first warms caches). Keep the second.

- [ ] **Step 2: Write the results file**

Create `docs/perf/2026-09-29-speed-round-2.md`:

````markdown
# Speed round 2: measurements

OnePlus 10T (CPH2401, Android 14), debug app at production JS speed with the profiling renderer,
`node scripts/perf-run.mjs`. Each row is read from the run's output: urgent/content are the
Diary renders after a `date-back` press; first visits are the `mount` lines after the first
`diary`/`profile` press; launch is the first `[perf] index` line's `@` time.

| Step | Diary day urgent | Diary day content | First visit Diary | First visit Profile | Today first render | Open-tab switch | PSS |
|---|---|---|---|---|---|---|---|
| Baseline | | | | | | | |

## Raw output: baseline

```
(paste the second run's output here)
```
````

Fill the Baseline row from the output (median of the three day changes; median of the round-trip switches) and paste the output.

- [ ] **Step 3: Commit**

```bash
cd /d/macrofit-mobile
git add docs/perf/2026-09-29-speed-round-2.md
git commit -m "Record the speed baseline for 1.4.3

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: One shared theme

**Files:**
- Modify: `src/theme/useTheme.ts` (whole file)
- Modify: `app/_layout.tsx` (`RootLayout`'s return, ~lines 691-719)

- [ ] **Step 1: Resolve the theme once**

Replace everything in `src/theme/useTheme.ts` from `export const useTheme = (): Theme => {` to the end of that function with:

```ts
/**
 * The user's light/dark choice, resolved: Light and Dark are explicit, System tracks
 * `useColorScheme()`. Until the choice has been read back from storage it falls back to the
 * synced `darkMode` flag, which is what the theme used to be and what every choice still writes.
 *
 * Called once, by ThemeProvider. Every screen used to run these four subscriptions in every
 * piece of text and every button: hundreds of them per screen, on every render.
 */
export const useResolvedTheme = (): Theme => {
  const darkMode = useStore(s => s.darkMode)
  const mode = useAppearance(s => s.mode)
  const hydrated = useAppearance(s => s.hydrated)
  const scheme = useColorScheme()

  const dark = !hydrated
    ? darkMode
    : mode === 'system'
      ? scheme === 'dark'
      : mode === 'dark'
  return dark ? darkTheme : lightTheme
}

const RootTheme = createContext<Theme | null>(null)

/** Mounted once, at the top of app/_layout.tsx. */
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  React.createElement(RootTheme.Provider, { value: useResolvedTheme() }, children)

/**
 * The active theme: a ThemeScope above the caller wins (that is how workout mode repaints a
 * whole screen), otherwise the app's. One context read.
 */
export const useTheme = (): Theme => {
  const override = useContext(ThemeOverride)
  const root = useContext(RootTheme)
  if (override) return override
  if (root) return root
  if (__DEV__) console.warn('useTheme() was called outside ThemeProvider; using the light theme.')
  return lightTheme
}
```

and change the file's first import:
```ts
import { createContext, useContext } from 'react'
```
to:
```ts
import React, { createContext, useContext } from 'react'
```

- [ ] **Step 2: Mount the provider above everything**

In `app/_layout.tsx`, add `ThemeProvider` to the existing `@/theme/useTheme` import (or add `import { ThemeProvider } from '@/theme/useTheme'`). In `RootLayout`'s return, change:
```tsx
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
```
to:
```tsx
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
      <SafeAreaProvider>
```
and:
```tsx
      </SafeAreaProvider>
    </GestureHandlerRootView>
```
to:
```tsx
      </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
```

- [ ] **Step 3: Typecheck**

Run: `cd /d/macrofit-mobile && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Check nothing renders outside the provider**

Run the dev build (`npm start`, open the debug app), open Today, Diary, Profile, Workout (Training), the coach, food search and an alert (delete a saved meal → Cancel). Expected: no `useTheme() was called outside ThemeProvider` warning in the Metro log; Profile → Appearance switches Light/Dark/System live; Training is still lime-on-black.

- [ ] **Step 5: Measure**

Run: `node scripts/perf-run.mjs` twice; add a `Shared theme` row to `docs/perf/2026-09-29-speed-round-2.md` from the second run.
Keep if Diary day content or a first visit improves by ≥ 10% against the baseline row. Otherwise `git checkout -- src/theme/useTheme.ts app/_layout.tsx`, record "reverted: no gain" in the row, and skip Step 6.

- [ ] **Step 6: Commit**

```bash
cd /d/macrofit-mobile
git add src/theme/useTheme.ts app/_layout.tsx docs/perf/2026-09-29-speed-round-2.md
git commit -m "Resolve the theme once instead of in every text and button

useTheme() subscribed to three stores and the system colour scheme in
every caller, hundreds per screen. ThemeProvider resolves it once at the
root and useTheme() reads one context; ThemeScope still overrides it.
<before> -> <after> on Diary day content (see docs/perf).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
(Replace `<before> -> <after>` with the measured numbers.)

---

### Task 4: Memoised icons

**Files:**
- Create: `scripts/memo-icons.mjs`
- Create (generated): `src/components/icons.ts`
- Modify (rewritten imports): every file under `app/` and `src/` that imports from `lucide-react-native` (42 files at time of writing)

- [ ] **Step 1: The generator**

Create `scripts/memo-icons.mjs`:

```js
#!/usr/bin/env node
/**
 * Every lucide icon the app uses, wrapped in React.memo, in src/components/icons.ts; and every
 * import of lucide-react-native rewritten to come from there.
 *
 *   node scripts/memo-icons.mjs
 *
 * WHY: an icon is a react-native-svg drawing, among the most expensive things to re-render in
 * JS, and it re-rendered whenever its parent did, with the same size and colour. Its props are
 * all primitives, so a memo holds and the drawing is skipped.
 *
 * Re-run it after adding an icon: it collects names from both lucide-react-native imports and
 * '@/components/icons' imports, so it is safe to run any number of times. Named imports only;
 * `import * as` from lucide would bundle all ~1,500 icons.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const OUT = path.join(root, 'src/components/icons.ts')
const IMPORT = /import\s+\{([^}]*)\}\s+from\s+'(lucide-react-native|@\/components\/icons)'/g

const files = []
const walk = dir => {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full)
    else if (/\.(ts|tsx)$/.test(name) && full !== OUT) files.push(full)
  }
}
walk(path.join(root, 'app'))
walk(path.join(root, 'src'))

const names = new Set()
let rewritten = 0
for (const file of files) {
  const source = readFileSync(file, 'utf8')
  let changed = false
  const next = source.replace(IMPORT, (_whole, list, from) => {
    for (const part of list.split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim()
      if (name) names.add(name)
    }
    if (from === 'lucide-react-native') changed = true
    return `import {${list}} from '@/components/icons'`
  })
  if (changed) {
    writeFileSync(file, next)
    rewritten += 1
  }
}

const sorted = [...names].sort()
writeFileSync(
  OUT,
  [
    '/*',
    '  GENERATED by scripts/memo-icons.mjs. Re-run it after using a new icon instead of editing.',
    '',
    '  Each lucide icon wrapped in React.memo: an icon is a react-native-svg drawing that used to',
    '  re-render with its parent even when its size and colour had not changed.',
    '*/',
    "import React from 'react'",
    'import {',
    ...sorted.map(name => `  ${name} as Lucide${name},`),
    "} from 'lucide-react-native'",
    '',
    '/** Same type as the original, so every call site and prop type keeps working. */',
    'const memo = <T extends React.ComponentType<any>>(Icon: T): T => React.memo(Icon) as unknown as T',
    '',
    ...sorted.map(name => `export const ${name} = memo(Lucide${name})`),
    '',
  ].join('\n'),
)
console.log(`${sorted.length} icons in src/components/icons.ts; ${rewritten} files rewritten`)
```

- [ ] **Step 2: Run it**

Run: `cd /d/macrofit-mobile && node scripts/memo-icons.mjs`
Expected: `77 icons in src/components/icons.ts; 42 files rewritten`.

Run: `grep -rn "from 'lucide-react-native'" app src | grep -v "src/components/icons.ts"`
Expected: no output.

Run it again. Expected: `77 icons ...; 0 files rewritten` (idempotent).

- [ ] **Step 3: Typecheck**

Run: `cd /d/macrofit-mobile && npx tsc --noEmit`
Expected: exit 0. (`app/(tabs)/profile.tsx` imports `User as UserIcon`; the generated module exports `User`, so the alias still resolves.)

- [ ] **Step 4: Look at the app**

Run the dev build: icons render on Today, the tab bar (the active tab's icon still changes colour and weight on switch), Diary, Profile, Training and the coach.

- [ ] **Step 5: Measure**

`node scripts/perf-run.mjs` twice; add a `Memo icons` row. Keep if Diary day content or a first visit improves ≥ 10% against the previous kept row; otherwise `git checkout -- app src && git clean -f src/components/icons.ts scripts/memo-icons.mjs`, record "reverted", skip Step 6.

- [ ] **Step 6: Commit**

```bash
cd /d/macrofit-mobile
git add scripts/memo-icons.mjs src/components/icons.ts app src docs/perf/2026-09-29-speed-round-2.md
git commit -m "Stop redrawing unchanged icons

Every lucide icon now comes from src/components/icons.ts, generated by
scripts/memo-icons.mjs, which wraps each in React.memo. <before> -> <after>
on Diary day content (see docs/perf).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Memoised date navigator

**Files:**
- Modify: `src/components/DateNavigator.tsx` (the `export const DateNavigator` declaration and its end)

- [ ] **Step 1: Wrap it**

Change:
```tsx
export const DateNavigator: React.FC<{
  date: string
  today: string
  onChange: (next: string) => void
}> = ({ date, today, onChange }) => {
```
to:
```tsx
/*
  Memoised: Diary's deferred pass (the one that renders the new day's content) re-rendered this
  with identical props, ~10 ms each time. `onChange` is a state setter, so it is stable.
*/
export const DateNavigator = React.memo<{
  date: string
  today: string
  onChange: (next: string) => void
}>(function DateNavigator({ date, today, onChange }) {
```
and the component's final `}` (after its closing `</Surface>` and `)`) to `})`.

- [ ] **Step 2: Typecheck**

Run: `cd /d/macrofit-mobile && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Measure**

`node scripts/perf-run.mjs` twice; add a `Memo date bar` row. In the `diary days` section, `diary:nav` must no longer appear in the content pass (only in the urgent pass after each `date-back`). Keep if Diary day content improves; otherwise revert with `git checkout -- src/components/DateNavigator.tsx` and record it.

- [ ] **Step 4: Commit**

```bash
cd /d/macrofit-mobile
git add src/components/DateNavigator.tsx docs/perf/2026-09-29-speed-round-2.md
git commit -m "Skip the date bar in Diary's content pass

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Pre-built Diary and Profile

**Files:**
- Modify: `app/(tabs)/_layout.tsx` (`TabsLayout`: imports, one effect)

- [ ] **Step 1: Prefetch after Today settles**

In `app/(tabs)/_layout.tsx`, add `useEffect` to the `react` import and `InteractionManager` to the `react-native` import. In `TabsLayout`, after `const router = useRouter()`, add:

```tsx
  /*
    FIRST VISITS WITHOUT A BUILD. Opening Diary or Profile for the first time mounted the whole
    screen on the tap: 156 ms and 361 ms of JS at production speed. Once Today has drawn and
    nothing is animating, both are built in the background, a second apart so neither competes
    with the other, and freezeOnBlur freezes each as soon as it has mounted. A later tap only
    shows it.
  */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const task = InteractionManager.runAfterInteractions(() => {
      router.prefetch('/diary')
      timer = setTimeout(() => router.prefetch('/profile'), 1000)
    })
    return () => {
      task.cancel()
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [router])
```

- [ ] **Step 2: Typecheck**

Run: `cd /d/macrofit-mobile && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Measure, and confirm the screens were really built**

`node scripts/perf-run.mjs` twice. In the `launch` section, expect `[perf] diary mount` and `[perf] profile mount` lines after the first `[perf] index` line. In `first visits`, the first `diary` and `profile` presses must show `update` (or nothing over 0.1 ms), **not** `mount`.
- If `mount` still appears on the first visit: prefetch did not build the tab before the freeze. Revert (`git checkout -- "app/(tabs)/_layout.tsx"`), record "prefetch does not pre-render frozen tabs", and stop this task.
- Compare the memory line with the previous row. If it rose by more than 40 MB, change the effect to prefetch `/diary` only, re-measure, and record both.

- [ ] **Step 4: Check it is invisible**

On the phone, open the app cold and watch Today for 3 seconds: no flicker, no tab switch, the tab indicator stays on Dashboard.

- [ ] **Step 5: Commit**

```bash
cd /d/macrofit-mobile
git add "app/(tabs)/_layout.tsx" docs/perf/2026-09-29-speed-round-2.md
git commit -m "Build Diary and Profile in the background after Today draws

First visits now show an already-built, frozen screen instead of mounting
one on the tap. <before> -> <after> (see docs/perf).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Today's first draw

**Files:**
- Modify: `app/(tabs)/index.tsx` (card list in the screen's return)
- Create: `src/hooks/useFirstFrameDone.ts`

- [ ] **Step 1: Probe every card**

In `app/(tabs)/index.tsx`, add `import { PerfProbe } from '@/lib/perf'` and wrap each card in the screen's return in a probe named after it: `<PerfProbe id="today:RecapSlot">…</PerfProbe>`, and the same for `MacroCard`, `NextMealCard`, `WeightVerdict`, `WeekCard`, `CoachCard`, `MealsCard`, `WaterCard`, `StepsCard`, `WeightTargetCard`.

- [ ] **Step 2: Measure which cards the first render pays for**

`node scripts/perf-run.mjs`. In the `launch` section, list each `today:*` line's time. Add them to the results file under "Today card costs". Note the sum of cards after `NextMealCard` (these are below the first screen on a 1080×2400 phone).

- [ ] **Step 3: The one-frame gate**

Create `src/hooks/useFirstFrameDone.ts`:

```ts
import { useEffect, useState } from 'react'

/**
 * False on the first render, true from the frame after it. Lets a screen draw what is above the
 * fold first and add what is below it a frame later, where nobody can see it arrive.
 */
export const useFirstFrameDone = (): boolean => {
  const [done, setDone] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setDone(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return done
}
```

- [ ] **Step 4: Draw below-the-fold cards a frame later**

In `app/(tabs)/index.tsx`, import `useFirstFrameDone` from `@/hooks/useFirstFrameDone`, call `const belowFold = useFirstFrameDone()` in the screen component, and wrap the probes from `WeightVerdict` through `WeightTargetCard` (everything after `NextMealCard`) in:

```tsx
      {belowFold && (
        <>
          {/* ...the existing WeightVerdict ... WeightTargetCard probes, unchanged... */}
        </>
      )}
```

with a comment above it:

```tsx
      {/*
        Below the first screen on a 1080×2400 phone, so drawn a frame after the cards above it:
        launch paid for all ten cards before showing any (687 ms at production speed).
      */}
```

- [ ] **Step 5: Typecheck**

Run: `cd /d/macrofit-mobile && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Measure and look**

`node scripts/perf-run.mjs` twice; add a `Today below fold` row. Target: the first `[perf] index` render ≤ 300 ms. On the phone, cold-start and scroll Today immediately: no gap or jump where the later cards arrive.
If the first render is still over 300 ms, the remaining cost is in the cards above the fold or outside the cards (compare the sum of `today:*` lines with the `index` line): record the breakdown in the results file for a follow-up; keep this change if it moved the number ≥ 10%, otherwise revert both files.

- [ ] **Step 7: Commit**

```bash
cd /d/macrofit-mobile
git add "app/(tabs)/index.tsx" src/hooks/useFirstFrameDone.ts docs/perf/2026-09-29-speed-round-2.md
git commit -m "Draw Today's below-the-fold cards a frame after the rest

<before> -> <after> to Today's first render at launch (see docs/perf).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Late frames

**Files:**
- Modify (only if the trace points there): `src/components/Material.tsx` (`Glass`), `src/components/Layout.tsx` (`Screen` header)

- [ ] **Step 1: Capture a trace during day changes**

Owner: phone unlocked on Diary, debug app running a perf build (start one with `node scripts/perf-run.mjs`, then leave the app open; or any production-mode run). Run:

```bash
adb shell perfetto -o /data/misc/perfetto-traces/diary.pftrace -t 12s sched freq gfx view input -a com.macrofit.app.dev &
sleep 2
for i in 1 2 3 4 5 6; do adb shell input tap 150 468; sleep 1.2; done
wait
adb pull /data/misc/perfetto-traces/diary.pftrace "$TEMP/diary.pftrace"
```
Expected: a trace file of a few MB.

- [ ] **Step 2: Read it**

```bash
pip install perfetto
python - "$TEMP/diary.pftrace" <<'EOF'
import sys
from perfetto.trace_processor import TraceProcessor
tp = TraceProcessor(trace=sys.argv[1])
APP = "(select upid from process where name like 'com.macrofit.app.dev%')"
print('jank by type')
for r in tp.query(f"select jank_type, count(*) n from actual_frame_timeline_slice where upid in {APP} group by jank_type"):
    print(f'  {r.jank_type}: {r.n}')
print('\nmain-thread time by slice name (top 20)')
for r in tp.query(f"""
  select s.name, count(*) n, sum(s.dur)/1e6 ms from slice s
  join thread_track tt on s.track_id = tt.id join thread t using(utid)
  where t.upid in {APP} and t.is_main_thread = 1
  group by s.name order by ms desc limit 20"""):
    print(f'  {r.ms:8.1f} ms  {r.n:5d}x  {r.name}')
print('\nRenderThread time by slice name (top 15)')
for r in tp.query(f"""
  select s.name, count(*) n, sum(s.dur)/1e6 ms from slice s
  join thread_track tt on s.track_id = tt.id join thread t using(utid)
  where t.upid in {APP} and t.name = 'RenderThread'
  group by s.name order by ms desc limit 15"""):
    print(f'  {r.ms:8.1f} ms  {r.n:5d}x  {r.name}')
EOF
```
Save the output under "Late frames: trace" in the results file.

- [ ] **Step 3: Decide from the trace**

| The trace shows | Cause | Fix (Step 4) |
|---|---|---|
| RenderThread dominated by blur/`RenderEffect`/`BlurView` slices, or `saveLayer` from the header region | the Dimezis blur behind the screen header re-samples the content changing under it | A: solid header on Android |
| Main thread dominated by `measure`/`layout`/`Choreographer#doFrame` with `RN` view creation | mounting the new day's native views | B: none here; record it (the content pass is already smaller after Tasks 3-5) |
| `saveLayer` / offscreen layers from buttons | `needsOffscreenAlphaCompositing` on every button, active only while faded | C: record; not changed in this plan |

Record the verdict in the results file. Only fix A has code in this plan.

- [ ] **Step 4 (fix A only): Solid screen header on Android**

In `src/components/Material.tsx`, add a prop to `GlassProps`:
```ts
  /**
   * Draw the solid fallback on Android even when blur is available. For chrome over content that
   * changes wholesale (a screen header while Diary swaps days), where the blur re-samples every
   * frame of the change and costs more than it shows.
   */
  solidOnAndroid?: boolean
```
add it to `Glass`'s destructured props (`solidOnAndroid = false`), and change:
```ts
  if (lite) {
```
to:
```ts
  if (lite || (solidOnAndroid && Platform.OS === 'android')) {
```
In `src/components/Layout.tsx`, on the header `<Glass radius={0} ...>` inside `Screen`, add `solidOnAndroid`. The tab bar keeps its blur.

- [ ] **Step 5 (fix A only): Measure again**

Repeat Steps 1-2. Target: janky frames ≤ 10% of the frames in the capture, and the blur slices gone from the header. Add a `Solid header (Android)` row. If the jank share did not drop by at least a third, revert both files and record it.

- [ ] **Step 6: Commit**

With fix A kept:
```bash
cd /d/macrofit-mobile
git add src/components/Material.tsx src/components/Layout.tsx docs/perf/2026-09-29-speed-round-2.md
git commit -m "Draw the screen header solid on Android

A Perfetto trace of Diary day changes showed <evidence>. The header's
blur re-sampled the whole content swap under it; the tab bar keeps its
blur. Late frames <before>% -> <after>%.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
Otherwise commit only the results file: `git add docs/perf/2026-09-29-speed-round-2.md && git commit -m "Record the late-frames trace for 1.4.3"` (with the Co-Authored-By trailer).

---

### Task 9: Release 1.4.3 (after Plan A and Tasks 1-8)

**Files:**
- Modify: `app.json` (`version`, `android.versionCode`)

- [ ] **Step 1: Final numbers**

`node scripts/perf-run.mjs` twice; add a `1.4.3 final` row and a one-paragraph summary at the top of the results file: each target, met or not.

- [ ] **Step 2: Version**

In `app.json` change `"version": "1.4.2"` to `"version": "1.4.3"` and `"versionCode": 12` to `"versionCode": 13`.
Run: `cd /d/macrofit-mobile && npx tsc --noEmit && npm test`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
cd /d/macrofit-mobile
git add app.json docs/perf/2026-09-29-speed-round-2.md
git commit -m "Bump to 1.4.3

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Build and verify the APK**

```bash
cd /d/macrofit-mobile
node scripts/sync-core.mjs
git status --short   # expected: clean (no core drift)
npx expo prebuild --platform android --no-install
(cd android && ./gradlew assembleRelease --console=plain)
node scripts/check-release-apk.mjs
```
Expected: `BUILD SUCCESSFUL`, then `versionName 1.4.3`, `versionCode 13`, `signed with the pinned key`, `Safe to publish.`

- [ ] **Step 5: Install over the owner's app and let them check**

`adb install -r android/app/build/outputs/apk/release/app-release.apk`, then `adb shell dumpsys package com.macrofit.app | grep -E "versionName|versionCode"` → `1.4.3` / `13`. Owner checks Today, Diary day changes, tab switches and the coach opener on their data.

- [ ] **Step 6: Draft the release notes for the owner**

Write `$TEMP/release-notes-1.4.3.md`, for MacroFit users, in the 1.4.2 format: a one-line lead, then `## Coach` (from Plan A: the coach sees water, steps and training; the opener's activity line; never "you earned calories"), `## Faster` (only the targets actually met, from the results file's summary, in plain words: "Diary days change instantly", "Profile opens instantly the first time"), and `## Fixes` if any. Show the owner the text and wait for approval or edits.

- [ ] **Step 7: Publish (owner's explicit go only)**

```bash
cd /d/macrofit-mobile
git checkout main && git merge --ff-only origin/main
git merge --no-ff whole-day-coach-and-speed -m "Merge the whole-day coach, speed round 2 and the 1.4.3 bump into main"
test "$(git rev-parse main^{tree})" = "$(git rev-parse whole-day-coach-and-speed^{tree})" && echo "tree matches the build"
git tag v1.4.3
git push origin main whole-day-coach-and-speed v1.4.3
cp android/app/build/outputs/apk/release/app-release.apk "$TEMP/MacroFit-v1.4.3.apk"
gh release create v1.4.3 "$TEMP/MacroFit-v1.4.3.apk" --repo Abenor-Labs/macrofit-mobile --title "MacroFit v1.4.3" --notes-file "$TEMP/release-notes-1.4.3.md" --verify-tag
```
Expected: the release URL. Then tell the owner to open it and confirm it is marked Latest with the APK attached.

- [ ] **Step 8: Remind the owner about the auth switch**

`AI_AUTH` stays `soft`. Turning it to `required` is a separate decision, once most installs are on 1.4.2 or later; flipping it earlier cuts 1.4.1 phones off from the coach and photo logging.

---

## Self-review against the spec

- Spec 2.1 (flag-gated probes, Metro alias, run script, lessons encoded, probe placement) → Task 1 (+ Task 7 for Today cards; launch time via the `@` commit time).
- Spec 2.2 fix 1 (theme) → Task 3; fix 2 (icons, DateNavigator; Button/IconButton not memoised) → Tasks 4-5; fix 3 (prefetch, freeze, 40 MB rule) → Task 6; fix 4 (Today first draw) → Task 7; fix 5 (trace-first late frames) → Task 8.
- "A fix that does not move its number is reverted" → Steps with explicit keep/revert thresholds in Tasks 3-8.
- Spec 3 release order and 4 testing → Task 9 (and Plan A for the server and coach).
- Spec risks: `preload` API → resolved as `router.prefetch`, with the "mount on first visit" check and revert in Task 6; ThemeProvider placement → Task 3 Step 4 warning check.
