import { createHash } from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export interface DownloadItem {
  url: string
  destination: string
  /** Mojang publishes SHA-1 for everything it serves. */
  sha1?: string
  /**
   * Adoptium publishes SHA-256 for its Java packages. Hashing one of those with
   * SHA-1 can never match, which is what made every Java download fail with
   * "Sağlama toplamı uyuşmuyor" — the algorithm has to travel with the digest.
   */
  sha256?: string
  size?: number
}

export interface DownloadOptions {
  concurrency?: number
  /** Called after each completed item with (completed, total, lastFileName). */
  onProgress?: (completed: number, total: number, current: string) => void
  signal?: AbortSignal
}

const USER_AGENT = 'PisanKusClient/1.0.0 (+https://github.com/pisanadam/PisanKus-client-)'

export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...(init.headers ?? {}) }
  })
  if (!response.ok) {
    throw new Error(`İstek başarısız (${response.status} ${response.statusText}): ${url}`)
  }
  return (await response.json()) as T
}

/** Same as `fetchJson`, for the handful of sources that only publish HTML. */
export async function fetchText(url: string, init: RequestInit = {}): Promise<string> {
  const response = await fetch(url, {
    ...init,
    headers: { 'User-Agent': USER_AGENT, ...(init.headers ?? {}) }
  })
  if (!response.ok) {
    throw new Error(`İstek başarısız (${response.status} ${response.statusText}): ${url}`)
  }
  return response.text()
}

export async function fileHash(file: string, algorithm: 'sha1' | 'sha256'): Promise<string> {
  const hash = createHash(algorithm)
  await pipeline(fs.createReadStream(file), hash)
  return hash.digest('hex')
}

export async function fileSha1(file: string): Promise<string> {
  return fileHash(file, 'sha1')
}

/** The digest an item should be checked against, if it declares one. */
function expectedHash(item: DownloadItem): { algorithm: 'sha1' | 'sha256'; value: string } | null {
  if (item.sha256) return { algorithm: 'sha256', value: item.sha256 }
  if (item.sha1) return { algorithm: 'sha1', value: item.sha1 }
  return null
}

/** True when the file already exists and matches the expected hash/size. */
async function isUpToDate(item: DownloadItem): Promise<boolean> {
  try {
    const stat = await fsp.stat(item.destination)
    if (!stat.isFile()) return false
    if (item.size != null && stat.size !== item.size) return false
    const expected = expectedHash(item)
    if (expected) return (await fileHash(item.destination, expected.algorithm)) === expected.value
    return item.size != null || stat.size > 0
  } catch {
    return false
  }
}

/** Fast offline readiness check: downloads already verified these files when saved. */
async function isPresent(item: DownloadItem): Promise<boolean> {
  try {
    const stat = await fsp.stat(item.destination)
    if (!stat.isFile()) return false
    if (item.size != null && stat.size !== item.size) return false
    return stat.size > 0
  } catch {
    return false
  }
}

/** Rejects an offline launch without ever attempting a network request. */
export async function assertLocalFiles(
  items: DownloadItem[],
  onProgress?: (completed: number, total: number, current: string) => void
): Promise<void> {
  const unique = [...new Map(items.map((item) => [item.destination, item])).values()]
  const missing: DownloadItem[] = []
  let cursor = 0
  let completed = 0

  const worker = async (): Promise<void> => {
    while (cursor < unique.length) {
      const item = unique[cursor++]
      if (!(await isPresent(item))) missing.push(item)
      completed++
      onProgress?.(completed, unique.length, path.basename(item.destination))
    }
  }

  await Promise.all(Array.from({ length: Math.min(24, unique.length) }, worker))
  if (missing.length === 0) return

  const examples = missing.slice(0, 3).map((item) => path.basename(item.destination)).join(', ')
  throw new Error(
    `Çevrimdışı başlatma için ${missing.length} dosya eksik veya bozuk${examples ? ` (${examples})` : ''}. ` +
      'İnternete bağlanıp “Dosyaları önceden indir” işlemini çalıştırın.'
  )
}

export async function downloadFile(item: DownloadItem, signal?: AbortSignal): Promise<void> {
  if (await isUpToDate(item)) return

  await fsp.mkdir(path.dirname(item.destination), { recursive: true })
  const temp = `${item.destination}.part`

  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(item.url, { headers: { 'User-Agent': USER_AGENT }, signal })
      if (!response.ok || !response.body) {
        throw new Error(`İndirme başarısız (${response.status}): ${item.url}`)
      }
      await pipeline(Readable.fromWeb(response.body as never), fs.createWriteStream(temp))

      const expected = expectedHash(item)
      if (expected) {
        const actual = await fileHash(temp, expected.algorithm)
        if (actual !== expected.value) {
          throw new Error(
            `Sağlama toplamı uyuşmuyor: ${path.basename(item.destination)} ` +
              `(beklenen ${expected.algorithm} ${expected.value.slice(0, 12)}…, gelen ${actual.slice(0, 12)}…)`
          )
        }
      }
      await fsp.rename(temp, item.destination)
      return
    } catch (error) {
      lastError = error
      if (signal?.aborted) break
      await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt))
    }
  }
  await fsp.rm(temp, { force: true })
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

/** Downloads every item with a bounded worker pool, reporting progress as it goes. */
export async function downloadAll(items: DownloadItem[], options: DownloadOptions = {}): Promise<void> {
  const { concurrency = 8, onProgress, signal } = options
  const total = items.length
  if (total === 0) return

  let cursor = 0
  let completed = 0
  const failures: Error[] = []

  const worker = async (): Promise<void> => {
    while (cursor < total) {
      if (signal?.aborted) return
      const item = items[cursor++]
      try {
        await downloadFile(item, signal)
      } catch (error) {
        failures.push(error instanceof Error ? error : new Error(String(error)))
      }
      completed++
      onProgress?.(completed, total, path.basename(item.destination))
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker))

  if (signal?.aborted) throw new Error('İndirme iptal edildi.')
  if (failures.length > 0) {
    throw new Error(`${failures.length} dosya indirilemedi. İlk hata: ${failures[0].message}`)
  }
}
