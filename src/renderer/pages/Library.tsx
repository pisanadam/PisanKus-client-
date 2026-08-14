import { useEffect, useMemo, useState } from 'react'
import type { LoaderId, Profile, VersionSummary } from '../../shared/types'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { api } from '../lib/api'
import { formatPlaytime, formatRelative, loaderLabel } from '../lib/format'
import { useApp } from '../state/AppContext'

const LOADERS: LoaderId[] = ['vanilla', 'fabric', 'legacyfabric', 'quilt', 'neoforge', 'forge']
const ICONS = ['🎮', '⛏️', '🌲', '🔥', '🧪', '🏰', '🚀', '🐉', '💎', '🌌', '🍄', '⚙️']

export function Library({ onOpenProfile }: { onOpenProfile: (id: string) => void }): JSX.Element {
  const { profiles, refreshProfiles, gameStates, notify } = useApp()
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('tr')
    const matching = needle
      ? profiles.filter(
          (profile) =>
            profile.name.toLocaleLowerCase('tr').includes(needle) || profile.gameVersion.includes(needle)
        )
      : profiles
    return [...matching].sort((a, b) => (b.lastPlayed ?? b.createdAt) - (a.lastPlayed ?? a.createdAt))
  }, [profiles, query])

  const launch = async (profile: Profile): Promise<void> => {
    setBusyId(profile.id)
    try {
      await api.game.launch(profile.id)
    } catch (error) {
      notify(error, 'error')
    } finally {
      setBusyId(null)
    }
  }

  const stop = async (profile: Profile): Promise<void> => {
    await api.game.kill(profile.id)
  }

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Kitaplık</h1>
          <p className="page__subtitle">
            {profiles.length} profil · her biri kendi mod, dünya ve ayar klasörüne sahip
          </p>
        </div>
        <div className="topbar__spacer" />
        <div className="search" style={{ maxWidth: 260 }}>
          <span className="search__icon">
            <Icon name="search" size={16} />
          </span>
          <input
            className="input"
            placeholder="Profil ara…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <button className="btn btn--primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={17} />
          Yeni profil
        </button>
      </header>

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="empty__icon">🎮</div>
          <div className="empty__title">{profiles.length === 0 ? 'Henüz profil yok' : 'Eşleşen profil yok'}</div>
          <p>
            {profiles.length === 0
              ? 'Bir profil oluşturun; mod yükleyicisi, sürüm ve bellek ayarları profile özel tutulur.'
              : 'Arama terimini değiştirmeyi deneyin.'}
          </p>
          {profiles.length === 0 && (
            <button className="btn btn--primary" onClick={() => setCreating(true)}>
              <Icon name="plus" size={17} />
              İlk profili oluştur
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid--profiles">
          {filtered.map((profile) => {
            const state = gameStates[profile.id]
            const running = state === 'running' || state === 'preparing'
            return (
              <div key={profile.id} className="profile-card">
                <button
                  className="profile-card__art"
                  onClick={() => onOpenProfile(profile.id)}
                  aria-label={`${profile.name} profilini aç`}
                >
                  {profile.icon?.startsWith('http') ? (
                    <img src={profile.icon} alt="" />
                  ) : (
                    <span>{profile.icon ?? '🎮'}</span>
                  )}
                  {running && (
                    <span className="profile-card__running">
                      <span className="nav-item__dot" style={{ width: 6, height: 6, background: 'currentColor' }} />
                      {state === 'preparing' ? 'Hazırlanıyor' : 'Çalışıyor'}
                    </span>
                  )}
                </button>

                <div className="profile-card__body">
                  <div className="profile-card__name">{profile.name}</div>
                  <div className="profile-card__meta">
                    <span>{profile.gameVersion}</span>
                    <span>·</span>
                    <span>{loaderLabel(profile.loader)}</span>
                    {profile.content.length > 0 && (
                      <>
                        <span>·</span>
                        <span>{profile.content.length} içerik</span>
                      </>
                    )}
                  </div>
                  <div className="faint">
                    {profile.lastPlayed
                      ? `Son oynama ${formatRelative(profile.lastPlayed)} · ${formatPlaytime(profile.totalPlaytimeMs)}`
                      : 'Hiç oynanmadı'}
                  </div>
                </div>

                <div className="profile-card__actions">
                  {running ? (
                    <button className="btn btn--danger btn--sm" onClick={() => void stop(profile)}>
                      <Icon name="stop" size={15} />
                      Durdur
                    </button>
                  ) : (
                    <button
                      className="btn btn--primary btn--sm"
                      onClick={() => void launch(profile)}
                      disabled={busyId === profile.id}
                    >
                      <Icon name="play" size={15} />
                      Oyna
                    </button>
                  )}
                  <button className="btn btn--sm" onClick={() => onOpenProfile(profile.id)}>
                    Yönet
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {creating && (
        <CreateProfileModal
          onClose={() => setCreating(false)}
          onCreated={async (profile) => {
            await refreshProfiles()
            setCreating(false)
            onOpenProfile(profile.id)
          }}
        />
      )}
    </div>
  )
}

function CreateProfileModal({
  onClose,
  onCreated
}: {
  onClose: () => void
  onCreated: (profile: Profile) => void | Promise<void>
}): JSX.Element {
  const { notify } = useApp()
  const [versions, setVersions] = useState<VersionSummary[]>([])
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [loaderVersions, setLoaderVersions] = useState<{ version: string; stable: boolean }[]>([])

  const [name, setName] = useState('')
  const [gameVersion, setGameVersion] = useState('')
  const [loader, setLoader] = useState<LoaderId>('fabric')
  const [loaderVersion, setLoaderVersion] = useState('')
  const [icon, setIcon] = useState(ICONS[0])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const list = await api.versions.list()
        setVersions(list)
        setGameVersion(list.find((version) => version.type === 'release')?.id ?? list[0]?.id ?? '')
      } catch (error) {
        notify(error, 'error')
      }
    })()
  }, [notify])

  // Loader versions depend on the selected game version, so refetch on change.
  useEffect(() => {
    if (!gameVersion || loader === 'vanilla') {
      setLoaderVersions([])
      setLoaderVersion('')
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const list = await api.versions.loaders(loader, gameVersion)
        if (cancelled) return
        setLoaderVersions(list)
        setLoaderVersion(list.find((entry) => entry.stable)?.version ?? list[0]?.version ?? '')
      } catch {
        if (!cancelled) setLoaderVersions([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loader, gameVersion])

  const visibleVersions = useMemo(
    () => versions.filter((version) => showSnapshots || version.type === 'release'),
    [versions, showSnapshots]
  )

  const submit = async (): Promise<void> => {
    if (!name.trim() || !gameVersion) return
    setSaving(true)
    try {
      const profile = await api.profiles.create({
        name: name.trim(),
        gameVersion,
        loader,
        loaderVersion: loader === 'vanilla' ? undefined : loaderVersion || undefined,
        icon
      })
      await onCreated(profile)
    } catch (error) {
      notify(error, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Yeni profil"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn btn--primary"
            onClick={() => void submit()}
            disabled={saving || !name.trim() || !gameVersion}
          >
            {saving ? 'Oluşturuluyor…' : 'Oluştur'}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field__label" htmlFor="profile-name">
          Profil adı
        </label>
        <input
          id="profile-name"
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Örn. Hayatta Kalma 1.21"
          autoFocus
        />
      </div>

      <div className="field">
        <span className="field__label">Simge</span>
        <div className="chips">
          {ICONS.map((candidate) => (
            <button
              key={candidate}
              className="chip"
              aria-pressed={icon === candidate}
              onClick={() => setIcon(candidate)}
            >
              {candidate}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field__label">Mod yükleyicisi</span>
        <div className="chips">
          {LOADERS.map((candidate) => (
            <button
              key={candidate}
              className="chip"
              aria-pressed={loader === candidate}
              onClick={() => setLoader(candidate)}
            >
              {loaderLabel(candidate)}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="row row--between">
          <label className="field__label" htmlFor="game-version">
            Minecraft sürümü
          </label>
          <button className="btn btn--ghost btn--sm" onClick={() => setShowSnapshots((value) => !value)}>
            {showSnapshots ? 'Anlık görüntüleri gizle' : 'Anlık görüntüleri göster'}
          </button>
        </div>
        <select
          id="game-version"
          className="select"
          value={gameVersion}
          onChange={(event) => setGameVersion(event.target.value)}
        >
          {visibleVersions.map((version) => (
            <option key={version.id} value={version.id}>
              {version.id}
              {version.type !== 'release' ? ` (${version.type})` : ''}
            </option>
          ))}
        </select>
      </div>

      {loader !== 'vanilla' && (
        <div className="field">
          <label className="field__label" htmlFor="loader-version">
            {loaderLabel(loader)} sürümü
          </label>
          {loaderVersions.length === 0 ? (
            <p className="field__hint">
              Bu Minecraft sürümü için {loaderLabel(loader)} bulunamadı. Farklı bir sürüm veya yükleyici seçin.
            </p>
          ) : (
            <select
              id="loader-version"
              className="select"
              value={loaderVersion}
              onChange={(event) => setLoaderVersion(event.target.value)}
            >
              {loaderVersions.map((entry) => (
                <option key={entry.version} value={entry.version}>
                  {entry.version}
                  {entry.stable ? '' : ' (kararsız)'}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </Modal>
  )
}
