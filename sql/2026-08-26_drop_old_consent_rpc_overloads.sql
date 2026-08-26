-- 2026-08-26_consent_rpc_ip_param.sql'deki CREATE OR REPLACE, p_ip parametresi
-- eklerken eski 2-parametreli fonksiyonu DEGISTIRMEDI - Postgres imza esitligini
-- parametre sayisina gore ayirdigi icin YENI bir overload olusturdu. Ayni isimle
-- iki farkli imza var olunca PostgREST 2-parametreli bir cagriyi belirsiz bulup
-- "function is not unique" hatasi verebilirdi. Kod tabaninda artik 2-parametreli
-- cagiran hicbir yer yok (portal artik log-client-event Edge Function uzerinden
-- 3 parametreyle geciyor), eski overload'lar kaldirildi.
DROP FUNCTION IF EXISTS public.set_my_marketing_consent(uuid, boolean);
DROP FUNCTION IF EXISTS public.set_my_photo_consent(uuid, boolean);
