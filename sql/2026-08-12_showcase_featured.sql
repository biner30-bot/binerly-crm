-- Vitrin sayfası (/vitrin/{lead_capture_token}): Before/After fotoğrafı çekilmiş
-- bir randevuyu KOBİ elle "vitrine ekle" diyerek herkese açık sayfada
-- yayınlayabilir. Fotoğraf izni tek başına ("saklayabiliriz") "herkese açık
-- sergileyebiliriz" anlamına gelmediği için otomatik yayınlanmıyor - her deal
-- KOBİ'nin kendi seçimiyle, tek tek işaretlenir (bkz. BeforeAfterPhotos,
-- Deals.jsx). Okuma anında customers.photo_consent tekrar kontrol edilir
-- (api/lead-capture.js) - müşteri izni geri alırsa showcase_featured true
-- kalsa bile sayfadan otomatik düşer.
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS showcase_featured boolean NOT NULL DEFAULT false;

-- service_role GRANT tuzağı (bkz. CLAUDE.md "Bilinen tuzaklar"): api/lead-capture.js
-- vitrin verisini toplarken public.attachments'ı service_role ile İLK KEZ okudu -
-- information_schema.role_table_grants kontrolünde SELECT/INSERT/UPDATE/DELETE hiç
-- yoktu (sadece TRUNCATE/REFERENCES/TRIGGER vardı, muhtemelen varsayılan şema
-- grant'inden). GRANT olmadan sorgu hata FIRLATMIYOR, sessizce boş sonuç dönüyor -
-- deals/customers'taki gibi tam yetki verildi.
GRANT ALL PRIVILEGES ON public.attachments TO service_role;
