-- Elle eklenen tahsilatlarda (online iyzico/PayTR ödemelerinde provider zaten
-- var) "nakit mi kart mı" diye bir alan hiç yoktu - sadece serbest metin not
-- alanına yazılabiliyordu. Opsiyonel, boş bırakılırsa (mevcut tüm kayıtlar
-- dahil) hiçbir şey değişmez.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS method text NULL;
