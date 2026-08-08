-- Hizmet <-> Kaynak (Cihaz/Oda) eşleştirmesi. Şu ana kadar resources
-- (Ayarlar -> Müsaitlik Saatleri -> Kaynaklar) hiçbir hizmetle bağlantılı
-- değildi - CRM'de her randevuda kaynak elle seçiliyordu, widget/portalda ise
-- sadece işletmenin TOPLAM 1 aktif kaynağı varsa otomatik atama yapılıyordu
-- (api/appointment-availability.js:resolveAutoAssignResource). 2+ kaynağı
-- olan işletmelerde hangi hizmetin hangi kaynağı gerektirdiği bilinmediği
-- için hiç otomatik atama yapılmıyordu.
--
-- ON DELETE SET NULL - bir kaynak silinirse eşleştirme sessizce temizlenir,
-- hizmet kaydı bozulmaz (ResourceManager'daki "silinirse geçmiş kayıtlar
-- etkilenmez" felsefesiyle aynı).
ALTER TABLE public.price_list_items
  ADD COLUMN resource_id uuid REFERENCES public.resources(id) ON DELETE SET NULL;
