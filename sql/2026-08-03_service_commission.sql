-- Prim/hakediş şimdiye kadar personel başına TEK bir sabit yüzdeydi
-- (team_members.commission_percent) - "lazerde %5, cilt bakımında %10" gibi
-- hizmet türüne göre değişen oranlar desteklenmiyordu. Bu, o oranı fiyat
-- listesi kalemine (price_list_items) BAĞLAMA imkanı ekliyor - boşsa (mevcut
-- tüm kalemlerde varsayılan) personelin genel oranı geçerli olmaya devam
-- eder, hiçbir mevcut hesaplama değişmez.
ALTER TABLE public.price_list_items ADD COLUMN IF NOT EXISTS commission_percent numeric NULL;
