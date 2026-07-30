/**
 * The Health Connect record types this app reads — one list, two consumers.
 *
 * WHY THIS EXISTS:
 * A Health Connect read needs agreement in two places that used to be edited by hand, and had
 * already drifted: the `android.permission.health.*` entries in AndroidManifest.xml (written at
 * prebuild by plugins/with-health-connect-permissions.js) and the `{accessType, recordType}` set
 * passed to `requestPermission` at runtime. app.json declared READ_BODY_FAT that
 * src/lib/healthConnect.ts never asked for.
 *
 * That direction is only untidy. The reverse — requesting a type the manifest does not declare —
 * fails inside the Health Connect permission Activity, below the JS bridge, where the try/catch
 * in healthConnect.ts cannot see it, and the process dies mid-tap. Nothing structural prevented
 * it, because the two lists were two files that happened to agree.
 *
 * So a record type is written once here and both spellings are derived from it. Adding one is a
 * single line, and the manifest cannot fall behind the request.
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
 * @typedef {'Steps' | 'Weight' | 'Height'} HealthReadRecordType
 */

/**
 * Record types read today. Add one here and both the manifest and the runtime request follow.
 *
 * Keep the HealthReadRecordType union above in step — tsc fails this assignment otherwise, which
 * is the point: the mismatch surfaces here rather than as a native crash on the user's phone.
 *
 * @type {readonly HealthReadRecordType[]}
 */
const HEALTH_READ_RECORD_TYPES = [
  'Steps',
  'Weight',
  // Height is read so setup can prefill it.
  'Height',
]

/**
 * `'BodyFat'` -> `'BODY_FAT'`, matching how Health Connect spells its permission names.
 *
 * @param {string} recordType
 * @returns {string}
 */
const screamingSnake = recordType => recordType.replace(/(?!^)([A-Z])/g, '_$1').toUpperCase()

/**
 * Permission name suffixes for the manifest, e.g. `'READ_STEPS'`. The plugin prefixes
 * `android.permission.health.` itself.
 *
 * @returns {string[]}
 */
const healthManifestPermissions = () =>
  HEALTH_READ_RECORD_TYPES.map(recordType => `READ_${screamingSnake(recordType)}`)

/**
 * The shape `react-native-health-connect`'s `requestPermission` expects.
 *
 * @returns {{ accessType: 'read', recordType: HealthReadRecordType }[]}
 */
const healthRuntimePermissions = () =>
  HEALTH_READ_RECORD_TYPES.map(recordType => ({
    accessType: /** @type {'read'} */ ('read'),
    recordType,
  }))

module.exports = {
  HEALTH_READ_RECORD_TYPES,
  healthManifestPermissions,
  healthRuntimePermissions,
}
