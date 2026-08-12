# Opbay Client for Android

Minecraft: Java Edition launcher for Android — profiles, Modrinth content, every Mojang
version channel down to the 2010 alphas, and a fully player-controlled theme.

## Ne yapar

- **Microsoft oturumu (zorunlu)** — MSA → Xbox Live → XSTS → Minecraft servisleri zinciri,
  PKCE korumalı. Lisans doğrulanmadan oyun başlatılmaz.
- **Profiller** — Her profilin kendi `mods`, `resourcepacks`, `shaderpacks`, `saves` klasörü,
  kendi bellek ayarı. Aynı adı taşıyan profiller bile ayrı dizin alır.
- **Yükleyiciler** — Vanilla, Fabric, Quilt, NeoForge, Forge. Kurulum otomatik.
- **Tüm sürüm kanalları** — Sürüm, anlık görüntü, **beta** (`b1.7.3` gibi) ve **alfa**
  (`a1.2.6` gibi) build'ler seçilebilir; profil oluştururken kanal filtreleri ile.
- **Modrinth** — Mod, mod paketi, doku paketi, shader ve veri paketi araması; profile göre
  uyumluluk filtresi; zorunlu bağımlılıkların otomatik kurulumu. API anahtarı gerekmez.
- **Mod paketleri** — Modrinth `.mrpack` paketleri `overrides` dahil kurulur; profilin sürümü
  ve yükleyicisi pakete göre ayarlanır.
- **Tema** — Herhangi bir renkten (hazır palet ya da `#RRGGBB`) tüm arayüz paleti türetilir;
  açık/koyu/sistem, AMOLED saf siyah, Material You duvar kâğıdı renkleri, köşe yuvarlaklığı
  ve yazı boyutu ayarlanabilir.

## Java çalışma zamanı

**Android'de Minecraft Java Edition'ı çalıştırmak için bir Java çalışma zamanı (JRE) gerekir.**
Android'in kendi çalışma zamanı (ART) standart JVM bytecode'unu ve LWJGL'in native
kütüphanelerini çalıştıramaz.

Minecraft her sürüm için belirli bir Java sürümü ister (sürüm dosyasındaki
`javaVersion.majorVersion`). Oyunu başlattığınızda gereken sürüm kurulu değilse **otomatik
indirilir** — elle bir şey yapmanız gerekmez. Ayarlar → Java bölümünden önceden de
kurabilirsiniz.

Eşleşme sürüm bazında kesindir: 1.20.5+ Java 21, 1.17–1.20.4 Java 17, daha eskiler Java 8
ister. Yanlış sürümle başlatmak oyunun içinde, sebebi anlaşılmayan bir hataya yol açtığı için
launcher farklı bir sürümle çalışmayı denemez.

Android için JRE yayımlayan bir üretici, masaüstündeki Adoptium gibi sürümlenmiş bir API
sunmuyor; var olanlar GitHub sürümlerine eklenmiş topluluk yapıları. Bu yüzden indirme adresi
koda gömülü değil: launcher sürüm listesini okuyup **Java sürümü ve cihaz mimarisiyle eşleşen
dosyayı buluyor**. Kaynak depo Ayarlar'dan değiştirilebilir; eşleşen yapı bulunamazsa neyin
arandığını söyleyen bir mesaj gösterilir. Elinizde bir arşiv varsa "Arşivden kur" ile de
ekleyebilirsiniz (`.tar.xz`, `.tar.gz`, `.zip`).

### Grafik

Minecraft **26.2** ile Vulkan arka ucu geldi: o sürümün kütüphane listesinde
`org.lwjgl:lwjgl-vulkan:3.4.1` var, 1.21.4'te yok. Android 7.0'dan beri sistemde Vulkan
sürücüsü bulunduğu için **26.2 ve sonrası için OpenGL çeviri katmanına gerek yok**.

26.2 öncesi sürümler masaüstü OpenGL çağırır; bunlar için gl4es benzeri bir çeviri bileşeni
gerekir. Launcher hangi yolun geçerli olduğunu sürüm dosyasından okur ve ortam değişkenlerini
buna göre kurar; çeviri bileşenini Ayarlar → Grafik bölümünden mimariye göre otomatik indirir.

### Bilinen sınır: pencere açılmıyor

Bu launcher oyunu **ayrı bir süreç** olarak başlatıyor. Ayrı süreç, uygulamanın penceresine
çizemez. Görüntü için iki şey daha gerekir:

1. JVM'in uygulama içinde (JNI ile) başlatılması ve bir `SurfaceView`'a bağlanması,
2. Android'e derlenmiş LWJGL bileşenleri — özellikle GLFW çağrılarını Android pencere
   sistemine bağlayan köprü. Mojang bunları yayımlamıyor (sürüm dosyalarında yalnızca
   `natives-linux`, `natives-macos`, `natives-windows` var).

Bu ikisi tamamlanana kadar indirme, oturum açma, mod/paket kurulumu ve başlatma komutunun
üretilmesi çalışır; oyun penceresi açılmaz. Günlük sekmesi bunu her başlatmada açıkça yazar.

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
├── content/                   Modrinth istemcisi ve mod paketi kurulumu
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
