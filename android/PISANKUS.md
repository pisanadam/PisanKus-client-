# PisanKus Client — Android

Amethyst tabanlı Android sürümü. Kaynak ve değişiklikler için `UPSTREAM.md`.

## Derleme

```bash
cd android
./gradlew :app_pojavlauncher:assembleDebug     # imzasız gerekmez, debug anahtarıyla imzalı
./gradlew :app_pojavlauncher:assembleRelease   # imza anahtarı varsa imzalı
```

Gerekenler — üçü de olmadan derleme durur:

| | |
|---|---|
| **Java 8** | `MioLibPatcher` `languageVersion=8` ister. Yoksa yapılandırma aşamasında *"Cannot find a Java installation ... matching {languageVersion=8}"* der. |
| **NDK 27.3.13750724** | `sdkmanager "ndk;27.3.13750724"` |
| **CMake 3.22.1** | `sdkmanager "cmake;3.22.1"` |

Gradle'ın 8'i bulması için:

```bash
./gradlew ... -Porg.gradle.java.installations.paths=/usr/lib/jvm/java-8-openjdk-amd64
```

Çıktılar `app_pojavlauncher/build/outputs/apk/` altında.

## İmzalama

Kurulabilmesi için APK'nın imzalı olması şart — Android imzasız paketi
reddeder. Release yapısı, depoda zaten duran `debug.keystore` ile imzalanır,
yani **hiçbir gizli anahtar ayarlamaya gerek yoktur**.

Bedeli açık olsun: o anahtar herkese açık. Yani imza, paketin gerçekten bizden
geldiğini kanıtlamıyor; aynı anahtarla imzalanmış sahte bir "güncelleme"
hazırlanabilir. Deneysel bir yapı için kabul edilebilir bir takas, gerçek bir
genel sürüm için değil.

Gerçek anahtara geçmek istendiğinde dört ortam değişkeni tanımlanır ve release
yapısı kendiliğinden onu kullanır:

| Değişken | |
|---|---|
| `PISANKUS_KEYSTORE_FILE` | keystore dosyasının yolu |
| `PISANKUS_KEYSTORE_PASSWORD` | keystore parolası |
| `PISANKUS_KEY_ALIAS` | anahtar takma adı |
| `PISANKUS_KEY_PASSWORD` | anahtar parolası |

```bash
keytool -genkeypair -v -keystore pisankus.jks -alias pisankus \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=PisanKus Client, O=PisanKus, C=TR"
```

Anahtar dosyası depoya konmamalı ve yedeklenmeli: kaybedilirse aynı uygulama
bir daha güncellenemez.

## Durum

Derleme yerelde ve CI'da geçiyor, paket kimliği `com.pisankus.client`, korsan
giriş sökülü. **Gerçek bir cihazda Minecraft oturumunun açıldığı henüz
doğrulanmadı** — indirme sayfasındaki kart bu yüzden "Deneysel" etiketli.
