import { useEffect, useRef, useState } from 'react'
import welcomeChime from '../assets/welcome.wav'
import { Icon, type IconName } from './Icon'
import { t } from '../../shared/i18n'
import type { Settings } from '../../shared/types'

const HIGHLIGHTS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'compass', title: 'Modrinth', text: 'Mod, doku paketi, shader ve dünyaları tek tıkla kur' },
  { icon: 'grid', title: 'Profiller', text: 'Vanilla, Fabric, Forge ve NeoForge yan yana' },
  { icon: 'sparkle', title: 'Skin', text: 'Skinini ve pelerinini launcher içinden değiştir' }
]

/**
 * Shown once, the first time the launcher opens after installation. The chime
 * needs `autoplayPolicy: no-user-gesture-required` on the window, since nothing
 * has been clicked yet at this point.
 */
export function Welcome({
  soundEnabled,
  onDone
}: {
  soundEnabled: boolean
  onDone: (patch?: Partial<Settings>) => void
}): JSX.Element {
  const [leaving, setLeaving] = useState(false)
  const [step, setStep] = useState(0)
  const [preset, setPreset] = useState<'performance' | 'balanced' | 'visuals'>('balanced')
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!soundEnabled) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const audio = new Audio(welcomeChime)
    audio.volume = 0.55
    // Blocked autoplay rejects rather than throwing; a silent welcome is fine.
    void audio.play().catch(() => undefined)
    return () => {
      audio.pause()
      audio.currentTime = 0
    }
  }, [soundEnabled])

  useEffect(() => () => clearTimeout(timer.current), [])

  // Let the panel animate out before the login gate replaces it.
  const dismiss = (): void => {
    setLeaving(true)
    const patch: Partial<Settings> = preset === 'performance'
      ? { defaultMemoryMb: 4096, concurrentDownloads: 10, keepLauncherOpen: false }
      : preset === 'visuals'
        ? { defaultMemoryMb: 6144, concurrentDownloads: 6, keepLauncherOpen: true }
        : { defaultMemoryMb: 4096, concurrentDownloads: 8, keepLauncherOpen: true }
    timer.current = setTimeout(() => onDone(patch), 260)
  }

  return (
    <div className={leaving ? 'welcome welcome--leaving' : 'welcome'}>
      <div className="welcome__glow" aria-hidden="true" />

      <div className="welcome__panel">
        <div className="welcome__mark">PK</div>

        <h1 className="welcome__title">{t("PisanKus Client'e hoş geldiniz")}</h1>
        <p className="welcome__text">
          {t("Modern, hızlı ve sade bir Minecraft launcher'ı. Başlamadan önce kısa bir tanıtım:")}
        </p>

        {step === 0 ? (
          <>
            <ul className="welcome__list">
              {HIGHLIGHTS.map((item, index) => (
                <li key={item.title} className="welcome__item" style={{ animationDelay: `${340 + index * 110}ms` }}>
                  <span className="welcome__icon">
                    <Icon name={item.icon} size={17} />
                  </span>
                  <span>
                    <strong>{t(item.title)}</strong>
                    <span className="faint"> · {t(item.text)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <button className="btn btn--primary welcome__cta" onClick={() => setStep(1)} autoFocus>
              {t('Devam')}
            </button>
          </>
        ) : (
          <>
            <div className="welcome__preset-title">{t('Nasıl oynamayı tercih ediyorsunuz?')}</div>
            <div className="welcome__presets">
              {([
                ['performance', 'Performans', 'Daha hızlı başlangıç ve launcher oyun sırasında kapalı'],
                ['balanced', 'Dengeli', 'Çoğu kullanıcı için önerilen ayarlar'],
                ['visuals', 'Görsellik', 'Shader ve büyük paketler için daha fazla bellek']
              ] as const).map(([id, title, detail]) => (
                <button
                  key={id}
                  className={preset === id ? 'welcome__preset welcome__preset--selected' : 'welcome__preset'}
                  onClick={() => setPreset(id)}
                >
                  <strong>{t(title)}</strong>
                  <span>{t(detail)}</span>
                </button>
              ))}
            </div>
            <div className="row welcome__actions">
              <button className="btn" onClick={() => setStep(0)}>{t('Geri')}</button>
              <button className="btn btn--primary" onClick={dismiss} autoFocus>{t('Başlayalım')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
