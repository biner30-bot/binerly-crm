-- Fiyat Listesi, Stok & Malzeme ve Özel Alanlar listelerinde elle sıralama
-- (sürükle-bırak + yukarı/aşağı/en-üste-taşı butonları) için sort_order kolonu.

alter table public.price_list_items add column sort_order integer not null default 0;
alter table public.stock_items add column sort_order integer not null default 0;

-- Mevcut kayıtları şu anki görünür sıraya göre (isme göre alfabetik) doldur,
-- her ekip kendi içinde 0'dan başlasın
update public.price_list_items p set sort_order = sub.rn - 1
from (select id, row_number() over (partition by user_id order by name) as rn from public.price_list_items) sub
where sub.id = p.id;

update public.stock_items s set sort_order = sub.rn - 1
from (select id, row_number() over (partition by user_id order by name) as rn from public.stock_items) sub
where sub.id = s.id;

-- custom_field_defs.sort_order zaten var ama hep 0 (sabit default, sequence değil) -
-- entity bazında oluşturulma sırasına göre gerçek bir başlangıç sırası ver
update public.custom_field_defs d set sort_order = sub.rn - 1
from (select id, row_number() over (partition by user_id, entity order by created_at) as rn from public.custom_field_defs) sub
where sub.id = d.id;
