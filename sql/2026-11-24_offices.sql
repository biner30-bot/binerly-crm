-- Emlak ofisi katmanı. Danışmanlar bağımsız (kendi şahıs şirketi, kendi
-- hesabı); ofis SADECE portföy paylaşımı, ortak bölge fiyatları ve sözleşme
-- arşivi içindir. Broker danışmanın müşteri/teklif/ciro verisini GÖRMEZ.
-- Mevcut "takım" (team_members) modeliyle bağı yoktur; diğer sektörlerde takım
-- aynen kalır.

create table if not exists public.offices (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  broker_id uuid not null default auth.uid() references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

-- Davet kodu ayrı tabloda: sadece broker görür (üyeler kendi kafalarına göre
-- başkasını davet edemesin).
create table if not exists public.office_invites (
  office_id uuid primary key references public.offices (id) on delete cascade,
  code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8))
);

create table if not exists public.office_members (
  office_id uuid not null references public.offices (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'danisman' check (role in ('broker', 'danisman')),
  display_name text not null default '',
  email text not null default '',
  phone text not null default '',
  joined_at timestamptz not null default now(),
  -- Ayrılan danışmanın satırı silinmez: sözleşme arşivinde kimin yüklediği
  -- görünmeye devam eder. Aktif üyelik = left_at is null.
  left_at timestamptz,
  primary key (office_id, user_id)
);

-- Bir danışman aynı anda tek ofiste aktif olabilir.
create unique index if not exists office_members_one_active_idx
  on public.office_members (user_id) where left_at is null;

-- Oturumdaki kullanıcının aktif ofisleri.
create or replace function public.my_office_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select office_id from public.office_members where user_id = auth.uid() and left_at is null;
$$;

-- Aynı aktif ofisteki diğer danışmanlar (kendisi dahil).
create or replace function public.office_peer_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select m.user_id from public.office_members m
  where m.left_at is null and m.office_id in (select public.my_office_ids());
$$;

create or replace function public.is_office_broker(p_office uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.offices o where o.id = p_office and o.broker_id = auth.uid());
$$;

alter table public.offices enable row level security;
alter table public.office_invites enable row level security;
drop policy if exists office_invites_broker_select on public.office_invites;
create policy office_invites_broker_select on public.office_invites for select to authenticated
  using (public.is_office_broker(office_id));
grant select on public.office_invites to authenticated;
alter table public.office_members enable row level security;

drop policy if exists offices_member_select on public.offices;
create policy offices_member_select on public.offices for select to authenticated
  using (id in (select public.my_office_ids()) or broker_id = auth.uid());

drop policy if exists offices_broker_update on public.offices;
create policy offices_broker_update on public.offices for update to authenticated
  using (broker_id = auth.uid()) with check (broker_id = auth.uid());

-- Aynı ofisin üyeleri birbirinin adını/iletişimini görür (portföy kartındaki
-- "sorumlu danışman" için). Ayrılanlar da listede kalır (arşiv için).
drop policy if exists office_members_select on public.office_members;
create policy office_members_select on public.office_members for select to authenticated
  using (office_id in (select public.my_office_ids()) or public.is_office_broker(office_id) or user_id = auth.uid());

-- Kişi kendi ad/telefonunu güncelleyebilir; rol/ofis/ayrılış RPC ile değişir.
drop policy if exists office_members_self_update on public.office_members;
create policy office_members_self_update on public.office_members for update to authenticated
  using (user_id = auth.uid() and left_at is null) with check (user_id = auth.uid());

grant select, update (name) on public.offices to authenticated;
grant select, update (display_name, phone) on public.office_members to authenticated;

-- Ofis kur: kuran broker olur (aynı zamanda portföylü bir üye).
create or replace function public.create_office(p_name text, p_display_name text, p_phone text)
returns public.offices language plpgsql security definer set search_path = public as $$
declare o public.offices;
begin
  if auth.uid() is null then raise exception 'Oturum yok'; end if;
  if exists (select 1 from public.office_members where user_id = auth.uid() and left_at is null) then
    raise exception 'Zaten bir ofistesiniz - önce ayrılın.';
  end if;
  insert into public.offices (name, broker_id) values (trim(p_name), auth.uid()) returning * into o;
  insert into public.office_invites (office_id) values (o.id);
  insert into public.office_members (office_id, user_id, role, display_name, email, phone)
  values (o.id, auth.uid(), 'broker', coalesce(trim(p_display_name), ''),
          coalesce((select email from auth.users where id = auth.uid()), ''), coalesce(trim(p_phone), ''));
  return o;
end $$;

-- Davet koduyla katıl. Ayrılıp geri dönen danışmanın eski satırı yeniden açılır.
create or replace function public.join_office(p_code text, p_display_name text, p_phone text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_office uuid;
begin
  if auth.uid() is null then raise exception 'Oturum yok'; end if;
  select office_id into v_office from public.office_invites where code = upper(trim(p_code));
  if v_office is null then raise exception 'Davet kodu bulunamadı.'; end if;
  if exists (select 1 from public.office_members where user_id = auth.uid() and left_at is null) then
    raise exception 'Zaten bir ofistesiniz - önce ayrılın.';
  end if;
  insert into public.office_members (office_id, user_id, role, display_name, email, phone)
  values (v_office, auth.uid(), 'danisman', coalesce(trim(p_display_name), ''),
          coalesce((select email from auth.users where id = auth.uid()), ''), coalesce(trim(p_phone), ''))
  on conflict (office_id, user_id) do update
    set left_at = null, joined_at = now(), display_name = excluded.display_name, phone = excluded.phone;
  return v_office;
end $$;

-- Ayrıl. Broker, ofiste başka aktif üye varken ayrılamaz (ofis sahipsiz kalmasın).
create or replace function public.leave_office()
returns void language plpgsql security definer set search_path = public as $$
declare v_office uuid; v_role text;
begin
  select office_id, role into v_office, v_role from public.office_members
  where user_id = auth.uid() and left_at is null;
  if v_office is null then return; end if;
  if v_role = 'broker' and exists (
    select 1 from public.office_members where office_id = v_office and left_at is null and user_id <> auth.uid()
  ) then
    raise exception 'Ofiste başka danışmanlar varken broker ayrılamaz - önce onları çıkarın.';
  end if;
  update public.office_members set left_at = now() where office_id = v_office and user_id = auth.uid();
end $$;

-- Broker bir danışmanı çıkarır (arşiv satırı kalır).
create or replace function public.remove_office_member(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_office uuid;
begin
  select office_id into v_office from public.office_members where user_id = p_user and left_at is null;
  if v_office is null or not public.is_office_broker(v_office) then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;
  if p_user = auth.uid() then raise exception 'Kendinizi çıkaramazsınız - ofisten ayrılın.'; end if;
  update public.office_members set left_at = now() where office_id = v_office and user_id = p_user;
end $$;

-- Broker davet kodunu yeniler (eski kod sızdıysa).
create or replace function public.reset_office_invite(p_office uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not public.is_office_broker(p_office) then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  v_code := upper(substr(md5(gen_random_uuid()::text), 1, 8));
  update public.office_invites set code = v_code where office_id = p_office;
  return v_code;
end $$;

revoke all on function public.create_office(text, text, text) from public;
revoke all on function public.join_office(text, text, text) from public;
revoke all on function public.leave_office() from public;
revoke all on function public.remove_office_member(uuid) from public;
revoke all on function public.reset_office_invite(uuid) from public;
grant execute on function public.create_office(text, text, text) to authenticated;
grant execute on function public.join_office(text, text, text) to authenticated;
grant execute on function public.leave_office() to authenticated;
grant execute on function public.remove_office_member(uuid) to authenticated;
grant execute on function public.reset_office_invite(uuid) to authenticated;
grant execute on function public.my_office_ids() to authenticated;
grant execute on function public.office_peer_ids() to authenticated;
grant execute on function public.is_office_broker(uuid) to authenticated;

-- 2/5 Ortak portföy: aynı ofisteki danışmanlar birbirinin AKTİF portföyünü
-- salt okunur görür (satılan/kiralanan paylaşılmaz - gerçekleşen fiyat vb.
-- danışmanın bilgisi). Mal sahibi (customers) ve property_private zaten
-- kendi RLS'leriyle kapalı. Düzenleme yetkisi verilmez.
alter table public.properties add column if not exists office_shared boolean not null default true;

drop policy if exists properties_office_peer_select on public.properties;
create policy properties_office_peer_select on public.properties for select to authenticated
  using (
    office_shared and deleted_at is null and status in ('aktif', 'opsiyonlu')
    and user_id in (select public.office_peer_ids())
  );

-- Paylaşılan portföyün sadece FOTOĞRAFLARI (belgeler değil).
drop policy if exists attachments_office_peer_photos on public.attachments;
create policy attachments_office_peer_photos on public.attachments for select to authenticated
  using (
    entity_type = 'property_photos' and deleted_at is null and exists (
      select 1 from public.properties p
      where p.id = attachments.entity_id and p.office_shared and p.deleted_at is null
        and p.status in ('aktif', 'opsiyonlu') and p.user_id in (select public.office_peer_ids())
    )
  );

drop policy if exists attachments_storage_office_peer_photos on storage.objects;
create policy attachments_storage_office_peer_photos on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments' and exists (
      select 1 from public.attachments a
      join public.properties p on p.id = a.entity_id
      where a.storage_path = objects.name and a.entity_type = 'property_photos' and a.deleted_at is null
        and p.office_shared and p.deleted_at is null and p.status in ('aktif', 'opsiyonlu')
        and p.user_id in (select public.office_peer_ids())
    )
  );

-- 4/5 Ortak bölge fiyatları: ofis üyeleri birbirinin bölge kaydını görür ve
-- (yeni ilan yapıştırarak) günceller. Silme sadece kaydı ekleyene ait
-- (mevcut region_prices_team_access politikası); sahiplik değiştirilemez.
drop policy if exists region_prices_office_select on public.region_prices;
create policy region_prices_office_select on public.region_prices for select to authenticated
  using (user_id in (select public.office_peer_ids()));
drop policy if exists region_prices_office_update on public.region_prices;
create policy region_prices_office_update on public.region_prices for update to authenticated
  using (user_id in (select public.office_peer_ids()))
  with check (user_id in (select public.office_peer_ids()));

-- Ortak kaydı güncelleyen ofis arkadaşı sahibini değiştiremesin (silme hakkı
-- sahibinde kalır).
create or replace function public.region_prices_keep_owner()
returns trigger language plpgsql as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'Bölge fiyatının sahibi değiştirilemez.';
  end if;
  return new;
end $$;
drop trigger if exists region_prices_keep_owner on public.region_prices;
create trigger region_prices_keep_owner before update on public.region_prices
  for each row execute function public.region_prices_keep_owner();

-- 3/5 Ofis sözleşme arşivi: imzalı yetki/aracılık sözleşmeleri ve yer gösterme
-- belgeleri ofiste kalır (fiziksel arşivin karşılığı). Ayrı bucket: danışman
-- kendi dosyasını silse ya da ofisten ayrılsa da kopya kalır.
insert into storage.buckets (id, name, public)
values ('office-archive', 'office-archive', false)
on conflict (id) do nothing;

create table if not exists public.office_documents (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices (id) on delete cascade,
  uploaded_by uuid not null default auth.uid() references auth.users (id),
  uploader_name text not null default '',
  property_id uuid references public.properties (id) on delete set null,
  property_title text not null default '',
  doc_type text not null check (doc_type in ('yetki_sozlesmesi', 'aracilik_sozlesmesi', 'yer_gosterme')),
  file_name text not null,
  storage_path text not null unique,
  file_size bigint,
  created_at timestamptz not null default now()
);
create index if not exists office_documents_office_idx on public.office_documents (office_id, created_at desc);

alter table public.office_documents enable row level security;

-- Broker hepsini, danışman (ofisteyken) kendi yüklediklerini görür.
drop policy if exists office_documents_select on public.office_documents;
create policy office_documents_select on public.office_documents for select to authenticated
  using (
    public.is_office_broker(office_id)
    or (uploaded_by = auth.uid() and office_id in (select public.my_office_ids()))
  );
drop policy if exists office_documents_insert on public.office_documents;
create policy office_documents_insert on public.office_documents for insert to authenticated
  with check (uploaded_by = auth.uid() and office_id in (select public.my_office_ids()));
-- Arşiv değiştirilemez; yanlış yüklemeyi sadece broker siler.
drop policy if exists office_documents_broker_delete on public.office_documents;
create policy office_documents_broker_delete on public.office_documents for delete to authenticated
  using (public.is_office_broker(office_id));
grant select, insert, delete on public.office_documents to authenticated;

drop policy if exists office_archive_insert on storage.objects;
create policy office_archive_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'office-archive'
    and ((storage.foldername(name))[1])::uuid in (select public.my_office_ids())
  );
drop policy if exists office_archive_select on storage.objects;
create policy office_archive_select on storage.objects for select to authenticated
  using (
    bucket_id = 'office-archive' and exists (
      select 1 from public.office_documents d
      where d.storage_path = objects.name
        and (public.is_office_broker(d.office_id)
             or (d.uploaded_by = auth.uid() and d.office_id in (select public.my_office_ids())))
    )
  );
drop policy if exists office_archive_delete on storage.objects;
create policy office_archive_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'office-archive'
    and public.is_office_broker(((storage.foldername(name))[1])::uuid)
  );

-- 5 (portföy bulma) Ofiste alıcı talepleri: danışman İSTERSE (varsayılan
-- kapalı) müşterilerinin talep alanları ofise anonim gösterilir. Müşterinin
-- adı/telefonu/notu ASLA dönmez; sadece talep + hangi danışmanda olduğu
-- (ortak satış için birbirini arayabilsinler). customers tablosuna ofis
-- erişimi verilmez - sadece bu SECURITY DEFINER özet.
alter table public.office_members add column if not exists share_demand boolean not null default false;
grant update (share_demand) on public.office_members to authenticated;

create or replace function public.office_demand_board()
returns table (
  agent_id uuid, agent_name text, islem text, bolge text, oda text, mulk_tipi text,
  min_butce numeric, max_butce numeric, last_contact timestamptz
) language sql stable security definer set search_path = public as $$
  select m.user_id, coalesce(nullif(m.display_name, ''), m.email),
    c.custom_fields->>'aranan_islem', c.custom_fields->>'aranan_bolge',
    c.custom_fields->>'aranan_oda_sayisi', c.custom_fields->>'aranan_mulk_tipi',
    case when (c.custom_fields->>'min_butce') ~ '^\d+(\.\d+)?$' then (c.custom_fields->>'min_butce')::numeric end,
    case when (c.custom_fields->>'max_butce') ~ '^\d+(\.\d+)?$' then (c.custom_fields->>'max_butce')::numeric end,
    c.last_contact
  from public.office_members m
  join public.customers c on c.user_id = m.user_id and c.deleted_at is null
  where m.left_at is null and m.share_demand
    and m.office_id in (select public.my_office_ids())
    and coalesce(c.last_contact, c.created_at) >= now() - interval '180 days'
    and (coalesce(c.custom_fields->>'aranan_bolge', '') <> '' or coalesce(c.custom_fields->>'max_butce', '') <> ''
         or coalesce(c.custom_fields->>'aranan_oda_sayisi', '') <> '');
$$;
revoke all on function public.office_demand_board() from public;
grant execute on function public.office_demand_board() to authenticated;
