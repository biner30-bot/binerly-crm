-- Randevu musaitligi neye gore hesaplansin: KOBI secimi. Su ana kadar musaitlik
-- HER ZAMAN business_hours (Musaitlik Saatleri) tablosuna gore hesaplaniyordu;
-- staff_shifts (Personel Vardiyalari) musteri tarafini hic etkilemiyordu (sadece
-- CRM'de Sorumlu atanmis randevularda findAppointmentConflict bakiyordu).
--
-- 'shifts' secilirse: slotlar sadece en az bir personelin vardiyada oldugu
-- saatlerde acilir, her saatteki kapasite = o an vardiyada olan (+ hizmeti
-- yapabilen + o gun izinli olmayan) personel sayisi (appointment_concurrency
-- ust tavan olarak kalir). O haftagunu hic vardiya girilmemisse otomatik
-- business_hours'a duser (effectiveStaffWindows'taki mevcut "personel yoksa
-- musaitlik saatleri" kurali). Mola zaten ayri vardiya satiri oldugu icin
-- otomatik haric kalir.
ALTER TABLE public.company_settings
  ADD COLUMN appointment_availability_source text NOT NULL DEFAULT 'business_hours'
  CHECK (appointment_availability_source IN ('business_hours', 'shifts'));

-- api/appointment-availability.js + api/lead-capture.js + api/deal-approval.js
-- bunlari supabaseAdmin (service_role) ile okuyacak. staff_shifts service_role
-- SELECT'e zaten sahip (sql/2026-07-28_staff_shifts.sql). staff_leave_records
-- ise su ana kadar sadece authenticated'a acikti - tarih bazli izinlerin
-- (yillik/raporlu) musteri musaitligine yansimasi icin service_role okumasi
-- gerekiyor.
GRANT SELECT ON public.staff_leave_records TO service_role;
