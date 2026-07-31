import { Platform } from 'react-native'
import * as Application from 'expo-application'
import * as IntentLauncher from 'expo-intent-launcher'
import { Directory, File, Paths } from 'expo-file-system'
import { getContentUriAsync } from 'expo-file-system/legacy'

/**
 * In-app update, served straight from the repository's GitHub releases.
 *
 * WHY GITHUB AND NOT A MANIFEST WE HOST:
 * Publishing a release is then the whole release process — there is no second endpoint to keep
 * in step with the tags, and no way for the two to disagree about what the newest build is.
 * This only works because the repository is public: a private repo's release asset needs a
 * token, and a token inside an APK is not a secret, since anyone holding the file can read it
 * out and reach the whole repository.
 *
 * WHAT IT CANNOT DO:
 * Nothing installs silently. Android hands the APK to the package installer, which asks the
 * user, and refuses outright unless this app holds REQUEST_INSTALL_PACKAGES and the user has
 * allowed it to install unknown apps. The replacement must also carry the same signature as the
 * installed copy; a different key fails with INSTALL_FAILED_UPDATE_INCOMPATIBLE, and the only
 * way out is uninstalling, which takes the user's local data with it.
 */

const RELEASES_URL = 'https://api.github.com/repos/warpirate/macrofit-mobile/releases/latest'

const FETCH_TIMEOUT_MS = 10_000

export interface AvailableRelease {
  version: string
  apkUrl: string
  /**
   * Exact size of the APK in bytes, as GitHub reports it.
   *
   * Carried so a download already on disk can be told apart from a half-finished one. Without
   * a figure to check against, "the file exists" and "the file is complete" are the same
   * observation, and the safe reading of that ambiguity costs the user the whole download.
   */
  sizeBytes: number | null
  notes?: string
}

export interface UpdateCheck {
  currentVersion: string
  available: AvailableRelease | null
}

/**
 * Parses '1.2.0', 'v1.2.0' or 'v1.2.0-rc.1' into comparable parts.
 *
 * The prerelease suffix is kept because it orders *below* the same numbers without it: 1.2.0-rc.1
 * must not read as newer than 1.2.0, or every release candidate would offer itself as an upgrade
 * over the final build that replaced it.
 */
const parseVersion = (raw: string): { parts: number[]; prerelease: boolean } | null => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(-.+)?$/.exec(raw.trim())
  if (!match) return null
  return {
    parts: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] !== undefined,
  }
}

/** Returns true when `candidate` is strictly newer than `installed`. */
const isNewer = (candidate: string, installed: string): boolean => {
  const a = parseVersion(candidate)
  const b = parseVersion(installed)
  // An unparseable version on either side is treated as "no update". Offering one on a guess is
  // worse than missing one: the cost of a wrong guess is a failed or unwanted install.
  if (!a || !b) return false

  for (let i = 0; i < 3; i += 1) {
    if (a.parts[i] > b.parts[i]) return true
    if (a.parts[i] < b.parts[i]) return false
  }
  // Same numbers: a final release beats the prerelease of it, and nothing beats a final.
  return b.prerelease && !a.prerelease
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * Finds the release's APK.
 *
 * GitHub returns every asset attached to the release, so a mapping file or a checksum sitting
 * alongside the build must not be handed to the installer as though it were the app.
 */
const findApk = (assets: unknown): { url: string; size: number | null } | null => {
  if (!Array.isArray(assets)) return null
  for (const asset of assets) {
    if (!isRecord(asset)) continue
    const name = typeof asset.name === 'string' ? asset.name : ''
    const url = asset.browser_download_url
    if (name.toLowerCase().endsWith('.apk') && typeof url === 'string' && url.startsWith('https://')) {
      const size = typeof asset.size === 'number' && asset.size > 0 ? asset.size : null
      return { url, size }
    }
  }
  return null
}

/**
 * Returns the installed version and whatever is newer, or throws with a sentence worth showing.
 */
export const checkForUpdate = async (): Promise<UpdateCheck> => {
  const currentVersion = Application.nativeApplicationVersion ?? '—'
  const current: UpdateCheck = { currentVersion, available: null }

  if (Platform.OS !== 'android') return current

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(RELEASES_URL, {
      signal: controller.signal,
      // GitHub rejects requests without a User-Agent, and answers the documented shape only for
      // callers that ask for this media type by name.
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'MacroFit-Android',
      },
      cache: 'no-store',
    })

    if (response.status === 404) {
      throw new Error('No releases have been published yet.')
    }
    if (response.status === 403) {
      // Unauthenticated GitHub allows 60 requests an hour per address, and says so this way.
      throw new Error('GitHub is rate limiting this device. Try again in a little while.')
    }
    if (!response.ok) throw new Error(`GitHub answered ${response.status}.`)

    const payload: unknown = await response.json()
    if (!isRecord(payload) || typeof payload.tag_name !== 'string') {
      throw new Error('That release could not be read.')
    }

    /*
      The comparison is ours to make, not GitHub's. "Latest" there means most recently published,
      not highest version — publishing a patch after a release candidate makes the patch latest —
      so trusting the label would offer downgrades as upgrades.
    */
    if (!isNewer(payload.tag_name, currentVersion)) return current

    const apk = findApk(payload.assets)
    if (apk === null) {
      throw new Error(`Release ${payload.tag_name} has no APK attached to it.`)
    }

    return {
      currentVersion,
      available: {
        version: payload.tag_name.replace(/^v/, ''),
        apkUrl: apk.url,
        sizeBytes: apk.size,
        notes: typeof payload.body === 'string' && payload.body.trim().length > 0
          ? payload.body.trim()
          : undefined,
      },
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

/** How far a download has got. `total` is null when the server sends no content length. */
export interface DownloadProgressReport {
  written: number
  total: number | null
  /** 0 to 1, or null when the total is unknown. */
  fraction: number | null
}

/**
 * Downloads the APK and opens the installer. Resolves once Android has been handed the file —
 * not once it is installed, which happens outside this app and is the user's decision.
 *
 * Returns whether bytes were actually fetched, so the caller can avoid reporting a download
 * that did not happen. `onProgress` is optional; without it the transfer still runs, just
 * silently.
 */
export const downloadAndInstall = async (
  release: AvailableRelease,
  onProgress?: (report: DownloadProgressReport) => void,
): Promise<{ downloaded: boolean }> => {
  if (Platform.OS !== 'android') throw new Error('Updates install on Android only.')

  /*
    Cache, not documents: the file is disposable the moment the installer has read it, and a
    100 MB APK left in a backed-up directory is 100 MB the user never asked to keep.
  */
  const target = new Directory(Paths.cache, 'updates')
  if (!target.exists) target.create({ intermediates: true })

  const destination = new File(target, `macrofit-${release.version}.apk`)

  /*
    Reuse a copy that is already here and provably whole.

    This used to delete any existing file before downloading, on the sound reasoning that a
    truncated file must never reach the installer. The trouble is that "exists" and "is
    complete" were the same observation, so the safe reading of that ambiguity threw away
    finished downloads too — and dismissing Android's install prompt, or missing it, meant
    fetching a hundred and fifty megabytes again to see the same prompt.

    GitHub reports the asset's exact byte count, which is the thing that tells the two apart: a
    partial download is short, and a complete one matches to the byte. With no size from GitHub
    the old behaviour is the right one, because then there is genuinely no way to know.
  */
  const already =
    destination.exists && release.sizeBytes !== null && destination.size === release.sizeBytes

  if (!already && destination.exists) destination.delete()

  /*
    Sweep other versions before fetching a new one.

    Each of these is roughly a hundred and fifty megabytes, and nothing else ever removes them,
    so upgrading three times used to leave almost half a gigabyte of superseded installers in
    the cache directory. Android reclaims cache under pressure, but only after the user has
    spent the storage in the meantime.
  */
  if (!already) {
    for (const entry of target.list()) {
      if (entry instanceof File && entry.name !== destination.name) {
        try {
          entry.delete()
        } catch {
          // Best effort. Failing to tidy up is not a reason to fail the update.
        }
      }
    }
  }

  /*
    A task rather than downloadFileAsync, so the transfer can report itself.

    A hundred and fifty megabytes on a slow connection is minutes of a spinner that never
    changes, which is indistinguishable from a hang. The user's only move then is to kill the
    app, which throws away the partial file and starts the whole thing again.
  */
  let file: File
  if (already) {
    file = destination
  } else {
    const task = File.createDownloadTask(release.apkUrl, destination, {
      onProgress: ({ bytesWritten, totalBytes }) => {
        const total = typeof totalBytes === 'number' && totalBytes > 0 ? totalBytes : null
        onProgress?.({
          written: bytesWritten,
          total,
          fraction: total === null ? null : Math.min(1, bytesWritten / total),
        })
      },
    })
    const result = await task.downloadAsync()
    // Null means paused, which nothing here requests. Treat it as a failure rather than
    // handing the installer a file that may be half written.
    if (result === null) throw new Error('The download stopped before it finished.')
    file = result
  }

  /*
    The installer is a different app and cannot read a file:// path inside this app's sandbox.
    getContentUriAsync produces a content:// URI through the FileProvider expo-file-system
    registers, and the flag grants read access to whoever receives the intent.
  */
  const contentUri = await getContentUriAsync(file.uri)

  await IntentLauncher.startActivityAsync('android.intent.action.INSTALL_PACKAGE', {
    data: contentUri,
    // FLAG_GRANT_READ_URI_PERMISSION. Without it the installer gets a URI it may not open and
    // fails with a parse error that says nothing about permissions.
    flags: 1,
  })

  return { downloaded: !already }
}
