-- price_list_items'a service_role hiç SELECT GRANT'i almamıştı (sadece
-- TRIGGER/REFERENCES/TRUNCATE vardı) — bu tabloya kadar hiçbir api/*.js
-- (service_role) bu tablodan okumamıştı, api/lead-capture.js'in GET dalı
-- (/randevu-al/{token} widget'ı için hizmet listesi) ilk kez okudu ve
-- sessizce boş sonuç aldı (RLS'i atlasa bile GRANT olmadan tablo görünmüyor,
-- hata da fırlatmıyor). Aynı sınıf bug: bkz. [[project_binerly_service_role_grant_gotcha]].
GRANT SELECT ON public.price_list_items TO service_role;
