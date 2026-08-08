-- Randevu Sistemi Aşama 2: personel (assigned_to) için veritabanı seviyesinde
-- çakışma garantisi - Aşama 1'de (sql/2026-08-08_deals_resource_booking.sql)
-- oda/cihaz için eklenen deals_resource_unit_no_overlap ile BİREBİR AYNI desen,
-- aynı appointment_range generated column'u kullanılıyor. Yeni kolon gerekmiyor.
--
-- assigned_to genel bir "sorumlu kişi" alanı (randevu dışı tekliflerde de
-- doluyor, Personel Performansı/komisyon raporlaması için) - bu yüzden WHERE
-- koşulu appointment_range'in (yani gerçek bir randevu tarihi/saatinin) dolu
-- olmasını şart koşuyor, ham assigned_to varlığına bakmıyor.
--
-- Migration öncesi üretim verisinde personel bazında hiçbir zaman çakışması
-- olmadığı doğrudan SQL ile doğrulandı (EXCLUDE CONSTRAINT'ler NOT VALID
-- desteklemiyor, mevcut satırları anında doğruluyor).
ALTER TABLE public.deals ADD CONSTRAINT deals_assigned_to_no_overlap
  EXCLUDE USING gist (
    assigned_to WITH =,
    appointment_range WITH &&
  ) WHERE (assigned_to IS NOT NULL AND deleted_at IS NULL AND stage <> 'kaybedildi');
