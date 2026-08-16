-- Gorev Yonetimi: genel amacli, musteri/firsata opsiyonel baglanabilen gorevler.
-- customer_id/deal_id/assigned_to BILINCLI OLARAK FK'siz - deals.assigned_to ile
-- AYNI gerekce: bagli kayit silinince (kalici silme) veya uye takimdan cikinca
-- satir sessizce anlamsizlasir ama silinmez, permanentlyDeleteBatch'e kademeli
-- cascade eklemek gerekmez. UI "Bilinmeyen musteri"/"Eski uye" fallback'iyle
-- (Pano.jsx/Deals.jsx'teki AYNI desen) bunu zaten karsiliyor.
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  type text NOT NULL DEFAULT 'diger' CHECK (type IN ('arama','toplanti','eposta','diger')),
  description text,
  due_date date,
  assigned_to uuid,
  customer_id uuid,
  deal_id uuid,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_batch_id uuid
);

-- send-reminders.js cron'unun her gun "due_date <= today AND acik" gorevleri
-- taramasi icin - deals.reminder_date sorgusuyla ayni erisim deseni.
CREATE INDEX tasks_due_date_open_idx ON public.tasks (due_date)
  WHERE completed_at IS NULL AND deleted_at IS NULL;

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tasks_team_access ON public.tasks
  FOR ALL USING (user_id = auth.uid() OR user_id IN (SELECT my_team_ids()))
  WITH CHECK (user_id = auth.uid() OR user_id IN (SELECT my_team_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
-- api/send-reminders.js (cron), service_role ile okuyacak - resources/staff_shifts'teki
-- ayni GRANT tuzagina dusmemek icin bastan ekleniyor.
GRANT SELECT ON public.tasks TO service_role;

-- audit_log.entity_type CHECK constraint'i yeni deger olmadan reddediyordu -
-- logAction("tasks", ...) canli testte 400 ile patladi, buradan eklendi.
ALTER TABLE public.audit_log DROP CONSTRAINT audit_log_entity_type_check;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_entity_type_check
  CHECK (entity_type = ANY (ARRAY['customers'::text, 'deals'::text, 'tickets'::text, 'kb_articles'::text, 'price_list_items'::text, 'payments'::text, 'company_expenses'::text, 'group_classes'::text, 'deal_photos'::text, 'staff_shifts'::text, 'staff_leave_balances'::text, 'staff_leave_records'::text, 'trash'::text, 'tasks'::text]));
