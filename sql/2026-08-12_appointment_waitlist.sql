-- Tekli randevu sektörlerinde (Güzellik & Bakım, Sağlık/Klinik) bir gün tamamen
-- doluysa müşteri "bu gün için beni haberdar et" diyebilsin diye - grup dersi
-- Yedek Liste'siyle AYNI ilke (açık rızalı, sadece kendi isteğiyle yazılanlar
-- bildirim alır). App.jsx'teki freedAppointmentAlerts KASITLI OLARAK aday
-- müşteri önermiyordu (doğrulanmamış eşleştirme riski, bkz.
-- feedback_portal_privacy_priority) - bu tablo o riski TAŞIMAZ çünkü eşleştirme
-- müşterinin kendi rızasına dayanıyor, sistemin tahminine değil.
CREATE TABLE public.appointment_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  requested_date date NOT NULL,
  notified_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.appointment_waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY appointment_waitlist_team_access ON public.appointment_waitlist
  FOR ALL USING (user_id = auth.uid() OR user_id IN (SELECT my_team_ids()))
  WITH CHECK (user_id = auth.uid() OR user_id IN (SELECT my_team_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_waitlist TO authenticated;
-- service_role GRANT tuzağı (bkz. CLAUDE.md): api/lead-capture.js (widget'tan
-- kayıt) ve api/send-reminders.js (günlük bildirim taraması) bu tabloyu
-- service_role ile kullanacak - önceki oturumda attachments'ta yaşanan
-- "sessiz boş sonuç" tuzağına düşmemek için baştan verildi.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_waitlist TO service_role;
