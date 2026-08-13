import { app, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '../shared/types'

const RELEASES_PAGE = 'https://github.com/pisanadam/Opbay-client-/releases/latest'

/**
 * Whether the running build can replace itself in place.
 *
 * Squirrel.Mac refuses to swap an application whose code signature it cannot
 * validate, and nothing in the release pipeline is signed with a Developer ID.
 * Rather than let the download run and fail at the last step, macOS is sent to
 * the download page instead. Windows (NSIS) and Linux (AppImage/deb) update
 * themselves without a signature.
 */
const canSelfUpdate = process.platform !== 'darwin'

let status: UpdateStatus = { state: 'idle' }
let publish: (status: UpdateStatus) => void = () => undefined

function set(next: UpdateStatus): void {
  status = next
  publish(next)
}

export function currentStatus(): UpdateStatus {
  return status
}

export function initUpdater(onStatus: (status: UpdateStatus) => void): void {
  publish = onStatus

  autoUpdater.autoDownload = false
  // The user restarts when they choose to; quitting the launcher out from under
  // a running game would be worse than a stale version.
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = null

  autoUpdater.on('update-available', (info) => {
    set({ state: 'available', version: info.version, canSelfUpdate })
  })
  autoUpdater.on('update-not-available', () => set({ state: 'idle' }))
  autoUpdater.on('download-progress', (progress) => {
    if (status.state === 'downloading' || status.state === 'available') {
      set({
        state: 'downloading',
        version: status.version,
        percent: Math.round(progress.percent)
      })
    }
  })
  autoUpdater.on('update-downloaded', (info) => set({ state: 'ready', version: info.version }))
  autoUpdater.on('error', (error) => set({ state: 'error', message: readableError(error) }))
}

/**
 * Turns electron-updater's error codes into something worth showing in a
 * sidebar. Its own messages carry stack traces and internal URLs.
 */
function readableError(error: Error): string {
  const text = error.message
  if (/ERR_UPDATER_CHANNEL_FILE_NOT_FOUND/.test(text)) {
    return 'Sürüm bilgisi yayımlanmamış; güncelleme şimdilik kontrol edilemiyor.'
  }
  if (/ERR_UPDATER_NO_PUBLISHED_VERSIONS|LATEST_VERSION_NOT_FOUND/.test(text)) {
    return 'Yayımlanmış bir sürüm bulunamadı.'
  }
  if (/net::|ENOTFOUND|ETIMEDOUT|EAI_AGAIN/.test(text)) {
    return 'Güncelleme sunucusuna ulaşılamadı.'
  }
  return text.split('\n')[0]
}

/** `1.0.9` vs `1.0.10` — compares numerically, segment by segment. */
export function isNewer(candidate: string, installed: string): boolean {
  const parse = (value: string): number[] =>
    value.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const left = parse(candidate)
  const right = parse(installed)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return false
}

/**
 * macOS never goes through electron-updater. The release ships dmg only, so
 * electron-builder writes no `latest-mac.yml` and a normal check would fail with
 * "channel file not found" rather than reporting a version. The version is the
 * same on every platform, so the Windows channel file answers the question —
 * `/releases/latest/download/` is a permanent url that follows the rolling tag.
 */
async function checkViaChannelFile(): Promise<UpdateStatus> {
  const url = 'https://github.com/pisanadam/Opbay-client-/releases/latest/download/latest.yml'
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`ERR_UPDATER_CHANNEL_FILE_NOT_FOUND ${response.status}`)

  const version = /^version:\s*(.+)$/m.exec(await response.text())?.[1]?.trim()
  if (!version) throw new Error('Sürüm bilgisi okunamadı.')

  return isNewer(version, app.getVersion())
    ? { state: 'available', version, canSelfUpdate }
    : { state: 'idle' }
}

/**
 * @param manual Pressed by the user rather than fired on startup. A manual check
 * always runs: silently reporting "you are up to date" without having asked
 * anyone would be worse than showing why the check cannot work.
 */
export async function checkForUpdates(manual = false): Promise<UpdateStatus> {
  // An unpackaged build has no app-update.yml, and asking anyway only produces
  // an error toast on every `npm run dev`.
  if (!manual && !app.isPackaged && !process.env.OPBAY_FORCE_UPDATE_CHECK) return status
  if (status.state === 'downloading' || status.state === 'ready') return status

  set({ state: 'checking' })
  try {
    // electron-updater only works from a packaged build; unpackaged it declines
    // and reads the channel file instead, which answers the same question.
    if (canSelfUpdate && app.isPackaged) {
      const result = await autoUpdater.checkForUpdates()
      // It resolves without firing an event when it declines to check, which
      // would otherwise leave the UI stuck on "checking" forever.
      if (status.state === 'checking') {
        const found = result?.updateInfo?.version
        set(
          found && isNewer(found, app.getVersion())
            ? { state: 'available', version: found, canSelfUpdate }
            : { state: 'idle' }
        )
      }
    } else {
      set(await checkViaChannelFile())
    }
  } catch (error) {
    set({ state: 'error', message: readableError(error as Error) })
  }
  return status
}

export async function downloadUpdate(): Promise<UpdateStatus> {
  if (status.state !== 'available') return status
  if (!canSelfUpdate) {
    await shell.openExternal(RELEASES_PAGE)
    return status
  }

  set({ state: 'downloading', version: status.version, percent: 0 })
  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    set({ state: 'error', message: readableError(error as Error) })
  }
  return status
}

export function installUpdate(): void {
  if (status.state !== 'ready') return
  // `isSilent: true` runs the installer without its wizard, reusing the install
  // directory and shortcuts already chosen — an update should not re-ask what
  // was answered at first install. `isForceRunAfter` brings the launcher back up.
  setImmediate(() => autoUpdater.quitAndInstall(true, true))
}
