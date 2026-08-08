-- audit_log.entity_type/action CHECK constraint'leri sabit bir listeye
-- kısıtlı (bkz. 2026-08-02_audit_log_staff_shift_leave_types.sql - aynı
-- kalıp daha önce staff_shifts/staff_leave_* için de yaşanmıştı). Çöp
-- kutusu kalıcı silme özelliği eklenirken (2026-08-01_trash_permanent_delete.sql)
-- logAction("trash", batchId, "permanently_deleted", ...) çağrısı hem
-- entity_type hem action için listede olmayan değerler kullanıyordu,
-- her kalıcı silmede sessizce "violates check constraint" ile başarısız
-- oluyordu (audit_log yazımı asıl silme işlemini hiç bloklamıyor, kullanıcıya
-- hata da göstermiyor - sadece console.error, bu yüzden fark edilmesi zor).
ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_entity_type_check;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_entity_type_check
  CHECK (entity_type IN (
    'customers', 'deals', 'tickets', 'kb_articles', 'price_list_items',
    'payments', 'company_expenses', 'group_classes', 'deal_photos',
    'staff_shifts', 'staff_leave_balances', 'staff_leave_records', 'trash'
  ));

ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_action_check
  CHECK (action IN ('created', 'updated', 'deleted', 'restored', 'permanently_deleted'));
