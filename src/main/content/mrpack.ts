import type { LoaderId } from '../../shared/types.ts'

/**
 * Reading a Modrinth pack index.
 *
 * `modrinth.index.json` is what a `.mrpack` is: a name, the Minecraft version
 * and loader it needs, and a list of files to fetch. Everything the launcher
 * decides about a pack — which loader the profile gets, which version, how many
 * files are actually going to land — comes out of this one object, so it is
 * worth having on its own where it can be checked against real indexes.
 */

export interface MrPackIndex {
  formatVersion?: number
  name?: string
  versionId?: string
  /** `minecraft` plus at most one loader. */
  dependencies?: Record<string, string>
  files?: {
    path: string
    hashes: { sha1: string }
    downloads: string[]
    fileSize: number
    /** `unsupported` on the client side means a server-only file. */
    env?: { client?: string; server?: string }
  }[]
}

export interface MrPackDetails {
  name: string
  versionId: string
  gameVersion: string
  loader: LoaderId
  loaderVersion?: string
  /** Files that will actually be downloaded, server-only ones excluded. */
  fileCount: number
}

/**
 * Maps a pack's dependency block onto our loader ids.
 *
 * Checked in this order because a pack may name more than one — NeoForge packs
 * sometimes still carry a `forge` entry for older launchers — and the more
 * specific loader has to win, or the profile is built on the wrong one and
 * every mod in it fails to load.
 */
export function loaderFromDependencies(
  dependencies: Record<string, string>
): { loader: LoaderId; loaderVersion?: string } {
  if (dependencies['fabric-loader']) return { loader: 'fabric', loaderVersion: dependencies['fabric-loader'] }
  if (dependencies['quilt-loader']) return { loader: 'quilt', loaderVersion: dependencies['quilt-loader'] }
  if (dependencies.neoforge) return { loader: 'neoforge', loaderVersion: dependencies.neoforge }
  if (dependencies.forge) return { loader: 'forge', loaderVersion: dependencies.forge }
  return { loader: 'vanilla' }
}

/** Whether a pack file is meant for the client at all. */
export function isClientFile(file: { env?: { client?: string } }): boolean {
  return file.env?.client !== 'unsupported'
}

/**
 * What the index says, or an error naming what is missing.
 *
 * `fallbackName` is the archive's own file name, used when the pack did not
 * bother to give itself one — better than an empty profile name.
 */
export function readPackIndex(index: MrPackIndex, fallbackName: string): MrPackDetails {
  const gameVersion = index.dependencies?.minecraft
  if (!gameVersion) {
    throw new Error('Mod paketi hangi Minecraft sürümü için olduğunu söylemiyor.')
  }

  return {
    name: index.name?.trim() || fallbackName,
    versionId: index.versionId ?? '',
    gameVersion,
    fileCount: (index.files ?? []).filter(isClientFile).length,
    ...loaderFromDependencies(index.dependencies ?? {})
  }
}
