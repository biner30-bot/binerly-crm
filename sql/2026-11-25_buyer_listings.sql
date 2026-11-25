-- Alıcı için DIŞARIDA bulunan evler (kendi portföyü dışı): ofis arkadaşının
-- portföyü, Sahibinden'deki başka emlakçı ilanı, çevredeki emlakçı. Bir danışmanın
-- 10-15 portföyü talebe nadiren uyar; alıcı kaçmasın diye dışarıda bulunan evler
-- alıcıya bağlı takip edilir ve paylaşımlı işlemde (alıcıdan %2+KDV bize, satıcı
-- tarafı karşı emlakçıya) işleme dönüşür. Portföy tablosuna KONMADI: vitrin,
-- yetki uyarıları ve mal sahibi raporu dış evlere karışmasın (kullanıcı kararı 25 Kas).
CREATE TABLE public.buyer_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'emlakci'
    CHECK (source IN ('ofis', 'sahibinden', 'emlakci', 'sahibi', 'diger')),
  status text NOT NULL DEFAULT 'bulundu'
    CHECK (status IN ('bulundu', 'gonderildi', 'gosterildi', 'begendi', 'elendi', 'islem')),
  title text NOT NULL,
  transaction_type text,
  property_type text,
  price numeric,
  city text,
  district text,
  neighborhood text,
  room_count text,
  gross_m2 numeric,
  listing_no text,
  listing_url text,
  -- Karşı taraf: müşteri portalında ASLA gösterilmez (alıcı danışmanı atlayıp
  -- doğrudan gitmesin).
  counterpart_office text,
  counterpart_agent text,
  counterpart_phone text,
  office_property_id uuid,
  note text,
  shown_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_batch_id uuid
);

CREATE INDEX buyer_listings_customer_idx ON public.buyer_listings (customer_id) WHERE deleted_at IS NULL;
CREATE INDEX buyer_listings_user_idx ON public.buyer_listings (user_id) WHERE deleted_at IS NULL;

ALTER TABLE public.buyer_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY buyer_listings_team_access ON public.buyer_listings
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR user_id IN (SELECT my_team_ids()))
  WITH CHECK (user_id = auth.uid() OR user_id IN (SELECT my_team_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.buyer_listings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.buyer_listings TO service_role;
REVOKE ALL ON public.buyer_listings FROM anon;
