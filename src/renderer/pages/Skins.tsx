import { useCallback, useEffect, useState } from 'react'
import type { SkinInfo } from '../../preload'
import { Icon } from '../components/Icon'
import { SkinViewer } from '../components/SkinViewer'
import { api } from '../lib/api'
import { errorMessage } from '../lib/format'
import { useApp } from '../state/AppContext'

export function Skins(): JSX.Element {
  const { activeAccount, refreshAccounts, notify } = useApp()
  const [info, setInfo] = useState<SkinInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [variant, setVariant] = useState<'classic' | 'slim'>('classic')
  const [urlInput, setUrlInput] = useState('')

  const load = useCallback(async () => {
    if (!activeAccount) return
    setLoading(true)
    try {
      const loaded = await api.skins.get(activeAccount.id)
      setInfo(loaded)
      setVariant(loaded.variant)
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setLoading(false)
    }
  }, [activeAccount, notify])

  useEffect(() => {
    void load()
  }, [load])

  /** Every mutation refreshes both the viewer and the cached account avatar. */
  const mutate = async (action: () => Promise<SkinInfo | null>): Promise<void> => {
    setBusy(true)
    try {
      const updated = await action()
      if (updated) {
        setInfo(updated)
        setVariant(updated.variant)
        await refreshAccounts()
        notify('Skin güncellendi.')
      }
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!activeAccount) {
    return (
      <div className="page">
        <div className="empty">
          <div className="empty__title">Hesap seçili değil</div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Skin</h1>
          <p className="page__subtitle">
            {activeAccount.name} · değişiklikler Minecraft hesabınıza doğrudan uygulanır
          </p>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(320px, 420px)', gap: 22 }}>
        <SkinViewer skinUrl={info?.skinUrl} slim={variant === 'slim'} scale={10} />

        <div className="stack-lg">
          <div className="settings-group">
            <div className="section-title">Model</div>
            <div className="chips">
              <button
                className="chip"
                aria-pressed={variant === 'classic'}
                onClick={() => setVariant('classic')}
                disabled={busy}
              >
                Klasik (geniş kol)
              </button>
              <button
                className="chip"
                aria-pressed={variant === 'slim'}
                onClick={() => setVariant('slim')}
                disabled={busy}
              >
                İnce (Alex)
              </button>
            </div>
            <p className="faint">
              Model seçimi yeni skin yüklerken uygulanır. Önizlemeyi sürükleyerek modeli döndürebilirsiniz.
            </p>
          </div>

          <div className="settings-group">
            <div className="section-title">Skin değiştir</div>

            <button
              className="btn btn--primary"
              disabled={busy}
              onClick={() => void mutate(() => api.skins.upload(activeAccount.id, variant))}
            >
              {busy ? <div className="spinner" /> : <Icon name="image" size={16} />}
              PNG dosyası yükle
            </button>
            <p className="faint">64×64 (veya eski biçim 64×32) boyutunda, en fazla 24 KB bir PNG seçin.</p>

            <div className="field">
              <label className="field__label" htmlFor="skin-url">
                Bağlantıdan uygula
              </label>
              <div className="row">
                <input
                  id="skin-url"
                  className="input"
                  placeholder="https://…/skin.png"
                  value={urlInput}
                  onChange={(event) => setUrlInput(event.target.value)}
                />
                <button
                  className="btn"
                  disabled={busy || !/^https?:\/\//i.test(urlInput)}
                  onClick={() =>
                    void mutate(async () => {
                      const updated = await api.skins.setUrl(activeAccount.id, urlInput.trim(), variant)
                      setUrlInput('')
                      return updated
                    })
                  }
                >
                  Uygula
                </button>
              </div>
            </div>

            <button
              className="btn btn--ghost"
              disabled={busy}
              onClick={() => void mutate(() => api.skins.reset(activeAccount.id))}
            >
              <Icon name="refresh" size={16} />
              Varsayılan skine dön
            </button>
          </div>

          <div className="settings-group">
            <div className="section-title">Pelerinler</div>
            {loading ? (
              <div className="spinner" />
            ) : info && info.capes.length > 0 ? (
              <div className="list">
                <div className="list__row">
                  <div className="list__main">
                    <div className="list__title">Pelerin yok</div>
                  </div>
                  <button
                    className="btn btn--sm"
                    disabled={busy || !info.capes.some((cape) => cape.active)}
                    onClick={() => void mutate(() => api.skins.setCape(activeAccount.id, null))}
                  >
                    Kaldır
                  </button>
                </div>
                {info.capes.map((cape) => (
                  <div key={cape.id} className="list__row">
                    <img className="list__icon" src={cape.url} alt="" style={{ objectFit: 'contain' }} />
                    <div className="list__main">
                      <div className="list__title">{cape.alias}</div>
                    </div>
                    {cape.active ? (
                      <span className="badge badge--success">Etkin</span>
                    ) : (
                      <button
                        className="btn btn--sm"
                        disabled={busy}
                        onClick={() => void mutate(() => api.skins.setCape(activeAccount.id, cape.id))}
                      >
                        Kullan
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="faint">Bu hesaba tanımlı pelerin bulunmuyor.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
