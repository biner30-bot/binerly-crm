-- Portföy adayları: Sahibinden'de sahibinden (aracısız) satılan/kiralanan
-- ilanlar. Danışman arama sonuç sayfasını kendisi yapıştırır (kazıma yok);
-- telefon/kişisel iletişim SAKLANMAZ (liste sayfasında yok, ilan sayfasından
-- danışman kendisi bakar). Kişiye özel: sadece ekleyen danışman görür.
create table if not exists public.listing_prospects (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  listing_no text not null check (listing_no ~ '^\d{7,12}$'),
  title text not null default '',
  city text not null default '',
  district text not null default '',
  neighborhood text not null default '',
  property_type text not null default 'Daire',
  transaction_type text not null default 'satilik' check (transaction_type in ('satilik', 'kiralik')),
  m2 numeric,
  rooms text not null default '',
  age_band text,
  price numeric,
  first_price numeric,
  -- [{date, price}] - her yapıştırmada fiyat değiştiyse eklenir (fiyat düşüren satıcı motivedir)
  price_history jsonb not null default '[]'::jsonb,
  listing_date date,
  first_seen date not null default current_date,
  last_seen date not null default current_date,
  status text not null default 'yeni'
    check (status in ('yeni', 'aranacak', 'arandi', 'gorusuldu', 'yetki_alindi', 'istemiyor', 'yayindan_kalkti')),
  note text not null default '',
  property_id uuid references public.properties (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, listing_no)
);

create index if not exists listing_prospects_owner_idx on public.listing_prospects (created_by, last_seen desc);

alter table public.listing_prospects enable row level security;
drop policy if exists listing_prospects_owner_all on public.listing_prospects;
create policy listing_prospects_owner_all on public.listing_prospects for all to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());
grant select, insert, update, delete on public.listing_prospects to authenticated;
