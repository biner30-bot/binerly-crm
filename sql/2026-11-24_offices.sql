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
