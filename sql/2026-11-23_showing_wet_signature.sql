-- Yer gosterme belgesi: linkle alinan onay basit elektronik onaydir, TBK m.520'deki
-- yazili sekil sartini (islak/guvenli e-imza) karsilamaz - hizmet bedeli talebinde
-- asil dayanak islak imzali belge. Taranmis islak imzali belge gosterime
-- showing_docs eki olarak yuklenir, wet_signed_at "Islak imzali" durumunu tutar.
ALTER TABLE public.property_showings ADD COLUMN IF NOT EXISTS wet_signed_at timestamptz;

ALTER TABLE public.attachments DROP CONSTRAINT IF EXISTS attachments_entity_type_check;
ALTER TABLE public.attachments ADD CONSTRAINT attachments_entity_type_check
  CHECK (entity_type IN ('customers', 'deals', 'tickets', 'kb_articles', 'price_list_items', 'deal_photos', 'properties', 'property_photos', 'property_docs', 'showing_docs'));

ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_entity_type_check;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_entity_type_check
  CHECK (entity_type IN ('customers', 'deals', 'tickets', 'kb_articles', 'price_list_items', 'payments', 'company_expenses', 'group_classes', 'deal_photos', 'staff_shifts', 'staff_leave_balances', 'staff_leave_records', 'trash', 'tasks', 'auth', 'properties', 'property_photos', 'property_docs', 'property_showings', 'showing_docs'));
