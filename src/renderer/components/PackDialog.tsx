import { useEffect, useState } from 'react'
import type { PackInstallResult } from '../../preload'
import { PACK_MODS, PACK_NAME, PACK_SUMMARY } from '../../shared/curatedPack'
import { api } from '../lib/api'
import { errorMessage } from '../lib/format'
import { Icon } from './Icon'
import { Modal } from './Modal'

/**
 * Sets up the launcher's own performance pack.
 *
 * The Minecraft version comes first because everything else follows from it:
 * the pack is resolved against Modrinth at install time, so which mods are
 * actually available depends on the version picked here.
 */
export function PackDialog({
  onClose,
  onInstalled
}: {
  onClose: () => void
  onInstalled: (profileId: string) => void
}): JSX.Element {
  const [versions, setVersions] = useState<string[] | null>(null)
  const [gameVersion, setGameVersion] = useState('')
  const [name, setName] = useState(PACK_NAME)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PackInstallResult | null>(null)

  useEffect(() => {
    api.content
      .packVersions()
      .then((list) => {
        setVersions(list)
        setGameVersion(list[0] ?? '')
      })
      .catch((caught) => setError(errorMessage(caught)))
  }, [])

  const install = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      setResult(await api.content.installPack({ gameVersion, name: name.trim() || PACK_NAME }))
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
        title={`${name} hazır`}
        onClose={onClose}
        footer={
          <button className="btn btn--primary" onClick={() => onInstalled(result.profile.id)}>
            <Icon name="play" size={16} />
            Profili aç
          </button>
        }
      >
        <p className="muted">
          Minecraft {result.profile.gameVersion} · Fabric · {result.report.installed.length} mod kuruldu.
          Oyun ayarları ve JVM argümanları da bu profile göre ayarlandı.
        </p>

        <ul className="pack-list">
          {result.report.installed.map((mod) => (
            <li key={mod.name} className="pack-list__item">
              <Icon name="check" size={15} className="pack-list__ok" />
              <span className="pack-list__name">{mod.name}</span>
              <span className="pack-list__role">{mod.role}</span>
            </li>
          ))}
        </ul>

        {result.report.skipped.length > 0 && (
          <>
            <p className="faint" style={{ marginTop: 16 }}>
              Bu sürüm için hazır olmayanlar atlandı — paket bunlarsız da çalışır, mod güncellenince
              Keşfet’ten tek tek ekleyebilirsiniz.
            </p>
            <ul className="pack-list">
              {result.report.skipped.map((mod) => (
                <li key={mod.name} className="pack-list__item pack-list__item--skipped">
                  <Icon name="close" size={15} />
                  <span className="pack-list__name">{mod.name}</span>
                  <span className="pack-list__role">{mod.reason}</span>
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
      title={PACK_NAME}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button className="btn btn--primary" onClick={() => void install()} disabled={busy || !gameVersion}>
            {busy ? <div className="spinner" /> : <Icon name="download" size={16} />}
            Kur
          </button>
        </>
      }
    >
      <p className="muted">{PACK_SUMMARY}</p>

      <div className="field">
        <label className="field__label" htmlFor="pack-version">
          Minecraft sürümü
        </label>
        {versions === null ? (
          <div className="row" style={{ gap: 8 }}>
            <div className="spinner" />
            <span className="faint">Uyumlu sürümler alınıyor…</span>
          </div>
        ) : (
          <select
            id="pack-version"
            className="select"
            value={gameVersion}
            onChange={(event) => setGameVersion(event.target.value)}
          >
            {versions.map((version) => (
              <option key={version} value={version}>
                {version}
              </option>
            ))}
          </select>
        )}
        <span className="field__hint">
          Yalnızca paketin çekirdek modlarının yayınlandığı sürümler listelenir.
        </span>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="pack-name">
          Profil adı
        </label>
        <input
          id="pack-name"
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="section-title" style={{ marginTop: 18 }}>
        İçindekiler
      </div>
      <ul className="pack-list">
        {PACK_MODS.map((mod) => (
          <li key={mod.slug} className="pack-list__item">
            <span className="pack-list__name">{mod.name}</span>
            <span className="pack-list__role">{mod.role}</span>
          </li>
        ))}
      </ul>
      <p className="faint" style={{ marginTop: 10 }}>
        Seçtiğiniz sürüme uymayan modlar kurulum sırasında atlanır ve size listelenir.
      </p>

      {error && <p className="form-error">{error}</p>}
    </Modal>
  )
}
