-- Randevu öncesi hazırlık talimatı — "aç karnına gelin" gibi işletmenin kendi
-- yazacağı, hatırlatma e-postasına eklenecek opsiyonel bir not. Nullable,
-- mevcut company_settings RLS politikası zaten kapsıyor, yeni policy gerekmiyor.
ALTER TABLE public.company_settings ADD COLUMN appointment_prep_note text;
