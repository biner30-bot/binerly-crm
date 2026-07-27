-- Zaman-bazlı iptal politikasına 3. bir katman: "kısmi kesinti sınırı" — sadece
-- görünürlük/öneri amaçlı (otomatik para hareketi YAPMAZ), geç sayılma
-- penceresinden (appointment_penalty_hours) daha yakın bir saat sınırı.
ALTER TABLE public.company_settings ADD COLUMN appointment_partial_charge_hours numeric NULL;

-- İşletme kaynaklı geç iptallerde (simetrik adalet) müşteriye tanınan ücretsiz
-- telafi hakkı sayacı — DealForm'da yeni bir randevu oluşturulurken kullanılabilir.
ALTER TABLE public.customers ADD COLUMN appointment_credit_count integer NOT NULL DEFAULT 0;

-- customer_profile_view, portalın kısmi kesinti sınırını okuyup iptal onay
-- mesajında gösterebilmesi için appointment_partial_charge_hours'u da taşımalı
-- (2026-07-26_appointment_penalty_burn_session.sql'deki view'in devamı).
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
    cs.appointment_penalty_burns_session AS company_appointment_penalty_burns_session,
    cs.appointment_partial_charge_hours AS company_appointment_partial_charge_hours
   FROM customers c
     LEFT JOIN company_settings cs ON cs.user_id = c.user_id
  WHERE c.portal_user_id = auth.uid() AND c.deleted_at IS NULL;
