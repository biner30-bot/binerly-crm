-- Geri kazanım (churn/win-back) bildirimi — [[feedback_features_opt_in_kobi_choice]]
-- gereği VARSAYILAN KAPALI, KOBİ Ayarlar'dan açıp gün eşiğini kendi belirliyor.
-- "Pasif müşteri" tanımı, Pano'daki mevcut "Pasif Müşteri Oranı" istatistiğiyle
-- AYNI sinyali (customers.last_contact) kullanıyor - tutarlılık için farklı bir
-- tanım icat edilmedi.
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS winback_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS winback_inactive_days integer NULL;

-- Aynı müşteriye her gün tekrar tekrar gönderilmesin diye - müşteri yeniden
-- temas kurana kadar (last_contact ilerleyene kadar) bir daha gönderilmez,
-- review_requested_at ile AYNI "her durumda damgala" ilkesi.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS winback_sent_at timestamptz NULL;
