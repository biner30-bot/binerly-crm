-- Genel "Eş zamanlı randevu kapasitesi" (company_settings.appointment_concurrency,
-- kaynak/personel atanmamış randevular için genel tavan) şu ana kadar sadece
-- uygulama seviyesinde kontrol ediliyordu - istek gelince "şu an kaç randevu
-- bu saatle çakışıyor" diye sayıp sayı kapasiteyi aşmıyorsa kaydediyordu. Bu
-- sayma ile asıl kayıt arasında atomik olmayan bir an var - iki müşteri
-- gerçekten aynı anda randevu isteği gönderirse ikisi de "boş" sanıp
-- kapasiteyi aşan iki randevu oluşturabilirdi.
--
-- resources/resource_units/pick_free_resource_unit/EXCLUDE CONSTRAINT
-- (2026-08-08_deals_resource_booking.sql) ile BİREBİR aynı desen, ama KOBİ'ye
-- hiç gösterilmeyen, dahili, appointment_concurrency'ye otomatik senkron bir
-- havuz - "adı konmamış bir kaynak" gibi düşünülebilir.
CREATE TABLE public.concurrency_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  slot_index integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slot_index)
);
ALTER TABLE public.concurrency_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY concurrency_slots_team_access ON public.concurrency_slots
  FOR ALL USING (user_id = auth.uid() OR user_id IN (SELECT my_team_ids()))
  WITH CHECK (user_id = auth.uid() OR user_id IN (SELECT my_team_ids()));

-- Yazma işlemleri SADECE aşağıdaki SECURITY DEFINER trigger üzerinden olur
-- (resource_units'teki AYNI hardening deseni - bkz.
-- 2026-08-08_resource_units_security_hardening.sql) - authenticated/
-- service_role'e kasıtlı olarak INSERT/UPDATE/DELETE grant'i verilmiyor.
GRANT SELECT ON public.concurrency_slots TO authenticated;
GRANT SELECT ON public.concurrency_slots TO service_role;

-- company_settings.appointment_concurrency değişince (INSERT veya UPDATE)
-- slot sayısını senkronlar - sync_resource_units ile AYNI mantık. Yeni
-- işletmeler sektör onboarding'de (applySectorPreset -> upsertCompanySettings)
-- ilk company_settings satırı oluşunca INSERT tetikleyicisinden otomatik
-- 1 slot alır, ayrıca bir "yeni kullanıcı" hook'una ihtiyaç yok.
CREATE OR REPLACE FUNCTION public.sync_concurrency_slots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_count integer;
BEGIN
  target_count := GREATEST(COALESCE(NEW.appointment_concurrency, 1), 1);
  INSERT INTO public.concurrency_slots (user_id, slot_index)
    SELECT NEW.user_id, gs FROM generate_series(1, target_count) gs
    ON CONFLICT (user_id, slot_index) DO NOTHING;
  DELETE FROM public.concurrency_slots WHERE user_id = NEW.user_id AND slot_index > target_count;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sync_concurrency_slots() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER company_settings_sync_slots
  AFTER INSERT OR UPDATE OF appointment_concurrency ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.sync_concurrency_slots();

-- Mevcut işletmeler için tek seferlik backfill.
INSERT INTO public.concurrency_slots (user_id, slot_index)
SELECT cs.user_id, gs FROM public.company_settings cs
CROSS JOIN LATERAL generate_series(1, GREATEST(COALESCE(cs.appointment_concurrency, 1), 1)) gs
ON CONFLICT (user_id, slot_index) DO NOTHING;

ALTER TABLE public.deals ADD COLUMN concurrency_slot_id uuid NULL
  REFERENCES public.concurrency_slots(id) ON DELETE SET NULL;

-- Bir slot atanmışsa aralığın da dolu olması zorunlu - deals_resource_needs_range
-- ile AYNI ilke (EXCLUDE constraint'in WHERE koşulu, slot dolu ama range NULL
-- olan bozuk bir satırı sessizce garantisiz bırakmasın diye).
ALTER TABLE public.deals ADD CONSTRAINT deals_concurrency_slot_needs_range
  CHECK (concurrency_slot_id IS NULL OR (appointment_start IS NOT NULL AND appointment_end IS NOT NULL));

-- ASIL GARANTİ: aynı slotta çakışan iki AKTİF randevu aynı anda var olamaz.
ALTER TABLE public.deals ADD CONSTRAINT deals_concurrency_slot_no_overlap
  EXCLUDE USING gist (concurrency_slot_id WITH =, appointment_range WITH &&)
  WHERE (concurrency_slot_id IS NOT NULL AND deleted_at IS NULL AND stage <> 'kaybedildi');

-- pick_free_resource_unit ile BİREBİR aynı desen (sadece resource_id yerine
-- user_id) - api/appointment-availability.js ve api/lead-capture.js
-- (widget/portal, service_role) RPC ile çağırır.
CREATE OR REPLACE FUNCTION public.pick_free_concurrency_slot(
  p_user_id uuid, p_start timestamptz, p_end timestamptz, p_exclude_deal_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT cs.id
  FROM public.concurrency_slots cs
  WHERE cs.user_id = p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.concurrency_slot_id = cs.id
        AND d.deleted_at IS NULL
        AND d.stage <> 'kaybedildi'
        AND (p_exclude_deal_id IS NULL OR d.id <> p_exclude_deal_id)
        AND d.appointment_range && tstzrange(p_start, p_end, '[)')
    )
  ORDER BY cs.slot_index
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.pick_free_concurrency_slot(uuid, timestamptz, timestamptz, uuid) TO authenticated, service_role;
