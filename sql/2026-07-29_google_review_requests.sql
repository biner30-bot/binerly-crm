-- Google değerlendirme isteği otomasyonu: bir teklif/randevu/üyelik/rezervasyon
-- "kazanildi" aşamasına geçtiğinin ERTESİ günü, işletme Ayarlar'dan bir Google
-- değerlendirme linki girmişse, müşteriye otomatik bir e-posta gidip o linke
-- yönlendiriyor (api/send-reminders.js günlük cron'una eklenen ikinci blok).
-- review_requested_at, aynı deal için tekrar gönderimi engelliyor —
-- appointment_reminder_sent_at ile birebir aynı desen.

ALTER TABLE public.deals ADD COLUMN review_requested_at timestamptz;

ALTER TABLE public.company_settings ADD COLUMN google_review_link text;
ALTER TABLE public.company_settings ADD COLUMN google_review_requests_enabled boolean DEFAULT true;
