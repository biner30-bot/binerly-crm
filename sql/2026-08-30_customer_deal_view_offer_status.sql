-- Muster Portali'nin (CustomerPortal.jsx) "Sadece talep al" modundaki bir randevu
-- talebini dogru gosterebilmesi icin appointment_offer_status/time kolonlari eklendi.
-- Onceden portal, teklif gonderilmis (appointment_offer_status='sent') bir talebi
-- normal bir deal gibi "Onayla" butonuyla gosteriyor, /onay/{token}'a (generic deal
-- approval) yonlendiriyordu - musteri onerilen SAATI gormeden onayliyordu ve teklif
-- 'sent'te asili kaliyordu (kullanici bulmus bug; markApproved tarafinda da
-- kesinlestirme eklendi, bkz. api/deal-approval.js).
--
-- CREATE OR REPLACE VIEW: yeni kolonlar SONA eklenmeli - araya eklemek
-- "cannot change name of view column" hatasi verir.
CREATE OR REPLACE VIEW public.customer_deal_view AS
 SELECT d.id,
    d.customer_id,
    d.title,
    d.value,
    d.stage,
    d.created_at,
    d.custom_fields,
    d.approval_token,
    d.payment_mode,
    d.payment_status,
    d.approved_at,
    d.session_total,
    d.session_used,
    d.late_cancel_count,
    d.appointment_offer_status,
    d.appointment_offer_time
   FROM deals d
     JOIN customers c ON c.id = d.customer_id
  WHERE c.portal_user_id = auth.uid() AND d.deleted_at IS NULL AND c.deleted_at IS NULL;
