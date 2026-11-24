-- Emlak Faz 4: Piyasa Fiyat Analizi emsalleri. Emsal portfoye bagli (o mulkun
-- analizi icin secilmis karsilastirma kayitlari); kaynak ilan (portal ilani,
-- istenen fiyat), satis (gerceklesmis islem) veya ofisin kendi portfoyu olabilir.
-- SPK lisansli degerleme raporu DEGILDIR - arayuz ve cikti bunu acikca yaziyor.
CREATE TABLE public.property_comparables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  property_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'ilan' CHECK (kind IN ('ilan','satis')),
  title text,
  price numeric NOT NULL CHECK (price > 0),
  gross_m2 numeric,
  net_m2 numeric,
  room_count text,
  building_age integer,
  floor text,
  district text,
  neighborhood text,
  observed_on date,
  -- Danismanin elle verdigi duzeltme (konum/manzara/bakim gibi formulun
  -- olcemedigi farklar), yuzde olarak: +5 = emsal bizimkinden %5 kotu.
  manual_adjust_percent numeric NOT NULL DEFAULT 0,
  note text,
  source_property_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_batch_id uuid
);

CREATE INDEX property_comparables_property_idx ON public.property_comparables (property_id) WHERE deleted_at IS NULL;

ALTER TABLE public.property_comparables ENABLE ROW LEVEL SECURITY;

CREATE POLICY property_comparables_team_access ON public.property_comparables
  FOR ALL USING (user_id = auth.uid() OR user_id IN (SELECT my_team_ids()))
  WITH CHECK (user_id = auth.uid() OR user_id IN (SELECT my_team_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_comparables TO authenticated;

ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_entity_type_check;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_entity_type_check
  CHECK (entity_type IN ('customers', 'deals', 'tickets', 'kb_articles', 'price_list_items', 'payments', 'company_expenses', 'group_classes', 'deal_photos', 'staff_shifts', 'staff_leave_balances', 'staff_leave_records', 'trash', 'tasks', 'auth', 'properties', 'property_photos', 'property_docs', 'property_showings', 'showing_docs', 'property_comparables'));
