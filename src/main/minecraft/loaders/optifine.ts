import { spawn } from 'node:child_process'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { extractZip } from '../../archive'
import { downloadFile, fetchText, fileSha1 } from '../downloader'
import { ensureJava } from '../java'
import { mavenPath } from '../libraries'
import { loadVersionJson, type Library, type VersionJson } from '../versions'
import { parseDownloadLink, parseDownloadsPage, type OptiFineBuild } from './optifinePage'

/**
 * OptiFine, installed the way its own installer would.
 *
 * OptiFine publishes no maven repository and no metadata endpoint — the only
 * index that exists is the downloads page, and the only artefact is the
 * installer jar. So this module does what every other launcher ends up doing:
 * read the page, take the jar, and produce from it the same three things the
 * official installer produces — a version json, the OptiFine library, and the
 * launch wrapper it runs under.
 *
 * The installer itself is never executed. It is a Swing application that wants
 * a window and a mouse, which is exactly why the Android side drives it with an
 * agent that clicks its buttons. Nothing in what it does needs a GUI, though:
 * the jar carries a `Patcher` that turns the vanilla client jar into the
 * OptiFine library, and that is a plain command line program.
 */

const DOWNLOADS_PAGE = 'https://optifine.net/downloads'

/** Launchwrapper reads this off the command line and hands control to OptiFine. */
const TWEAK_ARGUMENTS = ['--tweakClass', 'optifine.OptiFineTweaker']

/**
 * Where the launch wrapper comes from when the installer does not carry its own.
 *
 * Only very old builds leave it out; the coordinate is on Mojang's maven, so
 * the ordinary library downloader can fetch it.
 */
const FALLBACK_LAUNCH_WRAPPER = 'net.minecraft:launchwrapper:1.12'

let cache: { fetchedAt: number; builds: OptiFineBuild[] } | null = null

/** Every build the downloads page lists, newest first, as the page orders them. */
export async function listBuilds(): Promise<OptiFineBuild[]> {
  if (cache && Date.now() - cache.fetchedAt < 10 * 60_000) return cache.builds

  const builds = parseDownloadsPage(await fetchText(DOWNLOADS_PAGE))
  if (builds.length === 0) {
    throw new Error('OptiFine indirme sayfası okunamadı. Site değişmiş olabilir.')
  }
  cache = { fetchedAt: Date.now(), builds }
  return builds
}

/** The builds available for one Minecraft version, previews marked unstable. */
export async function listOptiFineVersions(
  gameVersion: string
): Promise<{ version: string; stable: boolean }[]> {
  const builds = await listBuilds()
  return builds
    .filter((build) => build.gameVersion === gameVersion)
    .map((build) => ({ version: build.version, stable: !build.preview }))
}

export function optiFineVersionId(gameVersion: string, version: string): string {
  return `${gameVersion}-OptiFine_${version}`
}

/**
 * Installs one build and returns the version json to launch it with.
 *
 * Everything lands where the rest of the launcher already looks: the library
 * under `libraries/optifine/…`, the version json written by the caller into
 * `versions/`. Nothing about launching an OptiFine profile is special after
 * this — it is a version that inherits from the vanilla one.
 */
export async function installOptiFine(
  dataDir: string,
  gameVersion: string,
  version: string,
  onProgress?: (detail: string) => void
): Promise<VersionJson> {
  const build = (await listBuilds()).find(
    (candidate) => candidate.gameVersion === gameVersion && candidate.version === version
  )
  if (!build) {
    throw new Error(`OptiFine ${version}, Minecraft ${gameVersion} için yayınlanmamış.`)
  }

  onProgress?.('OptiFine indirme bağlantısı çözülüyor…')
  const url = parseDownloadLink(await fetchText(build.pageUrl))
  if (!url) {
    throw new Error(
      'OptiFine indirme bağlantısı bulunamadı. Site değişmiş olabilir; ' +
        'jar dosyasını optifine.net üzerinden elle indirmeniz gerekebilir.'
    )
  }

  const versionId = optiFineVersionId(gameVersion, version)
  const installer = path.join(dataDir, 'installers', build.fileName)
  const unpacked = path.join(dataDir, 'installers', versionId)

  onProgress?.(`${build.fileName} indiriliyor…`)
  await downloadFile({ url, destination: installer })

  try {
    await fsp.rm(unpacked, { recursive: true, force: true })
    await extractZip(installer, {
      dir: unpacked,
      // Three entries decide the whole install; the rest of the jar is either
      // the patch data the Patcher reads itself, or the installer's own UI.
      filter: (name) =>
        name === 'optifine/Patcher.class' ||
        name === 'launchwrapper-of.txt' ||
        /^launchwrapper-of-[\d.]+\.jar$/.test(name)
    })

    const optiFine = await installOptiFineLibrary(dataDir, gameVersion, version, installer, unpacked, onProgress)
    const launchWrapper = await installLaunchWrapper(dataDir, unpacked)

    const parent = await loadVersionJson(dataDir, gameVersion)
    return {
      id: versionId,
      inheritsFrom: gameVersion,
      type: parent.type ?? 'release',
      mainClass: 'net.minecraft.launchwrapper.Launch',
      libraries: [optiFine, launchWrapper],
      // Versions up to 1.12 carry their arguments as one string and the launcher
      // uses it verbatim when it is present, so the tweak has to go inside it.
      // Newer ones take the structured list, which merging appends to.
      ...(parent.minecraftArguments
        ? { minecraftArguments: `${parent.minecraftArguments} ${TWEAK_ARGUMENTS.join(' ')}` }
        : { arguments: { game: [...TWEAK_ARGUMENTS] } })
    }
  } finally {
    await fsp.rm(unpacked, { recursive: true, force: true })
    await fsp.rm(installer, { force: true })
  }
}

/**
 * Produces the OptiFine library jar.
 *
 * Modern installers do not contain OptiFine as such: they contain the
 * differences between it and the vanilla client, which is how OptiFine avoids
 * redistributing Mojang's code. Turning that back into a jar is what the
 * bundled `Patcher` does, and it needs the vanilla jar and a JVM to do it.
 * Older installers are already the finished library and are simply copied.
 */
async function installOptiFineLibrary(
  dataDir: string,
  gameVersion: string,
  version: string,
  installer: string,
  unpacked: string,
  onProgress?: (detail: string) => void
): Promise<Library> {
  const coordinate = `optifine:OptiFine:${gameVersion}_${version}`
  const destination = path.join(dataDir, 'libraries', mavenPath(coordinate))
  await fsp.mkdir(path.dirname(destination), { recursive: true })

  const patcher = await exists(path.join(unpacked, 'optifine', 'Patcher.class'))
  if (!patcher) {
    await fsp.copyFile(installer, destination)
    return localLibrary(coordinate, destination)
  }

  onProgress?.('OptiFine oyunun jar dosyasına uygulanıyor…')
  const parent = await loadVersionJson(dataDir, gameVersion)
  const client = parent.downloads?.client
  if (!client) {
    throw new Error(`Minecraft ${gameVersion} istemci dosyası yayınlanmamış; OptiFine uygulanamıyor.`)
  }

  // The same file the launcher downloads to start the game, in the same place,
  // so this is the one download rather than a second copy of it.
  const clientJar = path.join(dataDir, 'versions', gameVersion, `${gameVersion}.jar`)
  await downloadFile({ url: client.url, destination: clientJar, sha1: client.sha1, size: client.size })

  // The patcher is ordinary Java 8 bytecode, so the runtime the game itself
  // needs runs it happily and no second one has to be downloaded.
  const java = await ensureJava(dataDir, parent.javaVersion?.majorVersion ?? 8, onProgress)

  // Built beside the final name and moved into place at the end: a patch that
  // dies halfway would otherwise leave a truncated jar that looks installed,
  // and the launcher would then record its digest and trust it forever.
  const partial = `${destination}.part`
  await fsp.rm(partial, { force: true })
  await runPatcher(java, installer, clientJar, partial)
  if (!((await fsp.stat(partial).catch(() => null))?.size)) {
    throw new Error('OptiFine kütüphanesi üretilemedi. Bu yapı bu Minecraft sürümüne uymuyor olabilir.')
  }
  await fsp.rename(partial, destination)
  return localLibrary(coordinate, destination)
}

/**
 * Installs the launch wrapper the build was published with.
 *
 * OptiFine ships its own fork and names its version in a text file next to it.
 * Using whatever the build carries rather than a fixed version matters: the
 * fork is what knows how to boot the Minecraft version in question.
 */
async function installLaunchWrapper(dataDir: string, unpacked: string): Promise<Library> {
  const marker = path.join(unpacked, 'launchwrapper-of.txt')
  const version = await fsp.readFile(marker, 'utf8').then((text) => text.trim(), () => '')
  if (!version) return { name: FALLBACK_LAUNCH_WRAPPER }

  const source = path.join(unpacked, `launchwrapper-of-${version}.jar`)
  if (!(await exists(source))) return { name: FALLBACK_LAUNCH_WRAPPER }

  const coordinate = `optifine:launchwrapper-of:${version}`
  const destination = path.join(dataDir, 'libraries', mavenPath(coordinate))
  await fsp.mkdir(path.dirname(destination), { recursive: true })
  await fsp.copyFile(source, destination)
  return localLibrary(coordinate, destination)
}

/**
 * Describes a jar that is already on disk and cannot be fetched from anywhere.
 *
 * The digest and size are what keep the downloader from trying: it verifies the
 * file, finds it correct, and moves on without a request. If the file ever goes
 * missing the empty url is what tells it to say so plainly instead of asking a
 * maven repository for something no maven repository has.
 */
async function localLibrary(coordinate: string, file: string): Promise<Library> {
  const stat = await fsp.stat(file)
  return {
    name: coordinate,
    downloads: {
      artifact: {
        path: mavenPath(coordinate).split(path.sep).join('/'),
        sha1: await fileSha1(file),
        size: stat.size,
        url: ''
      }
    }
  }
}

function runPatcher(java: string, installer: string, clientJar: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(java, ['-cp', installer, 'optifine.Patcher', clientJar, installer, output], {
      windowsHide: true
    })

    // The patcher narrates every one of the four thousand files it compares, and
    // only the tail of that is ever worth reading, so the rest is dropped as it
    // arrives instead of being kept for an error that usually never comes.
    let log = ''
    const collect = (chunk: Buffer): void => {
      log = (log + String(chunk)).slice(-4000)
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`OptiFine uygulanamadı (çıkış kodu ${code}). ${log.trim().slice(-500)}`))
    })
  })
}

function exists(file: string): Promise<boolean> {
  return fsp.access(file).then(
    () => true,
    () => false
  )
}
