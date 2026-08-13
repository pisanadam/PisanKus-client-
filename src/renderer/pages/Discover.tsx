import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ContentKind, ProjectVersion, SearchQuery, SearchResult } from '../../shared/types'
import { Icon } from '../components/Icon'
import { InstallDialog, checkCompatibility } from '../components/InstallDialog'
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

export function Discover({ lockedProfileId }: { lockedProfileId?: string }): JSX.Element {
  const { profiles, notify, refreshProfiles, settings } = useApp()
  const pageSize = settings?.searchPageSize ?? 30

  const [kind, setKind] = useState<ContentKind>('mod')
  const [sort, setSort] = useState<NonNullable<SearchQuery['sort']>>('relevance')
  const [query, setQuery] = useState('')
  // Defaults to browse mode so opening Keşfet shows every mod, not just the ones
  // one profile happens to accept.
  const [profileId, setProfileId] = useState(lockedProfileId ?? '')
  // Set while the install dialog is open. When the store was opened from inside
  // a profile the target is already settled, so the dialog only appears to carry
  // an incompatibility warning.
  const [installing, setInstalling] = useState<{ result: SearchResult; version?: ProjectVersion } | null>(null)
  const locked = Boolean(lockedProfileId)
  // Off by default: pinned to a profile's exact version this hides almost
  // everything (a snapshot profile cut a 98-result search down to 1), and the
  // install dialog already warns when something does not fit.
  /**
   * Browse mode is the empty profile id: nothing is filtered and no profile is
   * pre-chosen, so the store lists everything Modrinth has. Picking a profile in
   * the same dropdown narrows the search to what that profile can run.
   */
  const BROWSE = ''
  const filterByProfile = profileId !== BROWSE

  const [results, setResults] = useState<SearchResult[]>([])
  /** Everything the current facets match, so we know when to stop loading. */
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<SearchResult | null>(null)

  const profile = useMemo(() => profiles.find((entry) => entry.id === profileId), [profiles, profileId])

  /**
   * Starts an install. With a locked profile there is nothing to ask, so the
   * content goes straight in — unless it looks incompatible, which is the one
   * case still worth interrupting for.
   */
  const startInstall = async (result: SearchResult, version?: ProjectVersion): Promise<void> => {
    // A modpack always asks, even from inside a profile: it would rewrite that
    // profile's version and loader, and installing it as its own profile is
    // usually what was meant.
    if (!locked || !profile || result.kind === 'modpack') {
      setInstalling({ result, version })
      return
    }

    const supports = version
      ? { gameVersions: version.gameVersions, loaders: version.loaders }
      : await api.content
          .project(result.projectId)
          .then((detail) => ({ gameVersions: detail.gameVersions, loaders: detail.loaders }))
          // No listing to compare against is not a reason to block the install.
          .catch(() => null)

    if (supports && !checkCompatibility(result.kind, supports, profile).ok) {
      setInstalling({ result, version })
      return
    }

    try {
      await api.content.install({
        profileId: profile.id,
        projectId: result.projectId,
        versionId: version?.id,
        kind: result.kind,
        name: result.title,
        iconUrl: result.iconUrl
      })
      await refreshProfiles()
      setSelected(null)
      notify(`${result.title} · ${profile.name} profiline kuruldu.`)
    } catch (caught) {
      notify(errorMessage(caught), 'error')
    }
  }

  const runSearch = useCallback(
    async (nextOffset: number, append: boolean) => {
      // Modrinth hosts no worlds, so there is nothing to search for that tab.
      if (kind === 'world') {
        setResults([])
        setLoading(false)
        setError(null)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const page = await api.content.search({
          query,
          kind,
          sort,
          offset: nextOffset,
          limit: pageSize,
          gameVersion: filterByProfile ? profile?.gameVersion : undefined,
          loader: filterByProfile ? profile?.loader : undefined
        })
        setResults((current) => (append ? [...current, ...page.hits] : page.hits))
        setTotal(page.total)
        setOffset(nextOffset)
      } catch (caught) {
        setError(errorMessage(caught))
        if (!append) setResults([])
      } finally {
        setLoading(false)
      }
    },
    [query, kind, sort, filterByProfile, profile, pageSize]
  )

  const sentinel = useRef<HTMLDivElement>(null)

  // Load the next page when the end of the list scrolls into view, so finding a
  // mod never depends on noticing a "load more" button.
  useEffect(() => {
    const node = sentinel.current
    if (!node || loading || results.length === 0 || results.length >= total) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void runSearch(offset + pageSize, true)
      },
      { rootMargin: '400px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [loading, results.length, total, offset, pageSize, runSearch])

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
          <p className="page__subtitle">
            Gezinti modunda her şey listelenir; bir profil seçerseniz yalnızca ona uyanlar gösterilir
          </p>
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

          {locked && profile ? (
            /* Opened from a profile: the target is fixed, so it is shown rather
               than offered as a choice. */
            <div className="target" title={`${profile.gameVersion} · ${profile.loader}`}>
              <span aria-hidden="true">{profile.icon ?? '🎮'}</span>
              <span className="target__name">{profile.name}</span>
              <span className="target__meta">
                {profile.gameVersion} · {profile.loader}
              </span>
            </div>
          ) : (
            <select
              className="select"
              style={{ width: 230 }}
              value={profileId}
              onChange={(event) => setProfileId(event.target.value)}
              aria-label="Hedef profil"
            >
              <option value="">Gezinti modu (filtresiz)</option>
              {profiles.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name} · {entry.gameVersion}
                </option>
              ))}
            </select>
          )}
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

      {/* The profile filter is the usual reason a mod "isn't on Modrinth": pinned
          to a snapshot, almost nothing matches. Say so instead of showing an
          empty grid. */}
      {kind !== 'world' && filterByProfile && profile && !loading && !error && total < 5 && (
        <div className="notice notice--warning" style={{ marginBottom: 16 }}>
          <Icon name="compass" size={15} />
          <div>
            <strong>
              Profil süzgeci açık: {profile.gameVersion} · {profile.loader}
            </strong>
            Yalnızca bu sürüm ve yükleyici için yayımlanmış içerikler listeleniyor, bu yüzden
            {total === 0 ? ' hiç sonuç çıkmadı' : ` yalnızca ${total} sonuç var`}. Süzgeci
            kapatırsanız tümünü görebilirsiniz.
            <div style={{ marginTop: 8 }}>
              <button className="btn btn--sm" onClick={() => setProfileId(BROWSE)}>
                Gezinti moduna dön
              </button>
            </div>
          </div>
        </div>
      )}

      {kind === 'world' && (
        <div className="empty">
          <div className="empty__icon">🌍</div>
          <div className="empty__title">Modrinth&apos;te dünya bulunmuyor</div>
          <p>
            Modrinth dünya barındırmıyor, bu yüzden burada aranacak bir şey yok. Dünyalar ya bir mod
            paketiyle birlikte gelir ya da elinizdeki bir kayıt klasörünü/zip dosyasını içe
            aktararak eklenir.
          </p>
          <button
            className="btn btn--primary"
            disabled={!profile}
            onClick={async () => {
              if (!profile) return
              try {
                await api.content.importLocal(profile.id, 'world')
                await refreshProfiles()
                notify(`Dünya ${profile.name} profiline aktarıldı.`)
              } catch (caught) {
                notify(errorMessage(caught), 'error')
              }
            }}
          >
            <Icon name="folder" size={16} />
            Dosyadan dünya ekle
          </button>
          {!profile && <p className="faint">Önce bir profil seçin.</p>}
        </div>
      )}

      {kind !== 'world' && results.length === 0 && !loading && !error && (
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
            onQuickInstall={() => startInstall(result)}
          />
        ))}
      </div>

      {loading && (
        <div className="row" style={{ justifyContent: 'center', padding: 26 }}>
          <div className="spinner" />
        </div>
      )}

      {/* Scrolling to the bottom fetches the next page on its own; the button is
          only a fallback for when the observer cannot fire (no scrollbar yet). */}
      {results.length > 0 && results.length < total && (
        <div className="row" style={{ justifyContent: 'center', padding: 22 }} ref={sentinel}>
          {loading ? (
            <div className="spinner" />
          ) : (
            <button className="btn" onClick={() => void runSearch(offset + pageSize, true)}>
              Daha fazla yükle · {results.length}/{total}
            </button>
          )}
        </div>
      )}

      {results.length > 0 && results.length >= total && (
        <p className="faint" style={{ textAlign: 'center', padding: 18 }}>
          {total} sonucun tamamı gösteriliyor.
        </p>
      )}

      {selected && (
        <ProjectModal
          result={selected}
          profileId={profile?.id}
          onClose={() => setSelected(null)}
          onInstall={(target, version) => void startInstall(target, version)}
        />
      )}

      {installing && (
        <InstallDialog
          result={installing.result}
          version={installing.version}
          profiles={profiles}
          initialProfileId={profileId}
          locked={locked}
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
