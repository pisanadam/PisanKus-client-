import { useEffect, useState, type CSSProperties } from 'react'
import type { Texture } from '../../preload'
import type { SavedSkin } from '../../shared/types'
import { api } from '../lib/api'
import { Icon } from './Icon'
import { t } from '../../shared/i18n'

/**
 * The player's own skin shelf. Entries are copies of the PNG kept beside the
 * launcher's database, not links — a saved skin has to keep working after the
 * account moves on to a different one.
 */
export function SkinLibrary({
  currentSkinUrl,
  currentVariant,
  busy,
  onApply,
  notify
}: {
  /** The skin on the account right now, if it has a custom one. */
  currentSkinUrl?: string
  currentVariant: 'classic' | 'slim'
  busy: boolean
  onApply: (id: string) => void
  notify: (message: unknown, kind?: 'info' | 'error') => void
}): JSX.Element {
  const [skins, setSkins] = useState<SavedSkin[]>([])
  const [saving, setSaving] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<string | null>(null)

  useEffect(() => {
    void api.skins.saved().then(setSkins).catch(() => undefined)
  }, [])

  const guard = async (action: () => Promise<SavedSkin[]>): Promise<void> => {
    setSaving(true)
    try {
      setSkins(await action())
    } catch (error) {
      notify(error, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-group">
      <div className="row row--between">
        <span className="section-title" style={{ margin: 0 }}>
          {t('Skin kitaplığım')}
        </span>
        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn btn--sm"
            disabled={saving || busy}
            onClick={() =>
              void guard(async () => {
                const picked = await api.skins.pickFile()
                if (!picked) return skins
                return api.skins.saveFile(picked.path, stripExtension(picked.name), 'classic')
              })
            }
          >
            <Icon name="plus" size={14} />
            {t('Dosyadan')}
          </button>
          <button
            className="btn btn--sm btn--primary"
            disabled={saving || busy || !currentSkinUrl}
            title={currentSkinUrl ? undefined : t('Bu hesapta özel bir skin yok')}
            onClick={() =>
              void guard(() =>
                api.skins.saveFromUrl(currentSkinUrl!, `Skin ${skins.length + 1}`, currentVariant)
              )
            }
          >
            {saving ? <div className="spinner" /> : <Icon name="plus" size={14} />}
            {t('Şu anki skini ekle')}
          </button>
        </div>
      </div>

      {skins.length === 0 ? (
        <p className="faint">
          {t('Kitaplık boş. Kullandığınız bir skini buraya ekleyip sonra tek tıkla geri dönebilirsiniz.')}
        </p>
      ) : (
        <div className="skin-shelf">
          {skins.map((skin) => (
            <SavedSkinCard
              key={skin.id}
              skin={skin}
              busy={busy || saving}
              confirming={pendingRemove === skin.id}
              onApply={() => onApply(skin.id)}
              onAskRemove={() => setPendingRemove(skin.id)}
              onCancelRemove={() => setPendingRemove(null)}
              onRemove={() => {
                setPendingRemove(null)
                void guard(() => api.skins.removeSaved(skin.id))
              }}
              onRename={(name) => void guard(() => api.skins.renameSaved(skin.id, name))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.png$/i, '')
}

function SavedSkinCard({
  skin,
  busy,
  confirming,
  onApply,
  onAskRemove,
  onCancelRemove,
  onRemove,
  onRename
}: {
  skin: SavedSkin
  busy: boolean
  confirming: boolean
  onApply: () => void
  onAskRemove: () => void
  onCancelRemove: () => void
  onRemove: () => void
  onRename: (name: string) => void
}): JSX.Element {
  const [texture, setTexture] = useState<Texture | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(skin.name)

  useEffect(() => {
    void api.skins.savedTexture(skin.id).then(setTexture).catch(() => undefined)
  }, [skin.id])

  return (
    <div className="skin-shelf__item">
      <button
        className="skin-shelf__art"
        style={texture ? headStyle(texture) : undefined}
        disabled={busy}
        title={t('{name} · uygulamak için tıklayın', { name: skin.name })}
        onClick={onApply}
      >
        {!texture && <div className="spinner" />}
        <span className="skin-shelf__apply">
          <Icon name="check" size={16} />
        </span>
      </button>

      {editing ? (
        <input
          className="input skin-shelf__name-input"
          value={draft}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            setEditing(false)
            if (draft.trim() && draft !== skin.name) onRename(draft.trim())
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              setDraft(skin.name)
              setEditing(false)
            }
          }}
        />
      ) : (
        /* Not a second apply button: double-clicking to rename also fired two
           clicks, so renaming sent Mojang two skin changes back to back and
           tripped its rate limit. Applying happens on the tile only. */
        <span
          className="skin-shelf__name"
          title={t('Yeniden adlandırmak için çift tıklayın')}
          onDoubleClick={() => setEditing(true)}
        >
          {skin.name}
        </span>
      )}

      {confirming ? (
        <div className="skin-shelf__confirm">
          <button className="btn btn--sm btn--danger" onClick={onRemove}>
            {t('Sil')}
          </button>
          <button className="btn btn--sm btn--ghost" onClick={onCancelRemove}>
            {t('Vazgeç')}
          </button>
        </div>
      ) : (
        <button
          className="skin-shelf__remove"
          aria-label={t('{name} skinini kaldır', { name: skin.name })}
          disabled={busy}
          onClick={onAskRemove}
        >
          <Icon name="trash" size={13} />
        </button>
      )}
    </div>
  )
}

/** Crops the face out of the skin sheet, the same 8×8 cut the avatars use. */
function headStyle(texture: Texture): CSSProperties {
  const pixel = 56 / 8
  return {
    backgroundImage: `url(${texture.dataUrl}), url(${texture.dataUrl})`,
    backgroundSize: `${texture.width * pixel}px ${texture.height * pixel}px`,
    // Hat layer first so it paints over the face.
    backgroundPosition: `${-40 * pixel}px ${-8 * pixel}px, ${-8 * pixel}px ${-8 * pixel}px`,
    imageRendering: 'pixelated'
  }
}
