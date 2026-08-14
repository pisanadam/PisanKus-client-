import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { Account, Profile, SavedSkin, Settings } from '../shared/types'
import { encryptionStatus, protect, reveal } from './secrets'

interface Database {
  settings: Settings
  profiles: Profile[]
  accounts: Account[]
  activeAccountId?: string
  savedSkins: SavedSkin[]
}

// Minecraft's own launcher client id. It lives on the legacy MSA platform, not
// Azure AD — signing in against the v2.0 endpoints with it fails outright.
const DEFAULT_CLIENT_ID = '00000000402b5328'

function defaultSettings(): Settings {
  return {
    dataDir: path.join(app.getPath('userData'), 'minecraft'),
    defaultMemoryMb: 4096,
    jvmArgs:
      '-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:G1NewSizePercent=20 ' +
      '-XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=32M',
    authMode: process.env.OPBAY_MS_CLIENT_ID ? 'azure' : 'legacy',
    msClientId: process.env.OPBAY_MS_CLIENT_ID || DEFAULT_CLIENT_ID,
    concurrentDownloads: 8,
    searchPageSize: 30,
    keepLauncherOpen: true,
    theme: 'dark',
    accentColor: '#5b8cff',
    soundEffects: true,
    minecraftOptions: '',
    welcomeSeen: false,
    supportUrl: '',
    supportStrip: true
  }
}

/**
 * Tiny JSON-file store. Writes go through a temp file + rename so a crash mid-write
 * cannot leave a truncated database behind.
 */
class Store {
  private file = ''
  private data: Database = { settings: defaultSettings(), profiles: [], accounts: [], savedSkins: [] }

  init(): void {
    this.file = path.join(app.getPath('userData'), 'opbay-client.json')
    if (fs.existsSync(this.file)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<Database>
        this.data = {
          settings: { ...defaultSettings(), ...(parsed.settings ?? {}) },
          profiles: parsed.profiles ?? [],
          // A token that cannot be decrypted (different OS user, reset keyring)
          // becomes empty, which reads as an expired session and asks for a
          // fresh sign-in rather than failing in some obscure way later.
          accounts: (parsed.accounts ?? []).map((account) => ({
            ...account,
            accessToken: reveal(account.accessToken) ?? '',
            refreshToken: reveal(account.refreshToken) ?? ''
          })),
          activeAccountId: parsed.activeAccountId,
          savedSkins: parsed.savedSkins ?? []
        }
      } catch {
        // Corrupt database: keep a copy for support, then start clean.
        fs.renameSync(this.file, `${this.file}.corrupt-${Date.now()}`)
      }
    }
    fs.mkdirSync(this.data.settings.dataDir, { recursive: true })
    // Rewrites the file, which is also what migrates tokens that were stored in
    // the clear by an earlier build.
    this.save()
  }

  /** Reported in Settings so the player can see where their tokens are kept. */
  get encryption(): { available: boolean; backend: string } {
    return encryptionStatus()
  }

  private save(): void {
    // Tokens are the only secrets here, and they never touch the disk in the
    // clear. Everything else stays readable so the file remains debuggable.
    const onDisk: Database = {
      ...this.data,
      accounts: this.data.accounts.map((account) => ({
        ...account,
        accessToken: protect(account.accessToken) ?? '',
        refreshToken: protect(account.refreshToken) ?? ''
      }))
    }

    const tmp = `${this.file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(onDisk, null, 2))
    fs.renameSync(tmp, this.file)
  }

  get settings(): Settings {
    return this.data.settings
  }

  updateSettings(patch: Partial<Settings>): Settings {
    this.data.settings = { ...this.data.settings, ...patch }
    fs.mkdirSync(this.data.settings.dataDir, { recursive: true })
    this.save()
    return this.data.settings
  }

  get profiles(): Profile[] {
    return this.data.profiles
  }

  profile(id: string): Profile | undefined {
    return this.data.profiles.find((p) => p.id === id)
  }

  addProfile(profile: Omit<Profile, 'id' | 'createdAt' | 'content' | 'totalPlaytimeMs'>): Profile {
    const created: Profile = {
      ...profile,
      id: randomUUID(),
      content: [],
      totalPlaytimeMs: 0,
      createdAt: Date.now()
    }
    fs.mkdirSync(created.directory, { recursive: true })
    this.data.profiles.push(created)
    this.save()
    return created
  }

  updateProfile(id: string, patch: Partial<Profile>): Profile {
    const profile = this.profile(id)
    if (!profile) throw new Error(`Profil bulunamadı: ${id}`)
    Object.assign(profile, patch, { id: profile.id })
    this.save()
    return profile
  }

  removeProfile(id: string): void {
    this.data.profiles = this.data.profiles.filter((p) => p.id !== id)
    this.save()
  }

  get savedSkins(): SavedSkin[] {
    return this.data.savedSkins
  }

  addSavedSkin(skin: SavedSkin): SavedSkin[] {
    this.data.savedSkins.push(skin)
    this.save()
    return this.data.savedSkins
  }

  removeSavedSkin(id: string): SavedSkin[] {
    this.data.savedSkins = this.data.savedSkins.filter((skin) => skin.id !== id)
    this.save()
    return this.data.savedSkins
  }

  renameSavedSkin(id: string, name: string): SavedSkin[] {
    const skin = this.data.savedSkins.find((candidate) => candidate.id === id)
    if (skin) skin.name = name
    this.save()
    return this.data.savedSkins
  }

  get accounts(): Account[] {
    return this.data.accounts
  }

  get activeAccount(): Account | undefined {
    return this.data.accounts.find((a) => a.id === this.data.activeAccountId) ?? this.data.accounts[0]
  }

  upsertAccount(account: Account): Account {
    const index = this.data.accounts.findIndex((a) => a.id === account.id)
    if (index >= 0) this.data.accounts[index] = account
    else this.data.accounts.push(account)
    this.data.activeAccountId ??= account.id
    this.save()
    return account
  }

  setActiveAccount(id: string): void {
    this.data.activeAccountId = id
    this.save()
  }

  removeAccount(id: string): void {
    this.data.accounts = this.data.accounts.filter((a) => a.id !== id)
    if (this.data.activeAccountId === id) this.data.activeAccountId = this.data.accounts[0]?.id
    this.save()
  }
}

export const store = new Store()
