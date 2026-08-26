-- 2026-07-31_consent_ip_and_text.sql'deki not artik gecerli degil: portal
-- akisindan gelen istekler artik dogrudan PostgREST RPC'si degil, yeni bir
-- Supabase Edge Function (supabase/functions/log-client-event) uzerinden
-- geciyor - o fonksiyon gercek client IP'sini Deno request header'larindan
-- okuyup buraya p_ip olarak iletiyor. p_ip DEFAULT NULL oldugu icin eski
-- 2-parametreli cagrilar (varsa) hala calisir, IP verilmezse mevcut deger
-- bozulmaz (COALESCE).
CREATE OR REPLACE FUNCTION public.set_my_marketing_consent(p_customer_id uuid, p_consent boolean, p_ip text DEFAULT NULL)
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
      marketing_consent_ip = CASE WHEN p_consent THEN COALESCE(p_ip, marketing_consent_ip) ELSE marketing_consent_ip END,
      marketing_consent_text = CASE WHEN p_consent THEN 'Bu işletmeden kampanya ve değerlendirme isteği gibi e-postalar almak istiyorum' ELSE marketing_consent_text END,
      marketing_consent_token = CASE WHEN p_consent THEN NULL ELSE marketing_consent_token END
  WHERE id = p_customer_id AND portal_user_id = auth.uid() AND deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_my_photo_consent(p_customer_id uuid, p_consent boolean, p_ip text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.customers
  SET photo_consent = p_consent,
      photo_consent_at = CASE WHEN p_consent THEN now() ELSE photo_consent_at END,
      photo_consent_source = CASE WHEN p_consent THEN 'portal' ELSE photo_consent_source END,
      photo_consent_ip = CASE WHEN p_consent THEN COALESCE(p_ip, photo_consent_ip) ELSE photo_consent_ip END,
      photo_consent_text = CASE WHEN p_consent THEN 'Hizmet öncesi/sonrası fotoğraflarımın çekilip saklanmasına izin veriyorum' ELSE photo_consent_text END
  WHERE id = p_customer_id AND portal_user_id = auth.uid() AND deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_my_marketing_consent(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_photo_consent(uuid, boolean, text) TO authenticated;
