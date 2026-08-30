import { useEffect, useState } from 'react'
import { ProfileIcon } from './components/ProfileIcon'
import { Icon, type IconName } from './components/Icon'
import { LoginGate } from './components/LoginGate'
import { SkinHead } from './components/SkinViewer'
import { TaskTray } from './components/TaskTray'
import { UpdateBanner } from './components/UpdateBanner'
import { Welcome } from './components/Welcome'
import { Accounts } from './pages/Accounts'
import { Discover } from './pages/Discover'
import { Library } from './pages/Library'
import { Screenshots } from './pages/Screenshots'
import { ProfileDetail } from './pages/ProfileDetail'
import { Settings } from './pages/Settings'
import { Skins } from './pages/Skins'
import { useApp } from './state/AppContext'
import { t } from '../shared/i18n'
import type { ContentKind } from '../shared/types'

type Route =
  | { page: 'library' }
  | { page: 'discover'; profileId?: string; kind?: ContentKind }
  | { page: 'skins' }
  | { page: 'screenshots' }
  | { page: 'accounts' }
  | { page: 'settings' }
  | { page: 'profile'; profileId: string; tab?: 'logs'; tabRequestKey?: number }

const NAV: { page: Route['page']; label: string; icon: IconName }[] = [
  { page: 'library', label: 'Kitaplık', icon: 'grid' },
  { page: 'discover', label: 'Keşfet', icon: 'compass' },
  { page: 'skins', label: 'Skin', icon: 'sparkle' },
  { page: 'screenshots', label: 'Ekran görüntüleri', icon: 'image' },
  { page: 'accounts', label: 'Hesaplar', icon: 'user' },
  { page: 'settings', label: 'Ayarlar', icon: 'settings' }
]

export function App(): JSX.Element {
  const {
    ready,
    startupError,
    settings,
    saveSettings,
    accounts,
    activeAccount,
    profiles,
    gameStates,
    crashOpenRequest,
    clearCrashOpenRequest
  } = useApp()
  const [route, setRoute] = useState<Route>({ page: 'library' })
  // Kept locally as well so the panel can animate out before the flag round-trips.
  const [welcomed, setWelcomed] = useState(false)

  useEffect(() => {
    if (!crashOpenRequest) return
    setRoute({
      page: 'profile',
      profileId: crashOpenRequest.profileId,
      tab: 'logs',
      tabRequestKey: crashOpenRequest.nonce
    })
    clearCrashOpenRequest()
  }, [crashOpenRequest, clearCrashOpenRequest])

  if (!ready) {
    return (
      <div className="gate">
        <div className="spinner" style={{ width: 26, height: 26 }} />
      </div>
    )
  }

  if (startupError || !settings) {
    return (
      <div className="gate">
        <div className="gate__panel">
          <div className="gate__mark">PK</div>
          <div>
            <h1 className="gate__title">{t('Başlatma tamamlanamadı')}</h1>
            <p className="gate__text">
              {t('Launcher verileri okunamadı. Uygulamayı yeniden başlatın; sorun sürerse aşağıdaki hatayı paylaşın.')}
            </p>
          </div>
          <div className="gate__error">{startupError ?? t('Ayarlar yüklenemedi.')}</div>
        </div>
      </div>
    )
  }

  // First launch after installation, before the sign-in gate.
  if (!settings.welcomeSeen && !welcomed) {
    return (
      <Welcome
        soundEnabled={settings.soundEffects}
        onDone={(patch) => {
          setWelcomed(true)
          void saveSettings({ ...patch, welcomeSeen: true })
        }}
      />
    )
  }

  // Microsoft authentication is a hard requirement — no account, no launcher.
  if (accounts.length === 0) return <LoginGate />

  const runningCount = Object.values(gameStates).filter((status) => status === 'running').length

  return (
    <div className="app">
      <aside className="sidebar">
        <UpdateBanner />

        <div className="brand">
          <div className="brand__mark">PK</div>
          <div>
            <div className="brand__name">PisanKus Client</div>
            <div className="brand__tag">Minecraft Launcher</div>
          </div>
        </div>

        {NAV.map((entry) => (
          <button
            key={entry.page}
            className="nav-item"
            aria-current={route.page === entry.page}
            onClick={() => setRoute({ page: entry.page } as Route)}
          >
            <Icon name={entry.icon} size={18} />
            {t(entry.label)}
            {entry.page === 'library' && profiles.length > 0 && (
              <span className="nav-item__badge">{profiles.length}</span>
            )}
          </button>
        ))}

        {profiles.length > 0 && (
          <>
            <div className="nav-section">{t('Profiller')}</div>
            {profiles.slice(0, 8).map((profile) => {
              const running = gameStates[profile.id] === 'running' || gameStates[profile.id] === 'preparing'
              return (
                <button
                  key={profile.id}
                  className={running ? 'nav-item nav-item--running' : 'nav-item'}
                  aria-current={route.page === 'profile' && route.profileId === profile.id}
                  onClick={() => setRoute({ page: 'profile', profileId: profile.id })}
                >
                  <ProfileIcon profile={profile} size={19} />
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      minWidth: 0,
                      flex: 1,
                      textAlign: 'left'
                    }}
                  >
                    {profile.name}
                  </span>
                  {profile.preparing ? (
                    <div className="spinner" style={{ width: 13, height: 13 }} />
                  ) : (
                    running && <span className="nav-item__dot" />
                  )}
                </button>
              )
            })}
          </>
        )}

        <div className="sidebar__spacer" />

        <button className="account-chip" onClick={() => setRoute({ page: 'accounts' })}>
          <SkinHead skinUrl={activeAccount?.skinUrl} size={26} name={activeAccount?.name} />
          <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {activeAccount?.name ?? 'Hesap'}
          </span>
          {runningCount > 0 && <span className="nav-item__dot" style={{ margin: 0 }} />}
        </button>
      </aside>

      <main className="main">
        {route.page === 'library' && (
          <Library onOpenProfile={(profileId) => setRoute({ page: 'profile', profileId })} />
        )}

        {/* A profileId on the route means the store was opened from inside that
            profile, so it is the fixed install target rather than a suggestion. */}
        {route.page === 'discover' && (
          <Discover lockedProfileId={route.profileId} initialKind={route.kind} />
        )}

        {route.page === 'profile' && (
          <ProfileDetail
            profileId={route.profileId}
            initialTab={route.tab}
            initialTabRequestKey={route.tabRequestKey}
            onBack={() => setRoute({ page: 'library' })}
            onBrowse={(profileId, kind) => setRoute({ page: 'discover', profileId, kind })}
          />
        )}

        {route.page === 'skins' && <Skins />}
        {route.page === 'screenshots' && <Screenshots />}
        {route.page === 'accounts' && <Accounts />}
        {route.page === 'settings' && <Settings />}
      </main>

      <TaskTray />
    </div>
  )
}
