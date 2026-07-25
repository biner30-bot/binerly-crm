-- Portal "Mesajlar" sekmesi — talep açmadan doğrudan sohbet. Yeni tablo/RLS
-- yok, mevcut tickets + ticket_messages altyapısı yeniden kullanılıyor: her
-- müşteri için kalıcı, gizli bir "genel sohbet" tickets satırı bu bayrakla
-- işaretleniyor ve tüm Destek analitiğinden (SLA, açık talep sayısı vb.)
-- hariç tutuluyor.

ALTER TABLE public.tickets ADD COLUMN is_general_chat boolean NOT NULL DEFAULT false;
