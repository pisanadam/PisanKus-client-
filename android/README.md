# Opbay Client for Android

Minecraft: Java Edition launcher for Android — profiles, Modrinth/CurseForge content,
every Mojang version channel down to the 2010 alphas, and a fully player-controlled theme.

## Ne yapar

- **Microsoft oturumu (zorunlu)** — MSA → Xbox Live → XSTS → Minecraft servisleri zinciri,
  PKCE korumalı. Lisans doğrulanmadan oyun başlatılmaz.
- **Profiller** — Her profilin kendi `mods`, `resourcepacks`, `shaderpacks`, `saves` klasörü,
  kendi bellek ayarı. Aynı adı taşıyan profiller bile ayrı dizin alır.
- **Yükleyiciler** — Vanilla, Fabric, Quilt, NeoForge, Forge. Kurulum otomatik.
- **Tüm sürüm kanalları** — Sürüm, anlık görüntü, **beta** (`b1.7.3` gibi) ve **alfa**
  (`a1.2.6` gibi) build'ler seçilebilir; profil oluştururken kanal filtreleri ile.
- **Modrinth + CurseForge** — Mod, mod paketi, doku paketi, shader, veri paketi araması;
  profile göre uyumluluk filtresi; zorunlu bağımlılıkların otomatik kurulumu.
- **Mod paketleri** — Modrinth `.mrpack` ve CurseForge `manifest.json` paketleri `overrides`
  dahil kurulur; profilin sürümü ve yükleyicisi pakete göre ayarlanır.
- **Tema** — Herhangi bir renkten (hazır palet ya da `#RRGGBB`) tüm arayüz paleti türetilir;
  açık/koyu/sistem, AMOLED saf siyah, Material You duvar kâğıdı renkleri, köşe yuvarlaklığı
  ve yazı boyutu ayarlanabilir.

## Java çalışma zamanı gereksinimi

**Android'de Minecraft Java Edition'ı çalıştırmak için bir Java çalışma zamanı (JRE) gerekir.**
Android'in kendi çalışma zamanı (ART) standart JVM bytecode'unu ve LWJGL'in native
kütüphanelerini çalıştıramaz.

Opbay Client bir JRE ile birlikte gelmez. **Ayarlar → Java çalışma zamanı** bölümünden
cihazınızın mimarisine uygun bir arşivi (`.tar.xz`, `.tar.gz` veya `.zip`) içe aktarırsınız;
arşiv uygulamanın özel depolamasına açılır ve oyun bu çalışma zamanıyla başlatılır.

Bu, PojavLauncher ekosisteminin dağıttığı `android-aarch64` JRE yapılarıyla aynı hedefi
kullanır. Ek olarak, oyunun ekrana çizebilmesi için bir OpenGL ES çeviri katmanı (gl4es gibi)
gerekir — bu da cihaza kurulan bileşenlerden biridir.

Çalışma zamanı kurulu değilse başlatma denemesi, ne yapılması gerektiğini anlatan bir
mesajla durur; sessizce çökmez.

## Geliştirme

```bash
cd android
./gradlew testDebugUnitTest   # birim testleri (renk paleti kontrast doğrulaması dâhil)
./gradlew assembleDebug       # app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease     # küçültülmüş paket
```

Gereksinimler: JDK 17, Android SDK 35. `local.properties` dosyasına `sdk.dir` yazın ya da
`ANDROID_HOME` ortam değişkenini ayarlayın.

### Mimari

```
app/src/main/java/com/opbay/client/
├── auth/MicrosoftAuth.kt      MSA → XBL → XSTS → Minecraft zinciri (PKCE)
├── data/                      Modeller ve atomik JSON deposu
├── net/                       OkHttp sarmalayıcı + paralel indirici (SHA-1 doğrulamalı)
├── minecraft/
│   ├── Versions.kt            Sürüm manifesti, kanallar, kalıtım çözümlemesi
│   ├── Installer.kt           Kütüphane/varlık indirme, sanal varlıklar
│   └── Loaders.kt             Fabric, Quilt, NeoForge, Forge kurulumu
├── content/                   Modrinth, CurseForge, mod paketi kurulumu
├── game/
│   ├── JavaRuntime.kt         JRE içe aktarma ve seçimi
│   ├── GameLauncher.kt        Argüman üretimi ve süreç yönetimi
│   └── GameService.kt         Oyun çalışırken süreci canlı tutan ön plan servisi
└── ui/                        Compose arayüzü ve OkLab tabanlı tema motoru
```

Erişim jetonları yalnızca `Store` içinde tutulur ve yedeklemeden hariç bırakılır.

## Yasal

Bağımsız bir projedir; Mojang Studios veya Microsoft ile bağlantılı değildir. Oyunu oynamak
için geçerli bir Minecraft: Java Edition lisansı gereklidir.
