import { useEffect, useState } from 'react'
import type { JavaInfo } from '../../preload'
import { Icon } from '../components/Icon'
import { api } from '../lib/api'
import { errorMessage } from '../lib/format'
import { useApp } from '../state/AppContext'

const ACCENTS = ['#5b8cff', '#7c5cff', '#e0567a', '#f0873c', '#3fb98a', '#2fb6c8', '#d9b23c']

/** Minecraft's own launcher client id, paired with the legacy sign-in flow. */
const DEFAULT_CLIENT_ID = '00000000402b5328'

export function Settings(): JSX.Element {
  const { settings, saveSettings, notify } = useApp()
  const [javaRuntimes, setJavaRuntimes] = useState<JavaInfo[]>([])
  const [scanningJava, setScanningJava] = useState(false)
  const [jvmDraft, setJvmDraft] = useState('')

  useEffect(() => {
    if (!settings) return
    setJvmDraft(settings.jvmArgs)
  }, [settings])

  const scanJava = async (): Promise<void> => {
    setScanningJava(true)
    try {
      setJavaRuntimes(await api.versions.java())
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setScanningJava(false)
    }
  }

  useEffect(() => {
    void scanJava()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!settings) {
    return (
      <div className="page">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Ayarlar</h1>
          <p className="page__subtitle">Görünüm, oyun dizini, Java ve hesap ayarları</p>
        </div>
      </header>

      <div className="stack-lg" style={{ maxWidth: 820 }}>
        <section className="settings-group">
          <div className="section-title">Görünüm</div>

          <div className="settings-row">
            <div>
              <div className="settings-row__label">Tema</div>
              <div className="faint">Sistem seçeneği işletim sistemi ayarını izler</div>
            </div>
            <select
              className="select"
              value={settings.theme}
              onChange={(event) => void saveSettings({ theme: event.target.value as typeof settings.theme })}
            >
              <option value="dark">Koyu</option>
              <option value="light">Açık</option>
              <option value="system">Sistem</option>
            </select>
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-row__label">Vurgu rengi</div>
              <div className="faint">Düğmeler ve seçili öğelerde kullanılır</div>
            </div>
            <div className="chips">
              {ACCENTS.map((color) => (
                <button
                  key={color}
                  className="chip"
                  aria-pressed={settings.accentColor === color}
                  aria-label={`Vurgu rengi ${color}`}
                  style={{ background: color, width: 30, height: 30, padding: 0, borderRadius: 8 }}
                  onClick={() => void saveSettings({ accentColor: color })}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="settings-group">
          <div className="section-title">Oyun</div>

          <div className="settings-row">
            <div>
              <div className="settings-row__label">Veri dizini</div>
              <div className="faint" style={{ wordBreak: 'break-all' }}>
                {settings.dataDir}
              </div>
            </div>
            <button
              className="btn"
              onClick={async () => {
                const picked = await api.settings.pickDirectory()
                if (picked) {
                  await saveSettings({ dataDir: picked })
                  notify('Veri dizini değiştirildi. Mevcut profil dosyaları taşınmadı.')
                }
              }}
            >
              <Icon name="folder" size={16} />
              Değiştir
            </button>
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-row__label">Varsayılan bellek</div>
              <div className="faint">{(settings.defaultMemoryMb / 1024).toFixed(1)} GB — yeni profiller için</div>
            </div>
            <input
              type="range"
              min={1024}
              max={32768}
              step={512}
              value={settings.defaultMemoryMb}
              onChange={(event) => void saveSettings({ defaultMemoryMb: Number(event.target.value) })}
            />
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-row__label">Eşzamanlı indirme</div>
              <div className="faint">Yavaş bağlantılarda düşürün</div>
            </div>
            <input
              className="input"
              type="number"
              min={1}
              max={32}
              value={settings.concurrentDownloads}
              onChange={(event) => void saveSettings({ concurrentDownloads: Number(event.target.value) })}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="global-jvm">
              Varsayılan JVM argümanları
            </label>
            <textarea
              id="global-jvm"
              className="textarea"
              value={jvmDraft}
              onChange={(event) => setJvmDraft(event.target.value)}
              onBlur={() => void saveSettings({ jvmArgs: jvmDraft })}
            />
            <span className="field__hint">Profil bazında geçersiz kılınabilir.</span>
          </div>
        </section>

        <section className="settings-group">
          <div className="row row--between">
            <div className="section-title" style={{ margin: 0 }}>
              Java
            </div>
            <button className="btn btn--sm" onClick={() => void scanJava()} disabled={scanningJava}>
              {scanningJava ? <div className="spinner" /> : <Icon name="refresh" size={15} />}
              Yeniden tara
            </button>
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-row__label">Java çalıştırılabiliri</div>
              <div className="faint">
                Otomatik seçildiğinde sürümün gerektirdiği Java indirilir ve kullanılır
              </div>
            </div>
            <select
              className="select"
              value={settings.javaPath ?? ''}
              onChange={(event) => void saveSettings({ javaPath: event.target.value || undefined })}
            >
              <option value="">Otomatik</option>
              {javaRuntimes.map((runtime) => (
                <option key={runtime.path} value={runtime.path}>
                  Java {runtime.majorVersion} — {runtime.path}
                </option>
              ))}
            </select>
          </div>

          {javaRuntimes.length === 0 && !scanningJava && (
            <p className="faint">
              Sistemde Java bulunamadı. Sorun değil — bir profil ilk kez başlatıldığında uygun Temurin sürümü
              otomatik indirilir.
            </p>
          )}
        </section>

        <section className="settings-group">
          <div className="section-title">Hesap</div>

          <div className="settings-row">
            <div>
              <div className="settings-row__label">Oturum açma yöntemi</div>
              <div className="faint">
                Varsayılan yöntem hazır çalışır. Azure seçeneği yalnızca kendi uygulamanızı kaydettiyseniz
                işe yarar.
              </div>
            </div>
            <select
              className="select"
              value={settings.authMode}
              onChange={(event) =>
                void saveSettings({
                  authMode: event.target.value as typeof settings.authMode,
                  // Switching back to the built-in flow must also restore its client id,
                  // or sign-in fails with a mismatched pair.
                  msClientId:
                    event.target.value === 'legacy' ? DEFAULT_CLIENT_ID : settings.msClientId
                })
              }
            >
              <option value="legacy">Minecraft (varsayılan)</option>
              <option value="azure">Azure uygulaması</option>
            </select>
          </div>

          {settings.authMode === 'azure' && (
            <div className="field">
              <label className="field__label" htmlFor="ms-client">
                Azure istemci kimliği
              </label>
              <input
                id="ms-client"
                className="input"
                value={settings.msClientId}
                onChange={(event) => void saveSettings({ msClientId: event.target.value })}
              />
              <span className="field__hint">
                Uygulamanızda “genel istemci akışları” etkin olmalı ve yönlendirme adresi{' '}
                <code>https://login.microsoftonline.com/common/oauth2/nativeclient</code> olarak kayıtlı olmalıdır.
              </span>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
