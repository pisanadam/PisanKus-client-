# PisanKus Client — Android

Minecraft: Java Edition'ı Android'de çalıştıran sürüm. Masaüstündeki Electron
uygulamasının derlemesi **değil**; ayrı bir program, aynı depoda.

## Şu an ne var

| | |
|---|---|
| Derleme hattı | Gradle projesi, birim testleri, imzasız release APK |
| Oturum açma çekirdeği | Microsoft uç noktaları, `scope`, PKCE, yetki kodu ayrıştırma |
| Marka | PK simgesi, turkuaz/açık sarı tema |
| **Oyun çalışma zamanı** | **Yok** — aşağıya bakın |

APK indirme sayfasına **konmuyor**. Oyunu başlatamayan bir launcher'ı bitmiş
gibi yayımlamak, "yakında" demekten daha kötü olurdu; site kartı da bu yüzden
"Yakında" durumunda duruyor.

## Amethyst derleme tarifi (doğrulandı)

Aşağıdaki adımlarla Amethyst'in **143 MB'lık APK'sı bu depo ortamında üretildi**.
Tahmin değil, çalıştırılmış tariftir.

```bash
git clone --depth 1 --branch v3_openjdk \
  https://github.com/AngelAuraMC/Amethyst-Android.git
cd Amethyst-Android

sdkmanager "ndk;27.3.13750724" "cmake;3.22.1"
echo "sdk.dir=$ANDROID_HOME" > local.properties

./gradlew :app_pojavlauncher:assembleDebug \
  -Porg.gradle.java.installations.paths=/usr/lib/jvm/java-8-openjdk-amd64
```

Yol boyunca öğrenilenler:

- **Java 8 zorunlu.** `MioLibPatcher` modülü `languageVersion=8` ister. Sistemde
  yalnızca 17/21 varsa derleme yapılandırma aşamasında durur:
  *"Cannot find a Java installation ... matching {languageVersion=8}"*. CI'ya
  Java 8 kurulumu eklenmeli.
- **`.gitmodules` yanıltıyor.** Dört alt modül listeler (MobileGlues, SDL,
  sdl2-compat, MioLibPatcher) ama `v3_openjdk` ağacında yalnızca
  **MioLibPatcher** var; diğer üç yol için git `pathspec did not match` der.
  Eksik olmaları derlemeyi engellemiyor.
- **NDK r27d + CMake 3.22.1** yeterli; başka yerel bağımlılık gerekmedi.

Üretilen APK: 7 ABI, 201 MB yerel kütüphane, 116 MB varlık. Çalışma zamanı
`app_pojavlauncher/src/main/assets/components/` altında (lwjgl3, caciocavallo,
forge_installer, security …).

## Sıradaki adım: çalışma zamanı

Android'de Minecraft: Java Edition çalıştırmak üç parça ister ve üçü de yerel
(C/JNI) koddur:

1. **Java çalışma zamanı** — Android için derlenmiş bir OpenJDK.
2. **OpenGL → GLES çevirisi** — masaüstü OpenGL çağrılarını mobil GPU'ya
   çeviren katman (gl4es / ANGLE / Zink).
3. **Dokunmatik girdi köprüsü** — klavye/fare bekleyen bir oyuna dokunmatik
   girdiyi tanıtan katman.

Bunlar sıfırdan yazılmaz; bu işi yapan olgun bir proje temel alınır.

**PojavLauncher değil:** 23 Eylül 2025'te arşivlendi, geliştirmesi durdu. Ölü
bir tabanın üstüne kurmak, ilk uyumsuzlukta çıkışsız kalmak demek.

**Amethyst:** PojavLauncher'ın resmî devamı, aynı soydan, hâlâ aktif. Temel bu
olmalı.

Dikkat edilecek iki nokta:

- Bu soydan gelen launcher'lar **korsan (offline) girişi hazır olarak
  içeriyor.** PisanKus yalnızca Microsoft girişini destekler; entegrasyonda o
  kısım sökülmeli. Buradaki `MicrosoftAuth.kt` zaten yalnızca resmî akışı
  tanımlar.
- Yerel kod **NDK** ister. Bu depo NDK'sız derleniyor; çalışma zamanı
  eklendiğinde CI'ya NDK kurulumu eklenmeli.

## Derleme

```bash
cd android
./gradlew testDebugUnitTest      # birim testleri
./gradlew assembleRelease        # imzasız APK
```

`local.properties` gerekmez; `ANDROID_HOME` yeterli. CI her push'ta ikisini de
çalıştırır.

## `MicrosoftAuth.kt` neden Android'den bağımsız

İçinde tek bir Android tipi yok. Böylece cihaz ya da emülatör olmadan birim
testiyle kapsanabiliyor — masaüstünde bir saat sonra ortaya çıkan `scope`
hatasının Android'de tekrarlanmaması bu testlere bağlı.
