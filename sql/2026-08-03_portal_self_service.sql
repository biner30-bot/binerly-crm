-- Müşteri portalına üç ekleme: (1) kendi profil bilgilerini (ad/telefon/
-- e-posta) güncelleyebilme, (2) "Ödemelerim" - geçmiş tahsilat/iade dökümü,
-- (3) kendi kendine erteleme zaten mevcut booking (api/appointment-
-- availability.js) + cancel (deals update) akışlarını yeniden kullanıyor,
-- ayrı bir şema değişikliği gerektirmiyor.

-- 1) Profil güncelleme — customer_profile_view/set_my_photo_consent ile AYNI
-- desen: customers'a geniş bir UPDATE policy/grant AÇMAK yerine (bu, başka
-- hassas kolonlara da yol açardı) dar, tek amaçlı bir SECURITY DEFINER
-- fonksiyon. İsim boş gönderilirse mevcut isim korunur (yanlışlıkla
-- silinmesin); telefon/e-posta boş gönderilirse NULL'a çekilir (biri
-- boşken diğeri zorunlu olması istemci tarafında zaten uygulanıyor, bkz.
-- AppointmentRequestPage.jsx'teki AYNI kural).
CREATE OR REPLACE FUNCTION public.set_my_profile(p_customer_id uuid, p_name text, p_phone text, p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.customers
  SET name = COALESCE(NULLIF(TRIM(p_name), ''), name),
      phone = NULLIF(TRIM(p_phone), ''),
      email = NULLIF(TRIM(p_email), '')
  WHERE id = p_customer_id AND portal_user_id = auth.uid() AND deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_my_profile(uuid, text, text, text) TO authenticated;

-- 2) Ödemelerim — payments tablosu şu an sadece kobi tarafına (my_team_ids())
-- açık, portal kullanıcısının kendi ödemelerini görecek hiçbir yolu yoktu.
-- customer_profile_view ile AYNI ilke: payments hassas bir tablo olduğu için
-- geniş bir SELECT grant/policy yerine, SADECE görüntüleyen kullanıcının
-- kendi müşteri kayıtlarına bağlı satırları döndüren dar bir view. İade
-- satırları (amount negatif, bkz. api/deal-approval.js handleRefund) DIŞLANMADI
-- - şeffaflık için müşteri iade aldığını da bu listede görmeli.
CREATE OR REPLACE VIEW public.customer_payments_view AS
 SELECT p.id,
    p.deal_id,
    p.amount,
    p.paid_at,
    p.created_at,
    p.note,
    d.title AS deal_title,
    d.customer_id
   FROM payments p
     JOIN deals d ON d.id = p.deal_id
     JOIN customers c ON c.id = d.customer_id
  WHERE c.portal_user_id = auth.uid()
    AND p.deleted_at IS NULL
    AND d.deleted_at IS NULL;

GRANT SELECT ON public.customer_payments_view TO authenticated;
