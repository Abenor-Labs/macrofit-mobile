/**
 * The Health Connect permissions this app uses — one list, three consumers.
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
 * WHY ACCESS IS PER ENTRY:
 * The list used to be record types only, with `accessType: 'read'` hardcoded in the mapper. That
 * made writing structurally impossible, which is why a weight logged in MacroFit never reached
 * Health Connect or Google Fit however many times the user asked it to. Access belongs to the
 * record, not to the loop.
 *
 * WHY TIERS:
 * "Connected" cannot mean "granted all eleven of these". Health Connect shows one switch per
 * permission and users flip the ones they understand, so a definition that demands the whole set
 * would park almost everyone in "Partly connected" forever and make the phrase meaningless. Core
 * is what the app needs to do its original job; optional is what each added feature needs, and a
 * refusal there disables that feature and nothing else.
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
 * @typedef {'Steps'
 *   | 'Weight'
 *   | 'Height'
 *   | 'TotalCaloriesBurned'
 *   | 'ActiveCaloriesBurned'
 *   | 'BasalMetabolicRate'
 *   | 'BodyFat'
 *   | 'Nutrition'
 *   | 'Hydration'
 *   | 'ExerciseSession'} HealthRecordType
 * @typedef {'read' | 'write' | 'readwrite'} HealthAccess
 * @typedef {'core' | 'optional'} HealthTier
 * @typedef {{ recordType: HealthRecordType, access: HealthAccess, tier: HealthTier }} HealthPermissionSpec
 */

/**
 * Every record type this app touches, and what it does with it.
 *
 * The access column follows one rule: read what the phone or a scale measures, write what the
 * user tells this app, and do both only where both are true. Bodyweight is the obvious both —
 * a scale records it and the user also types it in. Meals are the obvious write: no other app
 * knows what MacroFit was told, and MacroFit does not want another app's guess at it.
 *
 * Keep the HealthRecordType union above in step — tsc fails this assignment otherwise, which is
 * the point: the mismatch surfaces here rather than as a native crash on the user's phone.
 *
 * @type {readonly HealthPermissionSpec[]}
 */
const HEALTH_PERMISSIONS = [
  // --- Core: what the app needed before any of this was added --------------------------
  { recordType: 'Steps', access: 'read', tier: 'core' },
  // Read to import past weigh-ins; write so a weight logged here reaches Health Connect, and
  // through it any other app the user has pointed at their health record.
  { recordType: 'Weight', access: 'readwrite', tier: 'core' },
  // Height is read so setup can prefill it. Nothing in the app ever sets a height.
  { recordType: 'Height', access: 'read', tier: 'core' },

  // --- Optional: one feature each, and a refusal costs only that feature ---------------
  /*
    Measured energy expenditure, against which the app's own TDEE is a formula.

    Total is active plus basal and is the directly comparable number. Active is read as well
    because a phone that has one often lacks the other, and active plus the app's own BMR is a
    better estimate than the activity-multiplier guess it would otherwise fall back to.

    Both are frequently empty. Samsung Health, Fitbit and Garmin write them; Google Fit largely
    does not, so a phone with only Fit grants the permission and still returns nothing. Every
    consumer has to treat absence as "no answer" rather than as zero.
  */
  { recordType: 'TotalCaloriesBurned', access: 'read', tier: 'optional' },
  { recordType: 'ActiveCaloriesBurned', access: 'read', tier: 'optional' },
  // Smart scales record a measured BMR. The app calculates one from height, weight, age and sex.
  { recordType: 'BasalMetabolicRate', access: 'read', tier: 'optional' },
  // Read a scale's measurement in preference to the app's estimate from tape measurements;
  // write the estimate back for anyone who has no scale.
  { recordType: 'BodyFat', access: 'readwrite', tier: 'optional' },
  // Write only. What the user ate is something this app is told and nothing else knows.
  { recordType: 'Nutrition', access: 'write', tier: 'optional' },
  { recordType: 'Hydration', access: 'write', tier: 'optional' },
  // Write only. Logged sessions were invisible outside the app until this existed.
  { recordType: 'ExerciseSession', access: 'write', tier: 'optional' },
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
 * Record types whose permission is not named after the record.
 *
 * Health Connect names most permissions after the record type, so `BodyFat` is guarded by
 * `READ_BODY_FAT` and the conversion below is mechanical. A few are named after the DATA TYPE
 * instead: `ExerciseSessionRecord` is guarded by `READ_EXERCISE`, and `SleepSessionRecord` by
 * `READ_SLEEP`.
 *
 * This matters here and nowhere else. The runtime request is safe either way, because the native
 * module resolves `{recordType: 'ExerciseSession'}` through androidx's own
 * `HealthPermission.getWritePermission(ExerciseSessionRecord::class)`. The manifest is generated
 * from a string, so without this map it would declare `WRITE_EXERCISE_SESSION` — a permission
 * that does not exist — and omit the one actually being requested. That is precisely the
 * declared-versus-requested mismatch this module exists to make impossible, and it fails inside
 * the permission Activity where nothing in JS can catch it.
 *
 * SleepSession is listed although the app does not use it, because the next person to add sleep
 * should find the answer here rather than the crash.
 *
 * @type {Record<string, string>}
 */
const PERMISSION_NAME_OVERRIDES = {
  ExerciseSession: 'EXERCISE',
  SleepSession: 'SLEEP',
}

/**
 * `'BodyFat'` -> `'BODY_FAT'`, matching how Health Connect spells its permission names, except
 * where PERMISSION_NAME_OVERRIDES says otherwise.
 *
 * @param {string} recordType
 * @returns {string}
 */
const permissionSuffix = recordType =>
  PERMISSION_NAME_OVERRIDES[recordType] ??
  recordType.replace(/(?!^)([A-Z])/g, '_$1').toUpperCase()

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
    const suffix = permissionSuffix(recordType)
    if (access === 'read' || access === 'readwrite') names.push(`READ_${suffix}`)
    if (access === 'write' || access === 'readwrite') names.push(`WRITE_${suffix}`)
  }
  names.push(HISTORY_PERMISSION_NAME)
  return names
}

/**
 * The shape `react-native-health-connect`'s `requestPermission` expects.
 *
 * Record types here, not permission names: the native side maps them through androidx, so the
 * overrides above are deliberately not applied.
 *
 * @returns {{ accessType: 'read' | 'write', recordType: string }[]}
 */
const healthRuntimePermissions = () => {
  /** @type {{ accessType: 'read' | 'write', recordType: string }[]} */
  const permissions = []
  for (const { recordType, access } of HEALTH_PERMISSIONS) {
    if (access === 'read' || access === 'readwrite') {
      permissions.push({ accessType: /** @type {'read'} */ ('read'), recordType })
    }
    if (access === 'write' || access === 'readwrite') {
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
  PERMISSION_NAME_OVERRIDES,
  healthManifestPermissions,
  healthRuntimePermissions,
}
