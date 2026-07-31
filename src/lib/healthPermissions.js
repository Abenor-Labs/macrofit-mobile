/**
 * The Health Connect permissions this app uses — one list, two consumers.
 *
 * WHY THIS EXISTS:
 * A Health Connect read needs agreement in two places that used to be edited by hand, and had
 * already drifted: the `android.permission.health.*` entries in AndroidManifest.xml (written at
 * prebuild by plugins/with-health-connect-permissions.js) and the `{accessType, recordType}` set
 * passed to `requestPermission` at runtime. app.json declared READ_BODY_FAT that
 * src/lib/healthConnect.ts never asked for.
 *
 * That direction is only untidy. The reverse — requesting a permission the manifest does not
 * declare — fails inside the Health Connect permission Activity, below the JS bridge, where the
 * try/catch in healthConnect.ts cannot see it, and the process dies mid-tap. Nothing structural
 * prevented it, because the two lists were two files that happened to agree.
 *
 * So a permission is written once here and both spellings are derived from it. Adding one is a
 * single line, and the manifest cannot fall behind the request.
 *
 * WHY ACCESS IS NOW PER ENTRY:
 * The list used to be record types only, with `accessType: 'read'` hardcoded in the mapper. That
 * made writing structurally impossible, which is why a weight logged in MacroFit never reached
 * Health Connect or Google Fit however many times the user asked it to. Access belongs to the
 * record, not to the loop.
 *
 * WHY THIS IS .js AND NOT .ts:
 * The config plugin is required by Node during `expo prebuild`, which does not resolve relative
 * TypeScript imports — app.config.ts importing a .ts module fails with "Cannot find module".
 * Plain CommonJS is the only format both the prebuild plugin and Metro can read, so this file
 * stays JS and carries its types in JSDoc. `allowJs` is on, so tsc still checks it.
 *
 * Health Connect has no record type for age or sex, which is why setup asks for those by hand
 * however many types get added below.
 *
 * @typedef {'Steps' | 'Weight' | 'Height'} HealthRecordType
 * @typedef {'read' | 'readwrite'} HealthAccess
 * @typedef {{ recordType: HealthRecordType, access: HealthAccess }} HealthPermissionSpec
 */

/**
 * Every record type this app touches, and what it does with it.
 *
 * Keep the HealthRecordType union above in step — tsc fails this assignment otherwise, which is
 * the point: the mismatch surfaces here rather than as a native crash on the user's phone.
 *
 * @type {readonly HealthPermissionSpec[]}
 */
const HEALTH_PERMISSIONS = [
  { recordType: 'Steps', access: 'read' },
  // Read to import past weigh-ins; write so a weight logged here reaches Health Connect, and
  // through it any other app the user has pointed at their health record.
  { recordType: 'Weight', access: 'readwrite' },
  // Height is read so setup can prefill it. Nothing in the app ever sets a height.
  { recordType: 'Height', access: 'read' },
]

/**
 * Android 14+ restricts every read to the last 30 days unless this is granted.
 *
 * Without it `readWeightHistory(profile, 365)` silently returns at most a month, while the
 * onboarding copy promises "any weigh-ins already recorded by a scale or another app". It is
 * requested separately from the record permissions because Health Connect models it separately,
 * and it is treated as optional everywhere: a refusal means a shorter import, not a broken one.
 */
const HISTORY_PERMISSION_NAME = 'READ_HEALTH_DATA_HISTORY'

/**
 * `'BodyFat'` -> `'BODY_FAT'`, matching how Health Connect spells its permission names.
 *
 * @param {string} recordType
 * @returns {string}
 */
const screamingSnake = recordType => recordType.replace(/(?!^)([A-Z])/g, '_$1').toUpperCase()

/**
 * Permission name suffixes for the manifest, e.g. `'READ_STEPS'`, `'WRITE_WEIGHT'`. The plugin
 * prefixes `android.permission.health.` itself.
 *
 * A `readwrite` record yields two entries. Health Connect has no combined permission; read and
 * write are separate grants the user can accept independently, which is exactly why the runtime
 * check has to look at them individually too.
 *
 * @returns {string[]}
 */
const healthManifestPermissions = () => {
  const names = []
  for (const { recordType, access } of HEALTH_PERMISSIONS) {
    names.push(`READ_${screamingSnake(recordType)}`)
    if (access === 'readwrite') names.push(`WRITE_${screamingSnake(recordType)}`)
  }
  names.push(HISTORY_PERMISSION_NAME)
  return names
}

/**
 * The shape `react-native-health-connect`'s `requestPermission` expects.
 *
 * @returns {{ accessType: 'read' | 'write', recordType: string }[]}
 */
const healthRuntimePermissions = () => {
  /** @type {{ accessType: 'read' | 'write', recordType: string }[]} */
  const permissions = []
  for (const { recordType, access } of HEALTH_PERMISSIONS) {
    permissions.push({ accessType: /** @type {'read'} */ ('read'), recordType })
    if (access === 'readwrite') {
      permissions.push({ accessType: /** @type {'write'} */ ('write'), recordType })
    }
  }
  // Health Connect models the history grant as a pseudo record type on the same request.
  permissions.push({
    accessType: /** @type {'read'} */ ('read'),
    recordType: 'ReadHealthDataHistory',
  })
  return permissions
}

module.exports = {
  HEALTH_PERMISSIONS,
  HISTORY_PERMISSION_NAME,
  healthManifestPermissions,
  healthRuntimePermissions,
}
