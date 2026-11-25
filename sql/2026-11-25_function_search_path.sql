-- Supabase güvenlik denetimi (function_search_path_mutable): search_path sabit
-- olmayan fonksiyon, çağıranın search_path'iyle aynı adlı başka bir şemadaki
-- tabloya yönlenebilir. Davranış değişmez, sadece public'e sabitlenir.
ALTER FUNCTION public.delete_customer_cascade(uuid) SET search_path = public;
ALTER FUNCTION public.region_prices_keep_owner() SET search_path = public;
