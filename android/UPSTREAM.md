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

## Üst kaynağı güncellerken

1. `UPSTREAM.md`'deki commit'i not al.
2. Yeni kaynağı aynı yöntemle çek (yalnızca izlenen dosyalar).
3. Yukarıdaki üç değişikliği yeniden uygula.
4. Bu dosyadaki commit bilgisini güncelle.
