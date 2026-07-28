-- team_members RLS'i sadece owner (team_id = auth.uid()) tüm takımı, üye
-- (member_id = auth.uid()) ise sadece KENDİ satırını görebiliyor — normal bir
-- çalışan diğer takım arkadaşlarının adını hiç göremiyordu: "Sorumlu"
-- dropdown'u kendisi dışında boş kalıyordu, Vardiya'da da kimin hangi saatte
-- çalıştığı isimle gösterilemiyordu (bkz. project_binerly_team_members_update_gotcha).
--
-- Prim %/koltuk kirası/ayar yetkisi gibi hassas alanları hiç açmadan, sadece
-- kimlik bilgisini (id + isim + e-posta) döndüren dar kapsamlı bir
-- SECURITY DEFINER fonksiyon — team_members'a genel bir SELECT policy
-- eklemek yerine bilinçli olarak bu daha dar yol seçildi.
CREATE OR REPLACE FUNCTION public.team_roster()
RETURNS TABLE(member_id uuid, name text, email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT tm.member_id, tm.name, tm.email
  FROM public.team_members tm
  WHERE tm.team_id = auth.uid() OR tm.team_id IN (SELECT my_team_ids());
$$;

GRANT EXECUTE ON FUNCTION public.team_roster() TO authenticated;
