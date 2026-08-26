-- 5651 sayili kanun kapsaminda "kim ne zaman giris/cikis yapti" logu istiyor,
-- audit_log su ana kadar sadece CRUD islemlerini kaydediyordu, kimlik
-- dogrulama olaylarina hic dokunmuyordu. entity_type/action CHECK constraint'leri
-- sabit bir listeye kisitli (bkz. 2026-08-08_audit_log_trash_permanent_delete_action.sql
-- ve 2026-08-16_tasks.sql - ayni kalip daha once de genisletildi), bu yuzden
-- yeni degerler eklenmeden logAction("auth", ..., "login"/"logout", ...)
-- sessizce "violates check constraint" ile basarisiz olurdu.
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS ip_address text;

ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_entity_type_check;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_entity_type_check
  CHECK (entity_type = ANY (ARRAY[
    'customers'::text, 'deals'::text, 'tickets'::text, 'kb_articles'::text,
    'price_list_items'::text, 'payments'::text, 'company_expenses'::text,
    'group_classes'::text, 'deal_photos'::text, 'staff_shifts'::text,
    'staff_leave_balances'::text, 'staff_leave_records'::text, 'trash'::text,
    'tasks'::text, 'auth'::text
  ]));

ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_action_check
  CHECK (action = ANY (ARRAY[
    'created'::text, 'updated'::text, 'deleted'::text, 'restored'::text,
    'permanently_deleted'::text, 'login'::text, 'logout'::text
  ]));
