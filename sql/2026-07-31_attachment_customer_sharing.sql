-- Muayene sonrası belge paylaşımı: işletmenin bir randevuya (deal) eklediği
-- dosyalar VARSAYILAN OLARAK portale açık değil (iç maliyet notu, pazarlık
-- dökümanı vb. olabilir) — işletme her dosya için elle "Müşteriyle Paylaş"
-- demeli. Bu kolon o bayrağı tutuyor.
ALTER TABLE public.attachments ADD COLUMN shared_with_customer boolean NOT NULL DEFAULT false;

-- Portal müşterisi, kendi deal'ine ait ve açıkça paylaşılmış (shared_with_customer
-- = true) attachments satırlarını görebilsin — mevcut portal politika deseniyle
-- (customer_id IN (SELECT id FROM customers WHERE portal_user_id = auth.uid()))
-- birebir aynı mantık, sadece deals üzerinden bir seviye dolaylı.
CREATE POLICY attachments_select_portal ON public.attachments FOR SELECT
  USING (
    shared_with_customer = true
    AND entity_type = 'deals'
    AND entity_id IN (
      SELECT id FROM public.deals WHERE customer_id IN (
        SELECT id FROM public.customers WHERE portal_user_id = auth.uid()
      )
    )
  );
GRANT SELECT ON public.attachments TO authenticated;

-- Storage: mevcut indirme (createSignedUrl) istemci oturumu ile çalışıyor,
-- bucket politikaları muhtemelen ${team_id}/... klasör önekine göre auth.uid()
-- kontrol ediyor — portal kullanıcıları takım üyesi olmadığı için bununla hiç
-- eşleşmez. Bu politika, yukarıdaki attachments tablosu satırıyla eşleşen
-- (yani zaten paylaşılmış ve kendi deal'ine ait) dosyalar için ayrı bir izin
-- yolu açıyor — var olan politikaları DEĞİŞTİRMİYOR, sadece ekliyor (Postgres
-- RLS permissive politikaları OR ile birleştirir).
CREATE POLICY attachments_storage_portal_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'attachments'
    AND EXISTS (
      SELECT 1 FROM public.attachments a
      JOIN public.deals d ON d.id = a.entity_id AND a.entity_type = 'deals'
      JOIN public.customers c ON c.id = d.customer_id
      WHERE a.storage_path = storage.objects.name
        AND a.shared_with_customer = true
        AND c.portal_user_id = auth.uid()
    )
  );
