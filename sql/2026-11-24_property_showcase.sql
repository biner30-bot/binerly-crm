-- Emlak Faz 5: portfoyun herkese acik Vitrin sayfasinda yayinlanmasi. Varsayilan
-- kapali (opt-in) - danisman ilan bazinda acar. api/lead-capture.js (view=vitrin)
-- service_role ile okuyup SADECE guvenli alanlari dondurur: adres, ada/parsel,
-- mal sahibi ve property_private hicbir zaman yayinlanmaz.
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS showcase_visible boolean NOT NULL DEFAULT false;
