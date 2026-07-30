const { withAndroidManifest } = require('@expo/config-plugins')
const { healthManifestPermissions } = require('../src/lib/healthPermissions')

/**
 * Declares the Health Connect reads in AndroidManifest.xml.
 *
 * WHY THIS EXISTS AT ALL:
 * `react-native-health-connect` ships its own config plugin, and that plugin's whole body is one
 * `push` of the ACTION_SHOW_PERMISSIONS_RATIONALE intent-filter — it takes no props and declares
 * no permissions. So the manifest came out of every `expo prebuild` with the rationale filter
 * present and not a single `android.permission.health.*` on it, which reads like the permissions
 * were configured when nothing had been.
 *
 * That is not a cosmetic gap: `requestPermission` for a permission the manifest does not declare
 * fails inside the Health Connect permission Activity, below the JS bridge, where the try/catch
 * around it in src/lib/healthConnect.ts cannot see it.
 *
 * Note on history — the crash this plugin was written for was NOT that failure. The app died on
 * `HealthConnectPermissionDelegate`'s uninitialised `lateinit` launcher, before any permission
 * Activity started, and kept dying with these permissions correctly declared. See
 * plugins/with-health-connect-delegate.js. Declaring the reads was necessary and not sufficient.
 *
 * `/android` is gitignored and CI runs `expo prebuild --clean`, so hand-editing the
 * generated manifest fixes one laptop and nothing else. The fix has to be a plugin.
 */

/** The Health Connect provider package, as APK-installed. */
const PROVIDER_PACKAGE = 'com.google.android.apps.healthdata'

/**
 * Takes no props on purpose. The list used to arrive from app.json, which meant the manifest and
 * the runtime `requestPermission` set were two hand-kept lists free to drift — and they had, by a
 * READ_BODY_FAT that nothing ever requested. Both now derive from src/lib/healthPermissions.js.
 */
const withHealthConnectPermissions = config => {
  const permissions = healthManifestPermissions()

  return withAndroidManifest(config, mod => {
    const manifest = mod.modResults.manifest

    // --- uses-permission ---------------------------------------------------
    manifest['uses-permission'] = manifest['uses-permission'] ?? []
    for (const name of permissions) {
      const qualified = `android.permission.health.${name}`
      const already = manifest['uses-permission'].some(
        entry => entry.$?.['android:name'] === qualified
      )
      if (!already) manifest['uses-permission'].push({ $: { 'android:name': qualified } })
    }

    // --- <queries> ---------------------------------------------------------
    // Package visibility is filtered from API 30 up. Without this entry `getSdkStatus`
    // reports the provider as unavailable on a phone that has it installed.
    manifest.queries = manifest.queries ?? []
    if (manifest.queries.length === 0) manifest.queries.push({})
    const queries = manifest.queries[0]
    queries.package = queries.package ?? []
    if (!queries.package.some(entry => entry.$?.['android:name'] === PROVIDER_PACKAGE)) {
      queries.package.push({ $: { 'android:name': PROVIDER_PACKAGE } })
    }

    // --- rationale alias for API 34+ ---------------------------------------
    // The vendored plugin's intent-filter covers Android 13 and below. API 34 replaced that
    // route with this alias, and Health Connect refuses the request outright when the
    // calling app has no way to show a rationale. Both have to be present.
    const application = manifest.application?.[0]
    if (application) {
      application['activity-alias'] = application['activity-alias'] ?? []
      const exists = application['activity-alias'].some(
        entry => entry.$?.['android:name'] === 'ViewPermissionUsageActivity'
      )
      if (!exists) {
        application['activity-alias'].push({
          $: {
            'android:name': 'ViewPermissionUsageActivity',
            'android:exported': 'true',
            'android:targetActivity': '.MainActivity',
            'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
          },
          'intent-filter': [
            {
              action: [{ $: { 'android:name': 'android.intent.action.VIEW_PERMISSION_USAGE' } }],
              category: [{ $: { 'android:name': 'android.intent.category.HEALTH_PERMISSIONS' } }],
            },
          ],
        })
      }
    }

    return mod
  })
}

module.exports = withHealthConnectPermissions
