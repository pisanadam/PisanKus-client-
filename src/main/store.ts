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
    authMode: process.env.PISANKUS_MS_CLIENT_ID ? 'azure' : 'legacy',
    msClientId: process.env.PISANKUS_MS_CLIENT_ID || DEFAULT_CLIENT_ID,
    concurrentDownloads: 8,
    searchPageSize: 30,
    recentIcons: [],
    keepLauncherOpen: true,
    theme: 'dark',
    language: 'system',
    accentColor: '#14b8b8',
    soundEffects: true,
    minecraftOptions: '',
    minecraftServers: [],
    welcomeSeen: false
  }
}

const STORE_FILE = 'pisankus-client.json'

/** What the launcher was called, and what it stored, before it was renamed. */
const LEGACY_DIR_NAME = 'Opbay Client'
const LEGACY_STORE_FILE = 'opbay-client.json'
/** The old brand's default accent. Nobody chose it, so it does not survive. */
const LEGACY_DEFAULT_ACCENT = '#5b8cff'

/**
 * Copies one database file across, retiring the old default accent on the way.
 *
 * Every install that never opened the accent picker has the previous brand's
 * blue saved, so carrying the file over verbatim would leave the whole rebrand
 * invisible to exactly the people who already use the launcher. A colour the
 * player actually picked is left alone.
 */
function copyDatabase(from: string, to: string): void {
  try {
    const parsed = JSON.parse(fs.readFileSync(from, 'utf8')) as { settings?: Settings }
    if (parsed.settings?.accentColor !== LEGACY_DEFAULT_ACCENT) throw new Error('nothing to rewrite')
    parsed.settings.accentColor = defaultSettings().accentColor
    fs.writeFileSync(to, JSON.stringify(parsed, null, 2))
  } catch {
    // Unparseable, or nothing needed rewriting. Either way the bytes still have
    // to arrive: a damaged file is what the recovery path in `init` is for.
    fs.copyFileSync(from, to)
  }
}

/**
 * Carries an install made under the old name into the renamed one.
 *
 * `app.getPath('userData')` is derived from `productName`, so renaming the app
 * points it at an empty directory — every profile, account and saved skin would
 * look deleted. The old directory is a sibling of the new one on all three
 * platforms, so it can simply be found and copied.
 *
 * This copies rather than moves: the old install stays intact and working, which
 * is what makes the rename safe to roll back. Game data is not touched at all —
 * `settings.dataDir` is an absolute path, so it keeps pointing at the existing
 * (possibly multi-gigabyte) directory wherever that already is.
 */
function migrateLegacyUserData(userData: string): void {
  const target = path.join(userData, STORE_FILE)
  if (fs.existsSync(target)) return

  const legacyDir = path.join(path.dirname(userData), LEGACY_DIR_NAME)
  const legacyStore = path.join(legacyDir, LEGACY_STORE_FILE)
  if (legacyDir === userData || !fs.existsSync(legacyStore)) return

  try {
    fs.mkdirSync(userData, { recursive: true })
    copyDatabase(legacyStore, target)
    // The backup generation is worth carrying over too — it is the thing that
    // rescues the install if the live file turns out to be damaged.
    if (fs.existsSync(`${legacyStore}.bak`)) copyDatabase(`${legacyStore}.bak`, `${target}.bak`)

    // Saved skins are referenced by bare file name inside this folder, so the
    // database alone would leave the library pointing at nothing.
    const legacySkins = path.join(legacyDir, 'skins')
    const skins = path.join(userData, 'skins')
    if (fs.existsSync(legacySkins) && !fs.existsSync(skins)) {
      fs.cpSync(legacySkins, skins, { recursive: true })
    }
  } catch {
    // A failed migration must not stop the launcher from starting. The old
    // directory is untouched, so nothing has been lost — the player sees a
    // fresh install and their previous one is still there to retry from.
  }
}

/**
 * Tiny JSON-file store. Writes go through a temp file + rename so a crash mid-write
 * cannot leave a truncated database behind.
 */
class Store {
  private file = ''

  /** Last known-good copy, kept beside the live file. */
  private get backup(): string {
    return `${this.file}.bak`
  }

  private data: Database = { settings: defaultSettings(), profiles: [], accounts: [], savedSkins: [] }

  init(): void {
    const userData = app.getPath('userData')
    migrateLegacyUserData(userData)
    this.file = path.join(userData, STORE_FILE)
    // Reading the backup when the live file is unreadable is the whole point of
    // keeping one: an update, a full disk or a power cut must not be able to
    // turn "your profiles and settings" into "a fresh install".
    const source = fs.existsSync(this.file)
      ? this.file
      : fs.existsSync(this.backup)
        ? this.backup
        : null

    if (source) {
      try {
        const parsed = JSON.parse(fs.readFileSync(source, 'utf8')) as Partial<Database>
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
        // Unreadable. Keep it for support, then try yesterday's copy before
        // giving up and starting empty.
        fs.renameSync(source, `${this.file}.corrupt-${Date.now()}`)
        if (source !== this.backup && fs.existsSync(this.backup)) {
          try {
            fs.copyFileSync(this.backup, this.file)
            this.init()
            return
          } catch {
            // The backup is no better; start clean below.
          }
        }
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
    // Roll the file that is about to be replaced into the backup slot first, so
    // there is always one complete generation behind the live file.
    try {
      if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.backup)
    } catch {
      // A missing backup must never stop the launcher from saving.
    }
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

  /** Replaces the complete record when a failed disk transaction is restored. */
  restoreProfile(snapshot: Profile): Profile {
    const restored = structuredClone(snapshot)
    const index = this.data.profiles.findIndex((profile) => profile.id === restored.id)
    if (index >= 0) this.data.profiles[index] = restored
    else this.data.profiles.push(restored)
    this.save()
    return restored
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
