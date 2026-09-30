#!/usr/bin/env node
/**
 * Checks a built release APK against what it is supposed to be, before it is published.
 *
 * WHY THIS EXISTS. Two release defects in one afternoon, both silent, both from the same
 * cause — android/ is generated, and what is in it can disagree with the repo:
 *
 *   1. v1.2.4 shipped signed with credentials/macrofit-release.keystore while
 *      plugins/with-release-signing.js still named keys/macrofit-signing.keystore. Anyone
 *      on an older build could no longer update, and the only way out was an uninstall that
 *      takes local data with it.
 *   2. A 1.3.1 build came out reporting versionCode 8 / 1.3.0, because app.json was bumped
 *      after the last prebuild and gradle read the stale generated values. Released under a
 *      v1.3.1 tag, the in-app updater would have offered an update that was already
 *      installed, for ever.
 *
 * Neither produced an error. Both would have been caught by reading the finished APK, which
 * is the only artifact that cannot lie about what it is.
 *
 *   node scripts/check-release-apk.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { inflateRawSync } from 'node:zlib'

const projectRoot = path.resolve(import.meta.dirname, '..')
const APK = path.join(projectRoot, 'android/app/build/outputs/apk/release/app-release.apk')

/** The key every build from v1.2.4 onward must carry, or it cannot update an install. */
const EXPECTED_CERT_SHA256 = '1edcd8dd2b9fcb815c5d9d7bd5520944444e05cec9acd583a2d505084f245c7b'

const problems = []
const note = message => console.log(`  ${message}`)

/**
 * Runs a build-tool and returns its stdout.
 *
 * `apksigner` ships as a .bat on Windows, and since Node's fix for CVE-2024-27980 a batch
 * file cannot be spawned without a shell — `execFileSync` throws EINVAL instead. Going
 * through the shell means quoting the paths, both of which routinely contain spaces
 * (`C:\Program Files\...`, `.../Local/Android/Sdk/...`).
 */
const run = (tool, args) => {
  const useShell = process.platform === 'win32'
  return useShell
    ? execFileSync(`"${tool}" ${args.map(arg => `"${arg}"`).join(' ')}`, {
        encoding: 'utf8',
        shell: true,
      })
    : execFileSync(tool, args, { encoding: 'utf8' })
}

/** Newest build-tools directory holding `tool`, or null when the SDK cannot be found. */
const findBuildTool = tool => {
  const roots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android/Sdk') : null,
    process.env.HOME ? path.join(process.env.HOME, 'Android/Sdk') : null,
    process.env.HOME ? path.join(process.env.HOME, 'Library/Android/sdk') : null,
  ].filter(Boolean)

  for (const root of roots) {
    const dir = path.join(root, 'build-tools')
    if (!existsSync(dir)) continue
    const versions = readdirSync(dir).sort().reverse()
    for (const version of versions) {
      for (const name of [tool, `${tool}.exe`, `${tool}.bat`]) {
        const candidate = path.join(dir, version, name)
        if (existsSync(candidate)) return candidate
      }
    }
  }
  return null
}

if (!existsSync(APK)) {
  console.error(`No APK at ${APK}\nRun: npx expo prebuild --platform android && (cd android && ./gradlew assembleRelease)`)
  process.exit(1)
}

const expo = JSON.parse(readFileSync(path.join(projectRoot, 'app.json'), 'utf8')).expo
const wantVersion = expo.version
const wantCode = String(expo.android.versionCode)

console.log(`app.json says ${wantVersion} (versionCode ${wantCode})\n`)

// --- Version ---------------------------------------------------------------
const aapt = findBuildTool('aapt2')
if (aapt === null) {
  problems.push('aapt2 not found, so the APK version could not be checked')
} else {
  const badging = run(aapt, ['dump', 'badging', APK])
  const gotVersion = /versionName='([^']*)'/.exec(badging)?.[1] ?? null
  const gotCode = /versionCode='([^']*)'/.exec(badging)?.[1] ?? null

  if (gotVersion === wantVersion) note(`ok    versionName ${gotVersion}`)
  else problems.push(`versionName is ${gotVersion}, app.json says ${wantVersion} — re-run expo prebuild`)

  if (gotCode === wantCode) note(`ok    versionCode ${gotCode}`)
  else problems.push(`versionCode is ${gotCode}, app.json says ${wantCode} — re-run expo prebuild`)
}

// --- Signature -------------------------------------------------------------
const apksigner = findBuildTool('apksigner')
if (apksigner === null) {
  problems.push('apksigner not found, so the signing key could not be checked')
} else {
  const certs = run(apksigner, ['verify', '--print-certs', APK])
  const got = /certificate SHA-256 digest:\s*([0-9a-f]+)/i.exec(certs)?.[1]?.toLowerCase() ?? null

  if (got === EXPECTED_CERT_SHA256) {
    note(`ok    signed with the pinned key`)
  } else {
    problems.push(
      `signed with ${got}, expected ${EXPECTED_CERT_SHA256}.\n` +
        '        This APK cannot update an existing install. Check that\n' +
        '        credentials/macrofit-release.keystore is present and that prebuild ran.',
    )
  }
}

// --- Freshness -------------------------------------------------------------
/*
  The home-screen widget fixes (ring from 12 o'clock, the OnePlus crop, the "Open with"
  chooser) were committed nine minutes after the last release build, and that build was the
  one waiting to be installed: every fix missing, nothing to say so. As make would have it, a
  build older than any file that goes into it is stale.
*/
const BUILD_INPUTS = ['app', 'src', 'patches', 'plugins', 'assets', 'index.ts', 'app.json', 'package.json', 'package-lock.json']
const apkTime = statSync(APK).mtimeMs
const newest = run('git', ['-C', projectRoot, 'ls-files', '--', ...BUILD_INPUTS])
  .split('\n')
  .filter(file => file && existsSync(path.join(projectRoot, file)))
  .reduce(
    (latest, file) => {
      const time = statSync(path.join(projectRoot, file)).mtimeMs
      return time > latest.time ? { file, time } : latest
    },
    { file: null, time: 0 },
  )
if (newest.time <= apkTime) note('ok    built after its last source change')
else problems.push(`built before ${newest.file} last changed — rebuild`)

// --- Patches ---------------------------------------------------------------
/*
  patches/ reaches the build only through node_modules: postinstall applies it, gradle
  compiles whatever is there. A build from before a patch was written carries the library as
  published, silently. Each patch here leaves a string in the dex that only its code contains.
*/
const PATCH_MARKERS = [
  // AppWidgetManager.OPTION_APPWIDGET_SIZES, which javac inlines into getPortraitSize.
  { patch: 'react-native-android-widget', marker: 'appWidgetSizes' },
]

/** The APK's entries whose names match `pattern`, uncompressed. An APK is a plain zip. */
const readZipEntries = (file, pattern) => {
  const zip = readFileSync(file)
  let end = zip.length - 22
  while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) end--
  const count = zip.readUInt16LE(end + 10)
  let at = zip.readUInt32LE(end + 16)
  const entries = []
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(at + 10)
    const size = zip.readUInt32LE(at + 20)
    const nameLength = zip.readUInt16LE(at + 28)
    const local = zip.readUInt32LE(at + 42)
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength)
    at += 46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32)
    if (!pattern.test(name)) continue
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
    const data = zip.subarray(start, start + size)
    entries.push(method === 0 ? data : inflateRawSync(data))
  }
  return entries
}

const dex = readZipEntries(APK, /^classes\d*\.dex$/)
for (const { patch, marker } of PATCH_MARKERS) {
  if (dex.some(file => file.includes(marker))) note(`ok    patched ${patch}`)
  else problems.push(`${patch} is unpatched — run npm install (it applies patches/), then rebuild`)
}

if (problems.length === 0) {
  console.log('\nSafe to publish.')
  process.exit(0)
}

console.log('')
for (const problem of problems) console.error(`  FAIL  ${problem}`)
console.error(`\n${problems.length} problem(s). Do not publish this APK.`)
process.exit(1)
