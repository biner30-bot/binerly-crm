-- Mevcut müşteriler (Müşteri Portalı) de kendi bağlı oldukları işletmenin
-- güncel kampanyalarını görebilsin - "portal users can view vendor company
-- settings" politikasıyla (company_settings) BİREBİR AYNI desen: customers
-- tablosundaki portal_user_id=auth.uid() eşleşmesi üzerinden. Sadece aktif ve
-- süresi geçmemiş kampanyalar (api/lead-capture.js'in ?view=vitrin dalıyla
-- aynı filtre mantığı).
CREATE POLICY "portal users can view vendor showcase campaigns" ON public.showcase_campaigns
  FOR SELECT
  USING (
    active = true
    AND (ends_at IS NULL OR ends_at >= CURRENT_DATE)
    AND EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.user_id = showcase_campaigns.user_id AND c.portal_user_id = auth.uid()
    )
  );
