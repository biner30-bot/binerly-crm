-- "logos" bucket'ı (şirket logosu + profil fotoğrafı) yüklemesi RLS ile
-- reddediliyordu (kullanıcı bildirdi):
-- 1) SELECT politikası yoktu. Storage API'si upsert ve silmede satırı okuyabilmeyi
--    de istiyor; public bucket'ın herkese açık URL'si buna sayılmıyor.
-- 2) Takım üyesi koşulunda EXISTS alt sorgusundaki `name`, objects.name yerine
--    team_members.name'e çözülüyordu - ayar yetkili üye hiç yükleyemiyordu.
drop policy if exists "Owners and permitted members can upload logos" on storage.objects;
drop policy if exists "Owners and permitted members can update logos" on storage.objects;
drop policy if exists "Owners and permitted members can delete logos" on storage.objects;
drop policy if exists "Owners and permitted members can read logos" on storage.objects;

create policy "Owners and permitted members can upload logos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'logos' and (
      (storage.foldername(objects.name))[1] = auth.uid()::text
      or exists (
        select 1 from public.team_members tm
        where tm.team_id::text = (storage.foldername(objects.name))[1]
          and tm.member_id = auth.uid() and tm.can_edit_settings = true
      )
    )
  );

create policy "Owners and permitted members can read logos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'logos' and (
      (storage.foldername(objects.name))[1] = auth.uid()::text
      or exists (
        select 1 from public.team_members tm
        where tm.team_id::text = (storage.foldername(objects.name))[1]
          and tm.member_id = auth.uid() and tm.can_edit_settings = true
      )
    )
  );

create policy "Owners and permitted members can update logos" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'logos' and (
      (storage.foldername(objects.name))[1] = auth.uid()::text
      or exists (
        select 1 from public.team_members tm
        where tm.team_id::text = (storage.foldername(objects.name))[1]
          and tm.member_id = auth.uid() and tm.can_edit_settings = true
      )
    )
  );

create policy "Owners and permitted members can delete logos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'logos' and (
      (storage.foldername(objects.name))[1] = auth.uid()::text
      or exists (
        select 1 from public.team_members tm
        where tm.team_id::text = (storage.foldername(objects.name))[1]
          and tm.member_id = auth.uid() and tm.can_edit_settings = true
      )
    )
  );
