import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { Account, Profile, Settings } from '../shared/types'

interface Database {
  settings: Settings
  profiles: Profile[]
  accounts: Account[]
  activeAccountId?: string
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
    keepLauncherOpen: true,
    theme: 'dark',
    accentColor: '#5b8cff',
    soundEffects: true,
    welcomeSeen: false
  }
}

/**
 * Tiny JSON-file store. Writes go through a temp file + rename so a crash mid-write
 * cannot leave a truncated database behind.
 */
class Store {
  private file = ''
  private data: Database = { settings: defaultSettings(), profiles: [], accounts: [] }

  init(): void {
    this.file = path.join(app.getPath('userData'), 'opbay-client.json')
    if (fs.existsSync(this.file)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<Database>
        this.data = {
          settings: { ...defaultSettings(), ...(parsed.settings ?? {}) },
          profiles: parsed.profiles ?? [],
          accounts: parsed.accounts ?? [],
          activeAccountId: parsed.activeAccountId
        }
      } catch {
        // Corrupt database: keep a copy for support, then start clean.
        fs.renameSync(this.file, `${this.file}.corrupt-${Date.now()}`)
      }
    }
    fs.mkdirSync(this.data.settings.dataDir, { recursive: true })
    this.save()
  }

  private save(): void {
    const tmp = `${this.file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2))
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
