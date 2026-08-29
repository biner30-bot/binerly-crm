-- api/lead-capture.js POST'u (herkese açık lead / randevu-al widget'i) form
-- spam'ine karsi IP basina saatlik tavan uyguluyor. Vercel serverless
-- fonksiyonlari durumsuz oldugu icin sayaci ortak bir yerde tutmak lazim -
-- ayri (parali) bir Redis yerine mevcut Postgres'te kucuk bir log tablosu.
-- Sadece service_role dokunur; KOBI'nin bunu gormesine gerek yok.
CREATE TABLE public.lead_capture_rate_limit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- "bu IP'den son 1 saatte kac istek" sorgusu icin.
CREATE INDEX lead_capture_rate_limit_ip_time
  ON public.lead_capture_rate_limit (ip, created_at DESC);

-- RLS acik + hic policy yok => anon/authenticated hicbir sey goremez,
-- service_role (RLS'i baypas eder) sadece kendi grant'iyla erisir.
ALTER TABLE public.lead_capture_rate_limit ENABLE ROW LEVEL SECURITY;

-- service_role GRANT tuzagi (bkz. CLAUDE.md): bu tablo service_role ile ILK KEZ
-- okundugunda grant eksikse sessizce bos doner - bastan veriliyor.
GRANT SELECT, INSERT, DELETE ON public.lead_capture_rate_limit TO service_role;
