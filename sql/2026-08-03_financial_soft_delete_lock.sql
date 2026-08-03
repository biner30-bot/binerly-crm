-- Tahsilat/gider "silme" (çöp kutusuna taşıma) artık arayüzde sadece owner
-- veya "İşletme/sektör ayarlarını düzenleyebilir" yetkisi verilmiş üyelere
-- gösteriliyor (App.jsx/Finance.jsx: canEditCompanySettings). Bu dosya AYNI
-- kısıtlamayı veritabanı seviyesinde de kapatıyor - aksi halde bir takım
-- üyesi arayüzü atlayıp API'ye doğrudan istek göndererek yine de bir
-- tahsilatı/gideri gizleyebilirdi. VUK/TTK saklama süresi ve "Kalıcı Olarak
-- Sil"in zaten payments/company_expenses'e hiç uygulanmaması (bkz.
-- 2026-08-01_trash_permanent_delete.sql) ile aynı gerekçe - buradaki amaç
-- kalıcı veri kaybını değil, YETKİSİZ GİZLEMEYİ engellemek.

CREATE OR REPLACE FUNCTION public.can_manage_financial_records(p_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() = p_owner_id
    OR EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = p_owner_id AND member_id = auth.uid() AND can_edit_settings = true
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_financial_records(uuid) TO authenticated;

-- RESTRICTIVE politika: mevcut "own veya takım" PERMISSIVE politikasını
-- DEĞİŞTİRMİYOR, sadece üzerine AND'lenen ek bir koşul ekliyor - bu yüzden
-- mevcut politikanın adını bilmeye/silmeye gerek yok, tamamen ek (additive)
-- ve geri alması güvenli. Etkisi: deleted_at'i NULL'dan doluya çeviren
-- (yani soft-delete eden) bir UPDATE, sadece owner veya can_edit_settings=true
-- üye tarafından yapılabilir. Diğer tüm alan güncellemeleri (tutar/tarih/not/
-- yöntem) ve geri yükleme (deleted_at'i tekrar NULL'a çevirme) etkilenmiyor.
CREATE POLICY payments_restrict_soft_delete ON public.payments
  AS RESTRICTIVE
  FOR UPDATE
  USING (true)
  WITH CHECK (deleted_at IS NULL OR public.can_manage_financial_records(user_id));

CREATE POLICY company_expenses_restrict_soft_delete ON public.company_expenses
  AS RESTRICTIVE
  FOR UPDATE
  USING (true)
  WITH CHECK (deleted_at IS NULL OR public.can_manage_financial_records(user_id));
