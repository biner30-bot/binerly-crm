-- Paralel yapılabilen hizmetler (örn. manikür yapılırken kaş lifting) -
-- KOBİ aynı grup adını birden fazla hizmete verirse, bu hizmetler bir
-- randevuda birlikte seçildiğinde eşzamanlı yapılıyor kabul edilir: randevu
-- süresi (dolayısıyla kaynak/personel çakışma kontrolü) toplanmaz, en uzun
-- süren hizmet baz alınır. Farklı gruptaki ya da grupsuz hizmetler eskisi
-- gibi ardışık (toplanarak) hesaplanmaya devam eder - bkz.
-- src/Deals.jsx:lineItemsDurationMinutes ve eşdeğerleri.
ALTER TABLE public.price_list_items ADD COLUMN parallel_group text;
