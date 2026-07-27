-- Personel vardiya sistemi — business_hours'un personel bazlı eşi. member_id,
-- team_members.member_id VEYA sahibin kendi auth id'si ("Ben") olabilir; deals.assigned_to
-- gibi bilerek FK'siz (üye takımdan çıkarılınca eski vardiya satırı sessizce anlamsızlaşır,
-- silinmesi gerekmez).
CREATE TABLE public.staff_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  member_id uuid NOT NULL,
  weekday int2 NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_shifts_team_access ON public.staff_shifts
  FOR ALL USING (user_id = auth.uid() OR user_id IN (SELECT my_team_ids()))
  WITH CHECK (user_id = auth.uid() OR user_id IN (SELECT my_team_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_shifts TO authenticated;
-- api/appointment-availability.js bunu supabaseAdmin (service_role) ile okuyacak.
GRANT SELECT ON public.staff_shifts TO service_role;
