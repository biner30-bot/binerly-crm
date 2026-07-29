-- Gerçek, müşterinin kendisinden alınmış pazarlama izni (İYS/ticari elektronik
-- ileti uyumu için). Üç kaynak: Müşteri Kazanma Linki (lead-capture, self opt-in),
-- Müşteri Portalı (set_my_marketing_consent RPC, kimliği doğrulanmış self-servis),
-- KOBİ'nin manuel eklediği müşteri için e-posta ile çift onay (deal-approval.js
-- action=confirm-marketing-consent, token tek başına yetki kanıtı). KOBİ'nin
-- kendi beyanı asla tek başına izin saymıyor.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS marketing_consent boolean NOT NULL DEFAULT false;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS marketing_consent_at timestamptz NULL;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS marketing_consent_source text NULL; -- 'lead_capture' | 'portal' | 'email_confirmation'
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS marketing_consent_token text NULL UNIQUE;

-- customer_profile_view'e izin alanları eklendi — portalın kendi izin durumunu
-- gösterebilmesi için (2026-07-27_appointment_partial_charge_and_credit.sql'deki
-- gövdenin devamı, geri kalan sütunlar aynen korundu). Postgres'te CREATE OR
-- REPLACE VIEW, var olan kolonların pozisyonunu DEĞİŞTİRMEYE izin vermiyor
-- (42P16 hatası) — bu yüzden yeni kolonlar ARAYA değil, listenin EN SONUNA eklendi.
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
    cs.appointment_partial_charge_hours AS company_appointment_partial_charge_hours,
    c.marketing_consent,
    c.marketing_consent_at
   FROM customers c
     LEFT JOIN company_settings cs ON cs.user_id = c.user_id
  WHERE c.portal_user_id = auth.uid() AND c.deleted_at IS NULL;

-- Portaldaki müşterinin KENDİ iznini değiştirebilmesi için — customers tablosuna
-- geniş bir UPDATE grant/policy açmak yerine (team_members'ta yeni öğrenilen "ne
-- GRANT ne policy vardı" tuzağına düşmemek için, bkz. 2026-07-28_team_members_update_grant.sql),
-- accept_team_invite() ile aynı SECURITY DEFINER deseni: sadece kendi
-- portal_user_id'sine bağlı TEK bir satırı (p_customer_id), sadece bu üç kolonu
-- değiştirebilir. Müşteri birden fazla işletmeye bağlıysa (çoklu işletme portalı)
-- izin İŞLETME BAZINDA olmalı — bu yüzden auth.uid() tek başına yetmiyor, hangi
-- customer satırının değiştirileceği de belirtiliyor (yine de portal_user_id
-- eşleşmesi olmadan başka bir satır ASLA değiştirilemez).
CREATE OR REPLACE FUNCTION public.set_my_marketing_consent(p_customer_id uuid, p_consent boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.customers
  SET marketing_consent = p_consent,
      marketing_consent_at = CASE WHEN p_consent THEN now() ELSE marketing_consent_at END,
      marketing_consent_source = CASE WHEN p_consent THEN 'portal' ELSE marketing_consent_source END,
      marketing_consent_token = CASE WHEN p_consent THEN NULL ELSE marketing_consent_token END
  WHERE id = p_customer_id AND portal_user_id = auth.uid() AND deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_my_marketing_consent(uuid, boolean) TO authenticated;
