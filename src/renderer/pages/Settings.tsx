import { useEffect, useState } from 'react'
import type { JavaInfo } from '../../preload'
import type { UpdateStatus } from '../../shared/types'
import { Icon } from '../components/Icon'
import { OptionsEditor } from '../components/OptionsEditor'
import { defaultOptionsText, parseOptions } from '../../shared/options'
import { api } from '../lib/api'
import { useApp } from '../state/AppContext'
import { LANGUAGES, t } from '../../shared/i18n'

const ACCENTS = ['#14b8b8', '#2fb6c8', '#3fb98a', '#d9b23c', '#5b8cff', '#7c5cff', '#e0567a']

/** Minecraft's own launcher client id, paired with the legacy sign-in flow. */
const DEFAULT_CLIENT_ID = '00000000402b5328'

export function Settings(): JSX.Element {
  const { settings, saveSettings, notify, profiles } = useApp()
  const [editingOptions, setEditingOptions] = useState(false)
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [tokenStorage, setTokenStorage] = useState<{ available: boolean; backend: string } | null>(null)
  const [applying, setApplying] = useState(false)
  const [javaRuntimes, setJavaRuntimes] = useState<JavaInfo[]>([])
  const [scanningJava, setScanningJava] = useState(false)
  const [jvmDraft, setJvmDraft] = useState('')

  useEffect(() => {
    if (!settings) return
    setJvmDraft(settings.jvmArgs)
  }, [settings])

  useEffect(() => {
    void api.app.version().then(setAppVersion).catch(() => undefined)
    void api.app.tokenStorage().then(setTokenStorage).catch(() => undefined)
    void api.updates.status().then(setUpdateStatus).catch(() => undefined)
    return api.updates.onStatus(setUpdateStatus)
  }, [])

  const scanJava = async (): Promise<void> => {
    setScanningJava(true)
    try {
      setJavaRuntimes(await api.versions.java())
    } catch (error) {
      notify(error, 'error')
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

  const optionCount = parseOptions(settings.minecraftOptions).filter((line) => !('raw' in line)).length

  return (
    <div className="page">
      {editingOptions && (
        <OptionsEditor
          // Opening on an empty template gave the player a blank form: nothing
          // to see, nothing to change, and saving stored nothing. Starting from
          // Minecraft's own defaults means the editor always shows the real
          // settings, so changing one and saving produces a template that
          // visibly reaches the next profile.
          value={settings.minecraftOptions || defaultOptionsText()}
          notify={notify}
          onClose={() => setEditingOptions(false)}
          onSave={async (text) => {
            await saveSettings({ minecraftOptions: text })
            setEditingOptions(false)
            notify(t('Minecraft ayarları kaydedildi.'))
          }}
        />
      )}

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
              <div className="settings-row__label">{t('Dil')}</div>
              <div className="faint">{t('Sistem seçeneği işletim sistemi dilini izler')}</div>
            </div>
            <select
              className="select"
              value={settings.language}
              onChange={(event) => void saveSettings({ language: event.target.value })}
            >
              <option value="system">{t('Sistem')}</option>
              {LANGUAGES.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.label}
                </option>
              ))}
            </select>
          </div>

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

          <div className="settings-row">
            <div>
              <div className="settings-row__label">Karşılama sesi</div>
              <div className="faint">Launcher ilk açılışta kısa bir jenerik çalar</div>
            </div>
            <div className="chips">
              <button
                className="chip"
                aria-pressed={settings.soundEffects}
                onClick={() => void saveSettings({ soundEffects: true })}
              >
                {t('Açık')}
              </button>
              <button
                className="chip"
                aria-pressed={!settings.soundEffects}
                onClick={() => void saveSettings({ soundEffects: false })}
              >
                {t('Kapalı')}
              </button>
            </div>
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-row__label">Karşılama ekranı</div>
              <div className="faint">Tanıtım ekranını bir sonraki açılışta yeniden göster</div>
            </div>
            <button
              className="btn"
              disabled={!settings.welcomeSeen}
              onClick={async () => {
                await saveSettings({ welcomeSeen: false })
                notify('Karşılama ekranı bir sonraki açılışta gösterilecek.')
              }}
            >
              <Icon name="refresh" size={16} />
              {t('Yeniden göster')}
            </button>
          </div>
        </section>

        <section className="settings-group">
          <div className="section-title">Güncelleme</div>

          <div className="settings-row">
            <div>
              <div className="settings-row__label">Sürüm {appVersion ?? '…'}</div>
              <div className="faint">{updateHint(updateStatus)}</div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              {updateStatus.state === 'available' && (
                <button className="btn btn--primary" onClick={() => void api.updates.download()}>
                  <Icon name="download" size={16} />
                  {t('İndir')}
                </button>
              )}
              {updateStatus.state === 'ready' && (
                <button className="btn btn--primary" onClick={() => void api.updates.install()}>
                  <Icon name="refresh" size={16} />
                  {t('Yeniden başlat ve kur')}
                </button>
              )}
              <button
                className="btn"
                disabled={checkingUpdate || updateStatus.state === 'downloading'}
                onClick={async () => {
                  setCheckingUpdate(true)
                  try {
                    const result = await api.updates.check()
                    // A packaged build with no update reports idle; an unpackaged
                    // one never checks at all, which is worth saying out loud.
                    if (result.state === 'available') notify(`Yeni sürüm hazır: ${result.version}`)
                    else if (result.state === 'error') notify(result.message, 'error')
                    else if (result.state === 'idle') notify(t('En güncel sürümü kullanıyorsunuz.'))
                  } catch (error) {
                    notify(error, 'error')
                  } finally {
                    setCheckingUpdate(false)
                  }
                }}
              >
                {checkingUpdate ? <div className="spinner" /> : <Icon name="refresh" size={16} />}
                Güncellemeyi kontrol et
              </button>
            </div>
          </div>

          <p className="faint" style={{ lineHeight: 1.5 }}>
            Kontrol yalnızca launcher açılırken bir kez ve bu düğmeye bastığınızda yapılır. Arka planda açık
            kalan bir bağlantı ya da yinelenen bir yoklama yok. Yeni sürüm bulunursa launcher başka bir
            pencerenin arkasındayken de görebilesiniz diye masaüstü bildirimi gönderilir.
          </p>
        </section>

        <section className="settings-group">
          <div className="section-title">Güvenlik</div>

          <div className="settings-row">
            <div>
              <div className="settings-row__label">Oturum jetonları</div>
              <div className="faint">
                {tokenStorage === null
                  ? 'Denetleniyor…'
                  : tokenStorage.available
                  ? `İşletim sisteminin kasasıyla şifreleniyor (${backendName(tokenStorage.backend)}). ` +
                    'Anahtar bu kullanıcı hesabına bağlı; dosya kopyalansa bile başka bir makinede açılmaz.'
                  : 'Bu sistemde şifreleme kasası bulunamadı, jetonlar düz metin olarak saklanıyor. ' +
                    'Linux\u2019ta gnome-keyring veya kwallet kurmak bunu çözer.'}
              </div>
            </div>
            <span className={tokenStorage?.available ? 'badge badge--success' : 'badge badge--warning'}>
              {tokenStorage === null ? '…' : tokenStorage.available ? 'şifreli' : 'düz metin'}
            </span>
          </div>
        </section>

        <section className="settings-group">
          <div className="section-title">Keşfet</div>

          <div className="settings-row">
            <div>
              <div className="settings-row__label">Arama sonucu sayısı</div>
              <div className="faint">
                Her sayfada kaç sonuç getirileceği. Liste sonuna gelindiğinde bir sonraki sayfa
                kendiliğinden yükleniyor.
              </div>
            </div>
            <select
              className="select"
              style={{ width: 130 }}
              value={settings.searchPageSize}
              onChange={(event) => void saveSettings({ searchPageSize: Number(event.target.value) })}
            >
              {[20, 30, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size} sonuç
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="settings-group">
          <div className="section-title">Minecraft ayarları</div>

          <div className="settings-row">
            <div>
              <div className="settings-row__label">options.txt şablonu</div>
              <div className="faint">
                {optionCount > 0
                  ? `${optionCount} ayar tanımlı · yeni profillere otomatik kurulur`
                  : 'Henüz kendi ayarlarınızı belirlemediniz — yeni profiller Minecraft’ın ' +
                    'varsayılanlarıyla başlıyor. Ayarlayıp kaydedin, bundan sonraki profiller ' +
                    'sizin ayarlarınızla açılsın.'}
              </div>
            </div>
            <button className="btn" onClick={() => setEditingOptions(true)}>
              <Icon name="settings" size={16} />
              Ayarla
            </button>
          </div>

          {optionCount > 0 && (
            <div className="settings-row">
              <div>
                <div className="settings-row__label">Mevcut profillere uygula</div>
                <div className="faint">
                  {profiles.length} profilin options.txt dosyası bu şablonla güncellenir. Şablonda
                  olmayan ayarlar (tuş atamaları, kaynak paketleri) korunur.
                </div>
              </div>
              <button
                className="btn"
                disabled={profiles.length === 0 || applying}
                onClick={async () => {
                  setApplying(true)
                  try {
                    const count = await api.options.applyToProfiles(profiles.map((p) => p.id))
                    notify(`${count} profile uygulandı.`)
                  } catch (error) {
                    notify(error, 'error')
                  } finally {
                    setApplying(false)
                  }
                }}
              >
                {applying ? <div className="spinner" /> : <Icon name="check" size={16} />}
                Uygula
              </button>
            </div>
          )}
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
              {t('Değiştir')}
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
              {t('Varsayılan JVM argümanları')}
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
                {t('Azure istemci kimliği')}
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

/** One line describing where the updater currently stands. */
function updateHint(status: UpdateStatus): string {
  switch (status.state) {
    case 'checking':
      return 'Kontrol ediliyor…'
    case 'available':
      return `Yeni sürüm var: ${status.version}`
    case 'downloading':
      return `İndiriliyor… %${status.percent}`
    case 'ready':
      return `${status.version} kurulmaya hazır`
    case 'error':
      return status.message
    default:
      return 'Her açılışta kendiliğinden kontrol edilir'
  }
}

/** The operating system facility behind `safeStorage`, in plain words. */
function backendName(backend: string): string {
  switch (backend) {
    case 'win32':
      return 'Windows DPAPI'
    case 'darwin':
      return 'macOS Anahtar Zinciri'
    case 'gnome_libsecret':
      return 'GNOME Keyring'
    case 'kwallet':
    case 'kwallet5':
    case 'kwallet6':
      return 'KWallet'
    default:
      return backend
  }
}
