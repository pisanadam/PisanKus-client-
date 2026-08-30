import { createHash } from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { requireLeafName, resolveInside } from './pathSafety.ts'

/**
 * The screenshot list, and the thumbnails that make it viewable.
 *
 * The gallery shows the picture itself, not a placeholder, which means every
 * visit to the tab carries the images across the IPC boundary in one message.
 * Two things keep that affordable.
 *
 * The thumbnails are JPEG. A 360px slice of a 1080p screenshot is 185 KB as PNG
 * and 24 KB as JPEG — with base64's third on top, a folder of 200 shots is the
 * difference between a 48 MB message and a 6 MB one.
 *
 * And they are kept on disk. Decoding a full-size PNG and scaling it is the
 * expensive half, and its result never changes while the file does not, so it is
 * written once under the profile's cache folder and read back afterwards. The
 * key carries the file's size and modification time, so an edited or replaced
 * screenshot re-renders on its own, and the cache lives where the existing
 * "clean cache" storage action can throw it away.
 */

export interface ScreenshotEntry {
  fileName: string
  createdAt: number
  sizeMb: number
  /** `data:image/jpeg;base64,…`, or empty when the file is not a readable image. */
  thumbnail: string
}

/** Scales one image down and encodes it. Electron's `nativeImage`, in production. */
export type ThumbnailEncoder = (file: string) => Promise<Buffer | null>

export const THUMBNAIL_WIDTH = 360
export const THUMBNAIL_QUALITY = 80

/**
 * The cache file name for one screenshot.
 *
 * Size and modification time are part of the key rather than checked against the
 * cached file: a screenshot replaced by another of the same name simply lands on
 * a different name, so a stale thumbnail can never be served.
 */
export function thumbnailCacheName(fileName: string, mtimeMs: number, size: number): string {
  const key = [fileName, Math.round(mtimeMs), size, THUMBNAIL_WIDTH, THUMBNAIL_QUALITY].join(' ')
  return `${createHash('sha1').update(key).digest('hex')}.jpg`
}

async function writeAtomic(file: string, bytes: Buffer): Promise<void> {
  const temporary = `${file}.${process.pid}.tmp`
  await fsp.writeFile(temporary, bytes)
  await fsp.rename(temporary, file)
}

export async function listScreenshots(
  directory: string,
  cacheDir: string,
  encode: ThumbnailEncoder
): Promise<ScreenshotEntry[]> {
  const names = await fsp.readdir(directory).catch(() => [] as string[])
  const wanted = names.filter((name) => /\.(png|jpe?g)$/i.test(name))

  let cacheReady = false
  const live = new Set<string>()

  const images = await Promise.all(
    wanted.map(async (fileName) => {
      const file = resolveInside(directory, requireLeafName(fileName, 'Ekran görüntüsü'))
      const stat = await fsp.stat(file)
      const cacheName = thumbnailCacheName(fileName, stat.mtimeMs, stat.size)
      live.add(cacheName)
      const cacheFile = path.join(cacheDir, cacheName)

      let bytes: Buffer | null = await fsp.readFile(cacheFile).catch(() => null)
      if (!bytes) {
        bytes = await encode(file)
        if (bytes) {
          if (!cacheReady) {
            await fsp.mkdir(cacheDir, { recursive: true })
            cacheReady = true
          }
          // A cache that cannot be written is no reason to fail the listing; the
          // thumbnail is already in hand.
          await writeAtomic(cacheFile, bytes).catch(() => undefined)
        }
      }

      return {
        fileName,
        createdAt: stat.mtimeMs,
        sizeMb: Math.round(stat.size / 10_485.76) / 100,
        thumbnail: bytes ? `data:image/jpeg;base64,${bytes.toString('base64')}` : ''
      }
    })
  )

  // Deleted and re-rendered screenshots would otherwise leave their thumbnails
  // behind forever.
  const stale = await fsp.readdir(cacheDir).catch(() => [] as string[])
  for (const name of stale) {
    if (!live.has(name)) await fsp.rm(path.join(cacheDir, name), { force: true }).catch(() => undefined)
  }

  return images.sort((a, b) => b.createdAt - a.createdAt)
}
