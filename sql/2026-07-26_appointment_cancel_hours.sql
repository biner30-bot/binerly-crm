-- AppointmentCancelLockBox (tekli randevu sektörleri: Güzellik & Bakım, Sağlık/
-- Klinik, Emlak vb.) yanlışlıkla company_settings.hard_block_hours'u (grup
-- dersi politikasıyla PAYLAŞARAK) kullanıyordu. "supportsGroupClasses ve
-- supportsSelfBooking hiç kesişmiyor" varsayımı YANLIŞTI — bir işletme SEKTÖR
-- DEĞİŞTİREBİLİR (Sektör & Özel Alanlar'dan), ve company_settings tek satır
-- olduğu için eski değer yeni sektörde sessizce yeniden yorumlanıyordu (örn.
-- Güzellik & Bakım'da girilen "24 saat" değeri sektör Spor Merkezi'ne
-- çevrilince "Tamamen kilitle" alanında aynen görünüyordu). Tamamen ayrı bir
-- kolon: iki özellik birbirinden bağımsız.
ALTER TABLE public.company_settings ADD COLUMN appointment_cancel_hours numeric;

CREATE OR REPLACE VIEW public.customer_profile_view AS
 SELECT c.id,
    c.user_id,
    c.name,
    c.sector,
    c.phone,
    c.email,
    c.created_at,
    cs.company_name,
    cs.sector AS company_sector,
    cs.late_cancel_hours AS company_late_cancel_hours,
    cs.hard_block_hours AS company_hard_block_hours,
    cs.late_cancel_strike_limit AS company_late_cancel_strike_limit,
    cs.appointment_cancel_hours AS company_appointment_cancel_hours
   FROM customers c
     LEFT JOIN company_settings cs ON cs.user_id = c.user_id
  WHERE c.portal_user_id = auth.uid() AND c.deleted_at IS NULL;
