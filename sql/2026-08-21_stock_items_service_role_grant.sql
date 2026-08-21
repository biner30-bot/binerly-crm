-- api/send-reminders.js dusuk stok ozeti icin service_role'e SELECT grant'i gerekiyor -
-- stock_items su ana kadar sadece tarayicidan (authenticated) okundu, service_role ile
-- ILK KEZ okunuyor (bkz. CLAUDE.md service_role GRANT tuzagi - grant olmadan sessizce
-- bos/hatali sonuc doner).
GRANT SELECT ON public.stock_items TO service_role;
