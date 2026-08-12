import { useState } from 'react'
import { Icon, type IconName } from './components/Icon'
import { LoginGate } from './components/LoginGate'
import { SkinHead } from './components/SkinViewer'
import { TaskTray } from './components/TaskTray'
import { Accounts } from './pages/Accounts'
import { Discover } from './pages/Discover'
import { Library } from './pages/Library'
import { ProfileDetail } from './pages/ProfileDetail'
import { Settings } from './pages/Settings'
import { Skins } from './pages/Skins'
import { useApp } from './state/AppContext'

type Route =
  | { page: 'library' }
  | { page: 'discover'; profileId?: string }
  | { page: 'skins' }
  | { page: 'accounts' }
  | { page: 'settings' }
  | { page: 'profile'; profileId: string }

const NAV: { page: Route['page']; label: string; icon: IconName }[] = [
  { page: 'library', label: 'Kitaplık', icon: 'grid' },
  { page: 'discover', label: 'Keşfet', icon: 'compass' },
  { page: 'skins', label: 'Skin', icon: 'sparkle' },
  { page: 'accounts', label: 'Hesaplar', icon: 'user' },
  { page: 'settings', label: 'Ayarlar', icon: 'settings' }
]

export function App(): JSX.Element {
  const { ready, accounts, activeAccount, profiles, gameStates } = useApp()
  const [route, setRoute] = useState<Route>({ page: 'library' })

  if (!ready) {
    return (
      <div className="gate">
        <div className="spinner" style={{ width: 26, height: 26 }} />
      </div>
    )
  }

  // Microsoft authentication is a hard requirement — no account, no launcher.
  if (accounts.length === 0) return <LoginGate />

  const runningCount = Object.values(gameStates).filter((status) => status === 'running').length

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand__mark">OP</div>
          <div>
            <div className="brand__name">Opbay Client</div>
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
            {entry.label}
            {entry.page === 'library' && profiles.length > 0 && (
              <span className="nav-item__badge">{profiles.length}</span>
            )}
          </button>
        ))}

        {profiles.length > 0 && (
          <>
            <div className="nav-section">Profiller</div>
            {profiles.slice(0, 8).map((profile) => {
              const running = gameStates[profile.id] === 'running' || gameStates[profile.id] === 'preparing'
              return (
                <button
                  key={profile.id}
                  className={running ? 'nav-item nav-item--running' : 'nav-item'}
                  aria-current={route.page === 'profile' && route.profileId === profile.id}
                  onClick={() => setRoute({ page: 'profile', profileId: profile.id })}
                >
                  <span aria-hidden="true" style={{ fontSize: 16, width: 18, textAlign: 'center' }}>
                    {profile.icon ?? '🎮'}
                  </span>
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
                  {running && <span className="nav-item__dot" />}
                </button>
              )
            })}
          </>
        )}

        <div className="sidebar__spacer" />

        <button className="account-chip" onClick={() => setRoute({ page: 'accounts' })}>
          <SkinHead skinUrl={activeAccount?.skinUrl} size={26} />
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

        {route.page === 'discover' && <Discover initialProfileId={route.profileId} />}

        {route.page === 'profile' && (
          <ProfileDetail
            profileId={route.profileId}
            onBack={() => setRoute({ page: 'library' })}
            onBrowse={(profileId) => setRoute({ page: 'discover', profileId })}
          />
        )}

        {route.page === 'skins' && <Skins />}
        {route.page === 'accounts' && <Accounts />}
        {route.page === 'settings' && <Settings />}
      </main>

      <TaskTray />
    </div>
  )
}
