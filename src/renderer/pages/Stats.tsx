import { useEffect, useMemo, useState } from 'react'
import { ProfileIcon } from '../components/ProfileIcon'
import { api } from '../lib/api'
import { formatPlaytime } from '../lib/format'
import { useApp } from '../state/AppContext'
import { summarise, type ProfileSessions } from '../../shared/playStats'
import { currentLanguage, t } from '../../shared/i18n'

/**
 * How much the launcher has actually been played, and when.
 *
 * The profile card already carried a total, which answers one question and
 * hides every other: it cannot say whether those hours were last week or two
 * years ago, which evenings were the long ones, or which of five profiles is
 * the one really being played. All of that is in the sessions; this is the page
 * that reads them.
 */
export function Stats(): JSX.Element {
  const { profiles } = useApp()
  const [raw, setRaw] = useState<ProfileSessions[] | null>(null)
  const [days, setDays] = useState(30)

  useEffect(() => {
    let active = true
    void api.stats
      .sessions()
      .then((value) => {
        if (active) setRaw(value)
      })
      .catch(() => {
        if (active) setRaw([])
      })
    return () => {
      active = false
    }
  }, [])

  const stats = useMemo(() => summarise(raw ?? [], { days }), [raw, days])
  const locale = currentLanguage()

  if (raw === null) {
    return (
      <div className="page">
        <div className="row" style={{ justifyContent: 'center', padding: 40 }}>
          <div className="spinner" />
        </div>
      </div>
    )
  }

  if (stats.sessionCount === 0) {
    return (
      <div className="page">
        <header className="page__header">
          <div>
            <h1 className="page__title">{t('İstatistikler')}</h1>
          </div>
        </header>
        <div className="empty">
          <div className="empty__icon">📊</div>
          <div className="empty__title">{t('Henüz oynanmış bir oturum yok')}</div>
          <p>{t('Bir profil başlatıp oynadığınızda süreler burada birikmeye başlar.')}</p>
        </div>
      </div>
    )
  }

  // The tallest bar sets the scale. Without it a quiet week would draw as flat
  // as an empty one, and a busy day next to it would look the same height.
  const peak = Math.max(...stats.days.map((day) => day.ms), 1)

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">{t('İstatistikler')}</h1>
          <p className="page__subtitle">{t('Ne kadar ve ne zaman oynadığınız')}</p>
        </div>
        <select
          className="select"
          style={{ width: 'auto' }}
          value={days}
          aria-label={t('Dönem')}
          onChange={(event) => setDays(Number(event.target.value))}
        >
          <option value={7}>{t('Son 7 gün')}</option>
          <option value={30}>{t('Son 30 gün')}</option>
          <option value={90}>{t('Son 90 gün')}</option>
        </select>
      </header>

      <div className="stat-cards">
        <StatCard label={t('Toplam süre')} value={formatPlaytime(stats.totalMs)} />
        <StatCard label={t('Oturum')} value={String(stats.sessionCount)} />
        <StatCard label={t('Ortalama oturum')} value={formatPlaytime(stats.averageMs)} />
        <StatCard label={t('En uzun oturum')} value={formatPlaytime(stats.longestMs)} />
      </div>

      <section className="stack-sm">
        <div className="section-title">{t('Günlere göre')}</div>
        <div className="daybars" role="img" aria-label={t('Günlere göre oynama süresi')}>
          {stats.days.map((day) => {
            const readable = new Date(`${day.day}T12:00:00`).toLocaleDateString(locale, {
              day: 'numeric',
              month: 'long'
            })
            return (
              <div
                key={day.day}
                className={day.ms > 0 ? 'daybar' : 'daybar daybar--empty'}
                title={`${readable} — ${day.ms > 0 ? formatPlaytime(day.ms) : t('oynanmadı')}`}
              >
                <div className="daybar__fill" style={{ height: `${Math.round((day.ms / peak) * 100)}%` }} />
              </div>
            )
          })}
        </div>
        {stats.busiest && (
          <div className="faint">
            {t('En yoğun gün: {day} — {time}', {
              day: new Date(`${stats.busiest.day}T12:00:00`).toLocaleDateString(locale, {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              }),
              time: formatPlaytime(stats.busiest.ms)
            })}
          </div>
        )}
      </section>

      <section className="stack-sm">
        <div className="section-title">{t('Profillere göre')}</div>
        <div className="list">
          {stats.profiles.map((entry) => {
            const profile = profiles.find((candidate) => candidate.id === entry.profileId)
            const share = Math.round((entry.ms / stats.totalMs) * 100)
            return (
              <div className="list__row" key={entry.profileId}>
                {profile ? <ProfileIcon profile={profile} size={22} /> : <span>🎮</span>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="list__title">{entry.profileName}</div>
                  <div className="list__sub">
                    {t('{count} oturum', { count: entry.sessionCount })} · %{share}
                  </div>
                </div>
                {/* The bar is the comparison; the number beside it is the answer. */}
                <div className="sharebar" aria-hidden="true">
                  <div className="sharebar__fill" style={{ width: `${share}%` }} />
                </div>
                <span className="list__sub">{formatPlaytime(entry.ms)}</span>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="stat-card">
      <div className="stat-card__value">{value}</div>
      <div className="stat-card__label">{label}</div>
    </div>
  )
}
