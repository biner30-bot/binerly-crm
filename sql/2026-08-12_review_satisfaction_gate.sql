-- Google değerlendirme isteği artık müşteriyi doğrudan Google'a göndermiyor -
-- önce api/deal-approval.js'in ham HTML döndüren action=review dalında kısa
-- bir memnuniyet sorusu soruluyor (confirm-attendance ile AYNI desen, ayrı
-- bir React sayfası/route değil).
-- Memnun (positive) ise Google linkine yönlendiriliyor, memnun değilse
-- (negative) geri bildirimi SADECE işletmeye özel/gizli kalıyor - mutsuz bir
-- müşteriyi hiç sormadan herkese açık Google'a yönlendirmek riskli bulundu.
-- Token olarak yeni bir kolon AÇILMADI - deal-approval.js'in zaten kullandığı
-- approval_token'ın AYNISI reused edildi (confirm-attendance ile AYNI ilke,
-- bkz. o dosyadaki yorum: "ayrı bir serverless fonksiyon yerine buraya, zaten
-- token bazlı deal/customer/settings'i çeken bu uç noktaya bir action dalı
-- olarak eklendi").
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS review_rating text NULL; -- 'positive' | 'negative'
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS review_feedback_text text NULL;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS review_submitted_at timestamptz NULL;
