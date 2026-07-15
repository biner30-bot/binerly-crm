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

  // Salt takvim günü olarak hesaplanır (saat/saat dilimi karışmasın diye) —
  // date.getDay() burada KULLANILMAZ: "YYYY-MM-DDT00:00:00+03:00" gibi bir
  // string'i new Date() ile açıp .getDay() çağırmak, sunucu UTC çalıştığı için
  // günü bir gün geriye kaydırıyordu (Türkiye'de gece yarısı, UTC'de bir önceki
  // günün 21:00'i oluyor).
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return res.status(400).json({ error: "Geçersiz tarih." });
  const jsWeekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
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

  // Sunucunun kendi çalışma saat dilimine güvenmeyen, doğrudan Europe/Istanbul
  // için "şu an"ın takvim günü ve saatini veren bir yöntem — new Date(...) ile
  // dolaylı çeviri yapan önceki yöntem, çalışma ortamına göre yanlış sonuç
  // verebiliyordu.
  const nowParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(new Date()).map((p) => [p.type, p.value])
  );
  const isToday = date === `${nowParts.year}-${nowParts.month}-${nowParts.day}`;
  const nowMinutes = (Number(nowParts.hour) % 24) * 60 + Number(nowParts.minute);

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
