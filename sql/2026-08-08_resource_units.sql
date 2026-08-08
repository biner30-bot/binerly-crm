-- Kaynak (Cihaz/Oda) "adet"i (resources.quantity) artık fiziksel alt-birimlere
-- (resource_units) bölünüyor - EXCLUDE CONSTRAINT ikili çakışma engelleyebilir
-- ama "aynı anda N tanesi meşgul olabilir" sayamaz; her adet kendi UUID'sine
-- sahip bir satıra dönüşünce constraint bu UUID üzerinde normal şekilde
-- çalışabiliyor. KOBİ'ye bu alt-birimler HİÇBİR ekranda gösterilmiyor -
-- tamamen dahili, sadece çakışma garantisi + otomatik atama için var.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE public.resource_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  unit_index integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resource_id, unit_index)
);

ALTER TABLE public.resource_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY resource_units_team_access ON public.resource_units
  FOR ALL USING (user_id = auth.uid() OR user_id IN (SELECT my_team_ids()))
  WITH CHECK (user_id = auth.uid() OR user_id IN (SELECT my_team_ids()));

-- Yazma işlemleri SADECE aşağıdaki SECURITY DEFINER trigger üzerinden olur
-- (resources.quantity/active değiştiğinde otomatik senkron) - authenticated/
-- service_role'e kasıtlı olarak INSERT/UPDATE/DELETE grant'i verilmiyor,
-- sadece okuma (SELECT) - "hangi birim boş" sorgusu için yeterli.
GRANT SELECT ON public.resource_units TO authenticated;
GRANT SELECT ON public.resource_units TO service_role;

-- resources.quantity büyürse yeni unit satırları eklenir; küçülürse fazla
-- unit'ler SİLİNMEZ (geçmiş/gelecek bir deal FK ile referans veriyor olabilir),
-- sadece active=false yapılır - resources tablosundaki "silinirse geçmiş kaydı
-- kalır" ilkesiyle aynı. resources.active kapatılırsa/açılırsa units da izler.
CREATE OR REPLACE FUNCTION public.sync_resource_units()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.resource_units (resource_id, user_id, unit_index, active)
    SELECT NEW.id, NEW.user_id, gs, NEW.active
    FROM generate_series(1, GREATEST(NEW.quantity, 1)) gs;
    RETURN NEW;
  END IF;

  IF NEW.quantity > OLD.quantity THEN
    INSERT INTO public.resource_units (resource_id, user_id, unit_index, active)
    SELECT NEW.id, NEW.user_id, gs, NEW.active
    FROM generate_series(OLD.quantity + 1, NEW.quantity) gs
    ON CONFLICT (resource_id, unit_index) DO NOTHING;
  ELSIF NEW.quantity < OLD.quantity THEN
    UPDATE public.resource_units SET active = false
    WHERE resource_id = NEW.id AND unit_index > NEW.quantity;
  END IF;

  IF NEW.active <> OLD.active THEN
    UPDATE public.resource_units
    SET active = (NEW.active AND unit_index <= NEW.quantity)
    WHERE resource_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER resources_sync_units
AFTER INSERT OR UPDATE OF quantity, active ON public.resources
FOR EACH ROW EXECUTE FUNCTION public.sync_resource_units();

-- Migration ANINDA var olan resources satırları için tek seferlik backfill
-- (bugün prodüksiyonda 0 satır var, ama ileride güvenli/idempotent olsun diye).
INSERT INTO public.resource_units (resource_id, user_id, unit_index, active)
SELECT r.id, r.user_id, gs, r.active
FROM public.resources r
CROSS JOIN LATERAL generate_series(1, GREATEST(r.quantity, 1)) AS gs
WHERE NOT EXISTS (
  SELECT 1 FROM public.resource_units ru WHERE ru.resource_id = r.id AND ru.unit_index = gs
);
