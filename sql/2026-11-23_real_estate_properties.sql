-- Emlak Faz 0+1: Portfoy karti. Mulk eskiden bir deal'in custom_fields'iydi (mulk =
-- teklif = tek musteri) - ayni daire 5 aliciya gosterilince 5 kez girilmesi
-- gerekiyordu ve mal sahibiyle iliski (yetki sozlesmesi, son fiyat) hic tutulmuyordu.
-- owner_customer_id/assigned_to BILINCLI OLARAK FK'siz - tasks tablosuyla ayni gerekce.
CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  owner_customer_id uuid,
  assigned_to uuid,
  transaction_type text NOT NULL CHECK (transaction_type IN ('satilik','kiralik','devren_kiralik')),
  status text NOT NULL DEFAULT 'taslak' CHECK (status IN ('taslak','aktif','opsiyonlu','satildi','kiralandi','pasif')),
  title text NOT NULL,
  property_type text,
  price numeric,
  city text,
  district text,
  neighborhood text,
  address text,
  parcel_block text,
  parcel_no text,
  unit_no text,
  gross_m2 numeric,
  net_m2 numeric,
  room_count text,
  building_age integer,
  floor text,
  total_floors integer,
  description text,
  -- Yetki sozlesmesi genelde "bitisten 15 gun once fesih bildirilmezse ayni sureyle
  -- uzar" kaydi tasir - bitis tarihi bu yuzden saklanmiyor, start+months+auto_renew'dan
  -- istemcide/cron'da hesaplaniyor (aksi halde her uzamada biri elle guncellemeli).
  authorization_start date,
  authorization_months integer CHECK (authorization_months IS NULL OR authorization_months > 0),
  authorization_auto_renew boolean NOT NULL DEFAULT true,
  authorization_exclusive boolean NOT NULL DEFAULT true,
  -- Internette emlak ilani icin mal sahibinin e-Devlet EIDS yetkilendirmesi sart.
  eids_status text NOT NULL DEFAULT 'yok' CHECK (eids_status IN ('yok','bekliyor','onaylandi')),
  eids_date date,
  listing_refs jsonb NOT NULL DEFAULT '{}'::jsonb,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_batch_id uuid
);

CREATE INDEX properties_user_active_idx ON public.properties (user_id) WHERE deleted_at IS NULL;

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY properties_team_access ON public.properties
  FOR ALL USING (user_id = auth.uid() OR user_id IN (SELECT my_team_ids()))
  WITH CHECK (user_id = auth.uid() OR user_id IN (SELECT my_team_ids()));

CREATE POLICY permanent_delete_owner_properties ON public.properties FOR DELETE TO authenticated
  USING (deleted_at IS NOT NULL AND user_id = auth.uid());
CREATE POLICY permanent_delete_restrict_properties ON public.properties AS RESTRICTIVE FOR DELETE TO authenticated
  USING (deleted_at IS NOT NULL AND user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;
-- send-reminders cron'u yetki bitis uyarisi icin service_role ile okuyacak - GRANT
-- eksikse hata vermeden bos sonuc donuyor (bkz. service_role GRANT tuzagi).
GRANT SELECT ON public.properties TO service_role;

-- Son inilecek fiyat ve gizli not (kiraci tercihleri vb.) ayri tabloda: RLS satir
-- bazli calisir, sutun gizleyemez - properties'te dursaydi her takim uyesi API'den
-- okuyabilirdi. Sadece ofis sahibi ve portfoyun sorumlu danismani gorur.
CREATE TABLE public.property_private (
  property_id uuid PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  min_price numeric,
  private_note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.property_private ENABLE ROW LEVEL SECURITY;

CREATE POLICY property_private_owner_or_assignee ON public.property_private
  FOR ALL USING (
    user_id = auth.uid()
    OR (
      user_id IN (SELECT my_team_ids())
      AND EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.assigned_to = auth.uid())
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (
      user_id IN (SELECT my_team_ids())
      AND EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.assigned_to = auth.uid())
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_private TO authenticated;

-- Teklif artik bir portfoye baglanabilir (alici x mulk iliskisi, Faz 2'nin temeli).
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS property_id uuid;

-- Ofis bazli emlak ayarlari (hizmet bedeli oranlari, yetki belgesi no, doner sermaye).
-- Ayri jsonb kolon: baska sektorlerle paylasilan bir kolona yazilirsa sektor
-- degistirildiginde veri sizar.
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS real_estate_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Ilan fotograflari (property_photos, kucultulmus) ve mulk belgeleri (property_docs,
-- orijinal - tapu/takyidat/iskan, KVKK kapsaminda kisisel veri icerir) mevcut
-- attachments tablosu + private bucket'ta. sort_order fotograf siralamasi icin.
ALTER TABLE public.attachments ADD COLUMN IF NOT EXISTS sort_order integer;

ALTER TABLE public.attachments DROP CONSTRAINT IF EXISTS attachments_entity_type_check;
ALTER TABLE public.attachments ADD CONSTRAINT attachments_entity_type_check
  CHECK (entity_type IN ('customers', 'deals', 'tickets', 'kb_articles', 'price_list_items', 'deal_photos', 'properties', 'property_photos', 'property_docs'));

ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_entity_type_check;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_entity_type_check
  CHECK (entity_type IN ('customers', 'deals', 'tickets', 'kb_articles', 'price_list_items', 'payments', 'company_expenses', 'group_classes', 'deal_photos', 'staff_shifts', 'staff_leave_balances', 'staff_leave_records', 'trash', 'tasks', 'auth', 'properties', 'property_photos', 'property_docs'));
