-- Kaynaklar (Cihaz/Oda) — Güzellik & Bakım gibi sektörlerde randevunun
-- Müşteri + Personel'in yanında üçüncü boyutu: isimlendirilmiş TEKİL bir
-- kaynak (örn. "Lazer Cihazı 1", "Oda 2"), aynı anda sadece BİR randevuda
-- olabilir. room_inventory (Otel) BİLEREK kullanılmadı - o tip+adet bazlı
-- bir stok/tarih-aralığı modeli, burada SAAT bazlı tekil kaynak çakışması
-- gerekiyor - farklı problem, farklı tablo.
CREATE TABLE public.resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY resources_team_access ON public.resources
  FOR ALL USING (user_id = auth.uid() OR user_id IN (SELECT my_team_ids()))
  WITH CHECK (user_id = auth.uid() OR user_id IN (SELECT my_team_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resources TO authenticated;
