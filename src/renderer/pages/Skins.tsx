import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import type { LocalSkin, SkinInfo } from '../../preload'
import { Icon } from '../components/Icon'
import { SkinLibrary } from '../components/SkinLibrary'
import { SkinViewer } from '../components/SkinViewer'
import { api } from '../lib/api'
import { errorMessage } from '../lib/format'
import { useTexture } from '../lib/useTexture'
import { useApp } from '../state/AppContext'

/** A skin chosen but not yet sent to Mojang. */
type Pending =
  | { kind: 'file'; file: LocalSkin }
  | { kind: 'url'; url: string }

export function Skins(): JSX.Element {
  const { activeAccount, refreshAccounts, notify } = useApp()
  const [info, setInfo] = useState<SkinInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [variant, setVariant] = useState<'classic' | 'slim'>('classic')
  const [urlInput, setUrlInput] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)

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
        setPending(null)
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

  const activeCape = info?.capes.find((cape) => cape.active)

  const apply = (): void => {
    if (!pending) return
    void mutate(() =>
      pending.kind === 'file'
        ? api.skins.upload(activeAccount.id, pending.file.path, variant)
        : api.skins.setUrl(activeAccount.id, pending.url, variant)
    )
  }

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Skin</h1>
          <p className="page__subtitle">
            {activeAccount.name} · seçtiğiniz skini önce burada görün, sonra uygulayın
          </p>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(320px, 420px)', gap: 22 }}>
        <div className="stack">
          <SkinViewer
            skinUrl={pending?.kind === 'url' ? undefined : info?.skinUrl}
            skinTexture={pending?.kind === 'file' ? pending.file.texture : undefined}
            capeUrl={activeCape?.url}
            slim={variant === 'slim'}
            scale={10}
            loading={loading}
          />
          {pending && (
            <div className="preview-bar">
              <Icon name="image" size={15} />
              <span className="preview-bar__text">
                {pending.kind === 'file' ? pending.file.name : 'Bağlantıdaki skin'} · önizleme,
                henüz uygulanmadı
              </span>
              <button className="btn btn--sm btn--ghost" onClick={() => setPending(null)} disabled={busy}>
                Vazgeç
              </button>
              <button className="btn btn--sm btn--primary" onClick={apply} disabled={busy}>
                {busy ? <div className="spinner" /> : <Icon name="check" size={14} />}
                Uygula
              </button>
            </div>
          )}

          <SkinLibrary
            currentSkinUrl={info?.skinUrl}
            currentVariant={variant}
            busy={busy}
            notify={notify}
            onApply={(id) => void mutate(() => api.skins.applySaved(activeAccount.id, id))}
          />
        </div>

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
              Model seçimi skini uygularken gönderilir. Önizlemeyi sürükleyerek modeli döndürebilirsiniz.
            </p>
          </div>

          <div className="settings-group">
            <div className="section-title">Skin değiştir</div>

            <button
              className="btn"
              disabled={busy}
              onClick={async () => {
                try {
                  const picked = await api.skins.pickFile()
                  if (picked) setPending({ kind: 'file', file: picked })
                } catch (error) {
                  notify(errorMessage(error), 'error')
                }
              }}
            >
              <Icon name="image" size={16} />
              PNG dosyası seç
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
                  onClick={() => {
                    setPending({ kind: 'url', url: urlInput.trim() })
                    setUrlInput('')
                  }}
                >
                  Seç
                </button>
              </div>
              <p className="faint">
                Bağlantıdaki skin önizlenemez; Mojang dosyayı kendisi indirir. Uygula&apos;ya bastıktan
                sonra modelde görünür.
              </p>
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
              <>
                <div className="capes">
                  <button
                    className="cape-card"
                    aria-pressed={!activeCape}
                    disabled={busy}
                    onClick={() => void mutate(() => api.skins.setCape(activeAccount.id, null))}
                  >
                    <span className="cape-card__art cape-card__art--none">
                      <Icon name="close" size={18} />
                    </span>
                    <span className="cape-card__name">Pelerinsiz</span>
                  </button>

                  {info.capes.map((cape) => (
                    <CapeCard
                      key={cape.id}
                      alias={cape.alias}
                      url={cape.url}
                      active={cape.active}
                      disabled={busy}
                      onSelect={() => void mutate(() => api.skins.setCape(activeAccount.id, cape.id))}
                    />
                  ))}
                </div>
                <p className="faint">Seçtiğiniz pelerin hem modelde hem oyunda anında görünür.</p>
              </>
            ) : (
              <p className="faint">Bu hesaba tanımlı pelerin bulunmuyor.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * One cape in the picker. The art is the cape's own front panel, cut out of the
 * texture the same way the model does it, so the card shows the actual design
 * rather than the raw unwrapped sheet.
 */
function CapeCard({
  alias,
  url,
  active,
  disabled,
  onSelect
}: {
  alias: string
  url: string
  active: boolean
  disabled: boolean
  onSelect: () => void
}): JSX.Element {
  const texture = useCapeTexture(url)

  return (
    <button className="cape-card" aria-pressed={active} disabled={disabled} onClick={onSelect}>
      <span className="cape-card__art" style={texture}>
        {!texture && <div className="spinner" />}
      </span>
      <span className="cape-card__name">{alias}</span>
      {active && <span className="cape-card__tick"><Icon name="check" size={13} /></span>}
    </button>
  )
}

/** Crops the 10×16 front panel out of a cape sheet, scaled to the card. */
function useCapeTexture(url: string): CSSProperties | undefined {
  const texture = useTexture(url)
  if (!texture) return undefined

  // The panel sits at (1,1) and the card is 10 cape-pixels wide.
  const pixel = CAPE_CARD_WIDTH / 10
  return {
    backgroundImage: `url(${texture.dataUrl})`,
    backgroundSize: `${texture.width * pixel}px ${texture.height * pixel}px`,
    backgroundPosition: `${-1 * pixel}px ${-1 * pixel}px`,
    imageRendering: 'pixelated'
  }
}

const CAPE_CARD_WIDTH = 50
