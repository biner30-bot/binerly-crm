import { createClient } from "@supabase/supabase-js";

// Randevulu sektörlerde (Güzellik & Bakım, Sağlık/Klinik) hâlihazırda
// kullanılan sabit özel alan anahtarı — SECTOR_PRESETS'te (Sectors.jsx) ikisi
// de aynı anahtarı kullanıyor. v1 basitleştirmesi: dinamik custom_field_defs
// araması yerine sabit kodlanmış — bir KOBİ bu alanı farklı bir anahtarla
// yeniden oluşturursa bu uç nokta o hesap için çalışmaz.
const APPOINTMENT_DATETIME_KEY = "randevu_tarihi";

// Müşteri portalındaki bir kullanıcı, RLS gereği sadece KENDİ randevularını
// görebilir — başka müşterilerin randevu saatlerini görüp "bu saat dolu mu"
// diye client-side hesaplayamaz (haklı bir gizlilik kısıtı). Bu yüzden
// doluluk hesabı burada, servis anahtarıyla, hiçbir müşteri/randevu detayı
// döndürmeden (sadece müsait saat listesi) sunucu tarafında yapılır.
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const { businessUserId, date } = req.query;
  if (!businessUserId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "businessUserId ve date (YYYY-MM-DD) gerekli." });
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const targetDate = new Date(`${date}T00:00:00+03:00`);
  if (isNaN(targetDate.getTime())) return res.status(400).json({ error: "Geçersiz tarih." });
  const jsWeekday = targetDate.getDay();
  const isoWeekday = jsWeekday === 0 ? 7 : jsWeekday;

  const [{ data: hours, error: hoursError }, { data: deals, error: dealsError }] = await Promise.all([
    supabaseAdmin.from("business_hours").select("start_time, end_time, slot_duration_minutes").eq("user_id", businessUserId).eq("weekday", isoWeekday),
    supabaseAdmin.from("deals").select("custom_fields").eq("user_id", businessUserId).is("deleted_at", null).neq("stage", "kaybedildi"),
  ]);

  if (hoursError || dealsError) return res.status(500).json({ error: (hoursError || dealsError).message });

  const takenTimes = new Set(
    (deals || [])
      .map((d) => d.custom_fields?.[APPOINTMENT_DATETIME_KEY])
      .filter((dt) => typeof dt === "string" && dt.startsWith(date))
      .map((dt) => dt.slice(11, 16))
  );

  const nowTurkey = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
  const isToday = date === nowTurkey.toISOString().slice(0, 10);
  const nowMinutes = nowTurkey.getHours() * 60 + nowTurkey.getMinutes();

  const slots = [];
  for (const window of hours || []) {
    const [startH, startM] = window.start_time.slice(0, 5).split(":").map(Number);
    const [endH, endM] = window.end_time.slice(0, 5).split(":").map(Number);
    const step = window.slot_duration_minutes;
    const end = endH * 60 + endM;
    for (let cursor = startH * 60 + startM; cursor + step <= end; cursor += step) {
      if (isToday && cursor <= nowMinutes) continue;
      const time = `${String(Math.floor(cursor / 60)).padStart(2, "0")}:${String(cursor % 60).padStart(2, "0")}`;
      if (!takenTimes.has(time)) slots.push(time);
    }
  }
  slots.sort();

  return res.status(200).json({ slots });
}
