-- Randevu sektörlerinde (Güzellik & Bakım, Sağlık/Klinik vb.) "iptal/gelmeme"
-- politikası tamamen kobiye bırakılıyor:
-- 1) appointment_cancel_hours (zaten vardı) — tamamen kilitleme süresi.
--    ÖNEMLİ DAVRANIŞ DEĞİŞİKLİĞİ: boş bırakılırsa artık sabit 2 saatlik eski
--    varsayılana DÜŞMÜYOR — hiç kısıtlama uygulanmaz (müşteri istediği an
--    iptal edebilir). Kobi "kapalıyken bile son 2 saat iptal edilemez"
--    davranışını istemiyor, tamamen kendi seçmek istiyor.
-- 2) appointment_penalty_hours — bu süreden az kala yapılan iptaller TAMAMEN
--    engellenmez (appointment_cancel_hours'tan büyükse) ama "geç iptal"
--    sayılır ve ceza sayacına eklenir.
-- 3) appointment_penalty_strike_limit — kaçıncı geç iptal/gelmemede
--    otomatik olarak sonraki randevuda ödeme zorunlu hale gelsin. Boş
--    bırakılırsa ceza sistemi TAMAMEN KAPALI — hiçbir uyarı/otomatik ödeme
--    zorunluluğu uygulanmaz ("bazı kobiler sorun değil diye düşünür").
-- Sayaç için yeni bir kolon gerekmedi: deals.lost_reason zaten "İptal etti"
-- (erken/normal iptal) ile yeni "Geç iptal etti" (ceza penceresi içinde
-- iptal) değerlerini ayırıyor, "Randevuya gelmedi" (mevcut) ile birlikte
-- sayılıyor.
ALTER TABLE public.company_settings ADD COLUMN appointment_penalty_hours numeric;
ALTER TABLE public.company_settings ADD COLUMN appointment_penalty_strike_limit integer;

CREATE OR REPLACE VIEW public.customer_profile_view AS
 SELECT c.id,
    c.user_id,
    c.name,
    c.sector,
    c.phone,
    c.email,
    c.created_at,
    cs.company_name,
    cs.sector AS company_sector,
    cs.late_cancel_hours AS company_late_cancel_hours,
    cs.hard_block_hours AS company_hard_block_hours,
    cs.late_cancel_strike_limit AS company_late_cancel_strike_limit,
    cs.appointment_cancel_hours AS company_appointment_cancel_hours,
    cs.appointment_penalty_hours AS company_appointment_penalty_hours,
    cs.appointment_penalty_strike_limit AS company_appointment_penalty_strike_limit
   FROM customers c
     LEFT JOIN company_settings cs ON cs.user_id = c.user_id
  WHERE c.portal_user_id = auth.uid() AND c.deleted_at IS NULL;
