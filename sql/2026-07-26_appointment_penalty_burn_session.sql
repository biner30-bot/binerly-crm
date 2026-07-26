-- Kaçıncı ihlalde "ödeme zorunlu" önerisi, paket sahibi (zaten önceden
-- ödemiş) müşterilerde adaletsizdi — tekrar ödeme istemek yerine paketten
-- bir seans düşmek daha mantıklı. Yeni bir ayar: appointment_penalty_
-- burns_session açıksa VE ihlal eden müşterinin aktif (tükenmemiş) bir
-- paketi varsa, ödeme zorunlu tutmak YERİNE o paketten 1 seans düşülür —
-- ihlal ANINDA (portaldan geç iptal veya elle "Randevuya gelmedi" işaretleme
-- anında), grup dersindeki seans yakma zamanlamasıyla aynı ilkeyle.
ALTER TABLE public.company_settings ADD COLUMN appointment_penalty_burns_session boolean NOT NULL DEFAULT false;

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
    cs.appointment_penalty_strike_limit AS company_appointment_penalty_strike_limit,
    cs.appointment_penalty_burns_session AS company_appointment_penalty_burns_session
   FROM customers c
     LEFT JOIN company_settings cs ON cs.user_id = c.user_id
  WHERE c.portal_user_id = auth.uid() AND c.deleted_at IS NULL;
