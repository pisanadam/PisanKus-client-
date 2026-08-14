import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import yauzl, { type Entry, type ZipFile } from 'yauzl'
import { resolveInside } from './pathSafety.ts'

const MAX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024 * 1024
const FILE_TYPE_MASK = 0o170000
const DIRECTORY_TYPE = 0o040000
const SYMLINK_TYPE = 0o120000

export interface ExtractZipOptions {
  dir: string
  /** Return false for entries that should not be materialised. */
  filter?: (entryName: string) => boolean
}

function openZip(file: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) reject(error ?? new Error('Zip arşivi açılamadı.'))
      else resolve(zip)
    })
  })
}

function openEntry(zip: ZipFile, entry: Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) reject(error ?? new Error(`Arşiv girdisi okunamadı: ${entry.fileName}`))
      else resolve(stream)
    })
  })
}

/**
 * Extracts a zip while rejecting path traversal, links, encrypted entries and
 * unexpectedly large expanded archives. Links are unnecessary for every format
 * the launcher accepts and are the usual route out of an extraction directory.
 */
export async function extractZip(file: string, options: ExtractZipOptions): Promise<void> {
  const root = path.resolve(options.dir)
  await fsp.mkdir(root, { recursive: true })
  const zip = await openZip(file)
  let expandedBytes = 0

  await new Promise<void>((resolve, reject) => {
    let settled = false
    const fail = (error: unknown): void => {
      if (settled) return
      settled = true
      zip.close()
      reject(error)
    }

    zip.on('error', fail)
    zip.on('end', () => {
      if (!settled) {
        settled = true
        resolve()
      }
    })
    zip.on('entry', (entry: Entry) => {
      void (async () => {
        if (entry.generalPurposeBitFlag & 0x1) {
          throw new Error(`Şifreli arşiv girdileri desteklenmiyor: ${entry.fileName}`)
        }

        const mode = (entry.externalFileAttributes >>> 16) & 0xffff
        const fileType = mode & FILE_TYPE_MASK
        if (fileType === SYMLINK_TYPE) {
          throw new Error(`Arşiv bağlantı içeremez: ${entry.fileName}`)
        }

        expandedBytes += entry.uncompressedSize
        if (expandedBytes > MAX_UNCOMPRESSED_BYTES) {
          throw new Error('Arşiv açıldığında izin verilen 20 GB sınırını aşıyor.')
        }

        const meaningfulSegments = entry.fileName
          .replace(/\\/g, '/')
          .split('/')
          .filter((segment) => segment && segment !== '.')
        if (meaningfulSegments.length === 0) {
          zip.readEntry()
          return
        }

        // Resolve before creating anything so even a rejected path cannot leave
        // directories outside the extraction root.
        const target = resolveInside(root, entry.fileName, 'Arşiv girdisi')
        const isDirectory = fileType === DIRECTORY_TYPE || entry.fileName.endsWith('/')
        if (isDirectory) {
          if (options.filter?.(entry.fileName) !== false) await fsp.mkdir(target, { recursive: true })
          zip.readEntry()
          return
        }

        if (options.filter?.(entry.fileName) === false) {
          zip.readEntry()
          return
        }

        await fsp.mkdir(path.dirname(target), { recursive: true })
        const input = await openEntry(zip, entry)
        await pipeline(input, fs.createWriteStream(target, { mode: (mode & 0o777) || 0o644 }))
        if (process.platform !== 'win32' && (mode & 0o777) !== 0) {
          await fsp.chmod(target, mode & 0o777)
        }
        zip.readEntry()
      })().catch(fail)
    })

    zip.readEntry()
  })
}
