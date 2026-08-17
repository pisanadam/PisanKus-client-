import { fetchText } from '../downloader.ts'

/**
 * Reading optifine.net.
 *
 * OptiFine is not published to a maven repository and has no version API: the
 * download table on its own site is the only index, and every file sits behind
 * an ad page that mints a single-use token. This is the same route the Android
 * client in `android/` takes.
 */

const SITE = 'https://optifine.net'
const CACHE_MS = 10 * 60_000

/** One build listed on optifine.net's download page. */
export interface OptiFineRelease {
  /** Minecraft version it targets, spelled the way Mojang spells it. */
  gameVersion: string
  /** OptiFine's own version, e.g. `HD_U_J3`. */
  version: string
  /** Previews come out before the Minecraft release they target settles. */
  preview: boolean
  /** Installer file name, which is also the key the site's pages take. */
  fileName: string
}

/** `OptiFine_1.21.4_HD_U_J3.jar`, or `preview_OptiFine_1.21.4_HD_U_J4_pre2.jar`. */
const INSTALLER_NAME = /^(preview_)?OptiFine_(\d+(?:\.\d+)*)_(.+)\.jar$/
/** Every download route on the page leads through `adloadx?f=<installer>`. */
const INSTALLER_LINK = /adloadx\?f=((?:preview_)?OptiFine_[^'"&\s]+\.jar)/gi
/** The real link, revealed on the ad page and carrying the token. */
const DOWNLOAD_LINK = /<a\s+href=['"]([^'"]*downloadx\?f=[^'"]+)['"]\s+onclick=['"]onDownload\(\)['"]/i

/**
 * OptiFine writes some Minecraft versions with a trailing `.0` that Mojang does
 * not — `OptiFine_1.8.0_HD_U_I7.jar` targets Minecraft `1.8` — so the version
 * has to be normalised before a profile can be matched against it.
 */
function normaliseGameVersion(value: string): string {
  const [major, minor, patch] = value.split('.')
  return patch && patch !== '0' ? `${major}.${minor}.${patch}` : `${major}.${minor ?? '0'}`
}

/** Reads the download table. Exported so the parser can be tested off-line. */
export function parseOptiFineDownloads(html: string): OptiFineRelease[] {
  const releases: OptiFineRelease[] = []
  const seen = new Set<string>()

  // Each row links the same installer twice — once through the ad broker and
  // once as the direct mirror — so the first sighting wins. Page order is
  // newest first, and that order is kept.
  for (const match of html.matchAll(INSTALLER_LINK)) {
    const fileName = match[1]
    if (seen.has(fileName)) continue
    seen.add(fileName)

    const parts = INSTALLER_NAME.exec(fileName)
    if (!parts) continue
    releases.push({
      gameVersion: normaliseGameVersion(parts[2]),
      version: parts[3],
      preview: Boolean(parts[1]),
      fileName
    })
  }
  return releases
}

let cache: { fetchedAt: number; releases: OptiFineRelease[] } | null = null

export async function listOptiFineReleases(): Promise<OptiFineRelease[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) return cache.releases

  const releases = parseOptiFineDownloads(await fetchText(`${SITE}/downloads`))
  if (releases.length === 0) {
    throw new Error('OptiFine sürüm listesi okunamadı. Site şu an erişilemiyor olabilir.')
  }
  cache = { fetchedAt: Date.now(), releases }
  return releases
}

/** Builds for one Minecraft version, stable ones first so they are picked by default. */
export async function listOptiFineVersions(gameVersion: string): Promise<OptiFineRelease[]> {
  const releases = (await listOptiFineReleases()).filter((release) => release.gameVersion === gameVersion)
  return releases.sort((a, b) => Number(a.preview) - Number(b.preview))
}

function absolute(href: string): string {
  if (/^https?:\/\//i.test(href)) return href.replace(/^http:/i, 'https:')
  return `${SITE}/${href.replace(/^\//, '')}`
}

/** Pulls the tokenised link out of an ad page. Exported for testing. */
export function parseDownloadPage(html: string): string | undefined {
  const href = DOWNLOAD_LINK.exec(html)?.[1]
  return href ? absolute(href.replace(/&amp;/g, '&')) : undefined
}

/** Follows the ad page to the link its download button points at. */
export async function resolveDownloadUrl(fileName: string): Promise<string> {
  const page = await fetchText(`${SITE}/adloadx?f=${encodeURIComponent(fileName)}`)
  const url = parseDownloadPage(page)
  if (!url) throw new Error(`OptiFine indirme bağlantısı bulunamadı: ${fileName}`)
  return url
}
