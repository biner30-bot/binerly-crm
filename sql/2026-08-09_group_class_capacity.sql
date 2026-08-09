-- Grup dersi kapasitesi (group_classes.capacity) şu ana kadar SADECE client-side
-- kontrol ediliyordu - enrollMember (App.jsx) ve enrollInClass (CustomerPortal.jsx)
-- "şu an bellekteki kayıt sayısı >= capacity mi" diye bakıp düz bir .insert()
-- atıyordu. KOBİ + portal üyesi (veya iki portal sekmesi) aynı anda kaydolursa
-- ikisi de "yer var" görüp kapasiteyi aşan iki kayıt oluşturabiliyordu.
--
-- resources/concurrency_slots'taki zaman-aralığı bazlı EXCLUDE CONSTRAINT deseni
-- burada uygun değil - kayıt bir zaman aralığı değil, dersin TOPLAM üye sayısı.
-- Bunun yerine standart Postgres "toplam sayı sınırı" deseni: INSERT anında
-- group_classes satırını kilitleyip (SELECT ... FOR UPDATE) sayan bir trigger -
-- kilit, aynı derse eşzamanlı gelen ikinci INSERT'i birincisi COMMIT olana kadar
-- serileştirir, bu yüzden sayım asla bayat olmaz.
CREATE OR REPLACE FUNCTION public.enforce_group_class_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  class_capacity integer;
  current_count integer;
BEGIN
  SELECT capacity INTO class_capacity
  FROM public.group_classes
  WHERE id = NEW.group_class_id
  FOR UPDATE;

  IF class_capacity IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO current_count
  FROM public.group_class_enrollments
  WHERE group_class_id = NEW.group_class_id;

  IF current_count >= class_capacity THEN
    -- Mesaj bilinçli olarak enrollMember/enrollInClass'ın client-side ön-kontrol
    -- metniyle ("Bu ders dolu.") birebir aynı - ikisi de hata mesajını olduğu
    -- gibi (bir önek ekleyerek) kullanıcıya gösteriyor, ayrı bir metin gerekmez.
    RAISE EXCEPTION 'Bu ders dolu.';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.enforce_group_class_capacity() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER group_class_enrollments_capacity_check
  BEFORE INSERT ON public.group_class_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_group_class_capacity();

-- Aynı müşteri aynı derse iki kez kaydolamaz - client zaten kontrol ediyordu
-- ("Bu müşteri zaten kayıtlı."/"Zaten kayıtlısınız."), artık DB'de de garanti
-- (aynı yarış durumu riski: iki eşzamanlı istek ikisi de "kayıtlı değil" görebilir).
ALTER TABLE public.group_class_enrollments
  ADD CONSTRAINT group_class_enrollments_unique_member UNIQUE (group_class_id, customer_id);
