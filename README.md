# San Kuaför Franchise Finans Yönetimi

Bu paket, 5 kullanıcıya kadar ortak internet kullanımı için hazırlanmış React + Supabase başlangıç uygulamasıdır.

## İçerik
- E-posta/şifre ile kullanıcı girişi
- `admin`, `finance`, `viewer` rolleri
- Şube kayıtları
- Aylık ciro girişi ve otomatik %5 franchise payı
- Manuel aidat ve düzeltme alanı
- Nakit/banka tahsilatları
- Çek/senet portföyü ve vade takibi
- Çek/senet teslim alınınca şube borcundan mahsup; tahsil edilince ikinci kez mahsup edilmez
- Karşılıksız kalan evrakın borç mahsubunun geri alınması
- Şube bakiye özeti ve CSV dışa aktarımı
- Finansal kayıtlar için audit log tablosu ve RLS

## Önemli muhasebe mantığı
Şube bakiyesi:
`Toplam tahakkuk - doğrudan nakit/banka tahsilatı - (portföyde + bankaya verilmiş + tahsil edilmiş çek/senet)`

- `portfolio`, `endorsed`, `collected` durumları borçtan mahsup edilmiş kabul edilir.
- `dishonored` ve `cancelled` durumları borçtan mahsup edilmez.
- Tahsil edilmiş çek/senet gerçekleşen tahsilata eklenir; borç bakiyesinden ikinci kez düşülmez.
- Aylık tahakkuk = `ciro × %5 + manuel aidat + düzeltme`.

## Canlı kullanıma alma

### 1. Supabase projesi
1. https://supabase.com adresinde hesap açıp yeni proje oluşturun.
2. Proje bölgesini size uygun seçin.
3. SQL Editor > New query bölümünde `supabase/schema.sql` dosyasının tamamını çalıştırın.
4. Authentication > Users bölümünden ilk yönetici hesabını oluşturun.
5. Oluşan kullanıcının UUID değerini kopyalayın. SQL Editor'de şu sorguyu kendi UUID'nizle çalıştırın:

```sql
update public.profiles
set full_name = 'Sistem Yöneticisi', role = 'admin'
where id = 'BURAYA-UUID';
```

6. Authentication > Users bölümünden diğer kullanıcıları davet edin/oluşturun.
7. Her yeni kullanıcı için profil rolünü belirleyin:

```sql
update public.profiles
set full_name = 'Muhasebe 1', role = 'finance'
where id = 'KULLANICI-UUID';

update public.profiles
set full_name = 'Yönetici 1', role = 'viewer'
where id = 'KULLANICI-UUID';
```

Varsayılan yeni kullanıcı rolü `viewer` olur. Böylece kullanıcıya ayrıca yetki verilmeden finansal kayıt değiştiremez.

### 2. Uygulama ayarları
1. Bilgisayarda Node.js LTS kurulu olmalı.
2. Bu klasörde `.env.example` dosyasını `.env` olarak kopyalayın.
3. Supabase Project Settings > API bölümünden Project URL ve anon/public key değerlerini `.env` dosyasına girin:

```env
VITE_SUPABASE_URL=https://PROJE_ID.supabase.co
VITE_SUPABASE_ANON_KEY=PUBLIC_ANON_KEY
```

**Asla `service_role` anahtarını kullanmayın.** Bu anahtar gizli ve sunucu tarafına özeldir.

### 3. Yerelde test
Terminalde proje klasöründe:

```bash
npm install
npm run dev
```

Terminalin verdiği yerel adresi tarayıcıda açın.

### 4. İnternete yayınlama
`npm run build` komutu `dist` klasörü üretir. Bu klasör Vercel, Netlify veya benzeri statik web barındırma hizmetine yayınlanabilir. Yayın platformunun Environment Variables bölümüne `.env` içindeki iki `VITE_` değerini ekleyin. Böylece 5 kullanıcı farklı bilgisayarlardan aynı Supabase veritabanına bağlanır.

## Güvenlik ve canlıya geçmeden önce
- Supabase e-posta doğrulamasını ve güçlü şifre politikasını etkinleştirin.
- Yönetici hesabında çok faktörlü doğrulamayı etkinleştirin.
- Kullanıcı davetlerini yalnızca yönetici yapsın.
- Düzenli veritabanı yedeği ve geri yükleme testi planlayın.
- Gerçek finansal kullanımdan önce örnek şubelerle ciro, tahsilat, çek tahsil ve karşılıksız senaryolarını test edin.
- Bu sürümde çek/senet durum geçişleri temel düzeydedir; iptal/karşılıksız işlemleri için gerekçe zorunluluğu, dosya eki, ayrıntılı rapor ve kayıt düzeltme onayı sonraki sürümde eklenmelidir.
- Audit log tablosu değişiklikleri kaydeder; arayüzde henüz ayrı denetim ekranı bulunmamaktadır.

## Not
Bu paket uygulama kaynak kodudur; kendiliğinden internete yayınlanmış canlı bir adres değildir. Supabase ve yayınlama hesabı kurulduktan sonra canlıya alınabilir.
