-- Daha önce "portaldan kendi alınan randevu/üyelik/rezervasyonlarda onay
-- kavramı yok" diye approved_at hiç set edilmiyordu (api/deal-approval.js).
-- Bu kural kaldırıldı: ödeyen müşteri kaynağı ne olursa olsun onaylamış
-- sayılır. Bu, sadece YENİ ödemeler için geçerli olan kod değişikliği —
-- zaten ödenmiş ama approved_at'i hâlâ boş olan eski kayıtları geriye
-- dönük düzeltir.
UPDATE public.deals
SET approved_at = COALESCE(closed_at, created_at)
WHERE payment_status = 'paid'
  AND approved_at IS NULL
  AND deleted_at IS NULL;
