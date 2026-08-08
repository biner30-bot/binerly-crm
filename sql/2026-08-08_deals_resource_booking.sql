-- Randevu tarihi/saati custom_fields[dateTimeKey] içinde ve dateTimeKey
-- sektöre göre değişken olduğu için Postgres GENERATED COLUMN doğrudan
-- custom_fields'tan üretilemiyor. Bunun yerine: uygulama kodu (App.jsx
-- upsertDeal + api/appointment-availability.js handleBooking + api/lead-
-- capture.js) SADECE iki sabit-isimli skaler kolonu (appointment_start/
-- appointment_end) açıkça yazar - dinamik anahtarı çözme sorumluluğu hâlâ
-- uygulamada. appointment_range'in KENDİSİ ise bu iki sabit kolondan artık
-- saf/deterministik bir fonksiyon olduğu için GERÇEK bir GENERATED COLUMN
-- olabiliyor - "start/end senkron tut" görevi uygulamada, "range'i hesapla"
-- görevi DB'de, hiçbir yerde iki kez yazılan/unutulabilecek mantık yok.
ALTER TABLE public.deals ADD COLUMN resource_unit_id uuid NULL
  REFERENCES public.resource_units(id) ON DELETE SET NULL;
ALTER TABLE public.deals ADD COLUMN appointment_start timestamptz NULL;
ALTER TABLE public.deals ADD COLUMN appointment_end timestamptz NULL;
ALTER TABLE public.deals ADD COLUMN appointment_range tstzrange
  GENERATED ALWAYS AS (
    CASE WHEN appointment_start IS NOT NULL AND appointment_end IS NOT NULL
      THEN tstzrange(appointment_start, appointment_end, '[)')
      ELSE NULL END
  ) STORED;

-- Bir kaynak birimi atanmışsa aralığın da dolu olması zorunlu - aksi halde
-- EXCLUDE constraint'in WHERE koşulu resource_unit_id dolu ama range NULL olan
-- bozuk bir satırı sessizce garantisiz bırakırdı.
ALTER TABLE public.deals ADD CONSTRAINT deals_resource_needs_range
  CHECK (resource_unit_id IS NULL OR (appointment_start IS NOT NULL AND appointment_end IS NOT NULL));

-- ASIL GARANTİ: aynı kaynak biriminde çakışan iki AKTİF (silinmemiş, kaybedilmemiş)
-- randevu aynı anda var olamaz. Personel (assigned_to) bilerek burada YOK -
-- Aşama 1 sadece oda/cihaz, personel DB garantisi vardiya sistemiyle birlikte
-- Aşama 2'ye bırakıldı.
ALTER TABLE public.deals ADD CONSTRAINT deals_resource_unit_no_overlap
  EXCLUDE USING gist (resource_unit_id WITH =, appointment_range WITH &&)
  WHERE (resource_unit_id IS NOT NULL AND deleted_at IS NULL AND stage <> 'kaybedildi');

-- Bir kaynak biriminin verilen aralıkta boş olup olmadığını bulan tek ortak
-- fonksiyon - App.jsx (CRM, authenticated), api/appointment-availability.js
-- ve api/lead-capture.js (widget/portal, service_role) ÜÇÜ DE bunu RPC ile
-- çağırır; anti-join'i üç yerde ayrı ayrı JS'de tekrar yazmak yerine tek
-- kaynaktan yönetilir. SECURITY DEFINER DEĞİL (invoker) - authenticated için
-- RLS doğal olarak kendi takımına daraltır, service_role zaten RLS'i atlar.
-- p_exclude_deal_id: DÜZENLENEN randevunun kendi eski satırını "dolu" sayıp
-- kendi kendine "yer yok" dememesi için.
CREATE OR REPLACE FUNCTION public.pick_free_resource_unit(
  p_resource_id uuid, p_start timestamptz, p_end timestamptz, p_exclude_deal_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT ru.id
  FROM public.resource_units ru
  WHERE ru.resource_id = p_resource_id
    AND ru.active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.resource_unit_id = ru.id
        AND d.deleted_at IS NULL
        AND d.stage <> 'kaybedildi'
        AND (p_exclude_deal_id IS NULL OR d.id <> p_exclude_deal_id)
        AND d.appointment_range && tstzrange(p_start, p_end, '[)')
    )
  ORDER BY ru.unit_index
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.pick_free_resource_unit(uuid, timestamptz, timestamptz, uuid) TO authenticated, service_role;

-- Mevcut satırlardan appointmentDateTimeKey'i çözülebilenler için
-- appointment_start/appointment_end best-effort dolduruluyor (resource_unit_id
-- HİÇBİRİNDE dolmuyor - resources bugün boş, geçmişte gerçek atama yok, bu
-- yüzden EXCLUDE CONSTRAINT eklenirken hiçbir satır çakışma riski taşımıyor).
DO $$
DECLARE
  r RECORD;
  dt_key text;
  raw_dt text;
  dur int;
  start_ts timestamptz;
BEGIN
  FOR r IN SELECT id, user_id, custom_fields FROM public.deals WHERE deleted_at IS NULL LOOP
    SELECT key INTO dt_key FROM public.custom_field_defs
      WHERE user_id = r.user_id AND entity = 'deal' AND field_type = 'datetime' AND active = true
      LIMIT 1;
    IF dt_key IS NULL THEN CONTINUE; END IF;
    raw_dt := r.custom_fields ->> dt_key;
    IF raw_dt IS NULL OR length(raw_dt) < 16 THEN CONTINUE; END IF;
    BEGIN
      start_ts := (left(raw_dt, 16) || ':00+03:00')::timestamptz;
    EXCEPTION WHEN others THEN CONTINUE;
    END;
    dur := GREATEST(COALESCE((r.custom_fields ->> 'duration_minutes')::int, 1), 1);
    UPDATE public.deals
      SET appointment_start = start_ts, appointment_end = start_ts + (dur || ' minutes')::interval
      WHERE id = r.id;
  END LOOP;
END $$;
