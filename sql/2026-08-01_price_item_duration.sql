-- Çoklu hizmet süre toplama (Faz 1 — iç randevu motoru): fiyat listesi
-- kalemlerine opsiyonel süre eklenir, randevu çakışma kontrolü bunu
-- kullanarak tam dakika eşitliği yerine aralık/overlap mantığına geçer.
ALTER TABLE public.price_list_items ADD COLUMN duration_minutes integer;
