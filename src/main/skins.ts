import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { Account, SavedSkin } from '../shared/types'
import { store } from './store'

const MC_API = 'https://api.minecraftservices.com/minecraft/profile'

export type SkinVariant = 'classic' | 'slim'

/** A texture the renderer can paint directly, with its real pixel size. */
export interface Texture {
  dataUrl: string
  width: number
  height: number
}

export interface SkinInfo {
  skinUrl?: string
  variant: SkinVariant
  capes: { id: string; alias: string; url: string; active: boolean }[]
}

/**
 * Mojang hands back texture URLs over plain http. The renderer's content policy
 * only permits https images — and textures.minecraft.net serves https fine — so
 * the scheme is upgraded here rather than by widening the policy to allow any
 * plaintext image.
 */
export function httpsTexture(url: string | undefined): string | undefined {
  if (!url) return undefined
  return url.replace(/^http:\/\//i, 'https://')
}

/**
 * Only Mojang's own texture hosts may be fetched on the renderer's behalf.
 * Without this the IPC below would be a general-purpose proxy that lets the page
 * pull any url it likes through the main process, straight past the content
 * policy that exists to stop exactly that.
 */
const TEXTURE_HOSTS = /(^|\.)(minecraft\.net|mojang\.com)$/i

// Skins are a few kilobytes each and rarely change during a session.
const textureCache = new Map<string, Texture>()
const TEXTURE_CACHE_LIMIT = 48

/**
 * Fetches a skin or cape texture and returns it as a data url.
 *
 * The renderer used to point `background-image` straight at the texture url,
 * which meant every avatar depended on the page's own network access and on the
 * url surviving the content policy — an account stored before the https fix
 * kept an http url and simply rendered an empty square. Handing over the bytes
 * removes both failure modes.
 */
export async function textureDataUrl(rawUrl: string): Promise<Texture> {
  const url = httpsTexture(rawUrl)!
  const cached = textureCache.get(url)
  if (cached) return cached

  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || !TEXTURE_HOSTS.test(parsed.hostname)) {
    throw new Error(`Bu adresten doku yüklenemez: ${parsed.hostname}`)
  }

  const response = await fetch(url)
  if (!response.ok) throw new Error(`Doku indirilemedi (${response.status}).`)

  const buffer = Buffer.from(await response.arrayBuffer())
  const texture: Texture = {
    dataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
    ...pngSize(buffer)
  }

  if (textureCache.size >= TEXTURE_CACHE_LIMIT) {
    textureCache.delete(textureCache.keys().next().value as string)
  }
  textureCache.set(url, texture)
  return texture
}

/**
 * Reads the dimensions out of a PNG's IHDR chunk, which always comes first.
 *
 * The model needs these to place UV cuts: skins are 64×64, but capes are 64×32
 * and old accounts still carry 64×32 skins. Guessing would misalign every face.
 */
function pngSize(buffer: Buffer): { width: number; height: number } {
  const signature = buffer.subarray(0, 8).toString('hex')
  if (signature !== '89504e470d0a1a0a') throw new Error('Doku PNG değil.')
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

interface ProfileResponse {
  id: string
  name: string
  skins?: { id: string; state: string; url: string; variant: string }[]
  capes?: { id: string; state: string; url: string; alias: string }[]
}

/** Mojang sends no Retry-After, so this is the wait we assume. */
export const DEFAULT_COOLDOWN = 60

/**
 * Mojang refused because the account changed its skin too often.
 *
 * Carries the wait so the interface can count it down instead of letting the
 * player press again and extend the cooldown.
 */
export class RateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super(
      `Mojang skin değiştirme sınırına takıldı. ${retryAfterSeconds} saniye sonra tekrar deneyin. ` +
        'Bu sınır Mojang tarafında ve kayıtlı skinleri silmekle geçmez.'
    )
    this.name = 'RateLimitError'
  }
}

async function authorized<T>(account: Account, url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      'User-Agent': 'OpbayClient/1.0.0',
      ...(init.headers ?? {})
    }
  })

  if (response.status === 401) {
    throw new Error('Oturum süresi doldu. Hesabınızı yeniden bağlayın.')
  }
  if (response.status === 429) {
    // Mojang rate-limits skin and cape changes hard, and the limit is a
    // server-side cooldown: it does not clear by undoing anything locally.
    const seconds = Number.parseInt(response.headers.get('retry-after') ?? '', 10)
    throw new RateLimitError(Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_COOLDOWN)
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Minecraft servisleri isteği reddetti (${response.status}). ${detail.slice(0, 200)}`)
  }
  // Cape removal answers 200 with an empty body.
  const text = await response.text()
  return (text ? JSON.parse(text) : {}) as T
}

export async function getSkinInfo(account: Account): Promise<SkinInfo> {
  const profile = await authorized<ProfileResponse>(account, MC_API)
  const active = profile.skins?.find((skin) => skin.state === 'ACTIVE')
  return {
    skinUrl: httpsTexture(active?.url),
    variant: active?.variant?.toLowerCase() === 'slim' ? 'slim' : 'classic',
    capes: (profile.capes ?? []).map((cape) => ({
      id: cape.id,
      alias: cape.alias,
      url: httpsTexture(cape.url) ?? cape.url,
      active: cape.state === 'ACTIVE'
    }))
  }
}

export interface LocalSkin {
  path: string
  name: string
  texture: Texture
}

/**
 * Validates a picked PNG and hands it back for preview. Nothing is sent to
 * Mojang until the user presses apply.
 */
export async function readLocalSkin(filePath: string): Promise<LocalSkin> {
  const buffer = await fsp.readFile(filePath)
  await assertValidSkin(buffer)
  return {
    path: filePath,
    name: path.basename(filePath),
    texture: {
      dataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
      ...pngSize(buffer)
    }
  }
}

/** Uploads a local PNG as the account's skin. */
export async function uploadSkin(account: Account, filePath: string, variant: SkinVariant): Promise<SkinInfo> {
  const buffer = await fsp.readFile(filePath)
  await assertValidSkin(buffer)

  const form = new FormData()
  form.append('variant', variant)
  form.append('file', new Blob([buffer], { type: 'image/png' }), path.basename(filePath))

  await authorized(account, `${MC_API}/skins`, { method: 'POST', body: form })
  return getSkinInfo(account)
}

/** Applies a skin already hosted somewhere public (e.g. a NameMC url). */
export async function setSkinFromUrl(account: Account, url: string, variant: SkinVariant): Promise<SkinInfo> {
  await authorized(account, `${MC_API}/skins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ variant, url })
  })
  return getSkinInfo(account)
}

export async function resetSkin(account: Account): Promise<SkinInfo> {
  await authorized(account, `${MC_API}/skins/active`, { method: 'DELETE' })
  return getSkinInfo(account)
}

export async function setCape(account: Account, capeId: string | null): Promise<SkinInfo> {
  if (capeId === null) {
    await authorized(account, `${MC_API}/capes/active`, { method: 'DELETE' })
  } else {
    await authorized(account, `${MC_API}/capes/active`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capeId })
    })
  }
  return getSkinInfo(account)
}

/**
 * Minecraft only accepts 64×64 (or legacy 64×32) PNGs. Checking here turns a
 * confusing HTTP 400 into an explanation the user can act on.
 */
async function assertValidSkin(buffer: Buffer): Promise<void> {
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (!isPng) throw new Error('Skin dosyası PNG biçiminde olmalı.')

  // IHDR always starts at byte 16 in a valid PNG.
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  const valid = (width === 64 && height === 64) || (width === 64 && height === 32)
  if (!valid) {
    throw new Error(`Skin boyutu 64×64 (veya eski biçim 64×32) olmalı. Seçilen dosya ${width}×${height}.`)
  }
  if (buffer.byteLength > 24_576) {
    throw new Error('Skin dosyası 24 KB sınırını aşıyor.')
  }
}


// --- the player's own skin library ----------------------------------------

/**
 * Where saved skins live. Kept beside the launcher's database rather than in
 * the game directory: the library belongs to the launcher, and moving the game
 * directory should not lose it.
 */
function libraryDir(): string {
  return path.join(app.getPath('userData'), 'skins')
}

export function savedSkins(): SavedSkin[] {
  return store.savedSkins
}

/** Reads a saved skin back as a texture the model can draw. */
export async function savedSkinTexture(id: string): Promise<Texture> {
  const skin = store.savedSkins.find((candidate) => candidate.id === id)
  if (!skin) throw new Error('Kayıtlı skin bulunamadı.')

  const buffer = await fsp.readFile(path.join(libraryDir(), skin.fileName))
  return { dataUrl: `data:image/png;base64,${buffer.toString('base64')}`, ...pngSize(buffer) }
}

/** Copies a PNG into the library. The bytes are kept, not the original path. */
export async function saveSkinBuffer(
  buffer: Buffer,
  name: string,
  variant: SkinVariant
): Promise<SavedSkin[]> {
  await assertValidSkin(buffer)

  const id = randomUUID()
  const fileName = `${id}.png`
  await fsp.mkdir(libraryDir(), { recursive: true })
  await fsp.writeFile(path.join(libraryDir(), fileName), buffer)

  return store.addSavedSkin({ id, name, variant, fileName, addedAt: Date.now() })
}

/**
 * Saves the skin currently on the account by downloading it from Mojang, so the
 * library holds the real texture rather than a link that can go stale.
 */
export async function saveSkinFromUrl(
  url: string,
  name: string,
  variant: SkinVariant
): Promise<SavedSkin[]> {
  const texture = await textureDataUrl(url)
  const buffer = Buffer.from(texture.dataUrl.split(',')[1], 'base64')
  return saveSkinBuffer(buffer, name, variant)
}

export async function removeSavedSkin(id: string): Promise<SavedSkin[]> {
  const skin = store.savedSkins.find((candidate) => candidate.id === id)
  if (skin) await fsp.rm(path.join(libraryDir(), skin.fileName), { force: true })
  return store.removeSavedSkin(id)
}

/** Applies a library skin to the account. */
export async function applySavedSkin(account: Account, id: string): Promise<SkinInfo> {
  const skin = store.savedSkins.find((candidate) => candidate.id === id)
  if (!skin) throw new Error('Kayıtlı skin bulunamadı.')
  return uploadSkin(account, path.join(libraryDir(), skin.fileName), skin.variant)
}
