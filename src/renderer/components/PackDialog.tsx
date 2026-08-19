import { useEffect, useState } from 'react'
import type { PackInstallResult } from '../../preload'
import type { CuratedPack } from '../../shared/curatedPack'
import { api } from '../lib/api'
import { errorMessage, loaderLabel } from '../lib/format'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { t } from '../../shared/i18n'

/**
 * Sets up the launcher's own performance pack.
 *
 * The Minecraft version comes first because everything else follows from it:
 * the pack is resolved against Modrinth at install time, so which mods are
 * actually available depends on the version picked here.
 */
export function PackDialog({
  pack,
  onClose,
  onInstalled
}: {
  pack: CuratedPack
  onClose: () => void
  onInstalled: (profileId: string) => void
}): JSX.Element {
  const [versions, setVersions] = useState<string[] | null>(null)
  const [gameVersion, setGameVersion] = useState('')
  const [name, setName] = useState(pack.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PackInstallResult | null>(null)

  useEffect(() => {
    api.content
      .packVersions(pack.id)
      .then((list) => {
        setVersions(list)
        // Start on the newest recommended version that the pack can actually be
        // built for today, falling back to whatever is newest.
        const first = pack.recommended.find((entry) => list.includes(entry.version))
        setGameVersion(first?.version ?? list[0] ?? '')
      })
      .catch((caught) => setError(errorMessage(caught)))
  }, [pack])

  const available = versions ?? []
  const recommended = pack.recommended.filter((entry) => available.includes(entry.version))
  const others = available.filter(
    (version) => !recommended.some((entry) => entry.version === version)
  )
  const why = pack.recommended.find((entry) => entry.version === gameVersion)?.why

  const install = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      setResult(
        await api.content.installPack({ packId: pack.id, gameVersion, name: name.trim() || pack.name })
      )
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  // After a successful install the dialog turns into the report: which mods
  // went in, and which had nothing for this version.
  if (result) {
    return (
      <Modal
        title={t('{name} hazır', { name })}
        onClose={onClose}
        footer={
          <button className="btn btn--primary" onClick={() => onInstalled(result.profile.id)}>
            <Icon name="play" size={16} />
            {t('Profili aç')}
          </button>
        }
      >
        <p className="muted">
          Minecraft {result.profile.gameVersion} · {loaderLabel(result.profile.loader)} ·{' '}
          {t('{count} mod kuruldu. Oyun ayarlarınıza dokunulmadı.', {
            count: result.report.installed.length
          })}
        </p>

        <ul className="pack-list">
          {result.report.installed.map((mod) => (
            <li key={mod.name} className="pack-list__item">
              <Icon name="check" size={15} className="pack-list__ok" />
              <span className="pack-list__name">{mod.name}</span>
              <span className="pack-list__role">{t(mod.role)}</span>
            </li>
          ))}
        </ul>

        {result.report.skipped.length > 0 && (
          <>
            <p className="faint" style={{ marginTop: 16 }}>
              {t(
                'Bu sürüm için hazır olmayanlar atlandı — paket bunlarsız da çalışır, mod güncellenince Keşfet’ten tek tek ekleyebilirsiniz.'
              )}
            </p>
            <ul className="pack-list">
              {result.report.skipped.map((mod) => (
                <li key={mod.name} className="pack-list__item pack-list__item--skipped">
                  <Icon name="close" size={15} />
                  <span className="pack-list__name">{mod.name}</span>
                  <span className="pack-list__role">{t(mod.reason)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Modal>
    )
  }

  return (
    <Modal
      title={pack.name}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            {t('Vazgeç')}
          </button>
          <button className="btn btn--primary" onClick={() => void install()} disabled={busy || !gameVersion}>
            {busy ? <div className="spinner" /> : <Icon name="download" size={16} />}
            {t('Kur')}
          </button>
        </>
      }
    >
      <p className="muted">{t(pack.summary)}</p>

      {pack.note && (
        <div className="notice notice--warning" style={{ marginTop: 12 }}>
          <Icon name="compass" size={15} />
          <div>{t(pack.note)}</div>
        </div>
      )}

      <div className="field">
        <label className="field__label" htmlFor="pack-version">
          {t('Minecraft sürümü')}
        </label>
        {versions === null ? (
          <div className="row" style={{ gap: 8 }}>
            <div className="spinner" />
            <span className="faint">{t('Uyumlu sürümler alınıyor…')}</span>
          </div>
        ) : (
          <select
            id="pack-version"
            className="select"
            value={gameVersion}
            onChange={(event) => setGameVersion(event.target.value)}
          >
            {recommended.length > 0 && (
              <optgroup label={t('Önerilen')}>
                {recommended.map((entry) => (
                  <option key={entry.version} value={entry.version}>
                    {entry.version} — {t(entry.why)}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label={t('Diğer sürümler')}>
              {others.map((version) => (
                <option key={version} value={version}>
                  {version}
                </option>
              ))}
            </optgroup>
          </select>
        )}
        <span className="field__hint">
          {why
            ? t('{why} — paket bu sürümde tam kuruluyor.', { why: t(why) })
            : t('Yalnızca paketin çekirdek modlarının yayınlandığı sürümler listelenir.')}
        </span>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="pack-name">
          {t('Profil adı')}
        </label>
        <input
          id="pack-name"
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="section-title" style={{ marginTop: 18 }}>
        {t('İçindekiler')}
      </div>
      <ul className="pack-list">
        {pack.mods.map((mod) => (
          <li key={mod.slug} className="pack-list__item">
            <span className="pack-list__name">{mod.name}</span>
            <span className="pack-list__role">{t(mod.role)}</span>
          </li>
        ))}
      </ul>
      <p className="faint" style={{ marginTop: 10 }}>
        {t('Seçtiğiniz sürüme uymayan modlar kurulum sırasında atlanır ve size listelenir.')}
      </p>

      {error && <p className="form-error">{error}</p>}
    </Modal>
  )
}
