-- Öncesi/sonrası fotoğraf çekimi için GERÇEK, müşterinin kendisinden alınmış rıza.
-- Öncesinde BeforeAfterPhotos bileşeninde personelin kendi kendine işaretlediği bir
-- onay kutusu vardı (KOBİ'nin kendi beyanı) — 2026-07-29_customer_marketing_consent.sql
-- ile aynı ilke burada da geçerli: KOBİ'nin beyanı tek başına asla izin saymaz.
--
-- Ayrı bir "sor-cevap" akışı KURULMADI — bilinçli tercih: fotoğraf izni, marketing_consent
-- ile AYNI anda/AYNI metinle/AYNI üç kaynaktan (Müşteri Kazanma Linki, Müşteri Portalı,
-- KOBİ tetikli e-posta çift onayı) isteniyor. Bu yüzden AYRI bir token kolonu YOK — istek
-- her zaman marketing_consent_token ile birlikte gidip geldiği için tek, paylaşılan
-- "bekleyen istek" token'ı yeterli (iki ayrı token'ın çakışma riski hiç oluşmuyor).
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS photo_consent boolean NOT NULL DEFAULT false;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS photo_consent_at timestamptz NULL;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS photo_consent_source text NULL; -- 'lead_capture' | 'portal' | 'email_confirmation'

-- customer_profile_view'e izin alanları eklendi — portalın kendi fotoğraf izni durumunu
-- gösterip değiştirebilmesi için (2026-07-29_customer_marketing_consent.sql'deki gövdenin
-- devamı, geri kalan sütunlar aynen korundu). Postgres'te CREATE OR REPLACE VIEW, var olan
-- kolonların pozisyonunu DEĞİŞTİRMEYE izin vermiyor (42P16 hatası) — bu yüzden yeni kolonlar
-- ARAYA değil, listenin EN SONUNA eklendi.
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
    c.marketing_consent_at,
    c.photo_consent,
    c.photo_consent_at
   FROM customers c
     LEFT JOIN company_settings cs ON cs.user_id = c.user_id
  WHERE c.portal_user_id = auth.uid() AND c.deleted_at IS NULL;

-- Portaldaki müşterinin KENDİ fotoğraf iznini değiştirebilmesi için — set_my_marketing_consent
-- ile birebir aynı SECURITY DEFINER deseni (bkz. o dosyadaki gerekçe: team_members'ta
-- "ne GRANT ne policy vardı" tuzağına düşmemek için customers'a geniş bir UPDATE grant/policy
-- açmak yerine tek satır/tek kolon grubunu değiştiren dar bir fonksiyon).
CREATE OR REPLACE FUNCTION public.set_my_photo_consent(p_customer_id uuid, p_consent boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.customers
  SET photo_consent = p_consent,
      photo_consent_at = CASE WHEN p_consent THEN now() ELSE photo_consent_at END,
      photo_consent_source = CASE WHEN p_consent THEN 'portal' ELSE photo_consent_source END
  WHERE id = p_customer_id AND portal_user_id = auth.uid() AND deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_my_photo_consent(uuid, boolean) TO authenticated;
