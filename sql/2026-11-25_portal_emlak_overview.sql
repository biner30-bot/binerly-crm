-- Müşteri portalı (emlak): müşterinin SADECE kendi kayıtları, dar kolon listesiyle.
-- - talep: kendi aranan_*/talep_* alanları (portal "Size uygun evler" eşleşmesi)
-- - gosterimler: gezdiği evler - mahalle/oda/m², adres/ada-parsel/mal sahibi YOK
-- - mulklerim: mal sahibi olduğu portföyler + gösterim sayısı ve ilgi dağılımı;
--   alıcının kimliği ve danışmanın geri bildirim notu ASLA dönmez (kullanıcı kararı:
--   "yoruma gerek yok", notlarda alıcının adı geçebilir).
-- vitrin_token: portal, uyan evleri zaten herkese açık vitrin verisinden çeker.
create or replace function public.portal_emlak_overview()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select jsonb_build_object(
      'customer_id', c.id,
      'vitrin_token', coalesce(nullif(cs.showcase_slug, ''), cs.lead_capture_token),
      'talep', (
        select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
        from jsonb_each(coalesce(c.custom_fields, '{}'::jsonb)) as e(k, v)
        where k like 'aranan\_%' or k like 'talep\_%' or k in ('min_butce', 'max_butce')
      ),
      'gosterimler', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'shown_at', s.shown_at,
          'method', s.method,
          'signed', (s.consent_signed_at is not null or s.wet_signed_at is not null),
          'title', p.title,
          'neighborhood', p.neighborhood,
          'district', p.district,
          'room_count', p.room_count,
          'gross_m2', p.gross_m2,
          'transaction_type', p.transaction_type
        ) order by s.shown_at desc), '[]'::jsonb)
        from property_showings s
        join properties p on p.id = s.property_id and p.deleted_at is null
        where s.customer_id = c.id and s.deleted_at is null
      ),
      'mulklerim', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', p.id,
          'title', p.title,
          'status', p.status,
          'transaction_type', p.transaction_type,
          'price', p.price,
          'neighborhood', p.neighborhood,
          'district', p.district,
          'created_at', p.created_at,
          'authorization_start', p.authorization_start,
          'authorization_months', p.authorization_months,
          'authorization_auto_renew', p.authorization_auto_renew,
          'listing_refs', p.listing_refs,
          'showcase_visible', p.showcase_visible,
          'show_total', (select count(*) from property_showings s where s.property_id = p.id and s.deleted_at is null),
          'show_30d', (select count(*) from property_showings s where s.property_id = p.id and s.deleted_at is null and s.shown_at >= now() - interval '30 days'),
          'interest', (
            select coalesce(jsonb_object_agg(i, n), '{}'::jsonb) from (
              select s.interest as i, count(*) as n from property_showings s
              where s.property_id = p.id and s.deleted_at is null and coalesce(s.interest, '') <> ''
              group by s.interest
            ) t
          )
        ) order by p.created_at desc), '[]'::jsonb)
        from properties p
        -- Satılan/kiralanan/pasife alınan mülk "Mülklerim"den çıkar (kullanıcı kararı).
        where p.owner_customer_id = c.id and p.deleted_at is null
          and p.status not in ('satildi', 'kiralandi', 'pasif')
      )
    ) as x
    from customers c
    join company_settings cs on cs.user_id = c.user_id
    where c.portal_user_id = auth.uid() and c.deleted_at is null and cs.sector = 'emlak'
  ) q;
$$;

revoke all on function public.portal_emlak_overview() from public, anon;
grant execute on function public.portal_emlak_overview() to authenticated;
