-- Musteri portali icin rozet/basari sistemi: musterinin KENDI ders yoklama
-- gecmisini gormesini saglayan security-definer view. class_attendance'in
-- kendi RLS politikasi sadece user_id = auth.uid() (KOBI/personel) icin acik,
-- portal_user_id uzerinden musteriye hic acik degildi - customer_deal_view/
-- customer_profile_view ile ayni desen (portal_user_id = auth.uid() filtresi).
create view customer_attendance_view as
select
  ca.id,
  ca.customer_id,
  ca.group_class_id,
  ca.occurrence_date,
  ca.status,
  gc.name as class_name,
  gc.start_time,
  gc.weekday
from class_attendance ca
join customers c on c.id = ca.customer_id
join group_classes gc on gc.id = ca.group_class_id
where c.portal_user_id = auth.uid() and c.deleted_at is null;

grant select on customer_attendance_view to authenticated;
