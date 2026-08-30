import { useState, type ReactNode } from 'react'
import type { ScreenshotSummary } from '../../preload'
import { formatRelative } from '../lib/format'
import { Icon } from './Icon'
import { currentLanguage, t } from '../../shared/i18n'

/**
 * The screenshot gallery, without an opinion about where the shots came from.
 *
 * One profile's tab and the launcher-wide page show the same thing — search,
 * sort, months that fold away, a card per picture — and the only difference is
 * which folder the list was read from. Keeping one copy means the two cannot
 * drift into behaving differently.
 */

export interface GalleryItem extends ScreenshotSummary {
  profileId: string
  /** Shown on the card when the list spans more than one profile. */
  profileName?: string
}

/**
 * A month, or "this month", with the shots taken in it.
 *
 * Grouping by date rather than listing everything: a profile played for a
 * season has hundreds of these, and a flat grid of them is a wall. The current
 * month is named rather than dated because that is how people refer to it.
 */
interface ScreenshotGroup {
  key: string
  label: string
  items: GalleryItem[]
}

export function groupByMonth(items: GalleryItem[], locale: string): ScreenshotGroup[] {
  const now = new Date()
  const groups = new Map<string, ScreenshotGroup>()

  for (const item of items) {
    const taken = new Date(item.createdAt)
    const thisMonth =
      taken.getFullYear() === now.getFullYear() && taken.getMonth() === now.getMonth()
    const key = thisMonth ? 'current' : `${taken.getFullYear()}-${taken.getMonth()}`
    const label = thisMonth
      ? t('Bu ay')
      : taken.toLocaleDateString(locale, { month: 'long', year: 'numeric' })

    const group = groups.get(key) ?? { key, label, items: [] }
    group.items.push(item)
    groups.set(key, group)
  }
  return [...groups.values()]
}

export function ScreenshotGallery({
  items,
  onReload,
  onRemove,
  controls,
  emptyTitle,
  emptyHint
}: {
  /** `null` while the folders are still being read. */
  items: GalleryItem[] | null
  onReload: () => void
  onRemove: (item: GalleryItem) => void
  /** Buttons or pickers that belong to the caller, placed before Refresh. */
  controls?: ReactNode
  emptyTitle: string
  emptyHint: string
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [newestFirst, setNewestFirst] = useState(true)
  const [grouped, setGrouped] = useState(true)
  /** Collapsed groups, by key. Everything starts open. */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // Month names and case-folding follow the language the player chose. The
  // codes are plain BCP-47 tags, so they can be handed to Intl as they are.
  const locale = currentLanguage()
  const needle = query.trim().toLocaleLowerCase(locale)
  const visible = (items ?? [])
    .filter(
      (item) =>
        !needle ||
        item.fileName.toLocaleLowerCase(locale).includes(needle) ||
        (item.profileName ?? '').toLocaleLowerCase(locale).includes(needle)
    )
    .sort((left, right) =>
      newestFirst ? right.createdAt - left.createdAt : left.createdAt - right.createdAt
    )

  const groups: ScreenshotGroup[] = grouped
    ? groupByMonth(visible, locale)
    : [{ key: 'all', label: '', items: visible }]

  const card = (item: GalleryItem): JSX.Element => (
    <article className="screenshot-card" key={`${item.profileId}/${item.fileName}`}>
      {item.thumbnail ? (
        <img src={item.thumbnail} alt={item.fileName} />
      ) : (
        <div className="screenshot-card__empty">📷</div>
      )}
      <div className="screenshot-card__info">
        <div className="list__title" title={item.fileName}>{item.fileName}</div>
        <div className="list__sub">
          {item.profileName ? `${item.profileName} · ` : ''}
          {formatRelative(item.createdAt)} · {item.sizeMb} MB
        </div>
        <button className="btn btn--danger btn--sm" onClick={() => onRemove(item)}>
          <Icon name="trash" size={14} /> {t('Sil')}
        </button>
      </div>
    </article>
  )

  return (
    <div className="stack-lg">
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <div className="screenshot-search">
          <Icon name="search" size={15} />
          <input
            className="input"
            value={query}
            placeholder={t('Ara')}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <select
          className="select"
          style={{ width: 'auto' }}
          value={newestFirst ? 'newest' : 'oldest'}
          onChange={(event) => setNewestFirst(event.target.value === 'newest')}
        >
          <option value="newest">{t('En yeni')}</option>
          <option value="oldest">{t('En eski')}</option>
        </select>

        <select
          className="select"
          style={{ width: 'auto' }}
          value={grouped ? 'date' : 'none'}
          onChange={(event) => setGrouped(event.target.value === 'date')}
        >
          <option value="date">{t('Tarihe göre')}</option>
          <option value="none">{t('Gruplama yok')}</option>
        </select>

        <div className="topbar__spacer" />

        {controls}
        <button className="btn" onClick={onReload}>
          <Icon name="refresh" size={16} />
          {t('Yenile')}
        </button>
      </div>

      {items === null ? (
        <div className="row" style={{ justifyContent: 'center', padding: 30 }}><div className="spinner" /></div>
      ) : items.length === 0 ? (
        <div className="empty">
          <div className="empty__icon">📷</div>
          <div className="empty__title">{emptyTitle}</div>
          <p>{emptyHint}</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="empty">
          <div className="empty__icon">🔍</div>
          <div className="empty__title">{t('Eşleşen görüntü yok')}</div>
          <p>{t('Arama terimini değiştirmeyi deneyin.')}</p>
        </div>
      ) : (
        groups.map((group) => (
          <section className="stack-sm" key={group.key}>
            {group.label && (
              <button
                className="screenshot-group"
                aria-expanded={!collapsed.has(group.key)}
                onClick={() =>
                  setCollapsed((current) => {
                    const next = new Set(current)
                    if (!next.delete(group.key)) next.add(group.key)
                    return next
                  })
                }
              >
                <Icon name="play" size={12} className="screenshot-group__caret" />
                <span className="screenshot-group__label">{group.label}</span>
                <span className="nav-item__badge">{group.items.length}</span>
              </button>
            )}
            {!collapsed.has(group.key) && (
              <div className="screenshot-grid">{group.items.map(card)}</div>
            )}
          </section>
        ))
      )}
    </div>
  )
}
