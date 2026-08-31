import { useEffect, useState } from 'react'
import type { GalleryItem } from './ScreenshotGallery'
import { api } from '../lib/api'
import { errorMessage, formatRelative } from '../lib/format'
import { Icon } from './Icon'
import { t } from '../../shared/i18n'

/**
 * One screenshot, full size.
 *
 * The gallery shows a 360px thumbnail, which is the right thing for a grid and
 * the wrong thing for actually looking at a picture — the base you built is a
 * smear at that width. The file itself is read only when it is opened, because
 * sending every full-size image with the list would be tens of megabytes for a
 * view that shows one at a time.
 *
 * Arrow keys walk the same list the gallery is showing, in the same order, so
 * going through an evening's shots does not mean closing and reopening.
 */
export function ScreenshotViewer({
  items,
  index,
  onIndex,
  onClose,
  onRemove,
  notify
}: {
  /** The gallery's visible list, in its current order. */
  items: GalleryItem[]
  index: number
  onIndex: (next: number) => void
  onClose: () => void
  onRemove: (item: GalleryItem) => void
  notify: (message: unknown, kind?: 'error') => void
}): JSX.Element | null {
  const item = items[index]
  const [full, setFull] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!item) return
    let active = true
    setFull(null)
    setFailed(false)
    api.screenshots
      .read(item.profileId, item.fileName)
      .then((data) => {
        if (active) setFull(data)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [item?.profileId, item?.fileName])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight' && index + 1 < items.length) onIndex(index + 1)
      if (event.key === 'ArrowLeft' && index > 0) onIndex(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, items.length, onClose, onIndex])

  if (!item) return null

  return (
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="viewer" role="dialog" aria-modal="true" aria-label={item.fileName}>
        <header className="viewer__head">
          <div style={{ minWidth: 0 }}>
            <div className="viewer__title" title={item.fileName}>{item.fileName}</div>
            <div className="list__sub">
              {item.profileName ? `${item.profileName} · ` : ''}
              {formatRelative(item.createdAt)} · {item.sizeMb} MB · {index + 1}/{items.length}
            </div>
          </div>
          <button className="btn btn--ghost btn--icon" onClick={onClose} aria-label={t('Kapat')}>
            <Icon name="close" size={17} />
          </button>
        </header>

        <div className="viewer__stage">
          {/* The thumbnail is already in hand, so it stands in while the full
              file is read — a blank rectangle would read as a broken image. */}
          <img
            className={full ? 'viewer__image' : 'viewer__image viewer__image--loading'}
            src={full ?? item.thumbnail}
            alt={item.fileName}
          />
          {failed && <div className="viewer__note">{t('Dosya okunamadı.')}</div>}

          {index > 0 && (
            <button
              className="viewer__step viewer__step--prev"
              aria-label={t('Önceki')}
              onClick={() => onIndex(index - 1)}
            >
              <Icon name="play" size={18} />
            </button>
          )}
          {index + 1 < items.length && (
            <button
              className="viewer__step viewer__step--next"
              aria-label={t('Sonraki')}
              onClick={() => onIndex(index + 1)}
            >
              <Icon name="play" size={18} />
            </button>
          )}
        </div>

        <footer className="viewer__foot">
          <button
            className="btn"
            onClick={() =>
              void api.screenshots
                .copy(item.profileId, item.fileName)
                .then(() => notify(t('Görüntü panoya kopyalandı.')))
                .catch((error) => notify(errorMessage(error), 'error'))
            }
          >
            <Icon name="copy" size={16} />
            {t('Panoya kopyala')}
          </button>
          <button
            className="btn"
            onClick={() =>
              void api.screenshots
                .reveal(item.profileId, item.fileName)
                .catch((error) => notify(errorMessage(error), 'error'))
            }
          >
            <Icon name="folder" size={16} />
            {t('Klasörde göster')}
          </button>
          <div className="topbar__spacer" />
          <button className="btn btn--danger" onClick={() => onRemove(item)}>
            <Icon name="trash" size={16} />
            {t('Sil')}
          </button>
        </footer>
      </div>
    </div>
  )
}
