const path = require('path')
const { existsSync, readFileSync } = require('fs')
const { withAppBuildGradle } = require('@expo/config-plugins')

/**
 * Points release builds at a signing key that survives `expo prebuild`.
 *
 * WHY THIS EXISTS:
 * The generated release config signs with `signingConfigs.debug`, whose keystore lives at
 * android/app/debug.keystore — inside the directory prebuild deletes and regenerates. That is
 * survivable for a build you install by hand, and fatal for one that updates itself: Android
 * refuses to install an APK over a copy signed with a different key, and the only way out is
 * uninstalling, which takes the user's local data with it. We hit exactly that failure earlier
 * with an EAS-signed copy already on the device.
 *
 * So the key is kept outside anything generated, and this points the release build at it.
 *
 * WHICH KEY, AND WHY IT IS NOT THE ONE THIS FILE ORIGINALLY NAMED:
 * This first pinned keys/macrofit-signing.keystore, a copy of the template debug key
 * (CN=Android Debug, fac61745…), which is what v1.2.3 and everything before it shipped with.
 * v1.2.4 was then built and released signed with credentials/macrofit-release.keystore
 * (CN=MacroFit, 1edcd8dd…) while this file still named the old one — so the released APK and
 * the repo's idea of the signing key silently disagreed for a whole version.
 *
 * The real key wins, because it is the one already on people's phones: an APK signed with the
 * debug key can no longer install over v1.2.4. Anyone still on v1.2.3 or earlier is on the
 * other side of that break and has to reinstall once; there is no key that satisfies both.
 *
 * Do not point this back at keys/ to rescue those installs. It would trade a break that has
 * already happened for a fresh one affecting everyone who is current.
 *
 * NOT FOR STORE DISTRIBUTION. This is a self-signed key for sideloading. Publishing to Play
 * would want its own key, generated once and never seen again by anything but the store.
 *
 * If the keystore or its properties file is missing the plugin leaves the gradle file alone,
 * so a fresh clone still builds — it just builds something that cannot update an existing
 * install. `credentials/` is git-ignored, so that is the normal state of a fresh clone.
 */

const KEYSTORE = 'credentials/macrofit-release.keystore'

/*
  Alias and passwords are read from the git-ignored properties file beside the keystore rather
  than written here, because this file IS committed. The values land in the generated
  android/app/build.gradle, which is git-ignored in turn.
*/
const PROPERTIES = 'credentials/keystore.properties'

/** Reads `KEY=value` lines, ignoring comments and blanks. */
const readProperties = file => {
  const out = {}
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue
    const split = trimmed.indexOf('=')
    if (split === -1) continue
    out[trimmed.slice(0, split).trim()] = trimmed.slice(split + 1).trim()
  }
  return out
}

const withReleaseSigning = config =>
  withAppBuildGradle(config, mod => {
    const keystorePath = path.join(mod.modRequest.projectRoot, KEYSTORE)
    const propertiesPath = path.join(mod.modRequest.projectRoot, PROPERTIES)

    if (!existsSync(keystorePath) || !existsSync(propertiesPath)) {
      console.warn(
        `[with-release-signing] ${KEYSTORE} or ${PROPERTIES} is missing, so the release build ` +
          'will fall back to the generated debug keystore. That APK will not be able to update ' +
          'an install signed with the pinned key.'
      )
      return mod
    }

    const properties = readProperties(propertiesPath)
    const KEY_ALIAS = properties.MACROFIT_UPLOAD_KEY_ALIAS
    const STORE_PASSWORD = properties.MACROFIT_UPLOAD_STORE_PASSWORD
    const KEY_PASSWORD = properties.MACROFIT_UPLOAD_KEY_PASSWORD

    /*
      Failing loudly beats signing with whatever `undefined` stringifies to. A release built
      against a half-filled properties file is not a build error — it is an APK that looks fine
      and cannot install over anything.
    */
    if (!KEY_ALIAS || !STORE_PASSWORD || !KEY_PASSWORD) {
      throw new Error(
        `[with-release-signing] ${PROPERTIES} is missing MACROFIT_UPLOAD_KEY_ALIAS, ` +
          'MACROFIT_UPLOAD_STORE_PASSWORD or MACROFIT_UPLOAD_KEY_PASSWORD.'
      )
    }

    let contents = mod.modResults.contents

    if (contents.includes('signingConfigs.release')) return mod

    /*
      Gradle resolves a relative storeFile against the android/app directory, so the path has to
      climb out of android/app before it can reach the project root. Written with forward slashes
      because Gradle accepts them on Windows and a backslash would be read as an escape.
    */
    const relative = path
      .relative(path.join(mod.modRequest.platformProjectRoot, 'app'), keystorePath)
      .split(path.sep)
      .join('/')

    const signingBlock = `        release {
            storeFile file('${relative}')
            storePassword '${STORE_PASSWORD}'
            keyAlias '${KEY_ALIAS}'
            keyPassword '${KEY_PASSWORD}'
        }
`

    // Added after the debug block rather than replacing it: debug builds still need their own.
    const anchor = /(signingConfigs \{\s*\n\s*debug \{[\s\S]*?\n\s{8}\}\n)/
    if (!anchor.test(contents)) {
      throw new Error(
        '[with-release-signing] Could not find the debug signingConfig to anchor to. The Expo ' +
          'template changed shape, and release builds would silently keep using a keystore that ' +
          'prebuild regenerates.'
      )
    }
    contents = contents.replace(anchor, `$1${signingBlock}`)

    /*
      Only the release buildType is retargeted. Matching on the comment the template ships above
      this line keeps the replacement from hitting the debug buildType, which uses the same words.
    */
    const releaseTarget =
      /(release \{\s*\n\s*\/\/ Caution! In production[^\n]*\n\s*\/\/ see[^\n]*\n\s*)signingConfig signingConfigs\.debug/
    if (!releaseTarget.test(contents)) {
      throw new Error(
        '[with-release-signing] Could not find the release buildType signingConfig. Release ' +
          'builds would keep signing with the regenerated debug keystore.'
      )
    }
    contents = contents.replace(releaseTarget, '$1signingConfig signingConfigs.release')

    mod.modResults.contents = contents
    return mod
  })

module.exports = withReleaseSigning
