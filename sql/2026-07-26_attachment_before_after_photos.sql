-- Sağlık/Klinik ve Güzellik & Bakım'da "Öncesi/Sonrası" tedavi fotoğrafları için
-- mevcut genel `attachments` tablosu yeniden kullanılıyor (entity_type =
-- 'deal_photos', entity_id = deals.id) — yeni bir tablo yerine iki nullable
-- sütun yeterli. photo_type NULL ise sıradan bir dosya ekidir (davranış değişmez).
-- consent_confirmed, yükleme anında KVKK onay kutusunun işaretli olup olmadığını
-- kalıcı olarak (satır bazında) tutar — sonradan silinirse/değişirse bile o anki
-- onay durumunun kanıtı kalsın diye.
ALTER TABLE public.attachments ADD COLUMN IF NOT EXISTS photo_type text NULL;
ALTER TABLE public.attachments DROP CONSTRAINT IF EXISTS attachments_photo_type_check;
ALTER TABLE public.attachments ADD CONSTRAINT attachments_photo_type_check CHECK (photo_type IS NULL OR photo_type IN ('before', 'after'));
ALTER TABLE public.attachments ADD COLUMN IF NOT EXISTS consent_confirmed boolean NOT NULL DEFAULT false;

-- entity_type zaten bir CHECK constraint ile kısıtlı (customers, deals, tickets,
-- kb_articles, price_list_items) — yeni 'deal_photos' değeri bu listeye eklenmezse
-- ekleme 23514 hatasıyla reddedilir. Constraint yerinde değiştirilemediği için
-- düşürüp aynı isimle (mevcut tüm değerler + deal_photos) yeniden oluşturuluyor.
ALTER TABLE public.attachments DROP CONSTRAINT IF EXISTS attachments_entity_type_check;
ALTER TABLE public.attachments ADD CONSTRAINT attachments_entity_type_check
  CHECK (entity_type IN ('customers', 'deals', 'tickets', 'kb_articles', 'price_list_items', 'deal_photos'));

-- uploadAttachment() her yüklemede logAction(entityType, ...) de çağırıyor —
-- audit_log tablosunda AYNI türde ayrı bir entity_type CHECK constraint'i var,
-- o da güncellenmezse fotoğraf yüklemesi başarılı olur ama denetim kaydı sessizce
-- başarısız olur (canlı testte 23514 olarak yakalandı).
ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_entity_type_check;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_entity_type_check
  CHECK (entity_type IN ('customers', 'deals', 'tickets', 'kb_articles', 'price_list_items', 'payments', 'company_expenses', 'group_classes', 'deal_photos'));
