import { spawn } from 'node:child_process'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { extractZip } from '../../archive'
import { downloadFile } from '../downloader'
import { ensureJava } from '../java'
import { mavenPath } from '../libraries'
import { loadVersionJson, type Library, type VersionJson } from '../versions'
import { listOptiFineVersions, resolveDownloadUrl } from './optifineSite'

/**
 * Installing OptiFine.
 *
 * The Android client in `android/` runs OptiFine's own installer under a java
 * agent that clicks through its Swing window. There is a smaller way: the
 * installer jar carries `optifine.Patcher`, which turns the vanilla client jar
 * into OptiFine's library jar and needs no window and no `.minecraft` folder.
 * Everything the installer would have written afterwards — the version json,
 * the two libraries — is produced here in the same shape.
 */

/** The shaded LaunchWrapper OptiFine ships inside its installer. */
const LAUNCHWRAPPER = /^launchwrapper-of-(.+)\.jar$/

/** A stale token gets an HTML apology instead of a jar; catch it before unzipping. */
async function assertJar(file: string, fileName: string): Promise<void> {
  const handle = await fsp.open(file, 'r')
  try {
    const header = Buffer.alloc(2)
    await handle.read(header, 0, 2, 0)
    if (header.toString('latin1') !== 'PK') {
      throw new Error(
        `OptiFine indirmesi bir jar dosyası değil (${fileName}). ` +
          'Bağlantı zaman aşımına uğramış olabilir; birkaç dakika sonra yeniden deneyin.'
      )
    }
  } finally {
    await handle.close()
  }
}

/**
 * Runs `Patcher <base.jar> <diff.jar> <mod.jar>`: it reads the vanilla client
 * jar, applies the xdelta patches carried by the installer and writes
 * OptiFine's library jar.
 */
async function runPatcher(
  javaPath: string,
  installerJar: string,
  clientJar: string,
  output: string
): Promise<void> {
  // `javaw` is windowless but also silent, and the patcher only reports failure
  // on its output streams.
  const binary = javaPath.replace(/javaw\.exe$/i, 'java.exe')
  const args = ['-cp', installerJar, 'optifine.Patcher', clientJar, installerJar, output]

  const tail = await new Promise<string>((resolve, reject) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(binary, args, { windowsHide: true })
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)))
      return
    }

    // The patcher narrates every one of the several thousand entries it copies;
    // only the last few lines are worth keeping for an error message.
    const lines: string[] = []
    const collect = (chunk: Buffer): void => {
      lines.push(...String(chunk).split(/\r?\n/).filter((line) => line.trim()))
      if (lines.length > 10) lines.splice(0, lines.length - 10)
    }
    child.stdout?.on('data', collect)
    child.stderr?.on('data', collect)
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(lines.join('\n'))
      else reject(new Error(`OptiFine yamalayıcısı ${code} koduyla çıktı.\n${lines.join('\n')}`))
    })
  })

  // A usage error still exits cleanly, so the result has to be checked.
  const written = await fsp.stat(output).catch(() => null)
  if (!written?.isFile() || written.size === 0) {
    throw new Error(`OptiFine jar'ı üretilemedi.\n${tail}`)
  }
}

/** Unpacks the shaded LaunchWrapper, or falls back to Mojang's for old builds. */
async function installLaunchWrapper(
  installerJar: string,
  librariesDir: string,
  scratchDir: string
): Promise<Library> {
  await fsp.rm(scratchDir, { recursive: true, force: true })
  await extractZip(installerJar, { dir: scratchDir, filter: (entry) => LAUNCHWRAPPER.test(entry) })

  const entries = await fsp.readdir(scratchDir).catch(() => [] as string[])
  const shipped = entries.find((entry) => LAUNCHWRAPPER.test(entry))
  if (!shipped) {
    // Releases from before OptiFine bundled its own build use Mojang's, which
    // the downloader can still fetch from the vanilla library repository.
    return { name: 'net.minecraft:launchwrapper:1.12' }
  }

  const version = LAUNCHWRAPPER.exec(shipped)![1]
  const name = `optifine:launchwrapper-of:${version}`
  const destination = path.join(librariesDir, mavenPath(name))
  await fsp.mkdir(path.dirname(destination), { recursive: true })
  await fsp.copyFile(path.join(scratchDir, shipped), destination)
  return { name, local: true }
}

export interface OptiFineInstallOptions {
  dataDir: string
  gameVersion: string
  /** OptiFine's own version, e.g. `HD_U_J3`. */
  version: string
  /** Java the player configured. A runtime is downloaded when there is none. */
  javaPath?: string
  onProgress?: (detail: string) => void
}

/**
 * Installs OptiFine into the shared library tree and returns the version json
 * to write, laid out the way the official installer lays it out.
 */
export async function installOptiFine(options: OptiFineInstallOptions): Promise<VersionJson> {
  const { dataDir, gameVersion, version, onProgress } = options
  const coordinate = `${gameVersion}_${version}`

  const release = (await listOptiFineVersions(gameVersion)).find(
    (candidate) => candidate.version === version
  )
  if (!release) {
    throw new Error(`OptiFine ${version}, Minecraft ${gameVersion} için yayınlanmamış.`)
  }

  const installerJar = path.join(dataDir, 'installers', release.fileName)
  const scratchDir = path.join(dataDir, 'installers', `optifine-${coordinate}`)
  const librariesDir = path.join(dataDir, 'libraries')

  try {
    onProgress?.(`OptiFine ${version} indiriliyor…`)
    await downloadFile({ url: await resolveDownloadUrl(release.fileName), destination: installerJar })
    await assertJar(installerJar, release.fileName)

    // The patch base is the vanilla client jar, and the loader is installed
    // before the launcher's own download pass runs — so fetch it here.
    onProgress?.(`Minecraft ${gameVersion} istemcisi indiriliyor…`)
    const vanilla = await loadVersionJson(dataDir, gameVersion)
    const client = vanilla.downloads?.client
    if (!client) throw new Error(`Minecraft ${gameVersion} istemci jar'ı yayınlanmamış.`)
    const clientJar = path.join(dataDir, 'versions', gameVersion, `${gameVersion}.jar`)
    await downloadFile({ url: client.url, destination: clientJar, sha1: client.sha1, size: client.size })

    const launchWrapper = await installLaunchWrapper(installerJar, librariesDir, scratchDir)

    const javaPath =
      options.javaPath ??
      (await ensureJava(dataDir, vanilla.javaVersion?.majorVersion ?? 8, onProgress))

    onProgress?.(`OptiFine ${version} uygulanıyor…`)
    const optiFineJar = path.join(librariesDir, mavenPath(`optifine:OptiFine:${coordinate}`))
    await fsp.mkdir(path.dirname(optiFineJar), { recursive: true })
    await runPatcher(javaPath, installerJar, clientJar, optiFineJar)

    const json: VersionJson = {
      id: `${gameVersion}-OptiFine_${version}`,
      inheritsFrom: gameVersion,
      type: vanilla.type,
      mainClass: 'net.minecraft.launchwrapper.Launch',
      libraries: [{ name: `optifine:OptiFine:${coordinate}`, local: true }, launchWrapper]
    }

    // OptiFine loads as a LaunchWrapper tweaker. Pre-1.13 versions carry their
    // game arguments as one `minecraftArguments` string, and a child version
    // replaces that string rather than extending it — so the inherited value
    // has to be repeated. Newer versions use `arguments`, which merges.
    if (vanilla.minecraftArguments) {
      json.minecraftArguments = `${vanilla.minecraftArguments} --tweakClass optifine.OptiFineTweaker`
    } else {
      json.arguments = { game: ['--tweakClass', 'optifine.OptiFineTweaker'] }
    }
    return json
  } finally {
    await fsp.rm(scratchDir, { recursive: true, force: true })
    await fsp.rm(installerJar, { force: true })
  }
}
