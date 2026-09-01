-- api/lead-capture.js + api/appointment-availability.js daha once deals.kdv_rate'i
-- hic set etmiyordu -> DB varsayilani 20 kaliyordu, KOBI'nin
-- company_settings.default_kdv_rate ayarini yok sayiyordu (commit 0fa3928 duzeltti).
--
-- Bu tek seferlik geriye donuk duzeltme: o bug'dan once olusmus, KOBI'nin
-- varsayilani 20 DEGIL ama kdv_rate hala 20 olan online (widget/portal) randevu
-- kayitlarini varsayilana ceker.
--
-- kdv_rate = 20 kosulu bilincli: KOBI bir online randevuyu ELLE farkli bir orana
-- (0/1/10) ayarladiysa dokunulmaz - sadece "hic dokunulmamis, bug'dan kalma 20"
-- degerleri hedeflenir. Tutar zaten KDV dahil, musterinin odedigi degismez;
-- sadece PDF / KDV Ozet Raporu'ndaki net/KDV ayrimi duzelir (kazanilmis, zaten
-- beyan edilmis bir ayi da geriye donuk etkiler - kullanici bunu bilerek istedi).
update public.deals d
set kdv_rate = cs.default_kdv_rate
from public.company_settings cs
where cs.user_id = d.user_id
  and d.deleted_at is null
  and d.kdv_rate = 20
  and cs.default_kdv_rate <> 20
  and (d.custom_fields->>'kaynak') in ('randevu_widget', 'randevu_widget_talep', 'portal', 'portal_talep');
