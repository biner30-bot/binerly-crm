-- Kapsamlı vardiya sistemi: haftalık tatil (off gün) + izin bakiyesi + izin
-- kayıtları. staff_shifts (2026-07-28) haftalık TEKRARLAYAN saat şablonunu
-- tutuyordu; izin ise doğası gereği TARİH aralığı bazlı (belirli günler), bu
-- yüzden ayrı iki tabloya ihtiyaç var - haftalık şablona eklenemez.

-- 1) staff_shifts: bir günü "haftalık tatil" (örn. her Pazar kapalı) olarak
-- işaretleyebilmek için start/end_time nullable oldu, is_off eklendi.
ALTER TABLE public.staff_shifts ALTER COLUMN start_time DROP NOT NULL;
ALTER TABLE public.staff_shifts ALTER COLUMN end_time DROP NOT NULL;
ALTER TABLE public.staff_shifts ADD COLUMN is_off boolean NOT NULL DEFAULT false;

-- valid_from/valid_to: "kim ne zaman çalışmış" geçmişini gerçekten sorgulanabilir
-- kılmak için basit ekle/sil yerine YARI-AÇIK ARALIK versiyonlama ([valid_from,
-- valid_to) - valid_to null ise hâlâ geçerli). Bir kural değiştirildiğinde eski
-- satır SİLİNMEZ, valid_to bugüne kapatılır ve yeni satır bugünden başlar - böylece
-- "geçen hafta Salı kim çalışıyordu" gibi bir soru, o tarihte weekday'i eşleşen ve
-- valid_from<=tarih<valid_to (veya valid_to null) olan satırlar taranarak
-- yeniden inşa edilebilir (istemci tarafında, ek bir sorgu gerekmeden - zaten
-- tüm satırlar yükleniyor).
ALTER TABLE public.staff_shifts ADD COLUMN valid_from date NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.staff_shifts ADD COLUMN valid_to date;

-- 2) Yıllık izin bakiyesi — kişi başına elle girilen, sürekli takip edilen
-- (otomatik sıfırlanmayan) bir gün sayısı. team_members'a değil ayrı tabloya
-- kondu çünkü işletme sahibinin ("Ben") team_members'ta satırı yok - staff_shifts
-- ile aynı member_id deseni (owner kendi auth.uid()'i, üye team_members.member_id).
CREATE TABLE public.staff_leave_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  member_id uuid NOT NULL,
  annual_leave_days numeric NOT NULL DEFAULT 14,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, member_id)
);

ALTER TABLE public.staff_leave_balances ENABLE ROW LEVEL SECURITY;

-- Prim/koltuk kirası (team_members) ile aynı gizlilik düzeyi: sahip TÜM takımın
-- izin verisini görür/yönetir, normal bir üye ise SADECE KENDİ satırını - vardiya
-- (staff_shifts) gibi tüm ekibe açık DEĞİL, izin/bakiye kişisel/İK bilgisi sayılır.
CREATE POLICY staff_leave_balances_access ON public.staff_leave_balances
  FOR ALL USING (user_id = auth.uid() OR (user_id IN (SELECT my_team_ids()) AND member_id = auth.uid()))
  WITH CHECK (user_id = auth.uid() OR (user_id IN (SELECT my_team_ids()) AND member_id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_leave_balances TO authenticated;

-- 3) İzin kayıtları — yıllık izin, ücretsiz izin, raporlu/sağlık izni, mazeret
-- izni, diğer. Sadece "yillik" tipi staff_leave_balances'tan düşülür (istemci
-- tarafında hesaplanır - gün sayısı için ayrı bir kolon tutulmuyor, start/end_date
-- farkından çıkarılıyor).
CREATE TABLE public.staff_leave_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  member_id uuid NOT NULL,
  leave_type text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.staff_leave_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_leave_records_access ON public.staff_leave_records
  FOR ALL USING (user_id = auth.uid() OR (user_id IN (SELECT my_team_ids()) AND member_id = auth.uid()))
  WITH CHECK (user_id = auth.uid() OR (user_id IN (SELECT my_team_ids()) AND member_id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_leave_records TO authenticated;
