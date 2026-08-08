-- Supabase advisor uyarılarını düzeltir: pick_free_resource_unit'te search_path
-- eksikti (mutable search_path riski); sync_resource_units SECURITY DEFINER
-- olduğu için varsayılan olarak PUBLIC EXECUTE almış - bu fonksiyon SADECE
-- resources tablosundaki trigger'dan çağrılmalı, hiçbir role'ün doğrudan
-- RPC ile çağırmasına gerek/izin yok.
CREATE OR REPLACE FUNCTION public.pick_free_resource_unit(
  p_resource_id uuid, p_start timestamptz, p_end timestamptz, p_exclude_deal_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT ru.id
  FROM public.resource_units ru
  WHERE ru.resource_id = p_resource_id
    AND ru.active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.resource_unit_id = ru.id
        AND d.deleted_at IS NULL
        AND d.stage <> 'kaybedildi'
        AND (p_exclude_deal_id IS NULL OR d.id <> p_exclude_deal_id)
        AND d.appointment_range && tstzrange(p_start, p_end, '[)')
    )
  ORDER BY ru.unit_index
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_resource_units() FROM PUBLIC, anon, authenticated;
