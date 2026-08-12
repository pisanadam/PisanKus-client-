import fsp from 'node:fs/promises'
import path from 'node:path'
import type { Account } from '../shared/types'

const MC_API = 'https://api.minecraftservices.com/minecraft/profile'

export type SkinVariant = 'classic' | 'slim'

export interface SkinInfo {
  skinUrl?: string
  variant: SkinVariant
  capes: { id: string; alias: string; url: string; active: boolean }[]
}

interface ProfileResponse {
  id: string
  name: string
  skins?: { id: string; state: string; url: string; variant: string }[]
  capes?: { id: string; state: string; url: string; alias: string }[]
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
    skinUrl: active?.url,
    variant: active?.variant?.toLowerCase() === 'slim' ? 'slim' : 'classic',
    capes: (profile.capes ?? []).map((cape) => ({
      id: cape.id,
      alias: cape.alias,
      url: cape.url,
      active: cape.state === 'ACTIVE'
    }))
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
