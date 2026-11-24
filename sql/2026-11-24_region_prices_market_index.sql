-- Otomatik fiyat tahmini (Endeksa tarzi: bolge + daire ozellikleri -> fiyat).
-- Kullanici emsal-tek-tek ekleme ekranini istemedi; bolge m2 fiyati, danismanin
-- kendi ekranindan kopyaladigi portal arama sonuc sayfasindan (kazima/robot
-- DEGIL) hesaplanip mahalle bazinda saklanir. Ileride resmi portal/Endeksa API'si
-- ayni "kaynak" (source) yuvasina eklenecek.
CREATE TABLE public.region_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  city text NOT NULL DEFAULT '',
  district text NOT NULL DEFAULT '',
  neighborhood text NOT NULL,
  property_type text NOT NULL DEFAULT 'Daire',
  transaction_type text NOT NULL DEFAULT 'satilik' CHECK (transaction_type IN ('satilik','kiralik')),
  -- Brut m2 basina ILAN fiyati (pazarlik payi dusulmemis) - pay ayri ayar,
  -- degistirilince eski kayitlar yeniden hesaplanmadan dogru kalir.
  median_m2 numeric NOT NULL CHECK (median_m2 > 0),
  q1_m2 numeric,
  q3_m2 numeric,
  median_area numeric,
  listing_count integer NOT NULL DEFAULT 0,
  -- Bolgedeki tipik bina yasi: arama sonuc sayfasi yasi gostermedigi icin
  -- danisman girer; yas duzeltmesi bu tipik yasa GORE yapilir (eski yapilasmali
  -- cogu 30 yasindaki bolgede her daireye "eski bina" indirimi uygulanmasin).
  typical_age integer,
  as_of date NOT NULL DEFAULT current_date,
  source text NOT NULL DEFAULT 'ilan_yapistirma' CHECK (source IN ('ilan_yapistirma','elle')),
  listings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX region_prices_unique_idx ON public.region_prices
  (user_id, lower(city), lower(district), lower(neighborhood), property_type, transaction_type);

ALTER TABLE public.region_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY region_prices_team_access ON public.region_prices
  FOR ALL USING (user_id = auth.uid() OR user_id IN (SELECT my_team_ids()))
  WITH CHECK (user_id = auth.uid() OR user_id IN (SELECT my_team_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.region_prices TO authenticated;
GRANT ALL ON public.region_prices TO service_role;

-- TCMB EVDS Konut Fiyat Endeksi (TP.KFE.*). Seviye icin DEGIL, sadece
-- degisim orani icin: eski tarihli bolge m2 fiyatini bugune tasir. Herkese
-- ortak, sadece cron (service_role) yazar.
CREATE TABLE public.market_index (
  series text NOT NULL,
  period date NOT NULL,
  value numeric NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (series, period)
);

ALTER TABLE public.market_index ENABLE ROW LEVEL SECURITY;

CREATE POLICY market_index_read ON public.market_index
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.market_index TO authenticated;
GRANT ALL ON public.market_index TO service_role;

-- Mahallenin Sahibinden arama bağlantısı (danışman bir kez yapıştırır). Bina
-- yaşı filtreli aramalar bu bağlantıya a812=<kod> eklenerek tek tıkla açılır.
alter table public.region_prices add column if not exists search_url text;

-- Piyasa hareketi: bölge her güncellendiğinde önceki ilanlarla karşılaştırma
-- (yeni ilan, fiyat düşüren, eksiksiz aramada yayından kalkan, ort. yayın süresi).
alter table public.region_prices add column if not exists market_moves jsonb;
