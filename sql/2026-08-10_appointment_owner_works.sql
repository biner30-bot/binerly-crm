-- "Personel sayisina gore otomatik" es zamanli kapasite hesabi (bkz.
-- 2026-08-09_auto_concurrency.sql) her zaman "1 (sahip) + team_members"
-- formulunu kullaniyordu - isletme sahibi bizzat hizmet vermiyorsa (sadece
-- yonetiyorsa) otomatik hesap onu da calisan sayarak kapasiteyi 1 fazla
-- gosteriyordu. staff_shifts bu hesaba hic girmiyor, sahibe vardiya
-- yazmamak bu sayiyi degistirmiyordu - kullanici bunu sorguladi.
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS appointment_owner_works boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.recalc_auto_concurrency(p_owner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  staff_count integer;
  owner_works boolean;
BEGIN
  SELECT appointment_owner_works INTO owner_works FROM public.company_settings WHERE user_id = p_owner_id;
  SELECT (CASE WHEN COALESCE(owner_works, true) THEN 1 ELSE 0 END) + count(*) INTO staff_count
    FROM public.team_members WHERE team_id = p_owner_id;
  UPDATE public.company_settings
    SET appointment_concurrency = staff_count
    WHERE user_id = p_owner_id AND appointment_concurrency_auto = true;
END;
$$;

-- appointment_owner_works degisince de (auto acikken) aninda yeniden
-- hesaplansin diye mevcut trigger'in kolon listesine eklenir - fonksiyonun
-- kendisi (company_settings_recalc_concurrency) degismedi, hala sadece
-- appointment_concurrency_auto = true kosuluna bakiyor.
DROP TRIGGER IF EXISTS company_settings_auto_concurrency_toggle ON public.company_settings;
CREATE TRIGGER company_settings_auto_concurrency_toggle
  AFTER INSERT OR UPDATE OF appointment_concurrency_auto, appointment_owner_works ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.company_settings_recalc_concurrency();
