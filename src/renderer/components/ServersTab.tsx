import { useCallback, useEffect, useState } from 'react'
import type { ServerEntry, ServerStatus } from '../../preload'
import type { Profile } from '../../shared/types'
import { api } from '../lib/api'
import { useApp } from '../state/AppContext'
import { Icon } from './Icon'
import { t } from '../../shared/i18n'

/**
 * The profile's multiplayer list, read from and written back to its own
 * `servers.dat`. Whatever is here is what the game shows under "Multiplayer".
 *
 * Live status comes from a public service and is fetched only when this tab is
 * opened or the player presses refresh — there is no polling, and the launcher
 * makes no contact with it while the tab is closed.
 */
export function ServersTab({ profile }: { profile: Profile }): JSX.Element {
  const { notify, gameStates } = useApp()
  const [servers, setServers] = useState<ServerEntry[] | null>(null)
  const [status, setStatus] = useState<Record<string, ServerStatus>>({})
  const [checking, setChecking] = useState(false)
  const [editing, setEditing] = useState<{ index: number | null; name: string; address: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [joining, setJoining] = useState<string | null>(null)

  const refreshStatus = useCallback(async (list: ServerEntry[]) => {
    setChecking(true)
    try {
      // Sequential rather than parallel: a courteous pace towards a free
      // service, and a dozen servers still resolve in a couple of seconds.
      for (const server of list) {
        const result = await api.servers.status(server.address)
        setStatus((current) => ({ ...current, [server.address]: result }))
      }
    } finally {
      setChecking(false)
    }
  }, [])

  const load = useCallback(async () => {
    try {
      const list = await api.servers.list(profile.id)
      setServers(list)
      void refreshStatus(list)
    } catch (error) {
      setServers([])
      notify(error, 'error')
    }
  }, [profile.id, notify, refreshStatus])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (action: () => Promise<ServerEntry[]>): Promise<void> => {
    setBusy(true)
    try {
      const list = await action()
      setServers(list)
      setEditing(null)
      void refreshStatus(list)
    } catch (error) {
      notify(error, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (servers === null) {
    return (
      <div className="row" style={{ justifyContent: 'center', padding: 30 }}>
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="stack-lg">
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button
          className="btn btn--primary"
          onClick={() => setEditing({ index: null, name: '', address: '' })}
        >
          <Icon name="plus" size={16} />
          {t('Sunucu ekle')}
        </button>
        <button className="btn" disabled={checking || servers.length === 0} onClick={() => void refreshStatus(servers)}>
          {checking ? <div className="spinner" /> : <Icon name="refresh" size={16} />}
          {t('Durumları yenile')}
        </button>
        <div className="topbar__spacer" />
        <span className="faint">{t('Bu liste oyunda “Çok Oyunculu” ekranında görünür')}</span>
      </div>

      {editing && (
        <div className="settings-group">
          <div className="section-title">{editing.index === null ? t('Yeni sunucu') : t('Sunucuyu düzenle')}</div>
          <div className="field">
            <label className="field__label" htmlFor="server-name">
              {t('Ad')}
            </label>
            <input
              id="server-name"
              className="input"
              value={editing.name}
              placeholder={t('Sunucunun listede görünecek adı')}
              onChange={(event) => setEditing({ ...editing, name: event.target.value })}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="server-address">
              {t('Adres')}
            </label>
            <input
              id="server-address"
              className="input"
              value={editing.address}
              placeholder="ornek.sunucu.net"
              onChange={(event) => setEditing({ ...editing, address: event.target.value })}
            />
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setEditing(null)} disabled={busy}>
              {t('Vazgeç')}
            </button>
            <button
              className="btn btn--primary"
              disabled={busy || !editing.address.trim()}
              onClick={() =>
                void run(() => {
                  const input = {
                    name: editing.name.trim() || editing.address.trim(),
                    address: editing.address.trim()
                  }
                  return editing.index === null
                    ? api.servers.add(profile.id, input)
                    : api.servers.update(profile.id, editing.index, input)
                })
              }
            >
              {t('Kaydet')}
            </button>
          </div>
        </div>
      )}

      {servers.length === 0 ? (
        <div className="empty">
          <div className="empty__icon">🛰️</div>
          <div className="empty__title">{t('Bu profilde kayıtlı sunucu yok')}</div>
          <p>{t('Eklediğiniz sunucular oyunu açtığınızda listede hazır olur.')}</p>
        </div>
      ) : (
        <div className="list">
          {servers.map((server) => {
            const state = status[server.address]
            // Minecraft caches an icon after the first connection; before that
            // the status service is the only place one comes from.
            const icon = server.icon ?? state?.icon

            return (
              <div key={`${server.index}-${server.address}`} className="list__row">
                {icon ? (
                  <img
                    className="list__icon"
                    src={icon.startsWith('data:') ? icon : `data:image/png;base64,${icon}`}
                    alt=""
                  />
                ) : (
                  <div className="list__icon" />
                )}

                <div className="list__main">
                  <div className="list__title">
                    {server.name}
                    {state && (
                      <span
                        className={state.online ? 'badge badge--success' : 'badge'}
                        style={{ marginLeft: 8 }}
                      >
                        {state.online
                          ? t('{online}/{max} oyuncu', {
                              online: state.players?.online ?? 0,
                              max: state.players?.max ?? 0
                            })
                          : (state.error ?? t('çevrimdışı'))}
                      </span>
                    )}
                  </div>
                  <div className="list__sub">
                    {server.address}
                    {state?.version && ` · ${state.version}`}
                    {state?.motd && ` · ${state.motd}`}
                  </div>
                </div>

                <button
                  className="btn btn--primary btn--sm"
                  disabled={busy || joining !== null || ['preparing', 'running'].includes(gameStates[profile.id] ?? '')}
                  onClick={async () => {
                    setJoining(server.address)
                    try {
                      await api.game.launch(profile.id, { serverAddress: server.address })
                    } catch (error) {
                      notify(error, 'error')
                    } finally {
                      setJoining(null)
                    }
                  }}
                >
                  {joining === server.address ? <div className="spinner" /> : <Icon name="play" size={15} />}
                  {t('Katıl')}
                </button>
                <button
                  className="btn btn--ghost btn--icon"
                  aria-label={t('Yukarı taşı')}
                  disabled={busy || server.index === 0}
                  onClick={() => void run(() => api.servers.move(profile.id, server.index, server.index - 1))}
                >
                  <Icon name="download" size={16} style={{ transform: 'rotate(180deg)' }} />
                </button>
                <button
                  className="btn btn--ghost btn--icon"
                  aria-label={t('Aşağı taşı')}
                  disabled={busy || server.index === servers.length - 1}
                  onClick={() => void run(() => api.servers.move(profile.id, server.index, server.index + 1))}
                >
                  <Icon name="download" size={16} />
                </button>
                <button
                  className="btn btn--sm"
                  disabled={busy}
                  onClick={() => setEditing({ index: server.index, name: server.name, address: server.address })}
                >
                  {t('Düzenle')}
                </button>
                <button
                  className="btn btn--ghost btn--icon"
                  aria-label={t('Kaldır')}
                  disabled={busy}
                  onClick={() => void run(() => api.servers.remove(profile.id, server.index))}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <p className="faint">
        {t('Durum bilgisi mcstatus.io üzerinden, yalnızca bu sekme açıkken ve yenilediğinizde sorgulanır.')}
      </p>
    </div>
  )
}
