import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loaderApplies, type ContentKind, type ProjectVersion, type SearchQuery, type SearchResult } from '../../shared/types'
import { Icon } from '../components/Icon'
import { InstallDialog, checkCompatibility } from '../components/InstallDialog'
import { Modal } from '../components/Modal'
import { PackDialog } from '../components/PackDialog'
import { PACKS, type CuratedPack } from '../../shared/curatedPack'
import { api } from '../lib/api'
import { errorMessage, formatBytes, formatCount, formatRelative, loaderLabel } from '../lib/format'
import { useApp } from '../state/AppContext'
import { t } from '../../shared/i18n'

const KINDS: { id: ContentKind; label: string; icon: string }[] = [
  { id: 'mod', label: 'Modlar', icon: '🧩' },
  { id: 'modpack', label: 'Mod paketleri', icon: '📦' },
  { id: 'resourcepack', label: 'Doku paketleri', icon: '🎨' },
  { id: 'shader', label: 'Shaderlar', icon: '✨' },
  { id: 'datapack', label: 'Veri paketleri', icon: '📜' }
]

/**
 * The launcher's own author tab. It reads the publisher's project list straight
 * from Modrinth rather than searching for the name, so it shows exactly what
 * they published — no unrelated matches, nothing missed.
 */
const FEATURED_AUTHOR = 'pisankusgaming'

const SORTS: { id: NonNullable<SearchQuery['sort']>; label: string }[] = [
  { id: 'relevance', label: 'İlgili' },
  { id: 'downloads', label: 'İndirme' },
  { id: 'follows', label: 'Takipçi' },
  { id: 'updated', label: 'Güncellenme' },
  { id: 'newest', label: 'Yeni' }
]

export function Discover({
  lockedProfileId,
  initialKind
}: {
  lockedProfileId?: string
  /** Which shelf to open on, when the store was reached from a content tab. */
  initialKind?: ContentKind
}): JSX.Element {
  const { profiles, notify, refreshProfiles, settings } = useApp()
  const pageSize = settings?.searchPageSize ?? 30

  const [kind, setKind] = useState<ContentKind>(initialKind ?? 'mod')
  /** `author` swaps the Modrinth search out for one publisher's project list. */
  const [tab, setTab] = useState<'search' | 'author'>('search')
  const [openPack, setOpenPack] = useState<CuratedPack | null>(null)
  const [authorProjects, setAuthorProjects] = useState<SearchResult[] | null>(null)
  const [sort, setSort] = useState<NonNullable<SearchQuery['sort']>>('relevance')
  const [query, setQuery] = useState('')
  // Defaults to browse mode so opening Keşfet shows every mod, not just the ones
  // one profile happens to accept.
  const [profileId, setProfileId] = useState(lockedProfileId ?? '')
  // Set while the install dialog is open. When the store was opened from inside
  // a profile the target is already settled, so the dialog only appears to carry
  // an incompatibility warning.
  const [installing, setInstalling] = useState<{ result: SearchResult; version?: ProjectVersion } | null>(null)
  /**
   * Projects installed since this page was opened.
   *
   * Kept here rather than on each card because an install can also finish in the
   * dialog, which the card knows nothing about — and a card that still says
   * "Install" after installing invites a second, pointless click.
   */
  const [installed, setInstalled] = useState<Set<string>>(() => new Set())
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
  const startInstall = async (result: SearchResult, version?: ProjectVersion): Promise<boolean> => {
    // A modpack always asks, even from inside a profile: it would rewrite that
    // profile's version and loader, and installing it as its own profile is
    // usually what was meant.
    if (!locked || !profile || result.kind === 'modpack') {
      setInstalling({ result, version })
      return false
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
      return false
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
      setInstalled((current) => new Set(current).add(result.projectId))
      notify(t('{name} · {profile} profiline kuruldu.', { name: result.title, profile: profile.name }))
      return true
    } catch (caught) {
      notify(caught, 'error')
      return false
    }
  }

  const runSearch = useCallback(
    async (nextOffset: number, append: boolean) => {
      if (tab === 'author') return
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
          loader: filterByProfile && loaderApplies(kind) ? profile?.loader : undefined
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
    [query, kind, sort, filterByProfile, profile, pageSize, tab]
  )

  /** What the grid renders: search results, or the author list filtered locally. */
  const shown = useMemo(() => {
    if (tab !== 'author') return results
    const needle = query.trim().toLocaleLowerCase('tr')
    const list = authorProjects ?? []
    return needle
      ? list.filter((entry) =>
          `${entry.title} ${entry.description}`.toLocaleLowerCase('tr').includes(needle)
        )
      : list
  }, [tab, results, authorProjects, query])

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

  // The author's catalogue is small and fixed, so it is fetched once and then
  // filtered in place rather than re-queried on every keystroke.
  useEffect(() => {
    if (tab !== 'author' || authorProjects) return
    setLoading(true)
    setError(null)
    api.content
      .userProjects(FEATURED_AUTHOR)
      .then(setAuthorProjects)
      .catch((caught) => setError(errorMessage(caught)))
      .finally(() => setLoading(false))
  }, [tab, authorProjects])

  // Debounce the query so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => void runSearch(0, false), query ? 350 : 0)
    return () => clearTimeout(timer)
  }, [runSearch, query])

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">{t('Keşfet')}</h1>
          <p className="page__subtitle">
            {t('Gezinti modunda her şey listelenir; bir profil seçerseniz yalnızca ona uyanlar gösterilir')}
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
                aria-pressed={tab === 'search' && kind === entry.id}
                onClick={() => {
                  setTab('search')
                  setKind(entry.id)
                }}
              >
                <span aria-hidden="true">{entry.icon}</span> {t(entry.label)}
              </button>
            ))}

            <button
              className="chip chip--author"
              aria-pressed={tab === 'author'}
              onClick={() => setTab('author')}
            >
              <span aria-hidden="true">⭐</span> {t('PisankusGaming modları')}
            </button>
          </div>

          <div className="topbar__spacer" />

          <select
            className="select"
            style={{ width: 150 }}
            value={sort}
            onChange={(event) => setSort(event.target.value as NonNullable<SearchQuery['sort']>)}
            aria-label={t('Sıralama')}
          >
            {SORTS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {t(entry.label)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="empty" style={{ padding: '30px 24px', marginBottom: 18 }}>
          <div className="empty__icon">⚠️</div>
          <div className="empty__title">{t('Arama başarısız')}</div>
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
      {tab === 'search' && filterByProfile && profile && !loading && !error && total < 5 && (
        <div className="notice notice--warning" style={{ marginBottom: 16 }}>
          <Icon name="compass" size={15} />
          <div>
            <strong>
              {t('Profil süzgeci açık: {version} · {loader}', {
                version: profile.gameVersion,
                loader: profile.loader
              })}
            </strong>
            {total === 0
              ? t(
                  'Yalnızca bu sürüm ve yükleyici için yayımlanmış içerikler listeleniyor, bu yüzden hiç sonuç çıkmadı. Süzgeci kapatırsanız tümünü görebilirsiniz.'
                )
              : t(
                  'Yalnızca bu sürüm ve yükleyici için yayımlanmış içerikler listeleniyor, bu yüzden yalnızca {count} sonuç var. Süzgeci kapatırsanız tümünü görebilirsiniz.',
                  { count: total }
                )}
            <div style={{ marginTop: 8 }}>
              <button className="btn btn--sm" onClick={() => setProfileId(BROWSE)}>
                {t('Gezinti moduna dön')}
              </button>
            </div>
          </div>
        </div>
      )}

      {shown.length === 0 && !loading && !error && (
        <div className="empty">
          <div className="empty__icon">🔍</div>
          <div className="empty__title">{t('Sonuç yok')}</div>
          <p>{t('Farklı bir arama terimi deneyin veya profil filtresini kapatın.')}</p>
        </div>
      )}

      {tab === 'author' && !loading && !error && (
        <p className="faint" style={{ marginBottom: 14 }}>
          {t('{count} proje · Modrinth’teki', { count: authorProjects?.length ?? 0 })}{' '}
          <a
            href="#"
            onClick={(event) => {
              event.preventDefault()
              void api.app.openExternal(`https://modrinth.com/user/${FEATURED_AUTHOR}`)
            }}
          >
            {FEATURED_AUTHOR}
          </a>{' '}
          {t('sayfasından doğrudan alınıyor.')}
        </p>
      )}

      {/* The launcher's own packs sit above the Modrinth results rather than
          among them: they are not Modrinth projects, and burying them in a grid
          sorted by download count would make them unfindable. */}
      {tab === 'search' &&
        kind === 'modpack' &&
        PACKS.map((pack) => (
          <button key={pack.id} className="featured" onClick={() => setOpenPack(pack)}>
            <div className="featured__mark">{pack.icon}</div>
            <div className="featured__text">
              <div className="featured__title">
                {pack.name}
                <span className="badge badge--success">{t('Önerilen')}</span>
              </div>
              <p className="featured__desc">{pack.summary}</p>
              <div className="featured__meta">
                {loaderLabel(pack.loader)} · {pack.mods.length} mod ·{' '}
                {pack.recommended.map((entry) => entry.version).join(' · ')}
              </div>
            </div>
            <span className="btn btn--primary btn--sm featured__action">
              <Icon name="download" size={15} />
              Kur
            </span>
          </button>
        ))}

      <div className="grid grid--content">
        {shown.map((result) => (
          <ResultCard
            key={`${result.source}-${result.projectId}`}
            result={result}
            canInstall={profiles.length > 0}
            installed={installed.has(result.projectId)}
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
      {tab === 'search' && results.length > 0 && results.length < total && (
        <div className="row" style={{ justifyContent: 'center', padding: 22 }} ref={sentinel}>
          {loading ? (
            <div className="spinner" />
          ) : (
            <button className="btn" onClick={() => void runSearch(offset + pageSize, true)}>
              {t('Daha fazla yükle · {shown}/{total}', { shown: results.length, total })}
            </button>
          )}
        </div>
      )}

      {tab === 'search' && results.length > 0 && results.length >= total && (
        <p className="faint" style={{ textAlign: 'center', padding: 18 }}>
          {t('{total} sonucun tamamı gösteriliyor.', { total })}
        </p>
      )}

      {openPack && (
        <PackDialog
          pack={openPack}
          onClose={() => setOpenPack(null)}
          onInstalled={() => {
            const name = openPack.name
            setOpenPack(null)
            void refreshProfiles()
            notify(t('{name} profili oluşturuldu.', { name }))
          }}
        />
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
            setInstalled((current) => new Set(current).add(installing.result.projectId))
            notify(t('{name} kuruldu.', { name: installing.result.title }))
          }}
        />
      )}
    </div>
  )
}

function ResultCard({
  result,
  canInstall,
  installed,
  onOpen,
  onQuickInstall
}: {
  result: SearchResult
  canInstall: boolean
  /** Already installed from this page; the button says so instead of offering again. */
  installed: boolean
  onOpen: () => void
  onQuickInstall: () => Promise<boolean>
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
          className={installed ? 'btn btn--sm' : 'btn btn--primary btn--sm'}
          disabled={!canInstall || installing || installed}
          onClick={async () => {
            setInstalling(true)
            try {
              await onQuickInstall()
            } finally {
              setInstalling(false)
            }
          }}
        >
          {installing ? (
            <div className="spinner" />
          ) : (
            <Icon name={installed ? 'check' : 'download'} size={15} />
          )}
          {installing ? t('Kuruluyor…') : installed ? t('Kuruldu') : t('Kur')}
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
          // A resource pack or shader is never published against the profile's
          // mod loader, so narrowing by it would empty the list.
          onlyCompatible && loaderApplies(result.kind) ? profile?.loader : undefined
        )
        if (!cancelled) setVersions(list)
      } catch (error) {
        if (!cancelled) notify(error, 'error')
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
          {t('Sürümler')}
        </span>
        <button className="chip" aria-pressed={onlyCompatible} onClick={() => setOnlyCompatible((value) => !value)}>
          {t('Yalnızca uyumlu')}
        </button>
      </div>

      {loading ? (
        <div className="row" style={{ justifyContent: 'center', padding: 24 }}>
          <div className="spinner" />
        </div>
      ) : versions.length === 0 ? (
        <div className="empty" style={{ padding: 30 }}>
          <div className="empty__title">{t('Uyumlu sürüm yok')}</div>
          <p>
            {profile
              ? t('{version} · {loader} için yayınlanmış bir sürüm bulunamadı.', {
                  version: profile.gameVersion,
                  loader: profile.loader
                })
              : t('Bir profil seçin.')}
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
