import { Platform } from 'react-native'
import * as Application from 'expo-application'
import * as IntentLauncher from 'expo-intent-launcher'
import { Directory, File, Paths } from 'expo-file-system'
import { getContentUriAsync } from 'expo-file-system/legacy'

/**
 * In-app update: check a manifest, download the APK, hand it to Android's installer.
 *
 * WHY IT IS BUILT THIS WAY:
 * The app is sideloaded, so there is no store to deliver updates. The manifest URL is read from
 * the environment rather than hardcoded, for one specific reason: the GitHub repository is
 * private, and the only way to fetch a private repo's release asset is with a token. A token
 * shipped inside an APK is not a secret — anyone holding the file can read it out and reach the
 * whole repository. So this takes a plain URL that serves public bytes, and where those bytes
 * live is a deployment decision rather than something compiled in.
 *
 * WHAT IT CANNOT DO:
 * Nothing here installs silently. Android hands the APK to the package installer, which asks the
 * user, and refuses outright unless this app holds REQUEST_INSTALL_PACKAGES and the user has
 * allowed it to install unknown apps. That is the platform working correctly; an app that could
 * replace itself without being asked would be a far worse thing to ship.
 *
 * The replacement must also be signed with the same key as the installed copy. A different key
 * fails with INSTALL_FAILED_UPDATE_INCOMPATIBLE and the only way out is uninstalling, which
 * takes the user's local data with it.
 */

/** Serves the manifest below. Absent in development and in any build that has no host yet. */
const UPDATE_URL = process.env.EXPO_PUBLIC_UPDATE_URL

const FETCH_TIMEOUT_MS = 10_000

/**
 * What the manifest must contain.
 *
 * `versionCode` is compared, not `version`. It is an integer that only ever increases, so the
 * comparison is arithmetic rather than a semver parse — and it is the number Android itself uses
 * to decide whether an APK is an upgrade or a downgrade.
 */
export interface UpdateManifest {
  versionCode: number
  version: string
  apkUrl: string
  notes?: string
}

export interface UpdateCheck {
  /** The running build, so the UI can state what it compared against. */
  currentVersionCode: number
  currentVersion: string
  available: UpdateManifest | null
}

export const updatesConfigured = (): boolean =>
  Platform.OS === 'android' && typeof UPDATE_URL === 'string' && UPDATE_URL.length > 0

const currentVersionCode = (): number => {
  // nativeBuildVersion is the versionCode on Android, as a string. Non-numeric means something
  // is wrong with the build, and treating that as 0 would offer an update on every launch.
  const raw = Application.nativeBuildVersion
  const parsed = raw === null ? NaN : Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER
}

const isManifest = (value: unknown): value is UpdateManifest => {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.versionCode === 'number' &&
    Number.isFinite(record.versionCode) &&
    typeof record.version === 'string' &&
    record.version.length > 0 &&
    typeof record.apkUrl === 'string' &&
    // Refuse plaintext: this URL becomes an executable on the user's phone, and a download that
    // can be intercepted is a download that can be replaced.
    record.apkUrl.startsWith('https://')
  )
}

/**
 * Returns what is installed and what is newer, or throws with a sentence worth showing.
 */
export const checkForUpdate = async (): Promise<UpdateCheck> => {
  const installed = currentVersionCode()
  const current: UpdateCheck = {
    currentVersionCode: installed,
    currentVersion: Application.nativeApplicationVersion ?? '—',
    available: null,
  }

  if (!updatesConfigured()) return current

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    // cache: 'no-store' because a cached manifest is the one thing this must never read: it
    // would keep reporting an old version long after a release went out.
    const response = await fetch(UPDATE_URL as string, {
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`The update server answered ${response.status}.`)

    const payload: unknown = await response.json()
    if (!isManifest(payload)) {
      throw new Error('The update information was not in a shape this app understands.')
    }

    return {
      ...current,
      available: payload.versionCode > installed ? payload : null,
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The update check timed out. Check your connection and try again.')
    }
    throw error instanceof Error ? error : new Error('The update check failed.')
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Downloads the APK and opens the installer. Resolves once the installer has been handed the
 * file — not once it has installed, which is the user's decision and happens outside this app.
 */
export const downloadAndInstall = async (manifest: UpdateManifest): Promise<void> => {
  if (Platform.OS !== 'android') throw new Error('Updates install on Android only.')

  /*
    Cache, not documents: this file is disposable the moment the installer has read it, and a
    50 MB APK left in a backed-up directory is 50 MB the user never asked to keep.
  */
  const target = new Directory(Paths.cache, 'updates')
  if (!target.exists) target.create({ intermediates: true })

  // A stale partial download from an interrupted attempt would otherwise be handed to the
  // installer as if it were whole.
  const existing = new File(target, `macrofit-${manifest.versionCode}.apk`)
  if (existing.exists) existing.delete()

  const file = await File.downloadFileAsync(manifest.apkUrl, existing)

  /*
    The installer is a different app, so it cannot read a file:// path inside this app's sandbox.
    getContentUriAsync produces a content:// URI through the FileProvider expo-file-system
    registers, and the read permission is granted to whoever receives the intent.
  */
  const contentUri = await getContentUriAsync(file.uri)

  await IntentLauncher.startActivityAsync('android.intent.action.INSTALL_PACKAGE', {
    data: contentUri,
    // FLAG_GRANT_READ_URI_PERMISSION. Without it the installer receives a URI it is not
    // allowed to open and fails with a parse error that says nothing about permissions.
    flags: 1,
  })
}
