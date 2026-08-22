# Kaynak ve değişiklikler

Bu klasördeki kod **Amethyst**'ten türetilmiştir.

| | |
|---|---|
| Üst kaynak | https://github.com/AngelAuraMC/Amethyst-Android |
| Dal | `v3_openjdk` |
| Commit | `360d708262ff703d9b52782d20cd348410a33df5` |
| Tarih | 2026-08-16 — *fix(hook): Incorrect LOGI for SDL hook* |
| Lisans | **GNU LGPLv3** — `LICENSE` dosyası olduğu gibi durur |

Amethyst, 23 Eylül 2025'te arşivlenen PojavLauncher'ın resmî devamıdır.
Çalışma zamanı (Android için OpenJDK, OpenGL→GLES çevirisi, dokunmatik girdi
köprüsü) buradan gelir; sıfırdan yazılmamıştır.

Kaynak, geçmişi olmadan kopyalandı: yalnızca üst kaynağın git'inin izlediği
dosyalar alındı, derleme çıktıları alınmadı.

## PisanKus'un yaptığı değişiklikler

LGPLv3, değiştirilen kısımların belirtilmesini ister. Şu ana kadar yapılanlar:

### 1. Korsan (offline) giriş kaldırıldı

`app_pojavlauncher/src/main/java/net/kdt/pojavlaunch/fragments/SelectAuthFragment.java`

Üst kaynak, yazılan bir kullanıcı adından hesap üreten ikinci bir giriş yolu
sunuyor; arkasında Mojang oturumu yok. PisanKus yalnızca Microsoft girişini
destekler ve hesabın Minecraft: Java Edition lisansını doğrular. Düğme
gizlendi ve dinleyicisi hiç bağlanmadı, böylece `LocalLoginFragment`
erişilemez hâle geldi.

Düğme, düzen dosyasından silinmek yerine gizlendi: üst kaynak güncellendiğinde
aradaki farkın küçük kalması, birleştirmeyi kolaylaştırıyor.

### 2. Kimlik

- `applicationId`: `org.angelauramc.amethyst` → `com.pisankus.client`
- `app_name`: `Amethyst` → `PisanKus Client`

`namespace` (`net.kdt.pojavlaunch`) bilerek değiştirilmedi: kaynak ağacındaki
binlerce içe aktarma ona bağlı ve değiştirmek, kazanılan hiçbir şey karşılığında
üst kaynakla farkı devasa büyütürdü.

### 3. Renkler

`app_pojavlauncher/src/main/res/values/colors.xml` — mor vurgu (`#9649b8`)
turkuaza (`#14b8b8`) çevrildi, nötr griler masaüstü uygulamasının turkuaz
tonlu koyu paletine taşındı, açık sarı vurgu ve koyu yazı rengi eklendi.

### 4. Tema ve ekranlar

`res/values/styles.xml` paleti tema düzeyinde taşır; `pk_preference*`,
`pk_card*`, `pk_ambient_background` ve `pk_ic_*` kaynakları eklendi. Ayarlar,
profil ve kurulum ekranları masaüstü uygulamasının kart düzenine ve kenarlardan
gelen turkuaz–sarı ambiansına getirildi. `mine_button_*_shape.xml`, rengi
bitmap'e gömülü olan nine-patch'in yerini aldı.

### 5. Uygulama içi güncelleme

`PisanKusUpdater.java` sürümü GitHub'daki `android` yayınından okur, APK'yı
indirir ve kurulum ekranını açar; ayarlardaki "Güncellemeleri denetle" düğmesi
buna bağlı. `versionCode` `10000000 + yapı numarası` olarak üretilir — Android
yükseltme kararını yalnızca bu sayıya bakarak verir.

Android kendi yayın kanalında: `latest` etiketi masaüstü kurulumlarını taşıyor
ve masaüstü her değiştiğinde yenileniyor. Oradan okumak, masaüstündeki bir
değişikliği Android güncellemesi gibi gösteriyordu. Yayında `android-version.json`
da duruyor; uygulama 150 MB'ı indirmeden önce sürüm kodunu ondan okuyup kendi
sürümüyle karşılaştırıyor.

### 6. Better Than Adventure kaldırıldı

`fragments/ProfileTypeSelectFragment.java`, `res/layout/fragment_profile_type.xml`

Ayrı bir oyun; PisanKus'un dağıttığı bir şey değil. Yerine Pisan Optimized
kondu. `BTAInstallFragment` ve `modloaders/BTA*` dosyaları, üst kaynakla farkı
büyütmemek için yerinde bırakıldı — hiçbir yerden çağrılmıyorlar.

### 7. Pisan Optimized

`PisanOptimizedInstaller.java`, `modloaders/PisanOptimizedDownloadTask.java`,
`fragments/PisanOptimizedInstallFragment.java`

Masaüstü uygulamasının paketinin aynısı (`src/shared/curatedPack.ts`). Seçilen
sürüm için Fabric kurulur, modlar Modrinth'ten o sürüme göre çözülerek profilin
kendi klasörüne iner. Dosya adları sabitlenmediği için paket, yeni bir Minecraft
sürümü çıktığında liste düzenlenmeden çalışmaya devam eder; o sürüme henüz
yayınlanmamış modlar atlanır.

Sodium'un bu launcher'da çalışması için üç engel var, üçü de kurulum sırasında
kaldırılıyor (`PisanKusSodium.java`):

1. **Modun kendi denetimi.** Sodium PojavLauncher türevlerini adından tanıyıp
   başlamayı reddediyor. Bunu kaldırmak için yayınlanmış [Podium][podium] modu
   pakete eklendi.
2. **Görüntüleyici.** GL4ES tabanlı çeviriciler Sodium'u taşıyamıyor; bu
   yapıda gömülü olanlardan MobileGlues taşıyor, profil ona ayarlanıyor.
   (Zink tam da Sodium için kaçınılması önerilen; LTW burada gömülü değil.)
3. **Launcher'ın kendi engeli.** Üst kaynak, mods klasöründe Sodium varken
   oynamayı kesiyor ve tek seçenek olarak silmeyi sunuyor; deneysel ayarlardaki
   anahtar açılmadıkça geçilmiyor. Kendi paketimiz için o anahtar açılıyor.
   Anahtarın önündeki matematik sorusu da kaldırıldı (`pref_experimental.xml`
   artık düz bir `SwitchPreferenceCompat` kullanıyor): soru, Sodium'u yanlışlıkla
   açanları caydırmak için var; onu yamasıyla ve görüntüleyicisiyle bilerek
   dağıtan bizde yalnızca oyuncunun önüne çıkıyor. `MathQuestionPreference`
   sınıfı, üst kaynakla farkı büyütmemek için yerinde duruyor — çağrılmıyor.

Dördüncü parçayı üst kaynak zaten kendisi yapıyor: başlatırken Sodium'un mixin
ayarlarını yazıp `-Dsodium.checks.issue2561=false` geçiyor.

Aynı hazırlık, mod tarayıcısından Sodium kuran oyuncu için de yapılıyor.

[podium]: https://modrinth.com/mod/podium

### 8. Skin değiştirme

`PisanKusSkins.java`, `PisanKusSkinPreview.java`, `fragments/SkinFragment.java`

Üst kaynakta yoktu. Masaüstü uygulamasının kullandığı Mojang profil uçlarının
aynısı: skin hesaba ait, cihaza değil. Ana menüde, gizlenen Discord düğmesinin
bıraktığı boşluğa kondu. Önizleme, dokudaki ön yüzleri düz olarak birleştirir —
skin dosyasını olduğu gibi göstermek oyuncuya bir şey anlatmıyor.

Masaüstündeki gibi kitaplık (`PisanKusSkinLibrary`) ve pelerin seçimi de var.
Kitaplık dosyaların kopyasını tutar, bağlantısını değil: galeriden seçilen bir
görsel telefon tarafından her an taşınabilir ya da silinebilir.

Doku bağlantıları https'e çevriliyor — Mojang hâlâ http veriyor, Android ise
düz metin trafiğini reddediyor.

### 9. Mağaza

`PisanKusModrinth.java`, `PisanKusProfileTarget.java`,
`fragments/PisanModsFragment.java`

Üst kaynak yalnızca modpack kurabiliyor ve her modpack kendi profilini
oluşturuyor. Eksik olan sıradan durumdu: elinde zaten bir Fabric profili olan
oyuncunun ona bir mod daha eklemesi. Ana menüdeki "Mağaza" düğmesi masaüstündeki
Keşfet'in karşılığı:

- **Türler:** mod, mod paketi, doku paketi, shader, veri paketi. Her biri kendi
  klasörüne iniyor; mod paketleri ise üst kaynağın kendi kurucusuna devrediliyor
  — bir paket klasöre atılacak bir dosya değil, sürümüyle ve yükleyicisiyle
  birlikte gelen bir profil.
- **Filtre düğmesi:** tür, yükleyici, Minecraft sürümü ve sıralama elle
  seçilebiliyor. Sürüm seçici, launcher'ın kendi sürüm listesini açıyor, yani
  yalnızca profilinki değil bildiği her sürüm seçilebilir.
- **PisanKus düğmesi:** `pisankusgaming` hesabının yayınladığı her şey. Adla
  aranmıyor, doğrudan proje listesi okunuyor — alakasız sonuç gelmiyor, hiçbiri
  atlanmıyor.

Profil ne yükleyicisini ne de sürümünü saklıyor; ikisi de sürüm kimliğinin
biçiminden ve sürüm json'ındaki `inheritsFrom` alanından okunuyor.

### 10. Simge düzenleyici

`PisanKusProfileIcon.java`, `PisanKusIconEditor.java`,
`res/layout/pk_dialog_icon_editor.xml`

Üst kaynakta profil simgesi yalnızca galeriden kırpılan bir fotoğraf olabiliyordu.
Artık bir arka plan ve bir simge seçilerek de yapılabiliyor; simgeye dokununca
hangisi olduğu soruluyor.

Şekiller görsel dosyası değil, birim karedeki geometri. Böylece tek tablo her
boyutta çizebiliyor ve masaüstündekiyle (`src/shared/profileIcon.ts`) birebir
aynı olabiliyor — telefonda yapılan simge bilgisayarda da aynı resim.

Yuvarlak köşe kırpılarak değil çizilerek yapılıyor: Android'de `clipPath` kenar
yumuşatma yapmıyor ve 18 piksellik bir simgede tırtıklı köşe ilk göze çarpan şey
oluyor.

### 11. Diller

`res/values/strings.xml` (varsayılan) + `res/values-*/strings.xml`

Bizim metinlerimiz yalnızca Türkçe vardı ve varsayılan dosyada duruyordu; yani
telefonu Türkçe olmayan herkes bizim ekranlarımızı Türkçe görüyordu. Artık
varsayılan İngilizce ve on altı dil ayrı klasörlerde: türkçe, ingilizce, rusça,
ispanyolca, fransızca, almanca, çince, japonca, korece, italyanca, arapça,
farsça, azerbaycanca, türkmence, kazakça, kırgızca, özbekçe. Üçü (tk, ky, uz)
üst kaynakta hiç yoktu, klasörleri yeni.

Android tek bir dil klasörü seçer — orada olmayan metin daha genel bir dile
değil, doğrudan varsayılana düşer — bu yüzden cihazın düşebileceği her klasöre
(`values-zh` ile `values-zh-rCN`, `values-fa` ile `values-fa-rIR`, `values-az`
ile `values-az-rAZ`) ayrı ayrı yazıldı. `values-zh-rTW` de dolduruldu:
geleneksel yazı, basitleştirilmişin bir yazım farkı değil; Tayvan'daki bir
telefonun `values-zh`e düşmesi ona yanlış yazıyı gösterirdi.

Arka planda çalışan kodun hata mesajları da kodun içinde Türkçe duruyordu:
paket kurucusu, Modrinth istemcisi ve skin servisi ekrandan uzakta çalışıyor
ama hataları oyuncuya metin olarak ulaşıyor. On sekizi kaynak dizesine
çevrildi; `PisanKusText`, `PojavApplication.onCreate`'te aldığı Application
üzerinden bunları Context elde tutmadan çözüyor — her birine Context taşımak
üst kaynak ağacının çok daha büyük bir bölümüne dokunurdu.

`utils/LocaleUtils.java` genelleştirildi: üst kaynakta yalnızca "İngilizceye
zorla" anahtarı vardı, artık ayarlardan dil seçilebiliyor. Eski anahtarı açmış
olanlar İngilizce görmeye devam ediyor.

## Üst kaynağı güncellerken

1. `UPSTREAM.md`'deki commit'i not al.
2. Yeni kaynağı aynı yöntemle çek (yalnızca izlenen dosyalar).
3. Yukarıdaki değişiklikleri yeniden uygula.
4. Bu dosyadaki commit bilgisini güncelle.
