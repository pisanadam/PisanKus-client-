# Opbay Client

Modern arayüzlü, açık kaynak bir Minecraft: Java Edition launcher'ı. Modrinth içeriklerini doğrudan
profillerine kurar, skin ve pelerin yönetimi sunar, Microsoft oturumunu zorunlu tutar.

<p align="center">
  <a href="https://pisanadam.github.io/opbay-client-/"><strong>İndirme sayfası →</strong></a>
</p>

## Özellikler

- **Microsoft oturumu (zorunlu)** — Resmî MSA → Xbox Live → XSTS → Minecraft servisleri zinciri, PKCE ile
  korunan yetkilendirme akışı. Oyun başlatılmadan önce Java Edition lisansı doğrulanır.
- **İzole profiller** — Her profilin kendi `mods`, `resourcepacks`, `shaderpacks`, `saves`, `datapacks`
  klasörü, kendi bellek ve JVM ayarları vardır.
- **Modrinth** — Mod, mod paketi, doku paketi, shader ve veri paketi arama; profil sürümüne/yükleyicisine göre
  filtreleme; zorunlu bağımlılıkların otomatik kurulumu. Hesap ya da API anahtarı gerekmez.
- **Mod paketi kurulumu** — Modrinth `.mrpack` paketleri açılır, `overrides` içeriği uygulanır, profilin sürümü
  ve yükleyicisi pakete göre ayarlanır.
- **Yerel içe aktarma** — Elindeki `.jar` / `.zip` dosyalarını ve dünya arşivlerini profile aktar.
- **3B skin değiştirici** — Skin yükle, bağlantıdan uygula, klasik/ince model seç, pelerin değiştir. Model saf
  CSS 3D ile çizilir, sürüklenerek döndürülebilir.
- **Otomatik Java** — Sistemdeki JVM'leri tarar; sürümün gerektirdiği Java yoksa Eclipse Temurin runtime'ını
  indirir.
- **Yükleyiciler** — Vanilla, Fabric, Quilt, NeoForge, Forge.
- **Sağlam indirme** — Paralel indirme havuzu, SHA-1 doğrulaması, yeniden deneme, yarım kalan dosyaların
  atlanması.
- **Canlı günlük** — Oyun çıktısı launcher içinde akar; kopyalanabilir.

## Platformlar

| Platform | Durum | Not |
|---|---|---|
| Windows / macOS / Linux | Hazır paket | Her güncellemede otomatik derlenir |
| Android | Hazır APK | Oyunu çalıştırmak için ayrıca bir Java çalışma zamanı içe aktarılır — bkz. [`android/README.md`](android/README.md) |

Android sürümü `android/` dizinindedir (Kotlin + Jetpack Compose) ve masaüstü sürümüyle
aynı özellikleri sunar: profiller, Modrinth, mod paketleri, tüm sürüm kanalları (beta ve alfa
dâhil) ve tamamen özelleştirilebilir tema.

## Kurulum

Hazır paketler için [indirme sayfasını](https://pisanadam.github.io/opbay-client-/) veya
[Releases](https://github.com/pisanadam/opbay-client-/releases) bölümünü kullanın.

## Geliştirme

```bash
npm install
npm run dev        # Electron + Vite geliştirme sunucusu
npm run typecheck  # TypeScript denetimi
npm run build      # main / preload / renderer derlemesi
npm run dist       # Bulunduğun platform için kurulum paketi
```

Node.js 20+ gerekir.

### Mimari

```
src/
├── main/                    Electron ana süreci — ağ, dosya sistemi ve oyun süreci burada
│   ├── auth/microsoft.ts    MSA → XBL → XSTS → Minecraft oturum zinciri
│   ├── minecraft/
│   │   ├── versions.ts      Sürüm manifesti, kalıtım (inheritsFrom) çözümlemesi
│   │   ├── libraries.ts     Kural değerlendirmesi, classpath, native ayıklama
│   │   ├── assets.ts        Varlık indeksi ve sanal varlıklar
│   │   ├── java.ts          JVM tarama ve Temurin indirme
│   │   ├── loaders/         Fabric, Quilt, NeoForge, Forge kurulumu
│   │   ├── downloader.ts    Paralel indirme + SHA-1 doğrulama
│   │   └── launcher.ts      Argüman üretimi ve süreç yönetimi
│   ├── content/             Modrinth istemcisi, kurulum/güncelleme/mod paketi mantığı
│   ├── skins.ts             Skin ve pelerin işlemleri
│   ├── store.ts             JSON tabanlı yerel veritabanı
│   └── ipc.ts               Renderer'a açılan tek yüzey
├── preload/                 contextBridge ile tip güvenli API
├── renderer/                React arayüzü
└── shared/types.ts          İki tarafın paylaştığı tipler
```

Erişim jetonları hiçbir zaman renderer'a geçmez; `ipc.ts` hesapları `PublicAccount` biçimine indirger.

## Yapılandırma

### Microsoft istemci kimliği

Varsayılan olarak genel bir istemci kimliği kullanılır. Kendi Azure uygulamanı kaydetmek istersen:

1. [Azure Portal](https://portal.azure.com) → **App registrations** → **New registration**
2. **Supported account types**: *Personal Microsoft accounts only*
3. **Redirect URI** (Mobile and desktop applications):
   `https://login.microsoftonline.com/common/oauth2/nativeclient`
4. **Authentication** → *Allow public client flows* → **Yes**
5. İstemci kimliğini **Ayarlar → Hesap** bölümüne gir (ya da `OPBAY_MS_CLIENT_ID` ortam değişkenini kullan).

## Yayınlama

Yayınlama tamamen otomatiktir — elle sürüm çıkarmak gerekmez.

- **Paketler:** `main` dalına her kod gönderiminde Windows, macOS (Intel + Apple Silicon) ve Linux paketleri
  derlenir ve `latest` sürümüne yüklenir. Paket adları sürüm numarası içermediği için indirme bağlantıları
  sabittir:

  ```
  https://github.com/pisanadam/opbay-client-/releases/latest/download/OpbayClient-win-x64.exe
  https://github.com/pisanadam/opbay-client-/releases/latest/download/OpbayClient-mac-arm64.dmg
  https://github.com/pisanadam/opbay-client-/releases/latest/download/OpbayClient-mac-x64.dmg
  https://github.com/pisanadam/opbay-client-/releases/latest/download/OpbayClient-linux-x64.AppImage
  https://github.com/pisanadam/opbay-client-/releases/latest/download/OpbayClient-linux-x64.deb
  ```

  İndirme sayfası bu adresleri kullanır, dolayısıyla GitHub API'sine erişilemese bile düğmeler çalışır.
  Sabitlenmiş bir sürüm istersen `v*` etiketi gönder (`git tag v1.1.0 && git push --tags`); ayrıca
  numaralandırılmış bir Release oluşturulur.

- **İndirme sayfası:** `main` dalına `docs/` altında bir değişiklik gittiğinde GitHub Pages'e dağıtılır.
  Deponun **Settings → Pages** ayarında kaynak olarak **GitHub Actions** seçili olmalıdır.

Paketler kod imzalama sertifikasıyla imzalanmaz; Windows'ta SmartScreen, macOS'ta Gatekeeper uyarı gösterir
(sayfadaki SSS bölümünde nasıl geçileceği anlatılıyor).

## Yasal

Opbay Client bağımsız bir projedir; Mojang Studios veya Microsoft ile bağlantılı değildir ve bu şirketler
tarafından onaylanmamıştır. Minecraft, Mojang Studios'un ticari markasıdır. Oyunu oynamak için geçerli bir
Minecraft: Java Edition lisansı gereklidir — launcher lisanssız ("cracked") girişi desteklemez.

GPL-3.0 lisansı ile dağıtılır.
