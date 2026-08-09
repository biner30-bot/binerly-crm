-- 24 saat oncesi randevu hatirlaticisi icin ikinci, bagimsiz "gonderildi" damgasi.
-- Mevcut appointment_reminder_sent_at (~2 saat oncesi, tek seferlik, gun-icinde
-- otomatik "Hatirlatma gonderildi" asamasina tasima anlaminda kullaniliyor) ile
-- KARISTIRILMASIN diye ayri kolon - ikisi de kendi penceresinde en fazla bir kez
-- yazilir, birbirinden bagimsiz ilerler (bkz. api/send-appointment-reminders.js).
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS appointment_reminder_24h_sent_at timestamptz NULL;
