-- Otel sektörü için oda-stoklu rezervasyon sistemi — oda tipi başına adet
-- (bookingModel === "inventory"; Müsaitlik Saatleri'nin saat-slotu modeli
-- Otel'e uymuyordu, bir otelin aynı tipte birden fazla odası olabilir).

CREATE TABLE public.room_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  room_type text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, room_type)
);
ALTER TABLE public.room_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY room_inventory_select ON public.room_inventory FOR SELECT
  USING (user_id = auth.uid() OR user_id IN (SELECT team_id FROM public.team_members WHERE member_id = auth.uid()));
CREATE POLICY room_inventory_insert ON public.room_inventory FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id IN (SELECT team_id FROM public.team_members WHERE member_id = auth.uid()));
CREATE POLICY room_inventory_update ON public.room_inventory FOR UPDATE
  USING (user_id = auth.uid() OR user_id IN (SELECT team_id FROM public.team_members WHERE member_id = auth.uid()))
  WITH CHECK (user_id = auth.uid() OR user_id IN (SELECT team_id FROM public.team_members WHERE member_id = auth.uid()));
CREATE POLICY room_inventory_delete ON public.room_inventory FOR DELETE
  USING (user_id = auth.uid() OR user_id IN (SELECT team_id FROM public.team_members WHERE member_id = auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_inventory TO authenticated;
-- api/appointment-availability.js bu tabloyu servis anahtarıyla okuyor (inventory modu):
GRANT SELECT ON public.room_inventory TO service_role;

-- Aynı gün, ikinci bir istekte eklendi: her oda tipi için kapasite (kişi) ve
-- serbest açıklama (kahvaltı dahil, klima vb.) — misafire rezervasyon
-- sırasında gösteriliyor.
ALTER TABLE public.room_inventory ADD COLUMN capacity integer;
ALTER TABLE public.room_inventory ADD COLUMN description text;
