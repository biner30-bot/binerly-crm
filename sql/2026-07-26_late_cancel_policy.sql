-- "Geç iptalde seans yakma" ayarını genişletiyor — KOBİ artık üç ayrı şeyi
-- kendi belirleyebiliyor:
-- 1) hard_block_hours: ders saatine bu kadar az kala iptal TAMAMEN kilitlenir
--    (portaldan buton devre dışı kalır). Boş bırakılırsa varsayılan 2 saat
--    (önceki sabit davranışla birebir aynı).
-- 2) late_cancel_hours: (zaten vardı) bu süreden az kala — ama hard_block_hours'tan
--    FAZLA — yapılan iptaller tamamen engellenmez, "geç iptal" sayılır.
-- 3) late_cancel_strike_limit: kaçıncı geç iptalde seans yanmaya başlasın.
--    Boş/1 ise HER geç iptalde hemen yanar; 3 girilirse ilk 2 geç iptal sadece
--    uyarı, 3'ten itibaren (ve sonrasında hep) seans düşer.
-- Üyeliğin (deals) kaç kez geç iptal yaptığını saymak için deals.late_cancel_count.

ALTER TABLE public.company_settings ADD COLUMN hard_block_hours numeric;
ALTER TABLE public.company_settings ADD COLUMN late_cancel_strike_limit integer;
ALTER TABLE public.deals ADD COLUMN late_cancel_count integer NOT NULL DEFAULT 0;

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
    cs.late_cancel_hours AS company_late_cancel_hours,
    cs.hard_block_hours AS company_hard_block_hours,
    cs.late_cancel_strike_limit AS company_late_cancel_strike_limit
   FROM customers c
     LEFT JOIN company_settings cs ON cs.user_id = c.user_id
  WHERE c.portal_user_id = auth.uid() AND c.deleted_at IS NULL;

-- customer_deal_view — session_total/session_used (paket takibi) hiç yoktu,
-- late_cancel_count (geç iptal sayacı) da yeni. İkisi de hassas değil (müşteri
-- zaten kendi paketinin durumunu/geçmişini biliyor), diğer sütunlar birebir aynı.
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
    d.late_cancel_count
   FROM deals d
     JOIN customers c ON c.id = d.customer_id
  WHERE c.portal_user_id = auth.uid() AND d.deleted_at IS NULL AND c.deleted_at IS NULL;
