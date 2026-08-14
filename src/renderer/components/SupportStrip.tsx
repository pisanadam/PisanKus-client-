import { COMMUNITY_LINKS, DISCLAIMER, isUsableSupportUrl } from '../../shared/support'
import { api } from '../lib/api'
import { useApp } from '../state/AppContext'
import { Icon } from './Icon'

/**
 * The launcher's only promotional surface: a few links to the project itself,
 * opened in the system browser. No ad network, no remote fetch, no tracking —
 * which is also why it does not fight the content security policy.
 *
 * Deliberately does not sell anything. Donating unlocks nothing here, because
 * Mojang's guidelines allow asking for donations only when the donor gets
 * nothing that other players cannot have.
 */
export function SupportStrip(): JSX.Element | null {
  const { settings, saveSettings } = useApp()
  if (!settings?.supportStrip) return null

  const donate = isUsableSupportUrl(settings.supportUrl) ? settings.supportUrl : ''

  return (
    <div className="support">
      <div className="support__head">
        <span className="support__title">Projeyi destekle</span>
        <button
          className="support__hide"
          title="Gizle — Ayarlar'dan geri açabilirsiniz"
          aria-label="Destek bölümünü gizle"
          onClick={() => void saveSettings({ supportStrip: false })}
        >
          <Icon name="close" size={13} />
        </button>
      </div>

      <div className="support__links">
        {donate && (
          <button
            className="support__link support__link--accent"
            onClick={() => void api.app.openExternal(donate)}
          >
            <Icon name="heart" size={14} />
            Bağış yap
          </button>
        )}

        {COMMUNITY_LINKS.map((link) => (
          <button
            key={link.id}
            className="support__link"
            onClick={() => void api.app.openExternal(link.url)}
          >
            <Icon name={link.icon} size={14} />
            {link.label}
          </button>
        ))}
      </div>

      <p className="support__note">{DISCLAIMER}</p>
    </div>
  )
}
