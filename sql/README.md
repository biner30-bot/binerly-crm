# SQL Geçmişi

Binerly'nin veritabanı şeması (tablolar, RLS politikaları, GRANT'ler) Supabase SQL Editor'de elle çalıştırılıyor — repo bugüne kadar bu SQL'lerin hiçbirini dosya olarak tutmuyordu, tek doğru kaynak Supabase'in kendi içindeki canlı durumdu. Bu, Supabase projesi bir şekilde kaybolursa (hesap sorunu, yanlışlık vb.) şemayı sıfırdan yeniden kurmanın hiçbir yolu olmaması demek.

Bu klasör, bundan sonra çalıştırılan her SQL'i **tarih sırasıyla, ayrı dosyalar halinde** kaydediyor — gerçek bir migration aracı değil, sadece basit bir kayıt/yedek.

## Önemli sınırlama

Bu klasör **2026-07-22 tarihinden itibaren** eklenmeye başlandı. Bu tarihten ÖNCE oluşturulmuş tabloların orijinal `CREATE TABLE` SQL metni burada yok (o dönemin tam SQL komutları elimde/hafızamda tutulmuyordu) — **ama** `2026-07-22_schema_snapshot.md` dosyasında bu tabloların hepsinin GERÇEK canlı sütun/tip/RLS politika dökümü var (kullanıcının Supabase Dashboard'dan doğrudan aldığı bir döküm, benim hafızamdan tahmin değil). Yani tam `CREATE TABLE` ifadeleri yok ama yapı (hangi sütun, hangi tip, hangi RLS kuralı) tamamen belgeli.

**Hâlâ eksik olan**: `GRANT` ifadeleri (özellikle `service_role` grant'leri), index tanımları, `my_team_ids()` fonksiyonunun kendi tanımı, ve tam foreign key/default value detayları. Bunları da içeren %100 tam bir yedek istersen, Supabase Dashboard → Project Settings → Database'den bağlantı stringini alıp bana verirsen `pg_dump --schema-only` ile tam bir çıktı alabilirim.

## Dosya adlandırma

`YYYY-MM-DD_kisa-aciklama.sql` — her dosya, o gün Supabase SQL Editor'de çalıştırılan komutları olduğu gibi içerir.
