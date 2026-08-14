import { useEffect, useMemo, useRef, useState } from 'react'
import type { ContentKind, InstalledContent, LoaderId } from '../../shared/types'
import { Icon } from '../components/Icon'
import { OptionsEditor } from '../components/OptionsEditor'
import { ProfileIcon } from '../components/ProfileIcon'
import { parseOptions } from '../../shared/options'
import { Confirm } from '../components/Modal'
import type { WorldSummary } from '../../preload'
import { api } from '../lib/api'
import { formatPlaytime, formatRelative, loaderLabel } from '../lib/format'
import { useApp } from '../state/AppContext'

type Tab = 'mods' | 'resourcepacks' | 'shaders' | 'worlds' | 'logs' | 'settings'

const TABS: { id: Tab; label: string; kind?: ContentKind }[] = [
  { id: 'mods', label: 'Modlar', kind: 'mod' },
  { id: 'resourcepacks', label: 'Doku paketleri', kind: 'resourcepack' },
  { id: 'shaders', label: 'Shaderlar', kind: 'shader' },
  { id: 'worlds', label: 'Dünyalar', kind: 'world' },
  { id: 'logs', label: 'Günlük' },
  { id: 'settings', label: 'Ayarlar' }
]

export function ProfileDetail({
  profileId,
  onBack,
  onBrowse
}: {
  profileId: string
  onBack: () => void
  onBrowse: (profileId: string) => void
}): JSX.Element {
  const { profiles, refreshProfiles, gameStates, notify } = useApp()
  const profile = profiles.find((entry) => entry.id === profileId)

  // The recorded list can lag behind the folders — a modpack writes its jars
  // straight to disk, and players drop files in themselves. Reconciling on open
  // is what keeps the tabs honest.
  useEffect(() => {
    api.content
      .sync(profileId)
      .then(() => refreshProfiles())
      .catch(() => undefined)
  }, [profileId, refreshProfiles])
  const [tab, setTab] = useState<Tab>('mods')
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!profile) {
    return (
      <div className="page">
        <div className="empty">
          <div className="empty__title">Profil bulunamadı</div>
          <button className="btn" onClick={onBack}>
            Kitaplığa dön
          </button>
        </div>
      </div>
    )
  }

  const state = gameStates[profile.id]
  const running = state === 'running' || state === 'preparing'

  return (
    <div className="page">
      <header className="page__header">
        <button className="btn btn--ghost btn--icon" onClick={onBack} aria-label="Geri">
          <Icon name="close" size={18} />
        </button>
        <div>
          <h1 className="page__title">
            <ProfileIcon profile={profile} size={30} />{' '}
            {profile.preparing && (
              <span className="badge badge--accent" style={{ marginRight: 8 }}>
                Hazırlanıyor
              </span>
            )}
            {profile.name}
          </h1>
          <p className="page__subtitle">
            {profile.gameVersion} · {loaderLabel(profile.loader)}
            {profile.loaderVersion ? ` ${profile.loaderVersion}` : ''} ·{' '}
            {formatPlaytime(profile.totalPlaytimeMs)} oynandı · son oynama {formatRelative(profile.lastPlayed)}
          </p>
        </div>
        <div className="topbar__spacer" />

        <button className="btn" onClick={() => void api.profiles.openFolder(profile.id)}>
          <Icon name="folder" size={16} />
          Klasör
        </button>
        <button className="btn" onClick={() => onBrowse(profile.id)}>
          <Icon name="compass" size={16} />
          İçerik ekle
        </button>
        {running ? (
          <button className="btn btn--danger" onClick={() => void api.game.kill(profile.id)}>
            <Icon name="stop" size={16} />
            Durdur
          </button>
        ) : (
          <button
            className="btn btn--primary"
            onClick={async () => {
              try {
                await api.game.launch(profile.id)
              } catch (error) {
                notify(error, 'error')
              }
            }}
          >
            <Icon name="play" size={16} />
            Oyna
          </button>
        )}
      </header>

      <nav className="tabs">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            className="tab"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
            {entry.kind && entry.kind !== 'world' && (
              <span className="nav-item__badge" style={{ marginLeft: 8 }}>
                {profile.content.filter((item) => item.kind === entry.kind).length}
              </span>
            )}
          </button>
        ))}
      </nav>

      {tab !== 'logs' && tab !== 'settings' && tab !== 'worlds' && (
        <ContentTab
          profileId={profile.id}
          kind={TABS.find((entry) => entry.id === tab)!.kind!}
          items={profile.content.filter((item) => item.kind === TABS.find((entry) => entry.id === tab)!.kind)}
          onChanged={refreshProfiles}
          onBrowse={() => onBrowse(profile.id)}
        />
      )}

      {tab === 'worlds' && <WorldsTab profileId={profile.id} />}
      {tab === 'logs' && <LogsTab profileId={profile.id} />}
      {tab === 'settings' && (
        <ProfileSettingsTab profileId={profile.id} onDeleteRequested={() => setConfirmDelete(true)} />
      )}

      {confirmDelete && (
        <Confirm
          title="Profili sil"
          danger
          confirmLabel="Profili ve dosyaları sil"
          message={
            <>
              <strong>{profile.name}</strong> profili ve <code>{profile.directory}</code> klasöründeki tüm modlar,
              dünyalar ve ayarlar kalıcı olarak silinecek. Bu işlem geri alınamaz.
            </>
          }
          onConfirm={async () => {
            await api.profiles.remove(profile.id, true)
            await refreshProfiles()
            onBack()
          }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}

function ContentTab({
  profileId,
  kind,
  items,
  onChanged,
  onBrowse
}: {
  profileId: string
  kind: ContentKind
  items: InstalledContent[]
  onChanged: () => Promise<void>
  onBrowse: () => void
}): JSX.Element {
  const { notify } = useApp()
  const [checking, setChecking] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [dropping, setDropping] = useState(false)

  const updatable = items.filter((item) => item.updateAvailable)

  /**
   * Takes files dropped anywhere on the tab. What each one is gets decided in
   * the main process by looking inside the archive, so a world, a resource pack
   * and a handful of mods can be dropped together.
   */
  const acceptDrop = async (event: React.DragEvent): Promise<void> => {
    event.preventDefault()
    setDropping(false)

    const paths = [...event.dataTransfer.files].map((file) => api.app.pathForFile(file)).filter(Boolean)
    if (paths.length === 0) return

    await run('import', async () => {
      await api.content.importPaths(profileId, paths)
      notify(paths.length === 1 ? 'Dosya kuruldu.' : `${paths.length} dosya kuruldu.`)
    })
  }

  const run = async (id: string, action: () => Promise<unknown>): Promise<void> => {
    setBusyId(id)
    try {
      await action()
      await onChanged()
    } catch (error) {
      notify(error, 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div
      className={dropping ? 'stack-lg dropzone dropzone--over' : 'stack-lg dropzone'}
      onDragOver={(event) => {
        event.preventDefault()
        setDropping(true)
      }}
      onDragLeave={(event) => {
        // Moving between children fires dragleave too; only leaving the tab counts.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false)
      }}
      onDrop={(event) => void acceptDrop(event)}
    >
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn--primary" onClick={onBrowse}>
          <Icon name="compass" size={16} />
          Mağazadan ekle
        </button>
        <button
          className="btn"
          onClick={() => void run('import', () => api.content.importLocal(profileId, kind))}
          disabled={busyId === 'import'}
        >
          <Icon name="folder" size={16} />
          Dosyadan ekle
        </button>
        <button
          className="btn"
          disabled={checking || items.length === 0}
          onClick={async () => {
            setChecking(true)
            try {
              await api.content.checkUpdates(profileId)
              await onChanged()
            } catch (error) {
              notify(error, 'error')
            } finally {
              setChecking(false)
            }
          }}
        >
          {checking ? <div className="spinner" /> : <Icon name="refresh" size={16} />}
          Güncellemeleri denetle
        </button>

        <div className="topbar__spacer" />

        {updatable.length > 0 && (
          <button
            className="btn btn--primary"
            onClick={async () => {
              for (const item of updatable) {
                await run(item.id, () => api.content.update(profileId, item.id))
              }
            }}
          >
            <Icon name="download" size={16} />
            {updatable.length} güncellemeyi uygula
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="empty empty--droppable">
          <div className="empty__icon">{dropping ? '📥' : '📭'}</div>
          <div className="empty__title">
            {dropping ? 'Bırakın, kuralım' : 'Bu profilde içerik yok'}
          </div>
          <p>
            Mağazadan kurabilir, dosya seçebilir ya da <strong>jar, dünya, doku paketi ve shader</strong>{' '}
            dosyalarını doğrudan buraya sürükleyebilirsiniz.
          </p>
        </div>
      ) : (
        <div className="list">
          {items.map((item) => (
            <div key={item.id} className={item.enabled ? 'list__row' : 'list__row list__row--disabled'}>
              {item.iconUrl ? (
                <img className="list__icon" src={item.iconUrl} alt="" loading="lazy" />
              ) : (
                <div className="list__icon" />
              )}

              <div className="list__main">
                <div className="list__title">
                  {item.name}
                  {item.updateAvailable && (
                    <span className="badge badge--accent" style={{ marginLeft: 8 }}>
                      güncelleme var
                    </span>
                  )}
                  {item.source === 'local' && (
                    <span className="badge" style={{ marginLeft: 8 }}>
                      yerel
                    </span>
                  )}
                </div>
                <div className="list__sub">{item.fileName}</div>
              </div>

              {item.updateAvailable && (
                <button
                  className="btn btn--sm btn--primary"
                  disabled={busyId === item.id}
                  onClick={() => void run(item.id, () => api.content.update(profileId, item.id))}
                >
                  <Icon name="download" size={14} />
                  Güncelle
                </button>
              )}

              <button
                className="switch"
                role="switch"
                aria-checked={item.enabled}
                aria-label={item.enabled ? 'Devre dışı bırak' : 'Etkinleştir'}
                disabled={busyId === item.id}
                onClick={() => void run(item.id, () => api.content.toggle(profileId, item.id, !item.enabled))}
              />

              <button
                className="btn btn--ghost btn--icon"
                aria-label="Kaldır"
                disabled={busyId === item.id}
                onClick={() => void run(item.id, () => api.content.remove(profileId, item.id))}
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function WorldsTab({ profileId }: { profileId: string }): JSX.Element {
  const { notify } = useApp()
  const [worlds, setWorlds] = useState<WorldSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState<WorldSummary | null>(null)

  const reload = async (): Promise<void> => {
    setLoading(true)
    try {
      setWorlds(await api.worlds.list(profileId))
    } catch (error) {
      notify(error, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId])

  return (
    <div className="stack-lg">
      <div className="row">
        <button
          className="btn btn--primary"
          onClick={async () => {
            try {
              const imported = await api.content.importLocal(profileId, 'world')
              if (imported.length > 0) await reload()
            } catch (error) {
              notify(error, 'error')
            }
          }}
        >
          <Icon name="download" size={16} />
          Dünya içe aktar (.zip)
        </button>
        <button className="btn" onClick={() => void reload()}>
          <Icon name="refresh" size={16} />
          Yenile
        </button>
      </div>

      {loading ? (
        <div className="row" style={{ justifyContent: 'center', padding: 30 }}>
          <div className="spinner" />
        </div>
      ) : worlds.length === 0 ? (
        <div className="empty">
          <div className="empty__icon">🌍</div>
          <div className="empty__title">Kayıtlı dünya yok</div>
          <p>Oyunda yeni bir dünya oluşturun ya da elinizdeki bir dünya arşivini içe aktarın.</p>
        </div>
      ) : (
        <div className="list">
          {worlds.map((world) => (
            <div key={world.folderName} className="list__row">
              <div className="list__icon" style={{ display: 'grid', placeItems: 'center' }}>
                🌍
              </div>
              <div className="list__main">
                <div className="list__title">{world.displayName}</div>
                <div className="list__sub">
                  {world.sizeMb} MB · son değişiklik {formatRelative(world.lastPlayed)}
                </div>
              </div>
              <button
                className="btn btn--ghost btn--icon"
                aria-label="Dünyayı sil"
                onClick={() => setPendingDelete(world)}
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {pendingDelete && (
        <Confirm
          title="Dünyayı sil"
          danger
          confirmLabel="Kalıcı olarak sil"
          message={
            <>
              <strong>{pendingDelete.displayName}</strong> dünyası ve içindeki tüm ilerleme silinecek. Bu işlem
              geri alınamaz.
            </>
          }
          onConfirm={async () => {
            setWorlds(await api.worlds.remove(profileId, pendingDelete.folderName))
          }}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}

function LogsTab({ profileId }: { profileId: string }): JSX.Element {
  const { logs, clearLogs } = useApp()
  const lines = logs[profileId] ?? []
  const consoleRef = useRef<HTMLDivElement>(null)
  const [follow, setFollow] = useState(true)

  useEffect(() => {
    if (follow && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    }
  }, [lines, follow])

  return (
    <div className="stack-lg">
      <div className="row">
        <button className="chip" aria-pressed={follow} onClick={() => setFollow((value) => !value)}>
          Otomatik kaydır
        </button>
        <button className="btn btn--sm" onClick={() => clearLogs(profileId)}>
          Temizle
        </button>
        <button
          className="btn btn--sm"
          onClick={() => void navigator.clipboard.writeText(lines.map((line) => line.line).join('\n'))}
          disabled={lines.length === 0}
        >
          <Icon name="copy" size={15} />
          Kopyala
        </button>
        <div className="topbar__spacer" />
        <span className="faint">{lines.length} satır</span>
      </div>

      <div className="console" ref={consoleRef}>
        {lines.length === 0 ? (
          <span className="muted">Oyun çalıştığında günlük çıktısı burada görünür.</span>
        ) : (
          lines.map((line, index) => (
            <div key={index} className={`console__line--${line.stream}`}>
              {line.line}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function ProfileSettingsTab({
  profileId,
  onDeleteRequested
}: {
  profileId: string
  onDeleteRequested: () => void
}): JSX.Element {
  const { profiles, refreshProfiles, notify } = useApp()
  const profile = profiles.find((entry) => entry.id === profileId)!

  const [name, setName] = useState(profile.name)
  const [memory, setMemory] = useState(profile.memoryMb)
  const [jvmArgs, setJvmArgs] = useState(profile.jvmArgs ?? '')
  const [loaderVersions, setLoaderVersions] = useState<{ version: string; stable: boolean }[]>([])
  const [loaderVersion, setLoaderVersion] = useState(profile.loaderVersion ?? '')
  const [saving, setSaving] = useState(false)
  const [options, setOptions] = useState<{ text: string; onDisk: boolean } | null>(null)
  const [editingOptions, setEditingOptions] = useState(false)

  // Read straight from the profile's folder rather than from the global
  // template: what matters here is the file the game will actually load.
  const loadOptions = (): void => {
    api.profiles
      .readOptions(profileId)
      .then(setOptions)
      .catch(() => setOptions(null))
  }
  useEffect(loadOptions, [profileId])

  useEffect(() => {
    if (profile.loader === 'vanilla') return
    void (async () => {
      try {
        setLoaderVersions(await api.versions.loaders(profile.loader, profile.gameVersion))
      } catch {
        setLoaderVersions([])
      }
    })()
  }, [profile.loader, profile.gameVersion])

  const dirty =
    name !== profile.name ||
    memory !== profile.memoryMb ||
    jvmArgs !== (profile.jvmArgs ?? '') ||
    loaderVersion !== (profile.loaderVersion ?? '')

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await api.profiles.update(profileId, {
        name: name.trim() || profile.name,
        memoryMb: memory,
        jvmArgs: jvmArgs.trim() || undefined,
        loaderVersion: loaderVersion || undefined
      })
      await refreshProfiles()
    } catch (error) {
      notify(error, 'error')
    } finally {
      setSaving(false)
    }
  }

  const totalMemory = useMemo(() => 32768, [])

  const optionCount = options ? parseOptions(options.text).filter((line) => !('raw' in line)).length : 0

  return (
    <div className="stack-lg" style={{ maxWidth: 760 }}>
      {editingOptions && options && (
        <OptionsEditor
          value={options.text}
          notify={notify}
          onClose={() => setEditingOptions(false)}
          onSave={async (text) => {
            await api.profiles.writeOptions(profileId, text)
            setOptions({ text, onDisk: true })
            setEditingOptions(false)
            notify('Bu profilin oyun ayarları kaydedildi.')
          }}
        />
      )}

      <div className="settings-group">
        <div className="settings-row">
          <div>
            <div className="settings-row__label">Profil adı</div>
            <div className="faint">Kitaplıkta görünen ad</div>
          </div>
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row__label">Simge</div>
            <div className="faint">
              {profile.iconImage ? 'Kendi görseliniz kullanılıyor' : 'PNG veya JPG yükleyebilirsiniz'}
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <ProfileIcon profile={profile} size={34} />
            <button
              className="btn btn--sm"
              onClick={async () => {
                try {
                  if (await api.profiles.pickIcon(profileId)) await refreshProfiles()
                } catch (error) {
                  notify(error, 'error')
                }
              }}
            >
              <Icon name="image" size={15} />
              Görsel seç
            </button>
            {profile.iconImage && (
              <button
                className="btn btn--sm"
                onClick={async () => {
                  await api.profiles.clearIcon(profileId)
                  await refreshProfiles()
                }}
              >
                Kaldır
              </button>
            )}
          </div>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row__label">Oyun ayarları</div>
            <div className="faint">
              {options === null
                ? 'Okunuyor…'
                : options.onDisk
                  ? `Bu profilin options.txt dosyası · ${optionCount} ayar`
                  : 'Bu profilde henüz options.txt yok — kaydedince oluşturulur'}
            </div>
          </div>
          <button className="btn btn--sm" disabled={options === null} onClick={() => setEditingOptions(true)}>
            <Icon name="settings" size={15} />
            Düzenle
          </button>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row__label">Ayrılan bellek</div>
            <div className="faint">{(memory / 1024).toFixed(1)} GB — büyük mod paketleri için 6 GB+ önerilir</div>
          </div>
          <input
            type="range"
            min={1024}
            max={totalMemory}
            step={512}
            value={memory}
            onChange={(event) => setMemory(Number(event.target.value))}
          />
        </div>

        {profile.loader !== 'vanilla' && loaderVersions.length > 0 && (
          <div className="settings-row">
            <div>
              <div className="settings-row__label">{loaderLabel(profile.loader)} sürümü</div>
              <div className="faint">Değiştirildiğinde bir sonraki başlatmada kurulur</div>
            </div>
            <select
              className="select"
              value={loaderVersion}
              onChange={(event) => setLoaderVersion(event.target.value)}
            >
              <option value="">En son kararlı</option>
              {loaderVersions.map((entry) => (
                <option key={entry.version} value={entry.version}>
                  {entry.version}
                  {entry.stable ? '' : ' (kararsız)'}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label className="field__label" htmlFor="jvm-args">
            JVM argümanları
          </label>
          <textarea
            id="jvm-args"
            className="textarea"
            value={jvmArgs}
            placeholder="Boş bırakılırsa genel ayarlardaki değerler kullanılır"
            onChange={(event) => setJvmArgs(event.target.value)}
          />
        </div>

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn--primary" onClick={() => void save()} disabled={!dirty || saving}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </div>

      <div className="settings-group">
        <div className="section-title">Bakım</div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button
            className="btn"
            onClick={async () => {
              try {
                await api.game.prepare(profileId)
              } catch (error) {
                notify(error, 'error')
              }
            }}
          >
            <Icon name="download" size={16} />
            Dosyaları önceden indir
          </button>
          <button
            className="btn"
            onClick={async () => {
              await api.profiles.duplicate(profileId)
              await refreshProfiles()
            }}
          >
            <Icon name="copy" size={16} />
            Profili kopyala
          </button>
          <div className="topbar__spacer" />
          <button className="btn btn--danger" onClick={onDeleteRequested}>
            <Icon name="trash" size={16} />
            Profili sil
          </button>
        </div>
      </div>
    </div>
  )
}

export type { LoaderId }
