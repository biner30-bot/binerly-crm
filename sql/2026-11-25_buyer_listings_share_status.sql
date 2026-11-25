-- Dış evi alıcıya sunmadan önce karşı emlakçıya (ya da ilan sahibine)
-- paylaşımlı çalışmaya açık olup olmadığı sorulmalı. 'acik' olmadan ev alıcıya
-- gönderilmez, portalda görünmez, paylaşımlı işlem başlatılmaz (kullanıcı, 25 Kas).
ALTER TABLE public.buyer_listings
  ADD COLUMN share_status text NOT NULL DEFAULT 'sorulmadi'
    CHECK (share_status IN ('sorulmadi', 'acik', 'kapali'));

-- Ofis arkadaşı portföyünü ofise zaten paylaşmış: varsayılan açık.
UPDATE public.buyer_listings SET share_status = 'acik' WHERE source = 'ofis';

-- portal_emlak_overview.bulunan_evler koşuluna "and b.share_status = 'acik'"
-- eklendi (fonksiyonun tamamı: 2026-11-25_portal_buyer_listings.sql).
