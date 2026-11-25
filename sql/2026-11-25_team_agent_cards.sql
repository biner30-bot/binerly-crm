-- Emlak raporlarındaki "Danışmanınız" kartı: portföy başka bir takım üyesine
-- (ya da takım sahibine) atanmışsa kartta o kişinin profil bilgisi olmalı.
-- Profil (telefon/unvan/fotoğraf/hakkımda) auth.users.raw_user_meta_data'da,
-- istemci başka kullanıcınınkini okuyamıyor; kart sadece ad+e-postayla
-- çıkıyordu, sahibe atanmış portföyde ise raporu AÇAN kişi yazıyordu.
--
-- team_roster() bilerek değiştirilmedi (sahibi içermiyor, sayımı birçok yerde
-- kullanılıyor). Burada sahip + üyeler, sadece müşteriye zaten gösterilmek
-- üzere girilmiş profil alanları - aynı takımdakiler dışında kimse göremez.
CREATE OR REPLACE FUNCTION public.team_agent_cards()
RETURNS TABLE(user_id uuid, name text, email text, phone text, title text, photo_url text, about text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH teams AS (
    SELECT auth.uid() AS team_id
    UNION
    SELECT t FROM my_team_ids() t
  ),
  people AS (
    SELECT team_id AS uid FROM teams
    UNION
    SELECT tm.member_id FROM public.team_members tm JOIN teams ON teams.team_id = tm.team_id
  )
  SELECT u.id,
         COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), tm.name),
         u.email::text,
         u.raw_user_meta_data->>'contact_phone',
         u.raw_user_meta_data->>'job_title',
         u.raw_user_meta_data->>'avatar_url',
         u.raw_user_meta_data->>'about'
  FROM people
  JOIN auth.users u ON u.id = people.uid
  LEFT JOIN LATERAL (
    SELECT name FROM public.team_members WHERE member_id = u.id AND name IS NOT NULL LIMIT 1
  ) tm ON true;
$$;

REVOKE ALL ON FUNCTION public.team_agent_cards() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_agent_cards() TO authenticated;
