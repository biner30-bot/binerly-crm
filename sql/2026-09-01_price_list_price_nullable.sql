-- price_list_items.price artik opsiyonel (NULL kabul eder). Neden: hizmetlerini
-- listelemek isteyen ama fiyatlarini herkese acik gostermek istemeyen KOBI'ler
-- var ("fiyat icin iletisime gecin" mantigi). Bu ana kadar price NOT NULL'di ve
-- form bos fiyati engelliyordu, tek cikis 0 TL yazmakti - o da widget/portal/
-- vitrinde "Ucretsiz" olarak gorunuyordu.
--
-- Uc durum ayrimi (istemci tarafinda uygulanir):
--   price > 0   -> normal fiyatli hizmet
--   price = 0   -> "Ucretsiz" (yesil vurgulu buton - mevcut ozellik, degismedi)
--   price IS NULL -> fiyat belirtilmemis (musteriye fiyat GOSTERILMEZ, "Ucretsiz"
--                    DE denmez)
--
-- GRANT/RLS: kolon tipi degismiyor, sadece NOT NULL kalkiyor - mevcut politika
-- ve GRANT'lar aynen gecerli.
ALTER TABLE public.price_list_items
  ALTER COLUMN price DROP NOT NULL;
