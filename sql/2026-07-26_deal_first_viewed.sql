-- Teklif okundu bildirimi: müşteri /onay/{token} linkini kimliği doğrulanmış
-- olarak (portal girişiyle) ilk kez açtığı an, satışçıya "teklif görüntülendi"
-- bildirimi gitsin diye. Sadece İLK görüntülemede tetiklenir — müşteri sonradan
-- kaç kere geri dönüp baksa (örn. "onayladım mıydı?" kontrolü) tekrar bildirim
-- gitmez. api/deal-approval.js bu kolonu approval_token ile eşleşen satırda
-- first_viewed_at IS NULL koşuluyla atomik olarak set eder (claimDealPayment'teki
-- gibi yarış durumuna karşı) — bu yüzden ayrı bir tabloya değil, tek bir
-- timestamptz koşuluna ihtiyaç var.

ALTER TABLE public.deals ADD COLUMN first_viewed_at timestamptz;
