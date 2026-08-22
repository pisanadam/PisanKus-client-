import { BrowserWindow, shell } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import type { Account, AuthMode } from '../../shared/types'
import { fetchJson } from '../minecraft/downloader'
import { httpsTexture } from '../skins'

const XBL_AUTH = 'https://user.auth.xboxlive.com/user/authenticate'
const XSTS_AUTH = 'https://xsts.auth.xboxlive.com/xsts/authorize'
const MC_LOGIN = 'https://api.minecraftservices.com/authentication/login_with_xbox'
const MC_PROFILE = 'https://api.minecraftservices.com/minecraft/profile'
const MC_ENTITLEMENTS = 'https://api.minecraftservices.com/entitlements/mcstore'

/**
 * Microsoft runs two separate identity platforms and a client id is registered
 * with exactly one of them.
 *
 * `legacy` is the platform Minecraft's own launcher client id lives on. It has
 * no PKCE and hands back a ticket Xbox Live accepts as-is.
 *
 * `azure` is the modern v2.0 platform, which requires an app registered in
 * Azure AD. Its tickets must be prefixed with `d=` for Xbox Live.
 *
 * Sending a client id to the wrong platform fails with a flat 400
 * (`unauthorized_client` / AADSTS700016), which is why the mode is explicit
 * rather than guessed.
 */
const ENDPOINTS = {
  legacy: {
    authorize: 'https://login.live.com/oauth20_authorize.srf',
    token: 'https://login.live.com/oauth20_token.srf',
    redirect: 'https://login.live.com/oauth20_desktop.srf',
    scope: 'service::user.auth.xboxlive.com::MBI_SSL',
    usePkce: false,
    rpsPrefix: ''
  },
  azure: {
    authorize: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
    token: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
    redirect: 'https://login.microsoftonline.com/common/oauth2/nativeclient',
    scope: 'XboxLive.signin offline_access',
    usePkce: true,
    rpsPrefix: 'd='
  }
} as const satisfies Record<AuthMode, unknown>

interface MsToken {
  access_token: string
  refresh_token: string
  expires_in: number
}

interface XboxResponse {
  Token: string
  /**
   * `uhs` is the user hash the Minecraft login needs; `xid` is the Xbox user id
   * the game itself is launched with. Only the XSTS response carries `xid`.
   */
  DisplayClaims: { xui: { uhs: string; xid?: string }[] }
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
  /**
   * Set when the session itself is the problem and signing in again is the
   * fix — the UI turns it into a button rather than leaving the player to
   * work out where to go.
   */
  readonly needsSignIn: boolean

  constructor(message: string, readonly code: string, needsSignIn = false) {
    super(message)
    this.needsSignIn = needsSignIn
  }
}

/**
 * Posts a form and turns Microsoft's own error payload into the message the
 * user sees — the raw status code alone says nothing actionable.
 */
async function postForm<T>(url: string, body: Record<string, string>): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString()
  })

  const text = await response.text()
  if (response.ok) return JSON.parse(text) as T

  let code = 'ms_token_failed'
  let detail = text.slice(0, 300)
  try {
    const parsed = JSON.parse(text) as { error?: string; error_description?: string }
    code = parsed.error ?? code
    detail = parsed.error_description ?? detail
  } catch {
    // Not JSON — the raw body is the best detail available.
  }

  if (code === 'unauthorized_client' || detail.includes('AADSTS700016')) {
    throw new AuthError(
      'Bu istemci kimliği Azure platformunda kayıtlı değil. Ayarlar → Hesap bölümünden oturum açma ' +
        'yöntemini “Minecraft (varsayılan)” yapın ya da geçerli bir Azure uygulama kimliği girin.',
      code
    )
  }

  throw new AuthError(detail.split('Trace ID')[0].trim(), code)
}

interface Pkce {
  verifier: string
  challenge: string
}

function createPkce(): Pkce {
  const verifier = randomBytes(48).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

/**
 * Opens the Microsoft login page in a dedicated window and resolves once the
 * redirect carrying the authorization code is observed.
 */
function requestAuthCode(clientId: string, mode: AuthMode): Promise<{ code: string; pkce: Pkce | null }> {
  const endpoints = ENDPOINTS[mode]
  const pkce = endpoints.usePkce ? createPkce() : null
  const state = randomBytes(16).toString('hex')

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: endpoints.redirect,
    scope: endpoints.scope,
    state
  })
  if (pkce) {
    params.set('code_challenge', pkce.challenge)
    params.set('code_challenge_method', 'S256')
  }
  // Always ask which account, on both platforms. Without it Microsoft signs the
  // window straight back in as whoever it saw last and redirects before anything
  // is drawn — the window appears and shuts itself, and a second account can
  // never be added because the same one comes back every time.
  params.set('prompt', 'select_account')

  // A partition with no `persist:` prefix is an in-memory one, thrown away with
  // the window, and a fresh name gives every attempt an empty cookie jar. The
  // shared persistent jar this used to have was what made repeated tries hammer
  // login.live.com with the same silent sign-in until it answered "too many
  // requests". Nothing is lost by dropping the cookies: the account itself is
  // kept as a refresh token, not as a browser session.
  const partition = `msa-${randomBytes(8).toString('hex')}`

  return new Promise((resolve, reject) => {
    const window = new BrowserWindow({
      width: 520,
      height: 720,
      autoHideMenuBar: true,
      title: 'Microsoft ile oturum aç',
      webPreferences: { nodeIntegration: false, contextIsolation: true, partition }
    })

    let settled = false
    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      fn()
      if (!window.isDestroyed()) window.destroy()
    }

    const inspect = (rawUrl: string): void => {
      if (!rawUrl.startsWith(endpoints.redirect)) return
      const url = new URL(rawUrl)
      // The legacy platform answers on the query string, the modern one too.
      const search = url.searchParams

      const error = search.get('error')
      if (error) {
        finish(() => reject(new AuthError(search.get('error_description') ?? error, error)))
        return
      }
      const code = search.get('code')
      if (!code) return
      // The legacy platform does not echo `state`, so it is only checked when sent back.
      if (search.has('state') && search.get('state') !== state) {
        finish(() => reject(new AuthError('Oturum durumu doğrulanamadı.', 'state_mismatch')))
        return
      }
      finish(() => resolve({ code, pkce }))
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

    void window.loadURL(`${endpoints.authorize}?${params}`)
  })
}

async function xboxLive(msAccessToken: string, mode: AuthMode): Promise<{ token: string; uhs: string }> {
  const xbl = await fetchJson<XboxResponse>(XBL_AUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `${ENDPOINTS[mode].rpsPrefix}${msAccessToken}`
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT'
    })
  })
  return { token: xbl.Token, uhs: xbl.DisplayClaims.xui[0].uhs }
}

async function xsts(xblToken: string): Promise<{ token: string; xuid: string | undefined }> {
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
    // Documented XSTS failure codes — plain language helps far more than the number.
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
  const xsts = (await response.json()) as XboxResponse
  return { token: xsts.Token, xuid: xsts.DisplayClaims?.xui?.[0]?.xid }
}

/** Runs the Xbox → Minecraft half of the chain and returns a ready-to-store account. */
async function completeMinecraftLogin(msToken: MsToken, mode: AuthMode): Promise<Account> {
  const { token: xblToken, uhs } = await xboxLive(msToken.access_token, mode)
  const { token: xstsToken, xuid } = await xsts(xblToken)

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
    xuid,
    accessToken: mcLogin.access_token,
    expiresAt: Date.now() + mcLogin.expires_in * 1000,
    refreshToken: msToken.refresh_token,
    authMode: mode,
    skinUrl: httpsTexture(profile.skins?.find((skin) => skin.state === 'ACTIVE')?.url),
    capeId: profile.capes?.find((cape) => cape.state === 'ACTIVE')?.id,
    addedAt: Date.now()
  }
}

export async function signIn(clientId: string, mode: AuthMode): Promise<Account> {
  const { code, pkce } = await requestAuthCode(clientId, mode)
  const endpoints = ENDPOINTS[mode]

  const body: Record<string, string> = {
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: endpoints.redirect,
    scope: endpoints.scope
  }
  if (pkce) body.code_verifier = pkce.verifier

  return completeMinecraftLogin(await postForm<MsToken>(endpoints.token, body), mode)
}

/** Renews an account in place; throws when the refresh token itself has expired. */
export async function refresh(account: Account, clientId: string): Promise<Account> {
  // Accounts remember how they were signed in, so a mode change in settings
  // cannot break sessions that already exist.
  const mode = account.authMode ?? 'legacy'
  const endpoints = ENDPOINTS[mode]

  if (!account.refreshToken) {
    throw new AuthError('Bu hesabın kayıtlı oturumu okunamadı.', 'no_refresh_token', true)
  }

  // `scope` is required on both platforms. Its absence is only reachable once
  // the refresh token itself checks out, so a launcher that omitted it appeared
  // to work for as long as the first access token lived and then failed every
  // action at once with "must include a 'scope' input parameter".
  const body: Record<string, string> = {
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: account.refreshToken,
    redirect_uri: endpoints.redirect,
    scope: endpoints.scope
  }

  const msToken = await postForm<MsToken>(endpoints.token, body).catch((error: unknown) => {
    if (!(error instanceof AuthError)) throw error

    // Nothing the launcher can retry in the background fixes a refusal here, so
    // every one of them becomes the same offer: sign in again. Microsoft's own
    // wording ("input parameter 'refresh_token' or 'assertion'") is replaced,
    // since it tells the player nothing about what to do.
    const message =
      error.code === 'invalid_grant'
        ? 'Microsoft oturumunuzun süresi doldu.'
        : `Microsoft oturumu yenilenemedi: ${error.message}`
    throw new AuthError(message, error.code, true)
  })

  const renewed = await completeMinecraftLogin(msToken, mode)
  return { ...renewed, addedAt: account.addedAt }
}

/** Refreshes only when the token is expired or within five minutes of expiring. */
export async function ensureValid(account: Account, clientId: string): Promise<Account> {
  if (account.expiresAt - Date.now() > 5 * 60_000) return account
  return refresh(account, clientId)
}
