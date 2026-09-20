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
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

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

if (problems.length === 0) {
  console.log('\nSafe to publish.')
  process.exit(0)
}

console.log('')
for (const problem of problems) console.error(`  FAIL  ${problem}`)
console.error(`\n${problems.length} problem(s). Do not publish this APK.`)
process.exit(1)
