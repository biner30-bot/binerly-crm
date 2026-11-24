import { KFE_SERIES } from "../src/priceEstimate.js";

// TCMB EVDS Konut Fiyat Endeksi'ni market_index tablosuna yazar. Günlük cron
// içinden çağrılır ama günde en fazla bir kez gerçekten istek atar (endeks
// aylık yayımlanıyor). Hata asıl cron'u (hatırlatma e-postaları) asla
// durdurmaz - sadece loglanır.
const EVDS_BASE = "https://evds3.tcmb.gov.tr/igmevdsms-dis";

export async function refreshMarketIndex(supabaseAdmin) {
  const key = process.env.EVDS_API_KEY;
  if (!key) return { skipped: "no-key" };
  try {
    const { data: last } = await supabaseAdmin
      .from("market_index")
      .select("fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last && Date.now() - new Date(last.fetched_at).getTime() < 20 * 3600 * 1000) {
      return { skipped: "fresh" };
    }
    const end = new Date();
    const start = new Date(end.getFullYear() - 3, 0, 1);
    const fmt = (d) =>
      `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
    const now = new Date().toISOString();
    const rows = [];
    // EVDS tek istekte en fazla ~14 seri döndürüyor (fazlası sessizce düşüyor).
    for (let i = 0; i < KFE_SERIES.length; i += 10) {
      const chunk = KFE_SERIES.slice(i, i + 10);
      const url = `${EVDS_BASE}/series=${chunk.join("-")}&startDate=${fmt(start)}&endDate=${fmt(end)}&type=json&frequency=5`;
      const resp = await fetch(url, { headers: { key } });
      if (!resp.ok) return { error: `EVDS ${resp.status}` };
      const json = await resp.json();
      for (const item of json.items || []) {
        const [y, m] = String(item.Tarih || "").split("-");
        if (!y || !m) continue;
        const period = `${y}-${m.padStart(2, "0")}-01`;
        for (const series of chunk) {
          const v = item[series.replace(/\./g, "_")];
          if (v != null && v !== "")
            rows.push({ series, period, value: Number(v), fetched_at: now });
        }
      }
    }
    if (rows.length === 0) return { error: "EVDS bos dondu" };
    const { error } = await supabaseAdmin.from("market_index").upsert(rows);
    if (error) return { error: error.message };
    return { upserted: rows.length };
  } catch (e) {
    return { error: e.message };
  }
}
