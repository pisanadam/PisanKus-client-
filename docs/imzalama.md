# Windows imzalama

## Sorun

Windows 11'de **Akıllı Uygulama Denetimi** (Smart App Control), yayımcısını
doğrulayamadığı bir programı çalıştırmayı reddediyor:

> Yayımcısı doğrulanamadığı için ... PisanKus Client.exe öğesinin çalıştırılmasının
> güvenli olduğu onaylanamadı.

Bu bir uygulama hatası değil, imzasız olmasının sonucu. İki önemli ayrıntı:

- Akıllı Uygulama Denetimi'nde **tek tek uygulamaya izin verme seçeneği yok**.
  SmartScreen'deki "Yine de çalıştır" bağlantısı burada görünmez.
- Her yayın **yeni bir dosya** üretir. Bir yapı itibar kazansa bile bir sonraki
  güncelleme sıfırdan başlar; bu yüzden engel her güncellemeden sonra döner.

Yalnızca Windows'u ilgilendirir. macOS `.dmg` ve Linux `.AppImage`/`.deb`
paketleri bundan etkilenmez.

## Kullanıcı ne yapabilir

Akıllı Uygulama Denetimi'ni kapatmak: **Windows Güvenliği → Uygulama ve tarayıcı
denetimi → Akıllı Uygulama Denetimi → Kapalı**.

Dikkat: bu **geri alınamaz**. Kapatıldıktan sonra yeniden açmanın tek yolu
Windows'u yeniden kurmaktır. Kullanıcıya bunu söylemeden kapattırmayın.

## Kalıcı çözüm: sertifika

Depoda hiçbir anahtar tutulmuyor. `electron-builder.yml` imzalamayı yalnızca
ortam değişkenlerinden okur, `release.yml` de bunları GitHub secret'larından
geçirir. Secret'lar tanımlı değilken yapı bugünkü gibi imzasız üretilir; secret
eklendiği anda aynı yapı imzalanmaya başlar. Kodda değişiklik gerekmez.

### Seçenek 1 — Azure Trusted Signing (önerilen)

Aylık ~10 USD. Akıllı Uygulama Denetimi'ni memnun eden en ucuz yol ve artık
şahıslar da kimlik doğrulatabiliyor.

Kurduktan sonra depoya şu secret'lar eklenir:

| Secret | Nereden |
| --- | --- |
| `AZURE_TENANT_ID` | Azure dizin kimliği |
| `AZURE_CLIENT_ID` | Uygulama kaydı |
| `AZURE_CLIENT_SECRET` | Uygulama kaydının gizli anahtarı |

### Seçenek 2 — OV/EV sertifikası

DigiCert, Sectigo ve benzerlerinden yıllık 200–600 USD. EV olanı ilk günden
itibaren itibar taşır, OV olanı bir süre SmartScreen uyarısı almaya devam eder.

| Secret | Nereden |
| --- | --- |
| `WINDOWS_CERTIFICATE` | `.pfx` dosyasının base64'ü: `base64 -w0 sertifika.pfx` |
| `WINDOWS_CERTIFICATE_PASSWORD` | `.pfx` parolası |

### Doğrulama

Yayından sonra indirilen `.exe` üzerinde:

```powershell
Get-AuthenticodeSignature 'PisanKusClient-win-x64.exe' | Format-List Status, SignerCertificate
```

`Status` **Valid** ve imzalayan `PisanKus` görünmelidir.

## Sertifika alınana kadar

`docs/` altındaki indirme sayfasında Windows kullanıcılarına bu engelin ne
olduğu ve neden çıktığı anlatılıyor. Sertifika yoksa yapılabilecek başka bir şey
yok: imzasız bir dosyayı Akıllı Uygulama Denetimi'ne kabul ettirmenin yolu
bulunmuyor.
