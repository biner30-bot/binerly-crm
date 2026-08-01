-- Randevu widget'ında booking anında kapora tahsilatı - opsiyonel, varsayılan
-- kapalı (null). KOBİ Ayarlar'dan açıp sabit bir TL tutarı girer.
ALTER TABLE public.company_settings ADD COLUMN appointment_deposit_amount numeric;
