-- KVKK ispat gücünü artırmak için: her izin kaydına IP adresi ve o an
-- gösterilen tam onay metni de eklendi. Metin İSTEMCİDEN ASLA alınmıyor
-- (client kendi metnini uydurup gönderebilirdi, bu da kanıtı değersizleştirirdi)
-- — sunucu tarafında sabit, UI'daki gerçek metinle birebir eşleşen bir sabit
-- olarak yazılıyor (bkz. api/lead-capture.js ve api/deal-approval.js'teki
-- MARKETING_CONSENT_TEXT/PHOTO_CONSENT_TEXT sabitleri, aralarında import
-- olmadığı için üçü de elle senkron tutulmalı).
--
-- Portal akışında (set_my_*_consent) IP yakalanmıyor — PostgREST'in forwarded
-- header'ı buraya güvenilir şekilde ulaşmıyor, ayrıca zaten kimlik doğrulamalı
-- bir oturum (auth.uid()) olduğu için IP burada kritik değil; sadece metin
-- snapshot'ı ekleniyor.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS marketing_consent_ip text NULL;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS marketing_consent_text text NULL;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS photo_consent_ip text NULL;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS photo_consent_text text NULL;

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
      marketing_consent_text = CASE WHEN p_consent THEN 'Bu işletmeden kampanya ve değerlendirme isteği gibi e-postalar almak istiyorum' ELSE marketing_consent_text END,
      marketing_consent_token = CASE WHEN p_consent THEN NULL ELSE marketing_consent_token END
  WHERE id = p_customer_id AND portal_user_id = auth.uid() AND deleted_at IS NULL;
END;
$$;

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
      photo_consent_source = CASE WHEN p_consent THEN 'portal' ELSE photo_consent_source END,
      photo_consent_text = CASE WHEN p_consent THEN 'Hizmet öncesi/sonrası fotoğraflarımın çekilip saklanmasına izin veriyorum' ELSE photo_consent_text END
  WHERE id = p_customer_id AND portal_user_id = auth.uid() AND deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_my_marketing_consent(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_photo_consent(uuid, boolean) TO authenticated;
