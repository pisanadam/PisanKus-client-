/**
 * Reading OptiFine's website, which is the only index it has.
 *
 * OptiFine publishes no maven repository and no metadata endpoint: the list of
 * builds exists as a downloads page, and each build's real link is minted by an
 * ad page behind it. So the launcher reads HTML — and keeps that reading here,
 * apart from everything that touches the disk or the network, because a scraper
 * is the part most likely to need fixing when the site is restyled and the only
 * part that can be tested without the site.
 */

const SITE = 'https://optifine.net/'

export interface OptiFineBuild {
  /** Minecraft version the build targets, e.g. `1.21.1`. */
  gameVersion: string
  /** OptiFine's own name for the build, e.g. `HD_U_J1`. */
  version: string
  /** Installer file name, e.g. `OptiFine_1.21.1_HD_U_J1.jar`. */
  fileName: string
  /** The ad page that hands out the real download link. */
  pageUrl: string
  /** Preview builds are published for testing and are not the recommended pick. */
  preview: boolean
}

/**
 * Reads the builds out of the downloads page.
 *
 * The page groups builds under a heading per Minecraft version, but the heading
 * is not what this reads: every row links to `adloadx?f=OptiFine_<mc>_<build>.jar`,
 * and that file name carries both versions itself. One less thing to be wrong
 * about when the page is restyled, and it keeps preview rows meaningful wherever
 * the page decides to put them.
 *
 * The file name is also all the ad page's address needs, which is why the link
 * itself is thrown away rather than followed. Each row carries the same build
 * two or three times — the download column goes through an ad broker, the
 * mirror column goes straight to optifine.net — and rebuilding the address from
 * the name sidesteps the question of which link was matched.
 */
export function parseDownloadsPage(html: string): OptiFineBuild[] {
  const builds: OptiFineBuild[] = []
  const seen = new Set<string>()

  const links = /adloadx\?f=([^&"'\s]+)/gi
  let match: RegExpExecArray | null
  while ((match = links.exec(html)) !== null) {
    const encodedName = decodeEntities(match[1])
    if (seen.has(encodedName)) continue

    const build = parseInstallerName(decodeURIComponent(encodedName))
    if (!build) continue

    seen.add(encodedName)
    builds.push({ ...build, pageUrl: `${SITE}adloadx?f=${encodedName}` })
  }
  return builds
}

/**
 * Splits `OptiFine_1.21.1_HD_U_J1.jar` into the two versions inside it.
 *
 * The Minecraft version is the first underscore-separated field and has to look
 * like one, so anything else on the page — a changelog link, a file named some
 * other way — is skipped rather than guessed at.
 */
export function parseInstallerName(fileName: string): Omit<OptiFineBuild, 'pageUrl'> | undefined {
  const match = /^(preview_)?OptiFine_(.+)\.jar$/.exec(fileName)
  if (!match) return undefined

  const [gameVersion, ...rest] = match[2].split('_')
  if (!/^\d+(\.\d+)+$/.test(gameVersion) || rest.length === 0) return undefined

  return {
    gameVersion,
    version: rest.join('_'),
    fileName,
    preview: Boolean(match[1])
  }
}

/**
 * Finds the real download link on a build's ad page.
 *
 * The link carries a token the page mints per visit, so it cannot be derived
 * from the file name and does not stay valid — which is why it is fetched
 * immediately before downloading rather than while listing versions.
 */
export function parseDownloadLink(html: string): string | undefined {
  const match = /href=["']([^"']*downloadx\?[^"']+)["']/i.exec(html)
  if (!match) return undefined
  return new URL(decodeEntities(match[1]), SITE).toString()
}

/** Enough of HTML's escaping to read an href — `&amp;` alone would corrupt the token. */
function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}
