-- CustomerPortal.jsx'in kendi randevu alma formu (SlotBookingModal) su ana
-- kadar company_settings.appointment_widget_mode'dan habersizdi - Elif
-- Guzellik Salonu hesabinda "Sadece talep al" secili olsa bile portal
-- musterileri hala anlik musaitlik/slot secip aninda randevu alabiliyordu,
-- kullanici bunu 2026-08-21'de fark etti. Portal, is_uid=auth.uid()
-- filtreli bu view uzerinden company_settings'e sinirli erisim aliyor -
-- diger company_* alanlarla ayni desende widget_mode de eklendi.
-- NOT: CREATE OR REPLACE VIEW mevcut kolonlarin SIRASINI degistiremez (yeni
-- kolon araya eklenirse "cannot change name of view column" hatasi verir) -
-- bu yuzden yeni kolon en SONA eklendi, aradaki company_* gruplamasina degil.
create or replace view public.customer_profile_view as
select
  c.id,
  c.user_id,
  c.name,
  c.sector,
  c.phone,
  c.email,
  c.created_at,
  cs.company_name,
  cs.sector as company_sector,
  cs.late_cancel_hours as company_late_cancel_hours,
  cs.hard_block_hours as company_hard_block_hours,
  cs.late_cancel_strike_limit as company_late_cancel_strike_limit,
  cs.appointment_cancel_hours as company_appointment_cancel_hours,
  cs.appointment_penalty_hours as company_appointment_penalty_hours,
  cs.appointment_penalty_strike_limit as company_appointment_penalty_strike_limit,
  cs.appointment_penalty_burns_session as company_appointment_penalty_burns_session,
  cs.appointment_partial_charge_hours as company_appointment_partial_charge_hours,
  c.marketing_consent,
  c.marketing_consent_at,
  c.photo_consent,
  c.photo_consent_at,
  cs.appointment_widget_mode as company_appointment_widget_mode
from public.customers c
left join public.company_settings cs on cs.user_id = c.user_id
where c.portal_user_id = auth.uid() and c.deleted_at is null;
