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

İmza anahtarı depoda **yok** ve olmamalı: anahtarı ele geçiren biri, Android'in
gerçek güncelleme sayacağı sahte bir paket imzalayabilir.

Dört ortam değişkeninden okunur:

| Değişken | |
|---|---|
| `PISANKUS_KEYSTORE_FILE` | keystore dosyasının yolu |
| `PISANKUS_KEYSTORE_PASSWORD` | keystore parolası |
| `PISANKUS_KEY_ALIAS` | anahtar takma adı |
| `PISANKUS_KEY_PASSWORD` | anahtar parolası |

Hiçbiri yoksa release yapısı **imzasız** çıkar ve derleme kırılmaz — gizli
anahtarları olmayan bir çatal da yeşil yapı alır. İmzasız APK Android'e
kurulamaz, o yüzden yayına da konmaz.

CI'da aynı değerler depo gizli anahtarlarından gelir; keystore
`PISANKUS_KEYSTORE_BASE64` içinden base64 çözülerek geri yazılır.

### Yeni anahtar üretmek

```bash
keytool -genkeypair -v -keystore pisankus.jks -alias pisankus \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=PisanKus Client, O=PisanKus, C=TR"

base64 -w0 pisankus.jks > pisankus-base64.txt
```

`pisankus-base64.txt` içeriği `PISANKUS_KEYSTORE_BASE64` gizli anahtarına
gider. `.jks` dosyası yedeklenmeli: kaybedilirse aynı uygulama bir daha
güncellenemez, kullanıcıların eskisini silip yenisini kurması gerekir.

## Durum

Derleme yerelde ve CI'da geçiyor, paket kimliği `com.pisankus.client`, korsan
giriş sökülü. **Gerçek bir cihazda Minecraft oturumunun açıldığı henüz
doğrulanmadı** — indirme sayfasındaki kart bu yüzden "Deneysel" etiketli.
