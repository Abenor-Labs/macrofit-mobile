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

/*
  Screen on through the waits before measuring (Metro, bundling, the app loading), which run
  longer than a 30-second screen timeout. Without touching settings: OnePlus refuses adb writes
  to them. Without key events: one sent while the app has no focused window gets it killed. A
  tap on the status bar goes to System UI, not the app, and counts as user activity. It stops
  before the measured taps, which keep the screen on by themselves.
*/
let keepAlive = null
const startKeepAlive = () => {
  keepAlive = setInterval(() => {
    try { tap([540, 12]) } catch {}
  }, 8000)
}
const stopKeepAlive = () => {
  if (keepAlive !== null) clearInterval(keepAlive)
  keepAlive = null
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
  stopKeepAlive()
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
  startKeepAlive()

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
  // The phone downloads the whole production bundle through the adb tunnel before it can run
  // any of it: 15 s to nearly 2 minutes over wireless adb, depending on the link.
  console.log('Loading the app on the phone (up to a couple of minutes over wireless adb)...')
  await waitFor(() => perfLines().some(line => line.startsWith('[perf] index')), 240, 'the first Today render')
  await sleep(4000)
  stopKeepAlive()
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
