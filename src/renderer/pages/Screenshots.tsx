import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { ScreenshotGallery, type GalleryItem } from '../components/ScreenshotGallery'
import { api } from '../lib/api'
import { useApp } from '../state/AppContext'
import { t } from '../../shared/i18n'

/**
 * Every screenshot in the launcher, in one place.
 *
 * They were only ever reachable through the profile that took them, which is
 * the wrong way round for the thing people actually want: the shot, not the
 * profile it happens to live under. Someone who plays three profiles had to
 * remember which one they were in that evening and go through each in turn.
 *
 * The folders are read side by side and the results merged, so the gallery
 * sorts and groups them by when they were taken rather than by profile. Which
 * profile a shot belongs to stays on its card and in the filter, for when that
 * is the question being asked.
 */
export function Screenshots(): JSX.Element {
  const { profiles, notify } = useApp()
  const [items, setItems] = useState<GalleryItem[] | null>(null)
  const [profileFilter, setProfileFilter] = useState('all')

  const reload = useCallback(async (): Promise<void> => {
    const lists = await Promise.all(
      profiles.map(async (profile) => {
        // One unreadable profile folder must not empty the whole page.
        const list = await api.screenshots.list(profile.id).catch(() => [])
        return list.map((item) => ({ ...item, profileId: profile.id, profileName: profile.name }))
      })
    )
    setItems(lists.flat())
  }, [profiles])

  useEffect(() => {
    void reload()
  }, [reload])

  // A filter pointing at a profile that has since been deleted would show an
  // empty page with no way to tell why.
  const known = profileFilter === 'all' || profiles.some((profile) => profile.id === profileFilter)
  const visible =
    items === null || known === false || profileFilter === 'all'
      ? items
      : items.filter((item) => item.profileId === profileFilter)

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">{t('Ekran görüntüleri')}</h1>
          <p className="page__subtitle">{t('Bütün profillerde çektiğiniz görüntüler')}</p>
        </div>
      </header>

      <ScreenshotGallery
        items={visible}
        onReload={() => void reload()}
        onRemove={(item) => {
          void api.screenshots
            .remove(item.profileId, item.fileName)
            .then(() => reload())
            .catch((error) => notify(error, 'error'))
        }}
        controls={
          profiles.length > 1 ? (
            <select
              className="select"
              style={{ width: 'auto' }}
              aria-label={t('Profil')}
              value={known ? profileFilter : 'all'}
              onChange={(event) => setProfileFilter(event.target.value)}
            >
              <option value="all">{t('Tüm profiller')}</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          ) : (
            profiles.length === 1 && (
              <button
                className="btn"
                onClick={() =>
                  void api.screenshots.openFolder(profiles[0].id).catch((error) => notify(error, 'error'))
                }
              >
                <Icon name="folder" size={16} />
                {t('Klasörü aç')}
              </button>
            )
          )
        }
        emptyTitle={t('Henüz ekran görüntüsü yok')}
        emptyHint={t("Minecraft'ta F2 tuşuyla çektiğiniz görüntüler burada görünür.")}
      />
    </div>
  )
}
