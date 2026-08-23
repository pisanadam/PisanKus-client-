import { spawn } from 'node:child_process'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { extractZip } from '../../archive.ts'
import { downloadFile } from '../downloader.ts'
import { mavenPath } from '../libraries.ts'

/**
 * Runs the build steps Forge's and NeoForge's installers perform.
 *
 * From 1.17 on, these installers do not ship a ready client. They ship a
 * recipe: a chain of Java tools that take Mojang's client jar and produce the
 * files the loader actually launches from —
 * `client-<mcp>-srg.jar`, `client-<mcp>-extra.jar` and
 * `forge-<version>-client.jar`. Skipping the chain leaves the version json
 * pointing at three files that were never created, and the game stops before it
 * draws anything:
 *
 *   java.io.IOException: Invalid paths argument, contained no existing paths:
 *     [... client-1.20.1-20230612.114412-srg.jar, ... -extra.jar, ... -client.jar]
 *
 * which is a crash with no mention of the loader in it, on a profile that looks
 * fully installed from the library.
 *
 * This has to happen after Mojang's client jar has been downloaded — it is the
 * input to the whole chain — so it is a launch step rather than part of
 * installing the loader.
 */

interface InstallProfile {
  /** Absent on Fabric-shaped installers and on Forge old enough to ship a ready jar. */
  processors?: Processor[]
  data?: Record<string, { client: string; server: string }>
  libraries?: ProfileLibrary[]
  path?: string
}

interface Processor {
  /** Missing means "both"; a server-only step must not run here. */
  sides?: string[]
  jar: string
  classpath: string[]
  args: string[]
  /** Expected results, keyed by path. Both sides are token strings. */
  outputs?: Record<string, string>
}

interface ProfileLibrary {
  name: string
  downloads?: { artifact?: { path?: string; url?: string; sha1?: string; size?: number } }
}

/** Where `installFromInstaller` left the unpacked installer. */
function installerDir(dataDir: string, versionId: string): string {
  return path.join(dataDir, 'installers', versionId)
}

async function readJson<T>(file: string): Promise<T | null> {
  return fsp
    .readFile(file, 'utf8')
    .then((text) => JSON.parse(text) as T)
    .catch(() => null)
}

async function exists(file: string): Promise<boolean> {
  return fsp.access(file).then(() => true).catch(() => false)
}

/**
 * Expands one value from the profile's `data` block.
 *
 * Three forms appear: `[group:artifact:version:classifier]` is a library and
 * becomes its path in the shared tree, `/data/client.lzma` is a file inside the
 * installer, and `'text'` is a literal with the quotes stripped.
 */
function expandData(value: string, dataDir: string, unpacked: string): string {
  if (value.startsWith('[') && value.endsWith(']')) {
    return path.join(dataDir, 'libraries', mavenPath(value.slice(1, -1)))
  }
  if (value.startsWith('/')) return path.join(unpacked, value.slice(1))
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1)
  return value
}

/** Replaces `{TOKEN}` and `[maven]` in a processor argument. */
function expandArgument(argument: string, tokens: Record<string, string>, dataDir: string): string {
  if (argument.startsWith('[') && argument.endsWith(']')) {
    return path.join(dataDir, 'libraries', mavenPath(argument.slice(1, -1)))
  }
  return argument.replace(/\{(\w+)\}/g, (match, token: string) => tokens[token] ?? match)
}

/**
 * The `Main-Class` a tool jar declares.
 *
 * The processors are named only by their maven coordinates, so the entry point
 * has to come out of the jar itself. Manifest lines wrap at 72 bytes with a
 * leading space, which a naive line-by-line read would truncate.
 */
async function mainClassOf(jar: string): Promise<string> {
  const staging = await fsp.mkdtemp(path.join(os.tmpdir(), 'pisankus-mf-'))
  try {
    await extractZip(jar, { dir: staging, filter: (name) => name === 'META-INF/MANIFEST.MF' })
    const manifest = await fsp.readFile(path.join(staging, 'META-INF', 'MANIFEST.MF'), 'utf8')
    const unwrapped = manifest.replace(/\r?\n[ \t]/g, '')
    const found = /^Main-Class:\s*(\S+)\s*$/m.exec(unwrapped)
    if (!found) throw new Error('Main-Class yok')
    return found[1]
  } finally {
    await fsp.rm(staging, { recursive: true, force: true })
  }
}

async function runJava(javaPath: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(javaPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    // Kept only for the error message: these tools are quiet when they succeed
    // and the failure reason is the one thing worth having when they do not.
    let output = ''
    const collect = (chunk: Buffer): void => {
      output = (output + chunk.toString()).slice(-4000)
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${code} ile bitti\n${output.trim()}`))
    })
  })
}

/**
 * Every client-side output the chain promises, as absolute paths.
 *
 * Used to decide whether the work has already been done: the chain takes a
 * minute or two and running it on every launch would be felt.
 */
function plannedOutputs(
  processors: Processor[],
  tokens: Record<string, string>,
  dataDir: string
): string[] {
  return processors
    .filter((processor) => !processor.sides || processor.sides.includes('client'))
    .flatMap((processor) => Object.keys(processor.outputs ?? {}))
    .map((output) => expandArgument(output, tokens, dataDir))
}

export async function runInstallerProcessors(
  dataDir: string,
  versionId: string,
  gameVersion: string,
  javaPath: string,
  onProgress?: (detail: string) => void
): Promise<void> {
  const unpacked = installerDir(dataDir, versionId)
  const profile = await readJson<InstallProfile>(path.join(unpacked, 'install_profile.json'))
  // Fabric, Quilt and OptiFine have no such file, and neither does Forge old
  // enough to ship a finished jar. Nothing to do for any of them.
  if (!profile?.processors?.length) return

  const clientJar = path.join(dataDir, 'versions', gameVersion, `${gameVersion}.jar`)
  const tokens: Record<string, string> = {
    SIDE: 'client',
    MINECRAFT_JAR: clientJar,
    ROOT: dataDir,
    INSTALLER: unpacked,
    LIBRARY_DIR: path.join(dataDir, 'libraries')
  }
  for (const [key, value] of Object.entries(profile.data ?? {})) {
    tokens[key] = expandData(value.client, dataDir, unpacked)
  }

  const processors = profile.processors.filter(
    (processor) => !processor.sides || processor.sides.includes('client')
  )

  const outputs = plannedOutputs(processors, tokens, dataDir)
  const done = await Promise.all(outputs.map(exists))
  if (outputs.length > 0 && done.every(Boolean)) return

  // The tools themselves, which live only in the installer's own library list
  // and are not in the version json the downloader works from.
  const tools = (profile.libraries ?? []).filter((library) => library.downloads?.artifact?.url)
  for (const [index, library] of tools.entries()) {
    const artifact = library.downloads!.artifact!
    onProgress?.(`Forge araçları ${index + 1}/${tools.length}`)
    await downloadFile({
      url: artifact.url!,
      destination: path.join(dataDir, 'libraries', artifact.path ?? mavenPath(library.name)),
      sha1: artifact.sha1,
      size: artifact.size
    })
  }

  for (const [index, processor] of processors.entries()) {
    const jar = path.join(dataDir, 'libraries', mavenPath(processor.jar))
    const classpath = [jar, ...processor.classpath.map((name) => path.join(dataDir, 'libraries', mavenPath(name)))]
    const mainClass = await mainClassOf(jar)
    const args = processor.args.map((argument) => expandArgument(argument, tokens, dataDir))

    onProgress?.(`Forge istemcisi hazırlanıyor ${index + 1}/${processors.length}`)
    try {
      await runJava(javaPath, ['-cp', classpath.join(path.delimiter), mainClass, ...args])
    } catch (error) {
      throw new Error(
        `Forge kurulum adımı başarısız (${processor.jar}): ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }

  // A tool that exits 0 without writing its output would otherwise surface much
  // later, as the loader's own "contained no existing paths" crash.
  const missing: string[] = []
  for (const output of outputs) if (!(await exists(output))) missing.push(path.basename(output))
  if (missing.length > 0) {
    throw new Error(`Forge kurulumu tamamlanamadı; şu dosyalar üretilemedi: ${missing.join(', ')}`)
  }
}
