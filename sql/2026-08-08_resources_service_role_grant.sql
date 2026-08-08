-- resources tablosu service_role'e hiç SELECT/INSERT/UPDATE grant'i almamıştı
-- (bkz. price_list_items_service_role_grant.sql'deki AYNI sınıf hata) -
-- api/appointment-availability.js ve api/lead-capture.js (service_role ile
-- çalışıyor) otomatik oda/cihaz ataması için bu tabloyu okumak zorunda,
-- GRANT olmadan sessizce boş sonuç alırlardı.
GRANT SELECT ON public.resources TO service_role;
