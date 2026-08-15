-- Maliyet & marj uyarisi (CPQ-light): stok kalemine opsiyonel birim maliyet
-- eklendi. Fiyat listesi kaleminin recetesindeki (price_item_ingredients)
-- stok kalemlerinin (miktar x birim maliyet) toplami urun maliyetini verir.
-- company_settings.min_profit_margin_percent boissa kontrol tamamen kapali
-- (opt-in, bkz. feedback_features_opt_in_kobi_choice) - deal formunda sadece
-- bir UYARI gosterilir, kaydetmeyi asla engellemez (creditRisk ile ayni desen).
alter table stock_items add column unit_cost numeric;
alter table company_settings add column min_profit_margin_percent numeric;
