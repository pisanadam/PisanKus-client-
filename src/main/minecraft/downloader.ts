import { createHash } from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export interface DownloadItem {
  url: string
  destination: string
  sha1?: string
  size?: number
}

export interface DownloadOptions {
  concurrency?: number
  /** Called after each completed item with (completed, total, lastFileName). */
  onProgress?: (completed: number, total: number, current: string) => void
  signal?: AbortSignal
}

const USER_AGENT = 'OpbayClient/1.0.0 (+https://github.com/pisanadam/opbay-client-)'

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

export async function fileSha1(file: string): Promise<string> {
  const hash = createHash('sha1')
  await pipeline(fs.createReadStream(file), hash)
  return hash.digest('hex')
}

/** True when the file already exists and matches the expected hash/size. */
async function isUpToDate(item: DownloadItem): Promise<boolean> {
  try {
    const stat = await fsp.stat(item.destination)
    if (!stat.isFile()) return false
    if (item.size != null && stat.size !== item.size) return false
    if (item.sha1) return (await fileSha1(item.destination)) === item.sha1
    return item.size != null || stat.size > 0
  } catch {
    return false
  }
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

      if (item.sha1) {
        const actual = await fileSha1(temp)
        if (actual !== item.sha1) {
          throw new Error(`Sağlama toplamı uyuşmuyor: ${path.basename(item.destination)}`)
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
