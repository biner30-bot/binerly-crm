-- Çöp Kutusu'nda "Kalıcı Olarak Sil" için gereken DELETE izinleri.
--
-- BİLEREK payments/company_expenses YOK bu dosyada — bu iki tabloya authenticated
-- rolüne DELETE hiç verilmiyor. Tahsilat/gider kayıtlarının Vergi Usul Kanunu/TTK
-- saklama süresi netleşmeden kalıcı silinmemesi gerekiyor (avukat/mali müşavir
-- onayı bekleniyor, bkz. proje hafızası) — bu, uygulama kodundaki kontrolün
-- YANINDA, veritabanı seviyesinde ikinci (ve daha güvenilir) bir güvence katmanı:
-- kod tarafında bir hata olsa bile DB bu iki tabloyu silmeyi reddeder.
--
-- ÖNEMLİ (canlı testte bulundu, 2026-08-01, İKİ AYRI sürpriz):
-- 1) payments/company_expenses gibi "daha sonra eklenen tablolar" (bkz.
--    sql/2026-07-22_schema_snapshot.md) kuruluşta muhtemelen authenticated'e
--    GENİŞ bir GRANT (DELETE dahil) almış - "hiç GRANT vermemek" bunu geri
--    almaz, GRANT sadece EKLEYİCİDİR. Canlı testte doğrudan bir DELETE denemesi
--    (REVOKE'suz haliyle) BAŞARILI oldu - bu yüzden burada açıkça REVOKE ediliyor.
-- 2) customers/deals/tickets/... gibi "eski/orijinal tablolar"ın zaten kendi
--    "own X" + "X_team_*" politikaları var (ikisi OR ile birleşiyor, TAKIM
--    ÜYELERİNİ de kapsıyor). Sıradan bir PERMISSIVE "sadece sahip" politikası
--    EKLEMEK bu eskileri kısıtlamaz - permissive politikalar OR ile birleşir,
--    eski "takım üyesi de silebilir" politikası hâlâ geçerli kalır. Gerçek bir
--    kısıtlama için RESTRICTIVE politika şart - restrictive politikalar TÜM
--    permissive politikalarla AND'lenir, yani var olan hiçbir politika onu
--    atlayamaz. Bu yüzden aşağıda her tablo için HEM normal (permissive, DELETE
--    hiç yoksa diye) HEM restrictive (gerçek kısıtlama için) politika var.
REVOKE DELETE ON public.payments, public.company_expenses FROM authenticated;

-- SADECE İŞLETME SAHİBİ (user_id = auth.uid(), takım üyeleri DEĞİL) ve SADECE
-- zaten çöp kutusunda olan (deleted_at IS NOT NULL) satırlar silinebilir.
-- activities/ticket_messages/deal_line_items'ın kendi deleted_at'i yok (bkz.
-- sql/2026-07-22_schema_snapshot.md notları) — bu yüzden onlarda üst kaydın
-- (customer/ticket/deal) çöpte olup olmadığına bakılıyor.

GRANT DELETE ON public.customers, public.deals, public.tickets, public.kb_articles, public.group_classes, public.attachments, public.activities, public.ticket_messages, public.deal_line_items TO authenticated;

DROP POLICY IF EXISTS permanent_delete_owner_customers ON public.customers;
CREATE POLICY permanent_delete_owner_customers ON public.customers FOR DELETE TO authenticated
  USING (deleted_at IS NOT NULL AND user_id = auth.uid());
DROP POLICY IF EXISTS permanent_delete_restrict_customers ON public.customers;
CREATE POLICY permanent_delete_restrict_customers ON public.customers AS RESTRICTIVE FOR DELETE TO authenticated
  USING (deleted_at IS NOT NULL AND user_id = auth.uid());

DROP POLICY IF EXISTS permanent_delete_owner_deals ON public.deals;
CREATE POLICY permanent_delete_owner_deals ON public.deals FOR DELETE TO authenticated
  USING (deleted_at IS NOT NULL AND user_id = auth.uid());
DROP POLICY IF EXISTS permanent_delete_restrict_deals ON public.deals;
CREATE POLICY permanent_delete_restrict_deals ON public.deals AS RESTRICTIVE FOR DELETE TO authenticated
  USING (deleted_at IS NOT NULL AND user_id = auth.uid());

DROP POLICY IF EXISTS permanent_delete_owner_tickets ON public.tickets;
CREATE POLICY permanent_delete_owner_tickets ON public.tickets FOR DELETE TO authenticated
  USING (deleted_at IS NOT NULL AND user_id = auth.uid());
DROP POLICY IF EXISTS permanent_delete_restrict_tickets ON public.tickets;
CREATE POLICY permanent_delete_restrict_tickets ON public.tickets AS RESTRICTIVE FOR DELETE TO authenticated
  USING (deleted_at IS NOT NULL AND user_id = auth.uid());

DROP POLICY IF EXISTS permanent_delete_owner_kb_articles ON public.kb_articles;
CREATE POLICY permanent_delete_owner_kb_articles ON public.kb_articles FOR DELETE TO authenticated
  USING (deleted_at IS NOT NULL AND user_id = auth.uid());
DROP POLICY IF EXISTS permanent_delete_restrict_kb_articles ON public.kb_articles;
CREATE POLICY permanent_delete_restrict_kb_articles ON public.kb_articles AS RESTRICTIVE FOR DELETE TO authenticated
  USING (deleted_at IS NOT NULL AND user_id = auth.uid());

DROP POLICY IF EXISTS permanent_delete_owner_group_classes ON public.group_classes;
CREATE POLICY permanent_delete_owner_group_classes ON public.group_classes FOR DELETE TO authenticated
  USING (deleted_at IS NOT NULL AND user_id = auth.uid());
DROP POLICY IF EXISTS permanent_delete_restrict_group_classes ON public.group_classes;
CREATE POLICY permanent_delete_restrict_group_classes ON public.group_classes AS RESTRICTIVE FOR DELETE TO authenticated
  USING (deleted_at IS NOT NULL AND user_id = auth.uid());

DROP POLICY IF EXISTS permanent_delete_owner_attachments ON public.attachments;
CREATE POLICY permanent_delete_owner_attachments ON public.attachments FOR DELETE TO authenticated
  USING (deleted_at IS NOT NULL AND user_id = auth.uid());
DROP POLICY IF EXISTS permanent_delete_restrict_attachments ON public.attachments;
CREATE POLICY permanent_delete_restrict_attachments ON public.attachments AS RESTRICTIVE FOR DELETE TO authenticated
  USING (deleted_at IS NOT NULL AND user_id = auth.uid());

DROP POLICY IF EXISTS permanent_delete_owner_activities ON public.activities;
CREATE POLICY permanent_delete_owner_activities ON public.activities FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND customer_id IN (SELECT id FROM public.customers WHERE deleted_at IS NOT NULL));
DROP POLICY IF EXISTS permanent_delete_restrict_activities ON public.activities;
CREATE POLICY permanent_delete_restrict_activities ON public.activities AS RESTRICTIVE FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND customer_id IN (SELECT id FROM public.customers WHERE deleted_at IS NOT NULL));

DROP POLICY IF EXISTS permanent_delete_owner_ticket_messages ON public.ticket_messages;
CREATE POLICY permanent_delete_owner_ticket_messages ON public.ticket_messages FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND ticket_id IN (SELECT id FROM public.tickets WHERE deleted_at IS NOT NULL));
DROP POLICY IF EXISTS permanent_delete_restrict_ticket_messages ON public.ticket_messages;
CREATE POLICY permanent_delete_restrict_ticket_messages ON public.ticket_messages AS RESTRICTIVE FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND ticket_id IN (SELECT id FROM public.tickets WHERE deleted_at IS NOT NULL));

DROP POLICY IF EXISTS permanent_delete_owner_deal_line_items ON public.deal_line_items;
CREATE POLICY permanent_delete_owner_deal_line_items ON public.deal_line_items FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND deal_id IN (SELECT id FROM public.deals WHERE deleted_at IS NOT NULL));
DROP POLICY IF EXISTS permanent_delete_restrict_deal_line_items ON public.deal_line_items;
CREATE POLICY permanent_delete_restrict_deal_line_items ON public.deal_line_items AS RESTRICTIVE FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND deal_id IN (SELECT id FROM public.deals WHERE deleted_at IS NOT NULL));
