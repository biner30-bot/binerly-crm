-- Emlak Faz 2: Gosterim (yer gosterme) kaydi. Bir mulk bircok musteriye, bir
-- musteri bircok mulke gosterilir - deal'den bagimsiz kendi tablosu. Gosterim
-- tarihi, yer gosterme belgesindeki 1 yillik koruma suresinin baslangicidir.
-- property_id/customer_id/shown_by BILINCLI OLARAK FK'siz - tasks ile ayni gerekce.
CREATE TABLE public.property_showings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  property_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  shown_at timestamptz NOT NULL DEFAULT now(),
  shown_by uuid,
  method text NOT NULL DEFAULT 'fiziki' CHECK (method IN ('fiziki','elektronik')),
  interest text CHECK (interest IS NULL OR interest IN ('yuksek','orta','dusuk','yok')),
  feedback text,
  -- Dijital onay: belge metni link olusturulurken istemcide uretilip burada
  -- dondurulur; musterinin onayladigi metin sonradan ayarlar/portfoy degisse de
  -- birebir kanit olarak kalir (marketing_consent_text ile ayni ilke).
  consent_token text UNIQUE,
  consent_text text,
  consent_signed_at timestamptz,
  consent_signer_name text,
  consent_ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_batch_id uuid
);

CREATE INDEX property_showings_property_idx ON public.property_showings (property_id) WHERE deleted_at IS NULL;
CREATE INDEX property_showings_customer_idx ON public.property_showings (customer_id) WHERE deleted_at IS NULL;

ALTER TABLE public.property_showings ENABLE ROW LEVEL SECURITY;

CREATE POLICY property_showings_team_access ON public.property_showings
  FOR ALL USING (user_id = auth.uid() OR user_id IN (SELECT my_team_ids()))
  WITH CHECK (user_id = auth.uid() OR user_id IN (SELECT my_team_ids()));

CREATE POLICY permanent_delete_owner_property_showings ON public.property_showings FOR DELETE TO authenticated
  USING (deleted_at IS NOT NULL AND user_id = auth.uid());
CREATE POLICY permanent_delete_restrict_property_showings ON public.property_showings AS RESTRICTIVE FOR DELETE TO authenticated
  USING (deleted_at IS NOT NULL AND user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_showings TO authenticated;
-- api/deal-approval.js (sign-showing) token ile okuyup imzayi yaziyor - GRANT
-- eksikse hata vermeden bos sonuc doner (service_role GRANT tuzagi).
GRANT SELECT, UPDATE ON public.property_showings TO service_role;

ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_entity_type_check;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_entity_type_check
  CHECK (entity_type IN ('customers', 'deals', 'tickets', 'kb_articles', 'price_list_items', 'payments', 'company_expenses', 'group_classes', 'deal_photos', 'staff_shifts', 'staff_leave_balances', 'staff_leave_records', 'trash', 'tasks', 'auth', 'properties', 'property_photos', 'property_docs', 'property_showings'));
