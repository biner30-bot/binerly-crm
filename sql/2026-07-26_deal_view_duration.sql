-- Basit ısı haritası: müşterinin /onay/{token} sayfasında aktif (sekme
-- görünürken) geçirdiği toplam süreyi (saniye) biriktirir. Gerçek bir
-- sayfa/bölüm bazlı AI analizi değil — tek bir toplam süre, "uzun süre baktı
-- ama onaylamadı" gibi bir tereddüt sinyali vermek için yeterli ve ücretsiz.
-- api/deal-approval.js action=track-view her ziyaret sonunda (pagehide) bunu
-- artırır.

ALTER TABLE public.deals ADD COLUMN view_duration_seconds integer NOT NULL DEFAULT 0;
