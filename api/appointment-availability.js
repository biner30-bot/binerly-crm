import { createClient } from "@supabase/supabase-js";

// Bir günün (weekday'e karşılık gelen mesai pencereleri) boş saatlerini
// hesaplar - hem tek-günlük sorguda hem çok-günlük önizleme şeridinde AYNI
// mantık kullanılsın diye ortak fonksiyon.
function computeDaySlots(windows, isToday, nowMinutes, takenTimes) {
  const slots = [];
  for (const window of windows) {
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
  return slots.sort();
}

// Müşteri portalındaki bir kullanıcı, RLS gereği sadece KENDİ randevularını
// görebilir — başka müşterilerin randevu saatlerini görüp "bu saat dolu mu"
// diye client-side hesaplayamaz (haklı bir gizlilik kısıtı). Bu yüzden
// doluluk hesabı burada, servis anahtarıyla, hiçbir müşteri/randevu detayı
// döndürmeden (sadece müsait saat/oda listesi) sunucu tarafında yapılır.
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  // Müsaitlik her zaman anlık hesaplanmalı — bir dakika önce dolu görünen bir
  // saat az sonra boşalabilir (iptal) veya tam tersi. Cache-Control header'ı
  // olmadan tarayıcı/CDN aynı URL için 304 dönüp eski yanıtı yeniden
  // kullanabiliyordu (Network sekmesinde gözlemlendi).
  res.setHeader("Cache-Control", "no-store");

  const { businessUserId, date, checkIn, checkOut } = req.query;
  if (!businessUserId) return res.status(400).json({ error: "businessUserId gerekli." });

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Sunucunun kendi çalışma saat dilimine güvenmeyen, doğrudan Europe/Istanbul
  // için "şu an"ın takvim gününü veren bir yöntem — new Date(...) ile dolaylı
  // çeviri yapan önceki yöntem, çalışma ortamına göre yanlış sonuç verebiliyordu.
  const nowParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(new Date()).map((p) => [p.type, p.value])
  );
  const todayIstanbul = `${nowParts.year}-${nowParts.month}-${nowParts.day}`;

  // Otel gibi oda-stoklu (bookingModel === "inventory", bkz. Sectors.jsx) sektörler
  // için ayrı bir dal — burada müsaitlik bir SAAT SLOTU değil, bir GİRİŞ/ÇIKIŞ TARİH
  // ARALIĞINDA kaç aynı tipte oda boş olduğudur. Aynı dosyada tutuyoruz çünkü
  // Vercel Hobby planının 12 fonksiyon sınırı zaten bir kez zorlanmıştı — yeni bir
  // api/*.js yerine mevcut uç noktaya dallanma eklendi.
  if (checkIn || checkOut) {
    if (!checkIn || !checkOut || !/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || checkOut <= checkIn) {
      return res.status(400).json({ error: "checkIn ve checkOut (YYYY-MM-DD, checkOut > checkIn) gerekli." });
    }
    // Geçmiş bir giriş tarihi seçilirse (bkz. slot moduyla aynı düzeltme) hiç oda
    // müsait dönülmez.
    if (checkIn < todayIstanbul) return res.status(200).json({ rooms: [] });

    const [{ data: inventory, error: inventoryError }, { data: deals, error: dealsError }, { data: cred, error: credError }] = await Promise.all([
      supabaseAdmin.from("room_inventory").select("room_type, quantity, capacity, description").eq("user_id", businessUserId),
      supabaseAdmin.from("deals").select("custom_fields, stage").eq("user_id", businessUserId).is("deleted_at", null).neq("stage", "kaybedildi"),
      supabaseAdmin.from("payment_credentials").select("id").eq("user_id", businessUserId).maybeSingle(),
    ]);
    if (inventoryError || dealsError || credError) return res.status(500).json({ error: (inventoryError || dealsError || credError).message });

    const rooms = (inventory || []).map((inv) => {
      const occupied = (deals || []).filter((d) => {
        const cf = d.custom_fields || {};
        if (cf.oda_tipi !== inv.room_type) return false;
        const start = typeof cf.giris_tarihi === "string" ? cf.giris_tarihi.slice(0, 10) : null;
        const end = typeof cf.cikis_tarihi === "string" ? cf.cikis_tarihi : null;
        if (!start || !end) return false;
        // Klasik tarih aralığı çakışma testi, çıkış günü hariç (misafir o sabah
        // ayrılır, aynı gün başka bir giriş için oda tekrar müsaittir).
        return checkIn < end && start < checkOut;
      }).length;
      const remaining = Math.max(0, inv.quantity - occupied);
      return { roomType: inv.room_type, quantity: inv.quantity, available: remaining > 0, remaining, capacity: inv.capacity || null, description: inv.description || "" };
    });

    return res.status(200).json({ rooms, hasPaymentProvider: !!cred });
  }

  // Önizleme şeridi (AppointmentRequestPage) - müşteri tek tek tarih deneyip
  // "bu gün boş mu" diye uğraşmasın diye önümüzdeki N günün her biri için kaç
  // boş saat olduğunu TEK istekte döner. Tek-günlük slot hesabıyla (aşağıda)
  // AYNI mantığı (computeDaySlots) kullanır - iki yerde ayrı ayrı bakım
  // gerektiren bir kopya oluşmasın diye.
  const overviewDays = req.query.overview ? Math.min(Math.max(parseInt(req.query.overview, 10) || 14, 1), 30) : 0;
  if (overviewDays > 0) {
    const [{ data: fieldDefs, error: fieldDefsError }, { data: allHours, error: hoursError }, { data: deals, error: dealsError }, { data: cred, error: credError }] = await Promise.all([
      supabaseAdmin.from("custom_field_defs").select("key").eq("user_id", businessUserId).eq("entity", "deal").eq("field_type", "datetime").eq("active", true).limit(1),
      supabaseAdmin.from("business_hours").select("weekday, start_time, end_time, slot_duration_minutes").eq("user_id", businessUserId),
      supabaseAdmin.from("deals").select("custom_fields").eq("user_id", businessUserId).is("deleted_at", null).neq("stage", "kaybedildi"),
      supabaseAdmin.from("payment_credentials").select("id").eq("user_id", businessUserId).maybeSingle(),
    ]);
    if (fieldDefsError || hoursError || dealsError || credError) return res.status(500).json({ error: (fieldDefsError || hoursError || dealsError || credError).message });

    const dateTimeKey = fieldDefs?.[0]?.key || null;
    const hasPaymentProvider = !!cred;
    if (!dateTimeKey) return res.status(200).json({ days: [], dateTimeKey: null, hasPaymentProvider });

    const hoursByWeekday = new Map();
    for (const h of allHours || []) {
      if (!hoursByWeekday.has(h.weekday)) hoursByWeekday.set(h.weekday, []);
      hoursByWeekday.get(h.weekday).push(h);
    }
    const takenByDate = new Map();
    for (const dl of deals || []) {
      const dt = dl.custom_fields?.[dateTimeKey];
      if (typeof dt !== "string" || dt.length < 16) continue;
      const dateStr = dt.slice(0, 10);
      if (!takenByDate.has(dateStr)) takenByDate.set(dateStr, new Set());
      takenByDate.get(dateStr).add(dt.slice(11, 16));
    }

    const nowMinutes = (Number(nowParts.hour) % 24) * 60 + Number(nowParts.minute);
    const startY = Number(nowParts.year), startM = Number(nowParts.month), startD = Number(nowParts.day);
    const days = [];
    for (let i = 0; i < overviewDays; i++) {
      const cursorDate = new Date(Date.UTC(startY, startM - 1, startD + i));
      const dateStr = `${cursorDate.getUTCFullYear()}-${String(cursorDate.getUTCMonth() + 1).padStart(2, "0")}-${String(cursorDate.getUTCDate()).padStart(2, "0")}`;
      const jsWeekday = cursorDate.getUTCDay();
      const isoWeekday = jsWeekday === 0 ? 7 : jsWeekday;
      const windows = hoursByWeekday.get(isoWeekday) || [];
      const taken = takenByDate.get(dateStr) || new Set();
      const slotCount = computeDaySlots(windows, dateStr === todayIstanbul, nowMinutes, taken).length;
      // "Kapalı" (o haftagünü için hiç mesai saati tanımlı değil - KOBİ'nin
      // kendi Müsaitlik Saatleri seçimi, ör. Pazar) ile "Dolu" (mesai var ama
      // tüm saatler alınmış) FARKLI şeyler - ikisi de slotCount=0 olduğu için
      // ayrı bir bayrakla işaretlenmezse widget'ta ayırt edilemiyordu.
      days.push({ date: dateStr, slotCount, closed: windows.length === 0 });
    }
    return res.status(200).json({ days, dateTimeKey, hasPaymentProvider });
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "businessUserId ve date (YYYY-MM-DD) gerekli." });
  }

  // Salt takvim günü olarak hesaplanır (saat/saat dilimi karışmasın diye) —
  // date.getDay() burada KULLANILMAZ: "YYYY-MM-DDT00:00:00+03:00" gibi bir
  // string'i new Date() ile açıp .getDay() çağırmak, sunucu UTC çalıştığı için
  // günü bir gün geriye kaydırıyordu (Türkiye'de gece yarısı, UTC'de bir önceki
  // günün 21:00'i oluyor).
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return res.status(400).json({ error: "Geçersiz tarih." });
  const jsWeekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const isoWeekday = jsWeekday === 0 ? 7 : jsWeekday;

  // Randevu tarihi özel alanının gerçek anahtarı sektöre göre değişiyor (Güzellik &
  // Bakım/Sağlık-Klinik'te randevu_tarihi, Emlak/Dijital Ajans/Danışmanlık'ta
  // gorusme_tarihi) — send-appointment-reminders.js'in zaten yaptığı gibi, sabit
  // kodlamak yerine bu işletmenin aktif "Tarih & Saat" alanı dinamik bulunuyor.
  const [{ data: fieldDefs, error: fieldDefsError }, { data: hours, error: hoursError }, { data: deals, error: dealsError }, { data: cred, error: credError }] = await Promise.all([
    supabaseAdmin.from("custom_field_defs").select("key").eq("user_id", businessUserId).eq("entity", "deal").eq("field_type", "datetime").eq("active", true).limit(1),
    supabaseAdmin.from("business_hours").select("start_time, end_time, slot_duration_minutes").eq("user_id", businessUserId).eq("weekday", isoWeekday),
    supabaseAdmin.from("deals").select("custom_fields").eq("user_id", businessUserId).is("deleted_at", null).neq("stage", "kaybedildi"),
    supabaseAdmin.from("payment_credentials").select("id").eq("user_id", businessUserId).maybeSingle(),
  ]);

  if (fieldDefsError || hoursError || dealsError || credError) return res.status(500).json({ error: (fieldDefsError || hoursError || dealsError || credError).message });
  const hasPaymentProvider = !!cred;

  const dateTimeKey = fieldDefs?.[0]?.key || null;
  const takenTimes = new Set(
    dateTimeKey
      ? (deals || [])
          .map((d) => d.custom_fields?.[dateTimeKey])
          .filter((dt) => typeof dt === "string" && dt.startsWith(date))
          .map((dt) => dt.slice(11, 16))
      : []
  );

  const isToday = date === todayIstanbul;
  const nowMinutes = (Number(nowParts.hour) % 24) * 60 + Number(nowParts.minute);

  // Geçmiş bir tarih seçilirse (örn. tarayıcının native date input'u bir
  // şekilde bypass edilirse) o günün tüm mesai saatleri "müsait" görünüyordu —
  // sadece "bugün ise geçmiş saat" filtreleniyordu, "tarihin kendisi geçmiş mi"
  // hiç kontrol edilmiyordu. Geçmiş tarihler için her zaman boş liste dön.
  if (date < todayIstanbul) return res.status(200).json({ slots: [], dateTimeKey: null, hasPaymentProvider });

  // Aktif randevu tarihi alanı yoksa (işletme devre dışı bırakmış vb.) alınacak
  // randevunun nereye yazılacağı belirsiz olur — güvenli tarafta kalıp boş dönülür.
  if (!dateTimeKey) return res.status(200).json({ slots: [], dateTimeKey: null, hasPaymentProvider });

  // Vardiya (staff_shifts) müşteri portalındaki müsaitliği ETKİLEMEZ — sadece
  // Takım modalında işletme sahibi/çalışanların gördüğü içe dönük bir planlama
  // aracı. Müşteri hangi personelle randevu aldığını seçmiyor (bkz.
  // SlotBookingModal), bu yüzden burada tek referans Müsaitlik Saatleri'dir;
  // müşteri belirli bir uzman istiyorsa not alanına yazıp işletmeyle
  // konuşuyor. Personel seçimi eklenirse vardiya buraya yeniden bağlanacak.
  const slots = computeDaySlots(hours || [], isToday, nowMinutes, takenTimes);

  return res.status(200).json({ slots, dateTimeKey, hasPaymentProvider });
}
