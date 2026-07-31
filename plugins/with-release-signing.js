const path = require('path')
const { existsSync } = require('fs')
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
 * So the key is kept at keys/macrofit-signing.keystore, outside anything generated, and this
 * points the release build at it. It is the same key the debug keystore already held, copied
 * rather than replaced on purpose: a brand new key would have been unable to install over the
 * build already on the phone.
 *
 * NOT FOR STORE DISTRIBUTION. This is a self-signed key for sideloading. Publishing to Play
 * would want its own key, generated once and never seen again by anything but the store.
 *
 * If the keystore is missing the plugin leaves the gradle file alone, so a fresh clone still
 * builds — it just builds something that cannot update an existing install.
 */

const KEYSTORE = 'keys/macrofit-signing.keystore'

/** The debug keystore's own well-known credentials; the file is the secret, not these. */
const STORE_PASSWORD = 'android'
const KEY_ALIAS = 'androiddebugkey'
const KEY_PASSWORD = 'android'

const withReleaseSigning = config =>
  withAppBuildGradle(config, mod => {
    const keystorePath = path.join(mod.modRequest.projectRoot, KEYSTORE)

    if (!existsSync(keystorePath)) {
      console.warn(
        `[with-release-signing] ${KEYSTORE} is missing, so the release build will fall back to ` +
          'the generated debug keystore. That APK will not be able to update an install signed ' +
          'with the pinned key.'
      )
      return mod
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
