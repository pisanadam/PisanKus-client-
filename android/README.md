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
