-- audit_log.entity_type bir CHECK constraint ile sabit bir listeye kısıtlı
-- (bkz. 2026-07-26_attachment_before_after_photos.sql) - vardiya/izin
-- sistemi eklenirken bu güncellenmemişti, logAction("staff_shifts"/...)
-- çağrıları sessizce "violates check constraint" hatasıyla başarısız oluyordu
-- (audit_log yazımı hiçbir asıl işlemi bloklamıyor, kullanıcıya hata da
-- göstermiyor - sadece console.error, bu yüzden fark edilmesi zor).
ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_entity_type_check;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_entity_type_check
  CHECK (entity_type IN (
    'customers', 'deals', 'tickets', 'kb_articles', 'price_list_items',
    'payments', 'company_expenses', 'group_classes', 'deal_photos',
    'staff_shifts', 'staff_leave_balances', 'staff_leave_records'
  ));
