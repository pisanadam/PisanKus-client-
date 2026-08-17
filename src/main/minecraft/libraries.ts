import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { DownloadItem } from './downloader'
import type { Artifact, Library, Rule, VersionJson } from './versions'
import { extractZip } from '../archive'

export type OsName = 'windows' | 'osx' | 'linux'

export function currentOs(): OsName {
  switch (process.platform) {
    case 'win32':
      return 'windows'
    case 'darwin':
      return 'osx'
    default:
      return 'linux'
  }
}

export function currentArch(): string {
  // Mojang uses x86/x64/arm64 in rules; Node reports ia32/x64/arm64.
  return process.arch === 'ia32' ? 'x86' : process.arch
}

/**
 * Evaluates Mojang's rule list. Rules are ordered and the last matching one wins;
 * an empty list means "allow".
 */
export function rulesAllow(rules: Rule[] | undefined, features: Record<string, boolean> = {}): boolean {
  if (!rules || rules.length === 0) return true

  let allowed = false
  for (const rule of rules) {
    let matches = true

    if (rule.os) {
      if (rule.os.name && rule.os.name !== currentOs()) matches = false
      if (rule.os.arch && rule.os.arch !== currentArch()) matches = false
      if (rule.os.version && !new RegExp(rule.os.version).test(os.release())) matches = false
    }

    if (rule.features) {
      for (const [feature, expected] of Object.entries(rule.features)) {
        if ((features[feature] ?? false) !== expected) matches = false
      }
    }

    if (matches) allowed = rule.action === 'allow'
  }
  return allowed
}

/** Converts `group:artifact:version[:classifier]` into a maven-style relative path. */
export function mavenPath(name: string): string {
  const [group, artifact, version, classifier] = name.split(':')
  const fileName = classifier
    ? `${artifact}-${version}-${classifier}.jar`
    : `${artifact}-${version}.jar`
  return path.join(...group.split('.'), artifact, version, fileName)
}

function nativeClassifier(library: Library): string | undefined {
  if (!library.natives) return undefined
  return library.natives[currentOs()]?.replace('${arch}', process.arch === 'ia32' ? '32' : '64')
}

/**
 * Whether a `natives-*` jar is the build for this machine.
 *
 * Mojang's rules gate these by operating system only — `natives-windows`,
 * `natives-windows-arm64` and `natives-windows-x86` all carry the identical
 * rule `{os: {name: windows}}`. The architecture lives in the classifier
 * suffix, so without this check every architecture's jar lands on the
 * classpath at once.
 */
export function nativeArchMatches(name: string): boolean {
  const classifier = name.split(':')[3]
  if (!classifier?.startsWith('natives-')) return true

  const arch = currentArch()
  if (classifier.endsWith('-arm64')) return arch === 'arm64'
  if (classifier.endsWith('-x86')) return arch === 'x86'
  // LWJGL ships a macOS patch jar that is not architecture-specific.
  if (classifier.endsWith('-patch')) return true
  // A bare `natives-<os>` is the 64-bit build.
  return arch === 'x64'
}

export interface ResolvedLibraries {
  /** Jars that belong on the classpath. */
  classpath: string[]
  /** Native jars that must be extracted into the natives directory before launch. */
  natives: { file: string; exclude: string[] }[]
  downloads: DownloadItem[]
}

export function resolveLibraries(version: VersionJson, dataDir: string): ResolvedLibraries {
  const librariesDir = path.join(dataDir, 'libraries')
  const classpath: string[] = []
  const natives: { file: string; exclude: string[] }[] = []
  const downloads: DownloadItem[] = []
  const seen = new Set<string>()

  for (const library of version.libraries) {
    if (!rulesAllow(library.rules)) continue
    if (!nativeArchMatches(library.name)) continue

    // Libraries repeat across a version and its loader, so only the first entry
    // for a coordinate is kept. The classifier is part of that identity: from
    // LWJGL 3.3 the native builds ship as ordinary classpath jars sharing a
    // group and artifact with the plain one (`org.lwjgl:lwjgl:3.4.2` alongside
    // `org.lwjgl:lwjgl:3.4.2:natives-windows`). Keying on group:artifact alone
    // discarded every native jar, and the game then failed to find lwjgl.dll.
    const [groupId, artifactId, , nameClassifier] = library.name.split(':')
    const key = [groupId, artifactId, nameClassifier ?? '', library.natives ? 'natives' : ''].join(':')
    if (seen.has(key)) continue
    seen.add(key)

    const artifact: Artifact | undefined = library.downloads?.artifact
    const classifier = nativeClassifier(library)
    const nativeArtifact = classifier ? library.downloads?.classifiers?.[classifier] : undefined

    if (artifact) {
      const destination = path.join(librariesDir, artifact.path ?? mavenPath(library.name))
      downloads.push({ url: artifact.url, destination, sha1: artifact.sha1, size: artifact.size })
      if (!library.natives) classpath.push(destination)
    } else if (library.local) {
      // Built locally by the loader install; there is nowhere to download it from.
      classpath.push(path.join(librariesDir, mavenPath(library.name)))
    } else if (!library.natives) {
      // Loader manifests often give only a maven repository root.
      const relative = mavenPath(library.name)
      const destination = path.join(librariesDir, relative)
      const base = (library.url ?? 'https://libraries.minecraft.net/').replace(/\/?$/, '/')
      downloads.push({ url: base + relative.split(path.sep).join('/'), destination })
      classpath.push(destination)
    }

    if (nativeArtifact) {
      const destination = path.join(librariesDir, nativeArtifact.path ?? mavenPath(library.name))
      downloads.push({
        url: nativeArtifact.url,
        destination,
        sha1: nativeArtifact.sha1,
        size: nativeArtifact.size
      })
      natives.push({ file: destination, exclude: library.extract?.exclude ?? ['META-INF/'] })
    }
  }

  return { classpath, natives, downloads }
}

/** Unpacks native jars, skipping the entries their manifest excludes. */
export async function extractNatives(
  natives: { file: string; exclude: string[] }[],
  targetDir: string
): Promise<void> {
  await fsp.rm(targetDir, { recursive: true, force: true })
  await fsp.mkdir(targetDir, { recursive: true })

  for (const native of natives) {
    await extractZip(native.file, {
      dir: targetDir,
      filter: (entryName) =>
        !entryName.endsWith('/') && !native.exclude.some((prefix) => entryName.startsWith(prefix))
    })
  }
}
