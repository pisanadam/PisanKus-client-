import { useState } from 'react'
import { Icon } from '../components/Icon'
import { Confirm } from '../components/Modal'
import { SkinHead } from '../components/SkinViewer'
import { api } from '../lib/api'
import { formatRelative } from '../lib/format'
import { useApp } from '../state/AppContext'
import { t } from '../../shared/i18n'

export function Accounts(): JSX.Element {
  const { accounts, activeAccount, refreshAccounts, signIn, signingIn, authError, notify } = useApp()
  const [pendingRemove, setPendingRemove] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const removing = accounts.find((account) => account.id === pendingRemove)

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">{t('Hesaplar')}</h1>
          <p className="page__subtitle">
            {t('Birden fazla Microsoft hesabı ekleyip aralarında geçiş yapabilirsiniz')}
          </p>
        </div>
        <div className="topbar__spacer" />
        <button className="btn btn--primary" onClick={() => void signIn()} disabled={signingIn}>
          {signingIn ? <div className="spinner" /> : <Icon name="plus" size={17} />}
          {t('Hesap ekle')}
        </button>
      </header>

      {authError && <div className="gate__error" style={{ marginBottom: 18 }}>{authError}</div>}

      <div className="list" style={{ maxWidth: 760 }}>
        {accounts.map((account) => {
          const active = account.id === activeAccount?.id
          return (
            <div key={account.id} className="list__row">
              <SkinHead skinUrl={account.skinUrl} size={38} name={account.name} />

              <div className="list__main">
                <div className="list__title">
                  {account.name}
                  {active && (
                    <span className="badge badge--accent" style={{ marginLeft: 8 }}>
                      {t('etkin')}
                    </span>
                  )}
                  {account.expired && (
                    <span className="badge badge--warning" style={{ marginLeft: 8 }}>
                      {t('oturum yenilenmeli')}
                    </span>
                  )}
                </div>
                <div className="list__sub">{t('Eklenme {when}', { when: formatRelative(account.addedAt) })}</div>
              </div>

              {!active && (
                <button
                  className="btn btn--sm"
                  onClick={async () => {
                    await api.auth.setActive(account.id)
                    await refreshAccounts()
                  }}
                >
                  {t('Etkinleştir')}
                </button>
              )}

              <button
                className="btn btn--sm"
                disabled={busyId === account.id}
                onClick={async () => {
                  setBusyId(account.id)
                  try {
                    await api.auth.refresh(account.id)
                    await refreshAccounts()
                    notify(t('Oturum yenilendi.'))
                  } catch (error) {
                    notify(error, 'error')
                  } finally {
                    setBusyId(null)
                  }
                }}
              >
                {busyId === account.id ? <div className="spinner" /> : <Icon name="refresh" size={14} />}
                {t('Yenile')}
              </button>

              <button
                className="btn btn--ghost btn--icon"
                aria-label={t('Hesabı kaldır')}
                onClick={() => setPendingRemove(account.id)}
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          )
        })}
      </div>

      {removing && (
        <Confirm
          title={t('Hesabı kaldır')}
          danger
          confirmLabel={t('Kaldır')}
          message={
            t('{name} hesabının oturumu bu cihazdan silinecek. Profilleriniz ve dosyalarınız etkilenmez.', {
              name: removing.name
            })
          }
          onConfirm={async () => {
            await api.auth.remove(removing.id)
            await refreshAccounts()
          }}
          onClose={() => setPendingRemove(null)}
        />
      )}
    </div>
  )
}
