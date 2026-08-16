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

### 4. "Better than Adventure" yerine Pisan Optimized

Profil türü ekranındaki *"Better than Adventure!" profili oluştur* düğmesi
kaldırıldı; yerine, modlu bölümün başına *"Pisan Optimized" profili oluştur*
kondu. Masaüstündeki küratörlü paketin (`src/shared/curatedPack.ts`) aynısı:
Minecraft sürümü seçilir, mod listesi Modrinth'ten o sürüme göre çözülür,
Fabric kurulur ve modlar profile iner.

Eklenen dosyalar — hepsi ayrı bir pakette (`modloaders/pisan/`) durur, üst
kaynakla çakışmasın diye:

| | |
|---|---|
| `modloaders/pisan/PisanPack.java` | paketin kendisi: Modrinth kısa adları, roller, önerilen sürümler |
| `modloaders/pisan/PisanPackResolver.java` | Modrinth çözümlemesi — hangi sürüme ne kurulabilir |
| `modloaders/pisan/PisanPackInstallTask.java` | Fabric + modlar + profil |
| `fragments/PisanPackInstallFragment.java` | tek ekran: sürüm seç, kur |
| `res/layout/fragment_pisan_pack_install.xml` | o ekranın düzeni |

Dokunulan üst kaynak dosyaları dörtle sınırlı tutuldu:

- `fragments/ProfileTypeSelectFragment.java` ve `res/layout/fragment_profile_type.xml` — düğme takası.
- `modloaders/FabriclikeDownloadTask.java` — sürüm json'unu yazan kısım `installVersionJson()` olarak ayrıldı; paket kurucusu Fabric'i kendi profilini kurmadan çağırabilsin diye. Görevin kendi davranışı değişmedi.
- `profiles/ProfileIconCache.java` — `pisan` ikon adı eklendi.

BTA'nın sınıfları (`modloaders/BTA*.java`, `fragments/BTAInstallFragment.java`)
ve dizeleri **silinmedi**, yalnızca erişilemez hâle geldi — korsan giriş
düğmesinde olduğu gibi, üst kaynakla farkın küçük kalması birleştirmeyi
kolaylaştırıyor.

### 5. Skin değiştirme

Masaüstünde vardı, Android'de yoktu. Ana menüye *Skin değiştir* düğmesi kondu —
gizlenen Discord düğmesinden boşta kalan yarım satıra. Açtığı ekran:
dosyadan ya da bağlantıdan skin uygulama, klasik/ince model seçimi,
varsayılana dönme, pelerin takıp çıkarma ve cihazda duran bir skin kitaplığı.

İhtiyaç duyduğu oturum jetonu zaten cihazdaydı; oyunu başlatmak için giriş
yapılıyor. Yeni bir izin ya da yeni bir hesap akışı yok.

| | |
|---|---|
| `skins/SkinApi.java` | Minecraft servisleri: skin/pelerin okuma, yükleme, sıfırlama |
| `skins/SkinLibrary.java` | cihazdaki kitaplık (`<oyun kökü>/skins`) |
| `skins/SkinRender.java` | doku sayfasından karakterin önden görünüşünü çizer |
| `fragments/SkinFragment.java` | ekranın kendisi |
| `res/layout/fragment_skin.xml`, `res/drawable/pk_ic_skin.xml` | düzen ve ikon |

Üst kaynaktan yalnızca ana menü dosyası ve düzeni değişti
(`fragments/MainMenuFragment.java`, `res/layout/fragment_launcher.xml`):
bir düğme ve bir dinleyici.

## Üst kaynağı güncellerken

1. `UPSTREAM.md`'deki commit'i not al.
2. Yeni kaynağı aynı yöntemle çek (yalnızca izlenen dosyalar).
3. Yukarıdaki değişiklikleri yeniden uygula.
4. Bu dosyadaki commit bilgisini güncelle.
