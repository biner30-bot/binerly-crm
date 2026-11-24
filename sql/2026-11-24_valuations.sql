-- Kayıtlı piyasa analizleri. Kişiye özel: sadece oluşturan danışman görür
-- (ofis/ekip paylaşımı ayrıca planlanacak; paylaşım şimdilik PDF ile).
create table if not exists public.valuations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  property_id uuid references public.properties (id) on delete set null,
  title text not null default '',
  subject jsonb not null default '{}'::jsonb,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists valuations_created_by_idx on public.valuations (created_by, updated_at desc);

alter table public.valuations enable row level security;

drop policy if exists valuations_owner_all on public.valuations;
create policy valuations_owner_all on public.valuations
  for all to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

grant select, insert, update, delete on public.valuations to authenticated;

-- Otomatik kayıt: yeterince bilgi girilen analiz "taslak" olarak düşer,
-- "Analizi kaydet" / PDF ile "kaydedildi" olur.
alter table public.valuations add column if not exists status text not null default 'kaydedildi'
  check (status in ('taslak', 'kaydedildi'));
