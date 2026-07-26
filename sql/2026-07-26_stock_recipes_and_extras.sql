-- Güzellik & Bakım (ve gerektiğinde diğer sektörler) için toplu ek özellikler:
-- (1) Tazeleme/seans hatırlatıcısı — fiyat listesi kalemine opsiyonel "kaç günde
--     bir tazeleme" bilgisi, (2) hangi fiyat kaleminin kullanıldığını teklif
--     kalemlerinde de saklamak (reçete tüketimi + hatırlatma için gerekli),
--     (3) ekip üyesi bazlı prim oranı/koltuk kirası, (4) gramaj bazlı stok ve
--     reçete sistemi (sektörden bağımsız — hangi sektör isterse kullanır,
--     kullanmayan hiç dokunmaz).

ALTER TABLE public.price_list_items ADD COLUMN refresh_days integer;
ALTER TABLE public.deal_line_items ADD COLUMN price_item_id uuid REFERENCES public.price_list_items(id) ON DELETE SET NULL;
ALTER TABLE public.team_members ADD COLUMN commission_percent numeric;
ALTER TABLE public.team_members ADD COLUMN chair_rental_fee numeric;

-- Stok kalemleri (hammadde/sarf malzemesi) — gramaj/hacim/adet bazlı.
CREATE TABLE public.stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'adet',
  quantity_on_hand numeric NOT NULL DEFAULT 0,
  reorder_threshold numeric,
  supplier_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_batch_id uuid
);
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_items_all ON public.stock_items FOR ALL
  USING ((user_id = auth.uid()) OR (user_id IN (SELECT my_team_ids())))
  WITH CHECK ((user_id = auth.uid()) OR (user_id IN (SELECT my_team_ids())));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_items TO authenticated;

-- Reçete: bir fiyat listesi kaleminin (hizmet/ürün) TEK SEFERLİK tükettiği
-- stok kalemleri ve miktarları. price_item silinirse reçete satırları da gider
-- (ON DELETE CASCADE) — artık var olmayan bir hizmetin reçetesi anlamsız.
CREATE TABLE public.price_item_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  price_item_id uuid NOT NULL REFERENCES public.price_list_items(id) ON DELETE CASCADE,
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  quantity numeric NOT NULL CHECK (quantity > 0)
);
ALTER TABLE public.price_item_ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY price_item_ingredients_all ON public.price_item_ingredients FOR ALL
  USING ((user_id = auth.uid()) OR (user_id IN (SELECT my_team_ids())))
  WITH CHECK ((user_id = auth.uid()) OR (user_id IN (SELECT my_team_ids())));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_item_ingredients TO authenticated;
