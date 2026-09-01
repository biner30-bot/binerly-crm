-- Musteri portali "Profilim" ekraninda kendi profil fotografini yukleyebilsin
-- diye herkese acik "avatars" storage bucket'i. Google ile giren musterinin
-- fotografi zaten user_metadata.avatar_url'den geliyor; e-posta/sifre ile
-- kayit olanlarin fotografi olmuyordu. Yuklenen dosyanin public URL'i
-- auth.updateUser({ data: { custom_avatar_url } }) ile user_metadata'ya yazilir
-- (avatar_url'i EZMEZ - Google tekrar giris yapinca avatar_url tazelenebilir,
-- custom_avatar_url'e dokunulmaz; istemci custom_avatar_url || avatar_url okur).
--
-- Klasor deseni: "<auth.uid()>/avatar-<ts>.<ext>" - kullanici sadece kendi
-- klasorune yazabilir (logos bucket'iyle ayni desen).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true, 2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Herkes okuyabilir (public bucket, <img src> ile dogrudan)
create policy "avatars public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Kullanici yalnizca kendi <uid>/ klasorune yazabilir/silebilir
create policy "avatars owner insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars owner update"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
