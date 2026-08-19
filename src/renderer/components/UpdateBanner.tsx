import { useEffect, useState } from 'react'
import type { UpdateStatus } from '../../shared/types'
import { api } from '../lib/api'
import { Icon } from './Icon'
import { t } from '../../shared/i18n'

/**
 * Sits above the brand in the sidebar and only appears when there is something
 * to act on. One button carries the whole flow: offer, download progress, then
 * restart.
 */
export function UpdateBanner(): JSX.Element | null {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })

  useEffect(() => {
    // Whatever the main process found while the window was still loading.
    void api.updates.status().then(setStatus)
    return api.updates.onStatus(setStatus)
  }, [])

  if (status.state === 'idle' || status.state === 'checking') return null

  if (status.state === 'error') {
    return (
      <div className="update update--error" role="status">
        <Icon name="refresh" size={14} />
        <span className="update__label">{status.message}</span>
      </div>
    )
  }

  if (status.state === 'downloading') {
    return (
      <div className="update update--busy" role="status">
        <div className="update__fill" style={{ width: `${status.percent}%` }} />
        <span className="update__label">İndiriliyor… %{status.percent}</span>
      </div>
    )
  }

  if (status.state === 'ready') {
    return (
      <button className="update update--ready" onClick={() => void api.updates.install()}>
        <Icon name="refresh" size={14} />
        <span className="update__label">Yeniden başlat ve kur</span>
      </button>
    )
  }

  return (
    <button className="update" onClick={() => void api.updates.download()}>
      <Icon name="download" size={14} />
      <span className="update__label">
        {t('Yeni sürüm var')}
        <span className="update__version">{status.version}</span>
      </span>
    </button>
  )
}
