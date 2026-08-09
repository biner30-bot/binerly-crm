-- "Es zamanli randevu kapasitesi" (appointment_concurrency) simdiye kadar
-- KOBI'nin elle girip guncel tutmasi gereken sabit bir sayiydi - personel
-- ekleyip cikardikca unutulup eskimesi kolaydi. Yeni "otomatik" mod acikken
-- bu sayi personel sayisina (sahip + team_members) gore kendiliginden
-- guncellenir - mevcut appointment_concurrency kolonuna yazildigi icin
-- concurrency_slots havuzunu senkronlayan MEVCUT trigger (sync_concurrency_slots,
-- bkz. 2026-08-09_deals_concurrency_slots.sql) otomatik olarak devreye girer,
-- yeni bir havuz mekanizmasi gerekmiyor.
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS appointment_concurrency_auto boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.recalc_auto_concurrency(p_owner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  staff_count integer;
BEGIN
  SELECT 1 + count(*) INTO staff_count FROM public.team_members WHERE team_id = p_owner_id;
  UPDATE public.company_settings
    SET appointment_concurrency = staff_count
    WHERE user_id = p_owner_id AND appointment_concurrency_auto = true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.recalc_auto_concurrency(uuid) FROM PUBLIC, anon, authenticated;

-- Bir personel eklenince/ciktiginda (INSERT/DELETE) otomatik modu acik olan
-- isletmenin kapasitesini yeniden hesaplar - kapali isletmelerde recalc_auto_
-- concurrency'nin ic kosulu (appointment_concurrency_auto = true) zaten hicbir
-- sey degistirmiyor, trigger her INSERT/DELETE'te calissa da zararsiz.
CREATE OR REPLACE FUNCTION public.team_members_recalc_concurrency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalc_auto_concurrency(COALESCE(NEW.team_id, OLD.team_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.team_members_recalc_concurrency() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER team_members_sync_concurrency
  AFTER INSERT OR DELETE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.team_members_recalc_concurrency();

-- KOBI "otomatik"i ilk kez actiginda (appointment_concurrency_auto false->true)
-- da aninda hesaplanir - aksi halde bir sonraki personel degisikligine kadar
-- eski/bos deger gorunurdu.
CREATE OR REPLACE FUNCTION public.company_settings_recalc_concurrency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.appointment_concurrency_auto = true THEN
    PERFORM public.recalc_auto_concurrency(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.company_settings_recalc_concurrency() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER company_settings_auto_concurrency_toggle
  AFTER INSERT OR UPDATE OF appointment_concurrency_auto ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.company_settings_recalc_concurrency();
