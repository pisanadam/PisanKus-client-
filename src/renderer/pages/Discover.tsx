import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ContentKind, ProjectVersion, SearchQuery, SearchResult } from '../../shared/types'
import { Icon } from '../components/Icon'
import { InstallDialog } from '../components/InstallDialog'
import { Modal } from '../components/Modal'
import { api } from '../lib/api'
import { errorMessage, formatBytes, formatCount, formatRelative } from '../lib/format'
import { useApp } from '../state/AppContext'

const KINDS: { id: ContentKind; label: string; icon: string }[] = [
  { id: 'mod', label: 'Modlar', icon: '🧩' },
  { id: 'modpack', label: 'Mod paketleri', icon: '📦' },
  { id: 'resourcepack', label: 'Doku paketleri', icon: '🎨' },
  { id: 'shader', label: 'Shaderlar', icon: '✨' },
  { id: 'datapack', label: 'Veri paketleri', icon: '📜' },
  { id: 'world', label: 'Dünyalar', icon: '🌍' }
]

const SORTS: { id: NonNullable<SearchQuery['sort']>; label: string }[] = [
  { id: 'relevance', label: 'İlgili' },
  { id: 'downloads', label: 'İndirme' },
  { id: 'follows', label: 'Takipçi' },
  { id: 'updated', label: 'Güncellenme' },
  { id: 'newest', label: 'Yeni' }
]

export function Discover({ initialProfileId }: { initialProfileId?: string }): JSX.Element {
  const { profiles, notify, refreshProfiles } = useApp()

  const [kind, setKind] = useState<ContentKind>('mod')
  const [sort, setSort] = useState<NonNullable<SearchQuery['sort']>>('relevance')
  const [query, setQuery] = useState('')
  const [profileId, setProfileId] = useState(initialProfileId ?? profiles[0]?.id ?? '')
  // Set while the install dialog is open, so the target profile is always an
  // explicit choice rather than whatever the filter happened to be showing.
  const [installing, setInstalling] = useState<{ result: SearchResult; version?: ProjectVersion } | null>(null)
  const [filterByProfile, setFilterByProfile] = useState(true)

  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<SearchResult | null>(null)

  const profile = useMemo(() => profiles.find((entry) => entry.id === profileId), [profiles, profileId])

  useEffect(() => {
    if (!profileId && profiles[0]) setProfileId(profiles[0].id)
  }, [profiles, profileId])

  const runSearch = useCallback(
    async (nextOffset: number, append: boolean) => {
      setLoading(true)
      setError(null)
      try {
        const found = await api.content.search({
          query,
          kind,
          sort,
          offset: nextOffset,
          limit: 30,
          gameVersion: filterByProfile ? profile?.gameVersion : undefined,
          loader: filterByProfile ? profile?.loader : undefined
        })
        setResults((current) => (append ? [...current, ...found] : found))
        setOffset(nextOffset)
      } catch (caught) {
        setError(errorMessage(caught))
        if (!append) setResults([])
      } finally {
        setLoading(false)
      }
    },
    [query, kind, sort, filterByProfile, profile]
  )

  // Debounce the query so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => void runSearch(0, false), query ? 350 : 0)
    return () => clearTimeout(timer)
  }, [runSearch, query])

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Keşfet</h1>
          <p className="page__subtitle">Modrinth içeriklerini doğrudan profillerinize kurun</p>
        </div>
      </header>

      <div className="col" style={{ gap: 14, marginBottom: 20 }}>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div className="search">
            <span className="search__icon">
              <Icon name="search" size={16} />
            </span>
            <input
              className="input"
              placeholder="Mod, doku paketi, shader ara…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="topbar__spacer" />

          <select
            className="select"
            style={{ width: 210 }}
            value={profileId}
            onChange={(event) => setProfileId(event.target.value)}
            aria-label="Hedef profil"
          >
            {profiles.length === 0 && <option value="">Profil yok</option>}
            {profiles.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name} · {entry.gameVersion}
              </option>
            ))}
          </select>
        </div>

        <div className="row" style={{ flexWrap: 'wrap', gap: 14 }}>
          <div className="chips">
            {KINDS.map((entry) => (
              <button
                key={entry.id}
                className="chip"
                aria-pressed={kind === entry.id}
                onClick={() => setKind(entry.id)}
              >
                <span aria-hidden="true">{entry.icon}</span> {entry.label}
              </button>
            ))}
          </div>

          <div className="topbar__spacer" />

          <button
            className="chip"
            aria-pressed={filterByProfile}
            onClick={() => setFilterByProfile((value) => !value)}
            title="Yalnızca seçili profille uyumlu içerikleri göster"
          >
            {profile ? `${profile.gameVersion} · ${profile.loader}` : 'Profil filtresi'}
          </button>

          <select
            className="select"
            style={{ width: 150 }}
            value={sort}
            onChange={(event) => setSort(event.target.value as NonNullable<SearchQuery['sort']>)}
            aria-label="Sıralama"
          >
            {SORTS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="empty" style={{ padding: '30px 24px', marginBottom: 18 }}>
          <div className="empty__icon">⚠️</div>
          <div className="empty__title">Arama başarısız</div>
          <p>{error}</p>
          <button className="btn" onClick={() => void runSearch(0, false)}>
            <Icon name="refresh" size={16} />
            Tekrar dene
          </button>
        </div>
      )}

      {results.length === 0 && !loading && !error && (
        <div className="empty">
          <div className="empty__icon">🔍</div>
          <div className="empty__title">Sonuç yok</div>
          <p>Farklı bir arama terimi deneyin veya profil filtresini kapatın.</p>
        </div>
      )}

      <div className="grid grid--content">
        {results.map((result) => (
          <ResultCard
            key={`${result.source}-${result.projectId}`}
            result={result}
            canInstall={profiles.length > 0}
            onOpen={() => setSelected(result)}
            onQuickInstall={async () => setInstalling({ result })}
          />
        ))}
      </div>

      {loading && (
        <div className="row" style={{ justifyContent: 'center', padding: 26 }}>
          <div className="spinner" />
        </div>
      )}

      {results.length > 0 && !loading && (
        <div className="row" style={{ justifyContent: 'center', padding: 22 }}>
          <button className="btn" onClick={() => void runSearch(offset + 30, true)}>
            Daha fazla yükle
          </button>
        </div>
      )}

      {selected && (
        <ProjectModal
          result={selected}
          profileId={profile?.id}
          onClose={() => setSelected(null)}
          onInstall={(target, version) => setInstalling({ result: target, version })}
        />
      )}

      {installing && (
        <InstallDialog
          result={installing.result}
          version={installing.version}
          profiles={profiles}
          initialProfileId={profileId}
          onClose={() => setInstalling(null)}
          onInstalled={async () => {
            await refreshProfiles()
            setSelected(null)
            notify(`${installing.result.title} kuruldu.`)
          }}
        />
      )}
    </div>
  )
}

function ResultCard({
  result,
  canInstall,
  onOpen,
  onQuickInstall
}: {
  result: SearchResult
  canInstall: boolean
  onOpen: () => void
  onQuickInstall: () => Promise<void>
}): JSX.Element {
  const [installing, setInstalling] = useState(false)

  return (
    <div className="content-card">
      {result.iconUrl ? (
        <img className="content-card__icon" src={result.iconUrl} alt="" loading="lazy" />
      ) : (
        <div className="content-card__icon" />
      )}

      <button className="content-card__body" onClick={onOpen} style={{ textAlign: 'left' }}>
        <div className="content-card__title">
          <span>{result.title}</span>
          {result.author && <span className="content-card__author">{result.author}</span>}
        </div>
        <p className="content-card__desc">{result.description}</p>
        <div className="content-card__stats">
          <span>
            <Icon name="download" size={12} /> {formatCount(result.downloads)}
          </span>
          {result.updatedAt && <span>{formatRelative(result.updatedAt)}</span>}
        </div>
      </button>

      <div className="content-card__aside">
        <button
          className="btn btn--primary btn--sm"
          disabled={!canInstall || installing}
          onClick={async () => {
            setInstalling(true)
            await onQuickInstall()
            setInstalling(false)
          }}
        >
          {installing ? <div className="spinner" /> : <Icon name="download" size={15} />}
          Kur
        </button>
      </div>
    </div>
  )
}

function ProjectModal({
  result,
  profileId,
  onClose,
  onInstall
}: {
  result: SearchResult
  profileId?: string
  onClose: () => void
  /** Hands the chosen version to the install dialog, which picks the profile. */
  onInstall: (result: SearchResult, version: ProjectVersion) => void
}): JSX.Element {
  const { notify, profiles } = useApp()
  const profile = profiles.find((entry) => entry.id === profileId)
  const [versions, setVersions] = useState<ProjectVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [onlyCompatible, setOnlyCompatible] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const list = await api.content.versions(
          result.projectId,
          onlyCompatible ? profile?.gameVersion : undefined,
          onlyCompatible ? profile?.loader : undefined
        )
        if (!cancelled) setVersions(list)
      } catch (error) {
        if (!cancelled) notify(errorMessage(error), 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [result, profile, onlyCompatible, notify])

  return (
    <Modal title={result.title} onClose={onClose} wide>
      <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
        {result.iconUrl && <img className="content-card__icon" style={{ width: 72, height: 72 }} src={result.iconUrl} alt="" />}
        <div className="col" style={{ gap: 6, flex: 1 }}>
          <p className="muted">{result.description}</p>
          <div className="content-card__stats">
            <span>
              <Icon name="download" size={12} /> {formatCount(result.downloads)} indirme
            </span>
            <span>Modrinth</span>
          </div>
          <div className="chips">
            {result.categories.slice(0, 6).map((category) => (
              <span key={category} className="badge">
                {category}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="row row--between">
        <span className="section-title" style={{ margin: 0 }}>
          Sürümler
        </span>
        <button className="chip" aria-pressed={onlyCompatible} onClick={() => setOnlyCompatible((value) => !value)}>
          Yalnızca uyumlu
        </button>
      </div>

      {loading ? (
        <div className="row" style={{ justifyContent: 'center', padding: 24 }}>
          <div className="spinner" />
        </div>
      ) : versions.length === 0 ? (
        <div className="empty" style={{ padding: 30 }}>
          <div className="empty__title">Uyumlu sürüm yok</div>
          <p>
            {profile
              ? `${profile.gameVersion} · ${profile.loader} için yayınlanmış bir sürüm bulunamadı.`
              : 'Bir profil seçin.'}
          </p>
        </div>
      ) : (
        <div className="list">
          {versions.slice(0, 25).map((version) => (
            <div key={version.id} className="list__row">
              <div className="list__main">
                <div className="list__title">
                  {version.name}
                  {version.channel !== 'release' && (
                    <span className="badge badge--warning" style={{ marginLeft: 8 }}>
                      {version.channel}
                    </span>
                  )}
                </div>
                <div className="list__sub">
                  {version.gameVersions.slice(0, 4).join(', ')}
                  {version.loaders.length > 0 && ` · ${version.loaders.join(', ')}`} · {formatBytes(version.fileSize)}{' '}
                  · {formatRelative(version.publishedAt)}
                </div>
              </div>
              <button className="btn btn--sm btn--primary" onClick={() => onInstall(result, version)}>
                <Icon name="download" size={15} />
                Kur
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
