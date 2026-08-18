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

`PisanKusUpdater.java` sürümü GitHub'daki yayından okur, APK'yı indirir ve
kurulum ekranını açar; ayarlardaki "Güncellemeleri denetle" düğmesi buna bağlı.
`versionCode` `10000000 + yapı numarası` olarak üretilir — Android yükseltme
kararını yalnızca bu sayıya bakarak verir.

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

### 9. Tek tek mod kurma

`PisanKusModrinth.java`, `PisanKusProfileTarget.java`,
`fragments/PisanModsFragment.java`

Üst kaynak yalnızca modpack kurabiliyor ve her modpack kendi profilini
oluşturuyor. Eksik olan sıradan durumdu: elinde zaten bir Fabric profili olan
oyuncunun ona bir mod daha eklemesi. Ana menüdeki "Modlar" düğmesi, seçili
profilin yükleyicisine ve sürümüne göre Modrinth'te arıyor ve dosyayı o
profilin kendi `mods` klasörüne indiriyor.

Profil ne yükleyicisini ne de sürümünü saklıyor; ikisi de sürüm kimliğinin
biçiminden ve sürüm json'ındaki `inheritsFrom` alanından okunuyor.

## Üst kaynağı güncellerken

1. `UPSTREAM.md`'deki commit'i not al.
2. Yeni kaynağı aynı yöntemle çek (yalnızca izlenen dosyalar).
3. Yukarıdaki değişiklikleri yeniden uygula.
4. Bu dosyadaki commit bilgisini güncelle.
