const { withMainActivity } = require('@expo/config-plugins')
const { addImports } = require('@expo/config-plugins/build/android/codeMod')

/**
 * Registers the Health Connect permission delegate in MainActivity.
 *
 * WHY THIS EXISTS AT ALL:
 * `HealthConnectPermissionDelegate` holds two `lateinit` ActivityResultLaunchers, and the only
 * thing that ever assigns them is `setPermissionDelegate(activity)`. Nothing in
 * `react-native-health-connect` calls it. The string appears exactly twice in the whole
 * package: the declaration, and its README, where it is written as a MainActivity edit you are
 * expected to make by hand. The library's own config plugin does not do it for you.
 *
 * Skip it and `requestPermission()` reaches `launchPermissionsDialog()`, touches the unassigned
 * launcher and throws on a `Dispatchers.IO` worker — off the JS thread, so the try/catch around
 * it in src/lib/healthConnect.ts cannot see it and the process dies mid-tap:
 *
 *   FATAL EXCEPTION: DefaultDispatcher-worker-1
 *   kotlin.UninitializedPropertyAccessException: lateinit property requestPermission has not been initialized
 *     at dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate.launchPermissionsDialog
 *     at dev.matinzd.healthconnect.HealthConnectManager$requestPermission$1$1.invokeSuspend
 *
 * This is a separate failure from the manifest gap with-health-connect-permissions.js closes,
 * and it happens earlier on the same tap. Declaring the permissions was necessary and not
 * sufficient: with them declared and no delegate, the app still dies before the Health Connect
 * permission Activity is ever launched.
 *
 * `/android` is gitignored and CI runs `expo prebuild --clean`, so editing the generated
 * MainActivity fixes one laptop and ships the crash to everyone else. It has to be a mod.
 */

const DELEGATE_IMPORT = 'dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate'
const DELEGATE_CALL = 'HealthConnectPermissionDelegate.setPermissionDelegate(this)'

/**
 * `registerForActivityResult` has to run before the Activity reaches STARTED, so the call
 * belongs in `onCreate` directly after `super`. Matched on the super call rather than on the
 * override signature because the Expo template passes `null` to drop saved state, and a future
 * template may not.
 *
 * Horizontal whitespace only. `\s*` here reaches across the newline and swallows the indent of
 * whatever follows, which drags the closing brace of `onCreate` up onto the inserted line.
 */
const SUPER_ON_CREATE = /(super\.onCreate\([^)]*\)[ \t]*;?)/

/** Used only when the template ships no onCreate override for the call to sit inside. */
const ON_CREATE_OVERRIDE = `
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    ${DELEGATE_CALL}
  }
`

const withHealthConnectDelegate = config =>
  withMainActivity(config, mod => {
    const isJava = mod.modResults.language === 'java'
    let contents = mod.modResults.contents

    // Prebuild can run more than once over the same file. Adding the call twice would
    // register two launchers and leak the first.
    if (contents.includes(DELEGATE_CALL)) return mod

    contents = addImports(contents, [DELEGATE_IMPORT], isJava)

    if (SUPER_ON_CREATE.test(contents)) {
      contents = contents.replace(SUPER_ON_CREATE, `$1\n    ${DELEGATE_CALL}${isJava ? ';' : ''}`)
    } else if (isJava) {
      // Nothing to anchor to and no Java override worth generating blind. Fail the prebuild
      // rather than emit an app whose only symptom is a native crash on one tap.
      throw new Error(
        '[with-health-connect-delegate] MainActivity.java has no super.onCreate(...) to anchor ' +
          'the Health Connect delegate registration to. Without it, connecting Health Connect ' +
          'crashes the app. Add the onCreate override manually or port this mod to Java.'
      )
    } else {
      contents = addImports(contents, ['android.os.Bundle'], isJava).replace(
        /(class MainActivity\s*:\s*ReactActivity\(\)\s*\{)/,
        `$1\n${ON_CREATE_OVERRIDE}`
      )
    }

    mod.modResults.contents = contents
    return mod
  })

module.exports = withHealthConnectDelegate
