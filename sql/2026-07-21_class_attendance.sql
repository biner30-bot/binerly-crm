-- Ders yoklaması (Geldi/Gelmedi) — Ajanda'dan bir ders gününe tıklayınca
-- kayıtlı üyeler için katılım kaydı. Üyelik (ongoing roster) ile "o gün
-- gerçekten geldi mi" (attendance) ayrımı için.

CREATE TABLE public.class_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  group_class_id uuid NOT NULL REFERENCES public.group_classes(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  occurrence_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('geldi','gelmedi')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_class_id, customer_id, occurrence_date)
);
ALTER TABLE public.class_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY class_attendance_select ON public.class_attendance FOR SELECT
  USING (user_id = auth.uid() OR user_id IN (SELECT team_id FROM public.team_members WHERE member_id = auth.uid()));
CREATE POLICY class_attendance_insert ON public.class_attendance FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id IN (SELECT team_id FROM public.team_members WHERE member_id = auth.uid()));
CREATE POLICY class_attendance_update ON public.class_attendance FOR UPDATE
  USING (user_id = auth.uid() OR user_id IN (SELECT team_id FROM public.team_members WHERE member_id = auth.uid()))
  WITH CHECK (user_id = auth.uid() OR user_id IN (SELECT team_id FROM public.team_members WHERE member_id = auth.uid()));
CREATE POLICY class_attendance_delete ON public.class_attendance FOR DELETE
  USING (user_id = auth.uid() OR user_id IN (SELECT team_id FROM public.team_members WHERE member_id = auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_attendance TO authenticated;
-- service_role GRANT gerekmiyor — sadece client (authenticated) erişiyor, hiçbir api/*.js dokunmuyor.
