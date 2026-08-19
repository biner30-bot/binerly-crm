-- Vitrin sayfasını (/vitrin/{token}) tüm sektörlere açan ve fiyat listesi +
-- kampanya bölümleri ekleyen genişleme. Öncesi/sonrası foto galerisi hâlâ
-- sadece randevu sektörlerinde anlamlı (showcase_featured zaten öyle
-- işaretleniyor) - bu migration ona dokunmuyor, yanına iki yeni bölüm ekliyor.

-- Fiyat listesi tek bir aç/kapa anahtarıyla YA HEP YA HİÇ yayınlanır - opt-in,
-- varsayılan kapalı (bkz. CLAUDE.md "Özellikler opt-in, seçim KOBİ'de").
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS showcase_price_list_visible boolean NOT NULL DEFAULT false;

-- resources tablosuyla birebir aynı desen (bkz. sql/2026-08-03_resources.sql):
-- KOBİ'nin kendi kampanya/duyurularını yönettiği küçük bir tablo.
CREATE TABLE public.showcase_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  starts_at date,
  ends_at date,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.showcase_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY showcase_campaigns_team_access ON public.showcase_campaigns
  FOR ALL USING (user_id = auth.uid() OR user_id IN (SELECT my_team_ids()))
  WITH CHECK (user_id = auth.uid() OR user_id IN (SELECT my_team_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.showcase_campaigns TO authenticated;

-- service_role GRANT tuzağı (bkz. CLAUDE.md "Bilinen tuzaklar"): api/lead-capture.js
-- bu tabloyu service_role ile İLK KEZ okuyacak - GRANT unutulursa hata FIRLATMAZ,
-- sessizce boş sonuç döner.
GRANT SELECT ON public.showcase_campaigns TO service_role;
