import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

// Bir günün (weekday'e karşılık gelen mesai pencereleri) boş saatlerini
// hesaplar - hem tek-günlük sorguda hem çok-günlük önizleme şeridinde AYNI
// mantık kullanılsın diye ortak fonksiyon. takenRanges gün-içi dakika
// cinsinden [{start,end}] aralıklarıdır (App.jsx'teki findAppointmentConflict
// ile AYNI overlap ilkesi - aday, süresi boyunca (durationMinutes, verilmezse
// slot adımı kadar) hiçbir mevcut randevu aralığıyla kesişmemeli). Önceden
// burada sadece "tam saat eşitliği" bakılıyordu - çoklu hizmet seçince (60+
// dakikalık randevular) bir sonraki 30dk'lık slot yanlışlıkla boş görünüyordu.
function computeDaySlots(windows, isToday, nowMinutes, takenRanges, durationMinutes = 0) {
  const slots = [];
  for (const window of windows) {
    const [startH, startM] = window.start_time.slice(0, 5).split(":").map(Number);
    const [endH, endM] = window.end_time.slice(0, 5).split(":").map(Number);
    const step = window.slot_duration_minutes;
    const svcDuration = durationMinutes > 0 ? durationMinutes : step;
    const end = endH * 60 + endM;
    for (let cursor = startH * 60 + startM; cursor + svcDuration <= end; cursor += step) {
      if (isToday && cursor <= nowMinutes) continue;
      const candidateEnd = cursor + svcDuration;
      if (takenRanges.some((r) => cursor < r.end && r.start < candidateEnd)) continue;
      const time = `${String(Math.floor(cursor / 60)).padStart(2, "0")}:${String(cursor % 60).padStart(2, "0")}`;
      slots.push(time);
    }
  }
  return slots.sort();
}

// Bir "YYYY-MM-DDTHH:MM..." zaman damgasının gün-içi dakika karşılığı.
function minutesOfDay(dateTimeStr) {
  const [hh, mm] = dateTimeStr.slice(11, 16).split(":").map(Number);
  return hh * 60 + mm;
}

// serviceIds (virgülle ayrılmış price_list_items id listesi) verilirse
// toplam süreyi SUNUCU TARAFINDA price_list_items'tan hesaplar - istemciden
// bir süre sayısı asla kabul edilmez (App.jsx DealForm'daki lineItemsDurationMinutes
// ile aynı "miktar süreyi katlamaz, sadece kalem sayısı toplanır" ilkesi).
async function resolveDurationMinutes(supabaseAdmin, businessUserId, serviceIdsParam) {
  const ids = (serviceIdsParam || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return 0;
  const { data } = await supabaseAdmin.from("price_list_items").select("id, duration_minutes").eq("user_id", businessUserId).in("id", ids);
  return (data || []).reduce((sum, item) => sum + (Number(item.duration_minutes) || 0), 0);
}

// Müşteri portalındaki bir kullanıcı, RLS gereği sadece KENDİ randevularını
// görebilir — başka müşterilerin randevu saatlerini görüp "bu saat dolu mu"
// diye client-side hesaplayamaz (haklı bir gizlilik kısıtı). Bu yüzden
// doluluk hesabı burada, servis anahtarıyla, hiçbir müşteri/randevu detayı
// döndürmeden (sadece müsait saat/oda listesi) sunucu tarafında yapılır.
// Müşteri Portalı'ndan (giriş yapmış müşteri) kendi randevusunu almasını
// SUNUCU TARAFINDA tamamlar. Öncesinde bu insert doğrudan CustomerPortal.jsx'ten
// (RLS ile) yapılıyordu — RLS SADECE sahiplik kontrol ediyor, iki gerçek
// korumayı (a) aynı saate çift randevu, (b) fiyat listesinden seçilen kalemin
// GERÇEK tutarı, hiç sağlamıyordu. Portal kullanıcısı RLS gereği başka
// müşterilerin deal'lerini göremediği için (yukarıdaki GET yorumuyla aynı
// gizlilik kısıtı) çakışma kontrolü client-side yapılamaz, service_role
// gerektirir — lead-capture.js'teki (widget) AYNI iki korumanın portal
// eşleniği.
async function handleBooking(req, res, supabaseAdmin) {
  const authHeader = req.headers.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!accessToken) return res.status(401).json({ error: "Giriş gerekli." });
  const { data: userData } = await supabaseAdmin.auth.getUser(accessToken);
  const authedUserId = userData?.user?.id || null;
  if (!authedUserId) return res.status(401).json({ error: "Giriş gerekli." });

  const { customerId, businessUserId, dateTime, dateTimeKey, note, value, serviceIds, checkIn, checkOut, roomType, partySize, visitPurpose } = req.body || {};
  const cleanServiceIds = Array.isArray(serviceIds) ? serviceIds.filter((id) => typeof id === "string" && id) : [];
  if (!customerId || !businessUserId || !(note || "").trim() || (!checkIn && (!dateTime || !dateTimeKey))) {
    return res.status(400).json({ error: "Eksik bilgi." });
  }

  const { data: customer, error: customerError } = await supabaseAdmin
    .from("customers")
    .select("id, portal_user_id, user_id")
    .eq("id", customerId)
    .is("deleted_at", null)
    .maybeSingle();
  if (customerError) return res.status(500).json({ error: customerError.message });
  if (!customer || customer.portal_user_id !== authedUserId || customer.user_id !== businessUserId) {
    return res.status(403).json({ error: "Yetkisiz işlem." });
  }

  // Otel gibi oda-stoklu (bookingModel === "inventory") sektörler — saat slotu
  // değil GİRİŞ/ÇIKIŞ tarih aralığı + oda tipi stoku. Önceden bu dal
  // CustomerPortal.jsx'ten doğrudan istemciden insert ediliyordu, oda kapasitesi
  // HİÇ kontrol edilmiyordu (GET'teki /rooms sorgusu sadece görüntüleme içindi) -
  // iki müşteri aynı anda son odayı "boş" görüp ikisi de alabiliyordu. GET
  // checkIn dalındaki AYNI overlap mantığı burada da uygulanır.
  if (checkIn) {
    if (new Date(checkIn).getTime() < Date.now()) {
      return res.status(400).json({ error: "Geçmiş bir tarih için rezervasyon alınamaz." });
    }
    if (!roomType) return res.status(400).json({ error: "Oda tipi gerekli." });
    const { data: inventory } = await supabaseAdmin.from("room_inventory").select("quantity").eq("user_id", businessUserId).eq("room_type", roomType).maybeSingle();
    if (!inventory) return res.status(400).json({ error: "Geçersiz oda tipi." });
    const { data: existingDeals, error: roomConflictError } = await supabaseAdmin
      .from("deals")
      .select("custom_fields")
      .eq("user_id", businessUserId)
      .is("deleted_at", null)
      .neq("stage", "kaybedildi");
    if (roomConflictError) return res.status(500).json({ error: roomConflictError.message });
    const occupied = (existingDeals || []).filter((d) => {
      const cf = d.custom_fields || {};
      if (cf.oda_tipi !== roomType) return false;
      const start = typeof cf.giris_tarihi === "string" ? cf.giris_tarihi.slice(0, 10) : null;
      const end = typeof cf.cikis_tarihi === "string" ? cf.cikis_tarihi : null;
      if (!start || !end) return false;
      return checkIn < end && start < checkOut;
    }).length;
    if (occupied >= inventory.quantity) return res.status(409).json({ error: "Bu tarih aralığında bu oda tipi dolu, lütfen farklı bir tarih/oda seçin." });

    const row = {
      id: crypto.randomUUID(), user_id: businessUserId, customer_id: customerId,
      title: (note || "").trim() || "Rezervasyon talebi", value: 0, stage: "ilk_gorusme",
      custom_fields: {
        giris_tarihi: checkIn, cikis_tarihi: checkOut, oda_tipi: roomType, kisi_sayisi: partySize,
        ...(visitPurpose ? { ziyaret_amaci: visitPurpose } : {}),
        portal_randevu_zamani: checkIn, kaynak: "portal",
      },
    };
    const { data, error } = await supabaseAdmin.from("deals").insert(row).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ deal: data });
  }

  if (new Date(dateTime).getTime() < Date.now()) {
    return res.status(400).json({ error: "Geçmiş bir tarih/saat için randevu alınamaz." });
  }

  // Fiyat VE süre listesinden seçilmişse burada DB'den TAZE okunur — istemciden
  // gelen value'ya güvenilmez (aksi halde ağ isteği değiştirilip tutar
  // düşürülebilirdi). Elle giriş (serviceIds boş) durumunda mevcut esneklik
  // korunur, süre bilinmez. Miktar süreyi/tutarı katlamıyor, kalem sayısı
  // toplanıyor - lead-capture.js'teki (widget) AYNI ilke.
  let dealValue = 0;
  let durationMinutes = 0;
  let serviceName = null;
  if (cleanServiceIds.length > 0) {
    const { data: services } = await supabaseAdmin.from("price_list_items").select("name, price, duration_minutes").eq("user_id", businessUserId).in("id", cleanServiceIds);
    if (services?.length) {
      serviceName = services.map((s) => s.name).join(", ");
      dealValue = services.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
      durationMinutes = services.reduce((sum, s) => sum + (Number(s.duration_minutes) || 0), 0);
    }
  } else {
    dealValue = Number(value) || 0;
  }

  // Race condition koruması: iki sekme/iki müşteri aynı saati aynı anda
  // seçebilir — müsaitlik listesinin döndüğü an ile bu istek arasında saat
  // dolmuş olabilir, insert'ten hemen önce tekrar doğrulanır. Süre biliniyorsa
  // (durationMinutes) tam saat eşitliği değil gerçek aralık çakışması bakılır -
  // computeDaySlots'taki AYNI overlap ilkesi (App.jsx findAppointmentConflict).
  const candidateStart = minutesOfDay(dateTime);
  const candidateEnd = candidateStart + Math.max(durationMinutes, 1);
  const candidateDateStr = dateTime.slice(0, 10);
  const { data: existingDeals, error: conflictError } = await supabaseAdmin
    .from("deals")
    .select("custom_fields")
    .eq("user_id", businessUserId)
    .is("deleted_at", null)
    .neq("stage", "kaybedildi");
  if (conflictError) return res.status(500).json({ error: conflictError.message });
  const hasConflict = (existingDeals || []).some((d) => {
    const dt = d.custom_fields?.[dateTimeKey];
    if (typeof dt !== "string" || !dt.startsWith(candidateDateStr)) return false;
    const otherStart = minutesOfDay(dt);
    const otherEnd = otherStart + Math.max(Number(d.custom_fields?.duration_minutes) || 1, 1);
    return candidateStart < otherEnd && otherStart < candidateEnd;
  });
  if (hasConflict) return res.status(409).json({ error: "Bu saat az önce doldu, lütfen başka bir saat seçin." });

  const { data: cred } = await supabaseAdmin.from("payment_credentials").select("id").eq("user_id", businessUserId).maybeSingle();

  const row = {
    id: crypto.randomUUID(), user_id: businessUserId, customer_id: customerId,
    title: serviceName || (note || "").trim() || "Randevu talebi", value: dealValue, stage: "ilk_gorusme",
    custom_fields: {
      [dateTimeKey]: dateTime, portal_randevu_zamani: dateTime, kaynak: "portal",
      ...(cleanServiceIds.length > 0 ? { service_ids: cleanServiceIds } : {}),
      ...(durationMinutes > 0 ? { duration_minutes: durationMinutes } : {}),
    },
  };
  // dealValue > 0 && hasPaymentProvider iken onay linki baştan kurulur — CustomerPortal.jsx'teki
  // ESKİ client-side mantığın birebir aynısı, sadece artık dealValue sunucuda doğrulanmış.
  if (dealValue > 0 && cred) {
    row.approval_token = crypto.randomUUID();
    row.payment_mode = "required";
  }

  const { data, error } = await supabaseAdmin.from("deals").insert(row).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ deal: data });
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).end();

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  if (req.method === "POST") return handleBooking(req, res, supabaseAdmin);

  // Müsaitlik her zaman anlık hesaplanmalı — bir dakika önce dolu görünen bir
  // saat az sonra boşalabilir (iptal) veya tam tersi. Cache-Control header'ı
  // olmadan tarayıcı/CDN aynı URL için 304 dönüp eski yanıtı yeniden
  // kullanabiliyordu (Network sekmesinde gözlemlendi).
  res.setHeader("Cache-Control", "no-store");

  const { businessUserId, date, checkIn, checkOut } = req.query;
  if (!businessUserId) return res.status(400).json({ error: "businessUserId gerekli." });

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
    // Süresi bilinmeyen (duration_minutes yok) randevular "1 dakikalık nokta"
    // kabul edilir - App.jsx'teki findAppointmentConflict'teki AYNI ilke,
    // eski "tam saat eşitliği" davranışını bozmadan süre bilinen durumlarda
    // gerçek aralık çakışmasını da yakalar (bkz. computeDaySlots yorumu).
    const takenByDate = new Map();
    for (const dl of deals || []) {
      const dt = dl.custom_fields?.[dateTimeKey];
      if (typeof dt !== "string" || dt.length < 16) continue;
      const dateStr = dt.slice(0, 10);
      if (!takenByDate.has(dateStr)) takenByDate.set(dateStr, []);
      const start = minutesOfDay(dt);
      const dur = Math.max(Number(dl.custom_fields?.duration_minutes) || 1, 1);
      takenByDate.get(dateStr).push({ start, end: start + dur });
    }

    const requestedDuration = await resolveDurationMinutes(supabaseAdmin, businessUserId, req.query.serviceIds);
    const nowMinutes = (Number(nowParts.hour) % 24) * 60 + Number(nowParts.minute);
    const startY = Number(nowParts.year), startM = Number(nowParts.month), startD = Number(nowParts.day);
    const days = [];
    for (let i = 0; i < overviewDays; i++) {
      const cursorDate = new Date(Date.UTC(startY, startM - 1, startD + i));
      const dateStr = `${cursorDate.getUTCFullYear()}-${String(cursorDate.getUTCMonth() + 1).padStart(2, "0")}-${String(cursorDate.getUTCDate()).padStart(2, "0")}`;
      const jsWeekday = cursorDate.getUTCDay();
      const isoWeekday = jsWeekday === 0 ? 7 : jsWeekday;
      const windows = hoursByWeekday.get(isoWeekday) || [];
      const taken = takenByDate.get(dateStr) || [];
      const slotCount = computeDaySlots(windows, dateStr === todayIstanbul, nowMinutes, taken, requestedDuration).length;
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
  // Süresi bilinmeyen mevcut randevular "1 dakikalık nokta" kabul edilir -
  // bkz. computeDaySlots ve overview dalındaki AYNI yorum.
  const takenRanges = dateTimeKey
    ? (deals || [])
        .map((d) => {
          const dt = d.custom_fields?.[dateTimeKey];
          if (typeof dt !== "string" || !dt.startsWith(date)) return null;
          const start = minutesOfDay(dt);
          const dur = Math.max(Number(d.custom_fields?.duration_minutes) || 1, 1);
          return { start, end: start + dur };
        })
        .filter(Boolean)
    : [];

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
  const requestedDuration = await resolveDurationMinutes(supabaseAdmin, businessUserId, req.query.serviceIds);
  const slots = computeDaySlots(hours || [], isToday, nowMinutes, takenRanges, requestedDuration);

  return res.status(200).json({ slots, dateTimeKey, hasPaymentProvider });
}
