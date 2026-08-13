import { useEffect, useState, type CSSProperties } from 'react'
import type { Texture } from '../../preload'
import type { SavedSkin } from '../../shared/types'
import { api } from '../lib/api'
import { errorMessage } from '../lib/format'
import { Icon } from './Icon'

/**
 * The player's own skin shelf. Entries are copies of the PNG kept beside the
 * launcher's database, not links — a saved skin has to keep working after the
 * account moves on to a different one.
 */
export function SkinLibrary({
  accountId,
  hasCurrentSkin,
  busy,
  onApply,
  notify
}: {
  accountId: string
  /** Whether there is an account skin worth offering to save. */
  hasCurrentSkin: boolean
  busy: boolean
  onApply: (id: string) => void
  notify: (message: string, kind?: 'info' | 'error') => void
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
      notify(errorMessage(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-group">
      <div className="row row--between">
        <span className="section-title" style={{ margin: 0 }}>
          Skin kitaplığım
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
            Dosyadan
          </button>
          <button
            className="btn btn--sm btn--primary"
            disabled={saving || busy || !hasCurrentSkin}
            title={hasCurrentSkin ? undefined : 'Bu hesapta özel bir skin yok'}
            onClick={() =>
              void guard(() => api.skins.saveCurrent(accountId, `Skin ${skins.length + 1}`))
            }
          >
            {saving ? <div className="spinner" /> : <Icon name="plus" size={14} />}
            Şu anki skini ekle
          </button>
        </div>
      </div>

      {skins.length === 0 ? (
        <p className="faint">
          Kitaplık boş. Kullandığınız bir skini buraya ekleyip sonra tek tıkla geri dönebilirsiniz.
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
        title={`${skin.name} · uygulamak için tıklayın`}
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
        <button className="skin-shelf__name" onDoubleClick={() => setEditing(true)} onClick={onApply}>
          {skin.name}
        </button>
      )}

      {confirming ? (
        <div className="skin-shelf__confirm">
          <button className="btn btn--sm btn--danger" onClick={onRemove}>
            Sil
          </button>
          <button className="btn btn--sm btn--ghost" onClick={onCancelRemove}>
            Vazgeç
          </button>
        </div>
      ) : (
        <button
          className="skin-shelf__remove"
          aria-label={`${skin.name} skinini kaldır`}
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
