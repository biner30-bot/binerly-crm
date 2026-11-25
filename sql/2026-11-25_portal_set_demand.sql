-- Müşteri portalı (emlak): müşteri aradığı evi kendisi güncelleyebilir.
-- Sadece kendi kaydı (portal_user_id = auth.uid()) ve sadece talep anahtarları
-- yazılır; diğer custom_fields alanlarına (danışmanın kendi alanları) dokunulmaz.
-- Değerler metin/sayı olarak kısaltılır - portaldan rastgele büyük veri yazılamaz.
create or replace function public.portal_set_my_demand(p_customer_id uuid, p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed text[] := array['aranan_islem','aranan_bolge','min_butce','max_butce',
    'aranan_oda_sayisi','aranan_mulk_tipi','talep_m2_min','talep_m2_max','talep_max_yas',
    'talep_odeme','talep_aciliyet'];
  k text;
  v jsonb;
  clean jsonb := '{}'::jsonb;
  remove text[] := '{}';
  result jsonb;
begin
  if not exists (
    select 1 from customers c
    join company_settings cs on cs.user_id = c.user_id
    where c.id = p_customer_id and c.portal_user_id = auth.uid()
      and c.deleted_at is null and cs.sector = 'emlak'
  ) then
    raise exception 'not allowed';
  end if;
  for k, v in select * from jsonb_each(coalesce(p_fields, '{}'::jsonb)) loop
    if k = any(allowed) then
      if v is null or v = 'null'::jsonb or v #>> '{}' = '' then
        remove := remove || k;
      elsif jsonb_typeof(v) = 'number' then
        clean := clean || jsonb_build_object(k, v);
      else
        clean := clean || jsonb_build_object(k, left(v #>> '{}', 120));
      end if;
    end if;
  end loop;
  update customers
    set custom_fields = (coalesce(custom_fields, '{}'::jsonb) - remove) || clean
    where id = p_customer_id
    returning custom_fields into result;
  return (
    select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    from jsonb_each(result) e
    where e.key like 'aranan\_%' or e.key like 'talep\_%' or e.key in ('min_butce', 'max_butce')
  );
end;
$$;

revoke all on function public.portal_set_my_demand(uuid, jsonb) from public, anon;
grant execute on function public.portal_set_my_demand(uuid, jsonb) to authenticated;
