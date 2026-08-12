import { BrowserWindow, shell } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import type { Account } from '../../shared/types'
import { fetchJson } from '../minecraft/downloader'

const MS_AUTHORITY = 'https://login.microsoftonline.com/consumers/oauth2/v2.0'
const XBL_AUTH = 'https://user.auth.xboxlive.com/user/authenticate'
const XSTS_AUTH = 'https://xsts.auth.xboxlive.com/xsts/authorize'
const MC_LOGIN = 'https://api.minecraftservices.com/authentication/login_with_xbox'
const MC_PROFILE = 'https://api.minecraftservices.com/minecraft/profile'
const MC_ENTITLEMENTS = 'https://api.minecraftservices.com/entitlements/mcstore'
const REDIRECT_URI = 'https://login.microsoftonline.com/common/oauth2/nativeclient'
const SCOPE = 'XboxLive.signin offline_access'

interface MsToken {
  access_token: string
  refresh_token: string
  expires_in: number
}

interface XboxResponse {
  Token: string
  DisplayClaims: { xui: { uhs: string }[] }
}

interface McLoginResponse {
  access_token: string
  expires_in: number
}

interface McProfileResponse {
  id: string
  name: string
  skins?: { id: string; state: string; url: string; variant: string }[]
  capes?: { id: string; state: string; url: string }[]
}

/** Errors surfaced to the UI verbatim, so they must stay human-readable. */
export class AuthError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
  }
}

async function postForm<T>(url: string, body: Record<string, string>): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString()
  })
  const text = await response.text()
  if (!response.ok) {
    throw new AuthError(`Microsoft yanıtı: ${text.slice(0, 300)}`, 'ms_token_failed')
  }
  return JSON.parse(text) as T
}

/**
 * Opens the Microsoft login page in a dedicated window and resolves once the
 * redirect carrying the authorization code is observed. PKCE keeps the flow
 * safe for a public client that ships no secret.
 */
function requestAuthCode(clientId: string): Promise<{ code: string; verifier: string }> {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const state = randomBytes(16).toString('hex')

  const authUrl =
    `${MS_AUTHORITY}/authorize?` +
    new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: SCOPE,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account'
    }).toString()

  return new Promise((resolve, reject) => {
    const window = new BrowserWindow({
      width: 520,
      height: 720,
      autoHideMenuBar: true,
      title: 'Microsoft ile oturum aç',
      webPreferences: { nodeIntegration: false, contextIsolation: true, partition: 'persist:msa' }
    })

    let settled = false
    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      fn()
      if (!window.isDestroyed()) window.destroy()
    }

    const inspect = (rawUrl: string): void => {
      if (!rawUrl.startsWith(REDIRECT_URI)) return
      const params = new URL(rawUrl).searchParams
      const error = params.get('error')
      if (error) {
        const description = params.get('error_description') ?? error
        finish(() => reject(new AuthError(description, error)))
        return
      }
      const code = params.get('code')
      if (!code) return
      if (params.get('state') !== state) {
        finish(() => reject(new AuthError('Oturum durumu doğrulanamadı.', 'state_mismatch')))
        return
      }
      finish(() => resolve({ code, verifier }))
    }

    window.webContents.on('will-redirect', (_event, url) => inspect(url))
    window.webContents.on('will-navigate', (_event, url) => inspect(url))
    // Links such as "create an account" should open in the system browser.
    window.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url)
      return { action: 'deny' }
    })
    window.on('closed', () => {
      finish(() => reject(new AuthError('Oturum açma penceresi kapatıldı.', 'cancelled')))
    })

    void window.loadURL(authUrl)
  })
}

async function xboxLive(msAccessToken: string): Promise<{ token: string; uhs: string }> {
  const xbl = await fetchJson<XboxResponse>(XBL_AUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `d=${msAccessToken}`
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT'
    })
  })
  return { token: xbl.Token, uhs: xbl.DisplayClaims.xui[0].uhs }
}

async function xsts(xblToken: string): Promise<string> {
  const response = await fetch(XSTS_AUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      Properties: { SandboxId: 'RETAIL', UserTokens: [xblToken] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT'
    })
  })

  if (response.status === 401) {
    const body = (await response.json().catch(() => ({}))) as { XErr?: number }
    // Documented XSTS failure codes — plain-language messages help far more than the raw number.
    const messages: Record<number, string> = {
      2148916233: 'Bu Microsoft hesabına bağlı bir Xbox profili yok. Önce xbox.com üzerinden profil oluşturun.',
      2148916235: 'Xbox Live bu ülkede kullanılamıyor.',
      2148916236: 'Hesap için yetişkin doğrulaması gerekiyor.',
      2148916238: 'Çocuk hesabı bir aile grubuna eklenmeden oturum açamaz.'
    }
    throw new AuthError(
      messages[body.XErr ?? 0] ?? 'Xbox Live doğrulaması reddedildi.',
      `xsts_${body.XErr ?? 'unknown'}`
    )
  }
  if (!response.ok) throw new AuthError('XSTS doğrulaması başarısız.', 'xsts_failed')
  return ((await response.json()) as XboxResponse).Token
}

/** Runs the Xbox → Minecraft half of the chain and returns a ready-to-store account. */
async function completeMinecraftLogin(msToken: MsToken): Promise<Account> {
  const { token: xblToken, uhs } = await xboxLive(msToken.access_token)
  const xstsToken = await xsts(xblToken)

  const mcLogin = await fetchJson<McLoginResponse>(MC_LOGIN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identityToken: `XBL3.0 x=${uhs};${xstsToken}` })
  })

  const entitlements = await fetchJson<{ items: { name: string }[] }>(MC_ENTITLEMENTS, {
    headers: { Authorization: `Bearer ${mcLogin.access_token}` }
  })
  if (!entitlements.items?.some((item) => item.name === 'product_minecraft' || item.name === 'game_minecraft')) {
    throw new AuthError(
      'Bu hesapta Minecraft: Java Edition lisansı bulunamadı. Oyunu satın aldığınız hesapla giriş yapın.',
      'no_entitlement'
    )
  }

  const profile = await fetchJson<McProfileResponse>(MC_PROFILE, {
    headers: { Authorization: `Bearer ${mcLogin.access_token}` }
  })

  return {
    id: profile.id,
    name: profile.name,
    accessToken: mcLogin.access_token,
    expiresAt: Date.now() + mcLogin.expires_in * 1000,
    refreshToken: msToken.refresh_token,
    skinUrl: profile.skins?.find((skin) => skin.state === 'ACTIVE')?.url,
    capeId: profile.capes?.find((cape) => cape.state === 'ACTIVE')?.id,
    addedAt: Date.now()
  }
}

export async function signIn(clientId: string): Promise<Account> {
  const { code, verifier } = await requestAuthCode(clientId)
  const msToken = await postForm<MsToken>(`${MS_AUTHORITY}/token`, {
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
    scope: SCOPE
  })
  return completeMinecraftLogin(msToken)
}

/** Renews an account in place; throws when the refresh token itself has expired. */
export async function refresh(account: Account, clientId: string): Promise<Account> {
  const msToken = await postForm<MsToken>(`${MS_AUTHORITY}/token`, {
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: account.refreshToken,
    scope: SCOPE
  })
  const renewed = await completeMinecraftLogin(msToken)
  return { ...renewed, addedAt: account.addedAt }
}

/** Refreshes only when the token is expired or within five minutes of expiring. */
export async function ensureValid(account: Account, clientId: string): Promise<Account> {
  if (account.expiresAt - Date.now() > 5 * 60_000) return account
  return refresh(account, clientId)
}
