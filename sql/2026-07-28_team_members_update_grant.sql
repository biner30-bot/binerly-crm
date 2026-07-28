-- team_members tablosunda UPDATE hiç kurulmamış — ne GRANT ne RLS policy vardı
-- (sadece SELECT/DELETE vardı). "Prim bilgisi güncellenemedi: permission denied
-- for table team_members" hatası buradan geliyordu; "İşletme/sektör ayarlarını
-- düzenleyebilir" checkbox'ı da aynı sebepten hiç çalışmıyordu, fark edilmemiş.
--
-- Sadece işletme sahibi kendi takımındaki üyelerin bu 3 alanını değiştirebilsin
-- diye kolon bazlı GRANT (team_id/member_id/email değişimine izin verilmiyor) +
-- team_members_owner_delete ile aynı desende owner-only RLS policy.
GRANT UPDATE (can_edit_settings, commission_percent, chair_rental_fee) ON public.team_members TO authenticated;

CREATE POLICY team_members_owner_update ON public.team_members
  FOR UPDATE
  USING (team_id = auth.uid())
  WITH CHECK (team_id = auth.uid());
