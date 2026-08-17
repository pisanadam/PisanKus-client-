import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { downloadFile, fetchText } from '../downloader.ts'
import type { VersionJson } from '../versions'
import { extractZip } from '../../archive.ts'

/**
 * OptiFine, installed the way the Android launcher does it.
 *
 * OptiFine publishes no maven repository and no API: the download page is the
 * index, and each build sits behind an interstitial page that carries the real
 * link. So both are read from the HTML, exactly as the Android launcher's
 * scraper does — there is no other source.
 *
 * What happens after the download differs on purpose. Android runs OptiFine's
 * own installer jar under its Java runtime; that installer is a Swing window,
 * and driving it needs the agent trick Android carries for Forge. Here the
 * version json it would have written is written directly instead — the same
 * shape the official installer produces: launchwrapper as the main class, the
 * OptiFine jar as a library, and the tweaker on the game arguments.
 */

const DOWNLOADS_PAGE = 'https://optifine.net/downloads'

export interface OptiFineBuild {
  /** Minecraft version this build patches, e.g. `1.21.11`. */
  gameVersion: string
  /** The part that names the build, e.g. `HD_U_J9`. Used as the loader version. */
  patch: string
  /** What OptiFine calls it, e.g. `OptiFine HD U J9`. */
  label: string
  /** Interstitial page holding the real download link. */
  pageUrl: string
  /** Preview builds are unfinished; offered, but never picked automatically. */
  preview: boolean
}

/**
 * Every build on the download page, newest Minecraft version first.
 *
 * The page is a sequence of `<h2>Minecraft x.y.z</h2>` headings, each followed
 * by rows for that version, so it is split on the headings and each section is
 * read on its own. Parsing HTML with expressions is normally a mistake; this
 * page is generated from a template and has kept the same three class names
 * (`downloadLine`, `colFile`, `colMirror`) for years, and the alternative is a
 * DOM parser dependency for one page.
 */
export function parseDownloadsPage(html: string): OptiFineBuild[] {
  const builds: OptiFineBuild[] = []
  const sections = html.split(/<h2>\s*Minecraft\s+/i).slice(1)

  for (const section of sections) {
    const gameVersion = section.slice(0, section.indexOf('<')).trim()
    if (!gameVersion) continue

    const rows = section.matchAll(/<tr\s+class=['"]([^'"]*downloadLine[^'"]*)['"][^>]*>([\s\S]*?)<\/tr>/gi)
    for (const row of rows) {
      const classes = row[1]
      const body = row[2]
      const label = body.match(/<td\s+class=['"]colFile['"][^>]*>([^<]*)</i)?.[1]?.trim()
      // The mirror column is the plain link; the download column is wrapped in
      // an ad redirect that would have to be followed to reach the same place.
      const pageUrl = body
        .match(/<td\s+class=['"]colMirror['"][^>]*>[\s\S]*?href=['"]([^'"]+)['"]/i)?.[1]
        ?.replace(/^http:/, 'https:')
      if (!label || !pageUrl) continue

      const file = pageUrl.match(/[?&]f=([^&'"]+)/)?.[1]
      if (!file) continue
      const patch = patchOf(file, gameVersion)
      if (!patch) continue

      builds.push({
        gameVersion,
        patch,
        label,
        pageUrl,
        preview: classes.includes('downloadLinePreview') || /pre\d*\b/i.test(patch)
      })
    }
  }
  return builds
}

/**
 * The build's own part of the file name.
 *
 * Files are named `OptiFine_<game version>_<patch>.jar`, with previews carrying
 * a `preview_` prefix. Cutting on the game version rather than counting
 * underscores keeps versions like `1.7.10_HD_U_E7` intact.
 */
function patchOf(file: string, gameVersion: string): string | undefined {
  const name = file.replace(/^preview_/i, '').replace(/\.jar$/i, '')
  const marker = `OptiFine_${gameVersion}_`
  return name.startsWith(marker) ? name.slice(marker.length) : undefined
}

/**
 * The whole page is one request for every Minecraft version on it, and the
 * profile dialog asks again on each change of game version or loader. Keeping
 * the parsed result briefly turns that back into a single fetch.
 */
let cache: { fetchedAt: number; builds: OptiFineBuild[] } | null = null

export async function listOptiFineBuilds(gameVersion: string): Promise<OptiFineBuild[]> {
  if (!cache || Date.now() - cache.fetchedAt > 10 * 60_000) {
    cache = { fetchedAt: Date.now(), builds: parseDownloadsPage(await fetchText(DOWNLOADS_PAGE)) }
  }
  return cache.builds.filter((build) => build.gameVersion === gameVersion)
}

/**
 * The real download link, read from the build's interstitial page.
 *
 * The link carries a per-build token that is only handed out on that page, so
 * it cannot be constructed from the file name.
 */
export async function resolveDownloadUrl(pageUrl: string): Promise<string> {
  const html = await fetchText(pageUrl)
  const href = html.match(/<span[^>]+id=['"]Download['"][\s\S]*?href=['"]([^'"]+)['"]/i)?.[1]
  if (!href) {
    throw new Error(
      'OptiFine indirme bağlantısı bulunamadı. Sayfa değişmiş olabilir; ' +
        'daha sonra yeniden deneyin veya başka bir OptiFine sürümü seçin.'
    )
  }
  return href.startsWith('http') ? href : `https://optifine.net/${href.replace(/^\//, '')}`
}

/** The version id an OptiFine profile launches, e.g. `1.21.11-OptiFine_HD_U_J9`. */
export function optiFineVersionId(gameVersion: string, patch: string): string {
  return `${gameVersion}-OptiFine_${patch}`
}

/**
 * Downloads a build and writes everything needed to launch it.
 *
 * OptiFine's jar is both the installer and the mod: placed on the classpath it
 * patches the game at startup through launchwrapper, which is why nothing has
 * to be run here. The launchwrapper build it wants travels inside the same jar,
 * so it is unpacked rather than fetched.
 */
export async function installOptiFine(
  dataDir: string,
  gameVersion: string,
  build: OptiFineBuild,
  onProgress?: (detail: string) => void
): Promise<VersionJson> {
  const librariesDir = path.join(dataDir, 'libraries')
  const coordinate = `${gameVersion}_${build.patch}`
  const jarPath = path.join(
    librariesDir,
    'optifine',
    'OptiFine',
    coordinate,
    `OptiFine-${coordinate}.jar`
  )

  onProgress?.(`OptiFine ${build.patch} indiriliyor…`)
  const url = await resolveDownloadUrl(build.pageUrl)
  await downloadFile({ url, destination: jarPath })

  const launchwrapper = await unpackLaunchwrapper(jarPath, librariesDir)

  return {
    id: optiFineVersionId(gameVersion, build.patch),
    inheritsFrom: gameVersion,
    type: 'release',
    mainClass: 'net.minecraft.launchwrapper.Launch',
    arguments: { game: ['--tweakClass', 'optifine.OptiFineTweaker'] },
    // No download entries: these two files are put in place here, and the
    // launcher leaves a library alone once it exists. Deleting one by hand
    // means installing OptiFine again — there is no repository to re-fetch it
    // from, which is the reason OptiFine is scraped in the first place.
    libraries: [
      { name: `optifine:OptiFine:${coordinate}` },
      { name: launchwrapper }
    ]
  }
}

/**
 * Puts the launchwrapper carried inside the OptiFine jar into the library tree
 * and returns its coordinate.
 *
 * Builds old enough to predate OptiFine's own launchwrapper use Mojang's, which
 * the ordinary library download handles.
 */
async function unpackLaunchwrapper(jarPath: string, librariesDir: string): Promise<string> {
  const scratch = await fsp.mkdtemp(path.join(os.tmpdir(), 'pisankus-optifine-'))
  try {
    await extractZip(jarPath, {
      dir: scratch,
      filter: (entry) => entry === 'launchwrapper-of.txt' || /^launchwrapper-of-[^/]+\.jar$/.test(entry)
    })

    const version = await fsp.readFile(path.join(scratch, 'launchwrapper-of.txt'), 'utf8').catch(() => '')
    const trimmed = version.trim()
    if (!trimmed) return 'net.minecraft:launchwrapper:1.12'

    const source = path.join(scratch, `launchwrapper-of-${trimmed}.jar`)
    const destination = path.join(
      librariesDir,
      'optifine',
      'launchwrapper-of',
      trimmed,
      `launchwrapper-of-${trimmed}.jar`
    )
    await fsp.mkdir(path.dirname(destination), { recursive: true })
    await fsp.copyFile(source, destination)
    return `optifine:launchwrapper-of:${trimmed}`
  } catch {
    // A jar without the bundled launchwrapper is an older build; Mojang's own
    // is what those were built against.
    return 'net.minecraft:launchwrapper:1.12'
  } finally {
    await fsp.rm(scratch, { recursive: true, force: true })
  }
}
