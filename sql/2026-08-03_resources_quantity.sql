-- Kaynaklar (Cihaz/Oda) artık isim başına adet de taşıyabiliyor - "Lazer
-- Cihazı" adında 2 fiziksel cihaz varsa, personel hangisinin kullanıldığını
-- ayrıca belirtmek zorunda kalmadan aynı anda 2 randevuya izin verilir
-- (Otel'in room_inventory adet mantığıyla aynı desen, ama SAAT bazlı).
-- Mevcut kaynaklar quantity=1 ile devam eder - eski "tekil kaynak" davranışı
-- birebir korunur, geriye dönük hiçbir şey bozulmaz.
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;
