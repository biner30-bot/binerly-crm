-- Vitrin sayfasına (/vitrin/{token}) okunabilir bir URL ekler - önceden sadece
-- rastgele lead_capture_token'la erişilebiliyordu, Google/paylaşım önizlemesi
-- için insan-okur bir adres gerekiyor. Token geriye dönük çalışmaya devam
-- eder (api/lead-capture.js artık ikisini de OR ile arıyor) - bu SADECE ek
-- bir çözümleme yolu, mevcut paylaşılmış linkler kırılmaz.
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS showcase_slug text;

-- Çoğu hesapta NULL kalacağı için TAM bir UNIQUE kısıtı yanlış olurdu (birden
-- fazla NULL'a izin veren kısmi index kullanılıyor). Büyük/küçük harf
-- farkını önlemek için lower() üzerinden - uygulama katmanı zaten slug'ı hep
-- küçük harfle üretiyor/karşılaştırıyor.
CREATE UNIQUE INDEX IF NOT EXISTS company_settings_showcase_slug_unique
  ON public.company_settings (lower(showcase_slug))
  WHERE showcase_slug IS NOT NULL;
