-- Gorevler icin Cop Kutusu "Kalici Olarak Sil" - 2026-08-01_trash_permanent_delete.sql
-- ile AYNI desen: tasks_team_access (Faz 1, FOR ALL PERMISSIVE) takim uyelerinin de
-- soft-delete/DELETE yapmasina izin veriyor - gercek "sadece sahip" kisitlamasi icin
-- RESTRICTIVE policy sart (permissive'ler OR ile, restrictive AND ile birlesir).
-- GRANT DELETE zaten Faz 1 migration'inda verildi, tekrar gerekmiyor.

CREATE POLICY permanent_delete_owner_tasks ON public.tasks FOR DELETE TO authenticated
  USING (deleted_at IS NOT NULL AND user_id = auth.uid());
CREATE POLICY permanent_delete_restrict_tasks ON public.tasks AS RESTRICTIVE FOR DELETE TO authenticated
  USING (deleted_at IS NOT NULL AND user_id = auth.uid());
