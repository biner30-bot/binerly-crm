-- "Randevu Alma Linki" icin ikinci mod: musteri boanlik saatlerini gormeden
-- (rakip/ziyaretci doluluk gormesin diye) gun + sirali saat tercihi gonderir,
-- KOBI uygun olani secip tek saatlik bir teklif yollar, musteri tek tikla
-- onaylar/reddeder. Mevcut "realtime" (anlik musaitlik goster) modu hic
-- degismeden kalir - bu sadece KOBI'nin secebilecegi ikinci bir davranis.

alter table public.company_settings
  add column appointment_widget_mode text not null default 'realtime'
    check (appointment_widget_mode in ('realtime', 'request_only')),
  add column appointment_offer_validity_hours integer not null default 24
    check (appointment_offer_validity_hours > 0);

-- appointment_offer_time/expires_at/status SADECE request_only akisinda
-- kullanilir - KOBI'nin musteriye onerdigi TEK saat + linkin gecerlilik
-- suresi + o teklifin son durumu. Onay/red, deals.approval_token'i (mevcut
-- teklif-onay/kapora akisiyla AYNI kolon, ayni unique index) yeniden
-- kullanir - deal bu akisla es zamanli baska bir approval_token akisinda
-- olamayacagi icin (farkli deal turleri) cakisma riski yok.
alter table public.deals
  add column appointment_offer_time timestamptz,
  add column appointment_offer_expires_at timestamptz,
  add column appointment_offer_status text
    check (appointment_offer_status in ('sent', 'confirmed', 'declined', 'expired'));
