-- Emlak Faz 2: mulk alanlari tekliften Portfoy kartina tasindi (deals.property_id).
-- Sectors.jsx emlak preset'inden cikarildi; mevcut hesaplarda aktif kalan tanimlar
-- burada pasife aliniyor - SILINMIYOR, eski tekliflerdeki degerler custom_fields'te
-- durur ve "Varsayilan Ozel Alanlara Don" artik onlari geri getirmez.
UPDATE public.custom_field_defs
SET active = false
WHERE entity = 'deal'
  AND sector = 'emlak'
  AND key IN ('mulk_tipi', 'islem_turu', 'metrekare', 'bolge', 'oda_sayisi', 'ilan_no')
  AND active = true;
