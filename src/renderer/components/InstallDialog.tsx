import { useEffect, useState } from 'react'
import type { ProjectDetail } from '../../preload'
import { loaderApplies, type ContentKind, type Profile, type ProjectVersion, type SearchResult } from '../../shared/types'
import { api } from '../lib/api'
import { errorMessage } from '../lib/format'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { t } from '../../shared/i18n'

export interface Compatibility {
  ok: boolean
  /** Human-readable reasons the content may not work in this profile. */
  issues: string[]
}

/**
 * Compares what a project supports against what a profile runs.
 *
 * Modrinth reports supported game versions and loaders per project (and per
 * version). Neither list is authoritative for every kind of content — a data
 * pack's listing often omits loaders entirely — so a missing list is treated as
 * "no claim made" rather than as an incompatibility.
 */
export function checkCompatibility(
  kind: ContentKind,
  supports: { gameVersions: string[]; loaders: string[] },
  profile: Profile
): Compatibility {
  const issues: string[] = []

  if (supports.gameVersions.length > 0 && !supports.gameVersions.includes(profile.gameVersion)) {
    issues.push(t('Minecraft {version} desteklenmiyor', { version: profile.gameVersion }))
  }

  if (loaderApplies(kind) && supports.loaders.length > 0) {
    // Quilt runs Fabric mods, so a Fabric-only mod is fine on a Quilt profile.
    const accepted =
      profile.loader === 'quilt' ? ['quilt', 'fabric'] : [profile.loader]
    const matches = supports.loaders.some((loader) => accepted.includes(loader.toLowerCase()))

    if (!matches) {
      // OptiFine is picked like a loader but loads no mods; saying "OptiFine is
      // not supported" would read as the mod's shortcoming rather than the
      // profile's.
      if (profile.loader === 'optifine') {
        issues.push(t('OptiFine profilleri mod yüklemez; kaynak paketi ve shader kurulabilir'))
      } else {
        issues.push(
          profile.loader === 'vanilla'
            ? t('Bu profilde mod yükleyici yok (vanilla)')
            : t('{loader} yükleyicisi desteklenmiyor', { loader: profile.loader })
        )
      }
    }
  }

  return { ok: issues.length === 0, issues }
}

/**
 * Formats what a project claims to support, for the dialog header.
 *
 * A popular mod lists well over a hundred game versions, so only the newest few
 * are named — with the remainder counted rather than dropped, since showing six
 * snapshots and nothing else reads as "snapshots only".
 */
function describeSupport(supports: { gameVersions: string[]; loaders: string[] }): string {
  const { gameVersions, loaders } = supports
  const SHOWN = 4

  let versions: string
  if (gameVersions.length === 0) versions = t('belirtilmemiş')
  else {
    // Modrinth returns them oldest first.
    const newest = gameVersions.slice(-SHOWN).reverse()
    const rest = gameVersions.length - newest.length
    versions = newest.join(', ') + (rest > 0 ? ' ' + t('ve {count} sürüm daha', { count: rest }) : '')
  }

  return loaders.length > 0 ? `${versions} · ${loaders.join(', ')}` : versions
}

export function InstallDialog({
  result,
  version,
  profiles,
  initialProfileId,
  locked = false,
  onClose,
  onInstalled
}: {
  result: SearchResult
  /** Set when installing one specific version rather than the newest. */
  version?: ProjectVersion
  profiles: Profile[]
  initialProfileId?: string
  /**
   * The target profile is already decided — the user opened the store from
   * inside it — so there is nothing to choose. The dialog then only appears at
   * all when the content looks incompatible, purely to carry the warning.
   */
  locked?: boolean
  onClose: () => void
  onInstalled: () => Promise<void>
}): JSX.Element {
  const [supports, setSupports] = useState<{ gameVersions: string[]; loaders: string[] } | null>(
    version ? { gameVersions: version.gameVersions, loaders: version.loaders } : null
  )
  // Modpacks bring their own game version and loader, so a fresh profile is the
  // right default — installing one over an existing profile rewrites what it runs.
  const NEW_PROFILE = '__new__'
  const isModpack = result.kind === 'modpack'
  const [selectedId, setSelectedId] = useState(
    isModpack ? NEW_PROFILE : (initialProfileId ?? profiles[0]?.id ?? '')
  )
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A specific version already carries its own support lists; otherwise ask the
  // project what it supports overall.
  useEffect(() => {
    if (version) return
    let cancelled = false
    void api.content
      .project(result.projectId)
      .then((detail: ProjectDetail) => {
        if (!cancelled) setSupports({ gameVersions: detail.gameVersions, loaders: detail.loaders })
      })
      .catch(() => {
        // Without the listing there is nothing to compare; installing still works.
        if (!cancelled) setSupports({ gameVersions: [], loaders: [] })
      })
    return () => {
      cancelled = true
    }
  }, [result.projectId, version])

  const asNewProfile = selectedId === NEW_PROFILE
  const selected = profiles.find((profile) => profile.id === selectedId)
  const compatibility =
    supports && selected && !asNewProfile ? checkCompatibility(result.kind, supports, selected) : null

  const install = async (): Promise<void> => {
    if (!selected && !asNewProfile) return
    setInstalling(true)
    setError(null)
    try {
      if (asNewProfile) {
        // Returns once the profile exists; the download continues in the
        // background and reports itself through the task tray.
        await api.content.installModpackAsProfile({
          projectId: result.projectId,
          versionId: version?.id,
          name: result.title,
          iconUrl: result.iconUrl
        })
      } else {
        await api.content.install({
          profileId: selected!.id,
          projectId: result.projectId,
          versionId: version?.id,
          kind: result.kind,
          name: result.title,
          iconUrl: result.iconUrl
        })
      }
      await onInstalled()
      onClose()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setInstalling(false)
    }
  }

  const footer = (
    <>
      <button className="btn" onClick={onClose} disabled={installing}>
        {t('Vazgeç')}
      </button>
      <button
        className={compatibility?.ok === false ? 'btn btn--danger' : 'btn btn--primary'}
        disabled={(!selected && !asNewProfile) || installing || !supports}
        onClick={install}
      >
        {installing ? <div className="spinner" /> : <Icon name="download" size={16} />}
        {compatibility?.ok === false ? t('Yine de kur') : t('Kur')}
      </button>
    </>
  )

  return (
    <Modal title={t('{name} · kurulum', { name: result.title })} onClose={onClose} footer={footer}>
      <p className="faint" style={{ marginBottom: 4 }}>
        {version ? t('Sürüm: {name}', { name: version.name }) : t('En son uyumlu sürüm kurulacak')}
        {supports && ' · ' + t('Destek: {list}', { list: describeSupport(supports) })}
      </p>

      <div className="section-title">{locked ? t('Kurulacak profil') : t('Hangi profile kurulsun?')}</div>

      {locked && selected && !isModpack ? (
        <div className="list">
          <div className="list__row">
            <span aria-hidden="true" style={{ fontSize: 18, width: 22, textAlign: 'center' }}>
              {selected.icon ?? '🎮'}
            </span>
            <div className="list__main">
              <div className="list__title">{selected.name}</div>
              <div className="list__sub">
                {selected.gameVersion} · {selected.loader}
              </div>
            </div>
            {compatibility &&
              (compatibility.ok ? (
                <span className="badge badge--success">uyumlu</span>
              ) : (
                <span className="badge badge--warning">uyumsuz</span>
              ))}
          </div>
        </div>
      ) : profiles.length === 0 ? (
        <div className="empty" style={{ padding: 24 }}>
          <div className="empty__title">{t('Profil yok')}</div>
          <p>{t("Önce Kitaplık'tan bir profil oluşturun.")}</p>
        </div>
      ) : (
        <div className="list">
          {isModpack && (
            <button
              className="list__row list__row--pick"
              aria-pressed={asNewProfile}
              onClick={() => setSelectedId(NEW_PROFILE)}
            >
              <span aria-hidden="true" style={{ fontSize: 18, width: 22, textAlign: 'center' }}>
                ✨
              </span>
              <div className="list__main">
                <div className="list__title">{t('Yeni profil oluştur')}</div>
                <div className="list__sub">{t('Paketin kendi sürümü ve yükleyicisiyle kurulur')}</div>
              </div>
              <span className="badge badge--accent">{t('önerilen')}</span>
            </button>
          )}

          {profiles.map((profile) => {
            const state = supports ? checkCompatibility(result.kind, supports, profile) : null
            return (
              <button
                key={profile.id}
                className="list__row list__row--pick"
                aria-pressed={profile.id === selectedId}
                onClick={() => setSelectedId(profile.id)}
              >
                <span aria-hidden="true" style={{ fontSize: 18, width: 22, textAlign: 'center' }}>
                  {profile.icon ?? '🎮'}
                </span>
                <div className="list__main">
                  <div className="list__title">{profile.name}</div>
                  <div className="list__sub">
                    {profile.gameVersion} · {profile.loader}
                  </div>
                </div>
                {state &&
                  (state.ok ? (
                    <span className="badge badge--success">{t('uyumlu')}</span>
                  ) : (
                    <span className="badge badge--warning">{t('uyumsuz')}</span>
                  ))}
              </button>
            )
          })}
        </div>
      )}

      {compatibility && !compatibility.ok && (
        <div className="notice notice--warning">
          <Icon name="close" size={15} />
          <div>
            <strong>{t('Bu içerik seçili profille uyumlu görünmüyor.')}</strong>
            <ul className="notice__list">
              {compatibility.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
            <span className="faint">{t('Yine de kurabilirsiniz; oyun açılmayabilir veya içerik yüklenmeyebilir.')}</span>
          </div>
        </div>
      )}

      {error && <div className="gate__error" style={{ marginTop: 12 }}>{error}</div>}
    </Modal>
  )
}
