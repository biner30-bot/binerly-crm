-- Musteri portalinin sol ust rozetinde (isletme adi + "Binerly ile") su ana
-- kadar sadece bas harfler gosteriliyordu; isletmenin yukledigi logo
-- (company_settings.logo_url) buraya da gelsin diye view'a company_logo_url
-- eklendi. logo_url zaten herkese acik (widget/vitrin/randevu-al sayfalarinda
-- gosteriliyor) - yeni bir gizlilik yuzeyi degil.
-- NOT: CREATE OR REPLACE VIEW mevcut kolon sirasini degistiremez, yeni kolon
-- en SONA eklenir (bkz. 2026-08-21_customer_profile_view_widget_mode.sql).
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
  cs.appointment_widget_mode as company_appointment_widget_mode,
  cs.logo_url as company_logo_url
from public.customers c
left join public.company_settings cs on cs.user_id = c.user_id
where c.portal_user_id = auth.uid() and c.deleted_at is null;
