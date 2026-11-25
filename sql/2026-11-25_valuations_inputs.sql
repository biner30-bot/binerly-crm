-- Kayıtlı analiz, kaydedildiği günün verileriyle sabit kalır: kullanılan bölge
-- ilanları, düzeltme oranları ve veri tarihi burada saklanır. Analiz tekrar
-- açılınca bunlarla hesaplanır; güncel bölge verisi değeri sessizce değiştirmez
-- (danışman "güncel verilerle güncelle" demedikçe). Kullanıcı kararı, 25 Kas.
alter table public.valuations add column if not exists inputs jsonb;
