-- Spor Merkezi (ve Grup Dersleri kullanan diğer sektörler) için: yapılandırılabilir
-- "geç iptalde seans yakma" politikası. Boş bırakılırsa hiçbir şey değişmez —
-- mevcut sabit 2 saatlik iptal kilidi aynen çalışmaya devam eder.

ALTER TABLE public.company_settings ADD COLUMN late_cancel_hours numeric;

-- customer_profile_view müşteri portalının işletme bilgilerini okuduğu
-- güvenlik-öncelikli view — kullanıcının paylaştığı gerçek tanıma SADECE yeni
-- kolonu ekliyoruz, mevcut WHERE/JOIN/diğer sütunlar birebir aynı kalıyor.
CREATE OR REPLACE VIEW public.customer_profile_view AS
 SELECT c.id,
    c.user_id,
    c.name,
    c.sector,
    c.phone,
    c.email,
    c.created_at,
    cs.company_name,
    cs.sector AS company_sector,
    cs.late_cancel_hours AS company_late_cancel_hours
   FROM customers c
     LEFT JOIN company_settings cs ON cs.user_id = c.user_id
  WHERE c.portal_user_id = auth.uid() AND c.deleted_at IS NULL;

-- Yedek liste (waitlist): bir grup dersi dolduğunda müşteri kendi kendine
-- sıraya girebilir. Otomatik terfi SADECE işletme tarafında (personel bir
-- üyeyi dersten çıkarınca) çalışır — müşterinin kendi iptali başka bir
-- müşteriyi derse otomatik eklemek için gereken yetkiye (RLS) sahip değil,
-- bilinçli bir sınır; o durumda Pano'da "yer açıldı" uyarısı çıkar, personel
-- tek tıkla doldurur.
CREATE TABLE public.group_class_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  group_class_id uuid NOT NULL REFERENCES public.group_classes(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_class_id, customer_id)
);
ALTER TABLE public.group_class_waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY group_class_waitlist_owner ON public.group_class_waitlist FOR ALL
  USING ((user_id = auth.uid()) OR (user_id IN (SELECT my_team_ids())))
  WITH CHECK ((user_id = auth.uid()) OR (user_id IN (SELECT my_team_ids())));

CREATE POLICY group_class_waitlist_select_portal ON public.group_class_waitlist FOR SELECT
  USING (customer_id IN (SELECT id FROM public.customers WHERE portal_user_id = auth.uid()));
CREATE POLICY group_class_waitlist_insert_portal ON public.group_class_waitlist FOR INSERT
  WITH CHECK (customer_id IN (SELECT id FROM public.customers WHERE portal_user_id = auth.uid()));
CREATE POLICY group_class_waitlist_delete_portal ON public.group_class_waitlist FOR DELETE
  USING (customer_id IN (SELECT id FROM public.customers WHERE portal_user_id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_class_waitlist TO authenticated;
