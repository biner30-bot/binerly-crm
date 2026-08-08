import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

// KVKK ispat kaydı için — deal-approval.js'teki AYNI fonksiyon, aralarında
// import olmadığı için kopyalanmış (bkz. sql/2026-07-31_consent_ip_and_text.sql).
function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || "203.0.113.1";
}

// api/appointment-availability.js'teki AYNI yardımcı (kasıtlı kopya, projenin
// diğer "ayrı dosya, ayrı kopya" desenleriyle tutarlı).
function minutesOfDay(dateTimeStr) {
  const [hh, mm] = dateTimeStr.slice(11, 16).split(":").map(Number);
  return hh * 60 + mm;
}

// api/appointment-availability.js'teki AYNI iki yardımcı (kasıtlı kopya) -
// işletmenin belirsiz olmayan (tam 1 aktif) bir kaynağı varsa otomatik atama
// havuzu olarak kullanır, aksi halde null döner (mevcut kaynaksız davranış
// korunur).
async function resolveAutoAssignResource(supabaseAdmin, businessUserId) {
  const { data } = await supabaseAdmin.from("resources").select("id").eq("user_id", businessUserId).eq("active", true);
  if (!data || data.length !== 1) return null;
  return data[0].id;
}
function buildAppointmentBounds(dateTimeStr, durationMinutes) {
  const start = new Date(`${dateTimeStr.slice(0, 16)}:00+03:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + Math.max(durationMinutes, 1) * 60000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

// İzin verilirken gösterilen TAM metin — istemciden ASLA alınmaz (client
// kendi metnini uydurup gönderebilirdi, kanıtı değersizleştirirdi). Bu metin
// AppointmentRequestPage.jsx/LeadCapturePage.jsx'teki checkbox etiketiyle
// birebir aynı tutulmalı (deal-approval.js'te de aynı sabit var, elle senkron).
const MARKETING_CONSENT_TEXT = "Kampanya ve değerlendirme isteği gibi e-postalar almak istiyorum";

// Müşterinin kendi bilgisini bırakabildiği kamuya açık form — Supabase auth
// gerektirmez, hesaba özel sabit bir token yetki kanıtı. GET sadece şirket
// adı/logosu döner, POST yeni bir customers satırı oluşturur (hesap sahibinin
// elle gireceği kaydı müşteri kendi giriyor).
export default async function handler(req, res) {
  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // req.query bazı durumlarda güvenilir doldurulmuyor (bkz. whatsapp-webhook.js) —
  // sorgu parametresini doğrudan req.url'den elle ayrıştırıyoruz.
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const token = req.method === "GET" ? url.searchParams.get("token") : (req.body || {}).token;
  if (!token) return res.status(400).json({ error: "Eksik token." });

  const { data: settings, error: settingsError } = await supabaseAdmin
    .from("company_settings")
    .select("user_id, company_name, logo_url, sector, appointment_deposit_amount, appointment_concurrency")
    .eq("lead_capture_token", token)
    .maybeSingle();
  if (settingsError) console.error("lead-capture query error:", settingsError.message);
  if (settingsError || !settings) return res.status(404).json({ error: "Bağlantı geçersiz." });

  if (req.method === "GET") {
    // /randevu-al/{token} (AppointmentRequestPage) aynı token'ı, aynı endpoint'i
    // kullanıyor — appointment-availability.js'teki AYNI sorguyla "bu işletmenin
    // aktif bir randevu tarihi alanı var mı" belirlenir (Vercel Hobby'nin 12
    // fonksiyon sınırı zaten dolu olduğu için ayrı bir api/*.js açılmadı).
    const [{ data: fieldDefs }, { data: services }, { data: cred }] = await Promise.all([
      supabaseAdmin.from("custom_field_defs").select("key").eq("user_id", settings.user_id).eq("entity", "deal").eq("field_type", "datetime").eq("active", true).limit(1),
      supabaseAdmin.from("price_list_items").select("id, name, price, duration_minutes").eq("user_id", settings.user_id).order("name"),
      supabaseAdmin.from("payment_credentials").select("id").eq("user_id", settings.user_id).maybeSingle(),
    ]);
    // Kapora sadece Ödeme Bağlantısı gerçekten kuruluysa anlamlı - KOBİ tutarı
    // girmiş ama sonradan bağlantıyı kopmuş/kaldırmış olabilir, bu durumda
    // widget'ta hiç kapora istenmez (booking anında ödeme başlatılamayacak bir
    // akışa girip müşteriyi kilitlemektense sessizce atlanır).
    const hasPaymentProvider = !!cred;
    const depositAmount = hasPaymentProvider && settings.appointment_deposit_amount > 0 ? settings.appointment_deposit_amount : null;
    return res.status(200).json({
      companyName: settings.company_name || "Binerly",
      logoUrl: settings.logo_url || null,
      businessUserId: settings.user_id,
      // Otel (bookingModel === "inventory", bkz. Sectors.jsx) GİRİŞ/ÇIKIŞ tarih
      // aralığı + oda tipi stokuna göre çalışır - buradaki tek-saat-slotu
      // formuna uymuyor. "acceptsAppointments" sadece bir datetime alanının
      // varlığına bakıyor, oteldeki "giris_tarihi" alanını da yanlışlıkla
      // yakalıyordu (slotsuz, çakışma kontrolsüz eksik rezervasyon riski) -
      // widget tarafı sector'a bakıp bu durumda formu hiç göstermez.
      sector: settings.sector || null,
      acceptsAppointments: !!fieldDefs?.[0]?.key && settings.sector !== "otel",
      services: services || [],
      depositAmount,
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { name, phone, email, address, note, marketingConsent, dateTime, dateTimeKey, serviceIds } = req.body || {};
  const cleanServiceIds = Array.isArray(serviceIds) ? serviceIds.filter((id) => typeof id === "string" && id) : [];
  const trimmedName = (name || "").trim();
  const trimmedPhone = (phone || "").trim();
  const trimmedEmail = (email || "").trim();
  const trimmedAddress = (address || "").trim();
  if (!trimmedName) return res.status(400).json({ error: "İsim gerekli." });
  if (!trimmedPhone && !trimmedEmail) return res.status(400).json({ error: "Telefon veya e-posta gerekli." });

  // Pazarlama izni burada gerçek bir opt-in — potansiyel müşteri kendi bilgisini
  // gönderirken kendi eliyle işaretliyor (e-posta yoksa kutu hiç gösterilmiyor,
  // form tarafında). KOBİ'nin manuel eklediği müşterilerden farklı olarak burada
  // ayrıca bir e-posta ile çift onay gerekmiyor - eylemin kendisi zaten doğrudan.
  // Fotoğraf izni burada BİLEREK sorulmuyor — henüz hiç müşteri olmamış, ilk kez
  // randevu talep eden birine bunu sormak korkutucu bulundu (2026-07-31). Fotoğraf
  // izni artık sadece BeforeAfterPhotos panelinden (requestPhotoConsent, App.jsx),
  // yani işletme gerçekten fotoğraf çekecekken, o müşteriye özel istenir.
  const consented = trimmedEmail && marketingConsent === true;
  const consentedAt = new Date().toISOString();
  const consentIp = consented ? getClientIp(req) : null;

  // --- Randevu talebi (AppointmentRequestPage, /randevu-al/{token}) ---
  // Sadece dateTime+dateTimeKey gönderildiğinde bu dal çalışır; düz /lead/ formu
  // (bunlar YOK) davranışı aşağıda hiç değişmeden devam eder — regresyon riski yok.
  if (dateTime && dateTimeKey) {
    if (new Date(dateTime).getTime() < Date.now()) {
      return res.status(400).json({ error: "Geçmiş bir tarih/saat için randevu alınamaz." });
    }

    // Aynı işletmede telefon/e-posta eşleşen bir müşteri varsa onu kullan — her
    // randevu talebinde yinelenen customers satırı oluşmasın (bkz. Gerçek engel
    // istisnaları: mükerrer telefon/e-posta zaten hard-block sayılıyor, burada da
    // aynı ruhla mükerrer kayıt yerine mevcut kayıt kullanılır). deleted_at IS
    // NULL şart — çöp kutusundaki bir müşteriyle eşleşirse deal ona bağlanıyor
    // ama ana ekranın customers listesi (deleted_at IS NULL filtreli) onu hiç
    // göstermiyor: "Bilinmeyen müşteri" + customerType okunamadığı için "kurumsal"
    // sekmesine düşme bugı buradan geliyordu (canlıda görüldü, 2026-07-31).
    let customerId = null;
    if (trimmedPhone) {
      const { data } = await supabaseAdmin.from("customers").select("id").eq("user_id", settings.user_id).eq("phone", trimmedPhone).is("deleted_at", null).limit(1).maybeSingle();
      customerId = data?.id || null;
    }
    if (!customerId && trimmedEmail) {
      const { data } = await supabaseAdmin.from("customers").select("id").eq("user_id", settings.user_id).eq("email", trimmedEmail).is("deleted_at", null).limit(1).maybeSingle();
      customerId = data?.id || null;
    }

    if (!customerId) {
      customerId = crypto.randomUUID();
      const { error: customerInsertError } = await supabaseAdmin.from("customers").insert({
        id: customerId,
        user_id: settings.user_id,
        name: trimmedName,
        // Lead capture'daki "kurumsal" varsayılanından farklı — randevu alan
        // gerçek bir bireysel tüketicidir.
        customer_type: "bireysel",
        phone: trimmedPhone,
        email: trimmedEmail,
        notes: `Randevu talebi formundan eklendi.${note ? ` Not: ${note.trim()}` : ""}`,
        last_contact: new Date().toISOString(),
        created_at: new Date().toISOString(),
        ...(consented ? { marketing_consent: true, marketing_consent_at: consentedAt, marketing_consent_source: "lead_capture", marketing_consent_ip: consentIp, marketing_consent_text: MARKETING_CONSENT_TEXT } : {}),
      });
      if (customerInsertError) return res.status(500).json({ error: customerInsertError.message });
    }

    let serviceName = null;
    let servicePrice = 0;
    let serviceDurationMinutes = 0;
    if (cleanServiceIds.length > 0) {
      const { data: services } = await supabaseAdmin.from("price_list_items").select("name, price, duration_minutes").eq("user_id", settings.user_id).in("id", cleanServiceIds);
      if (services?.length) {
        serviceName = services.map((s) => s.name).join(", ");
        servicePrice = services.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
        // Miktar süreyi katlamıyor, kalem sayısı toplanıyor - App.jsx'teki
        // lineItemsDurationMinutes ile AYNI ilke.
        serviceDurationMinutes = services.reduce((sum, s) => sum + (Number(s.duration_minutes) || 0), 0);
      }
    }

    // Race condition koruması: iki ziyaretçi aynı saati aynı anda seçebilir —
    // availability uç noktasının döndüğü liste bir kaç saniye eski olabilir,
    // burada tekrar doğrulanır. Süre biliniyorsa (serviceDurationMinutes) tam
    // saat eşitliği değil gerçek aralık çakışması bakılır -
    // api/appointment-availability.js'teki computeDaySlots ile AYNI overlap
    // ilkesi (App.jsx findAppointmentConflict).
    const candidateStart = minutesOfDay(dateTime);
    const candidateEnd = candidateStart + Math.max(serviceDurationMinutes, 1);
    const candidateDateStr = dateTime.slice(0, 10);
    const { data: existingDeals, error: conflictError } = await supabaseAdmin
      .from("deals")
      .select("custom_fields")
      .eq("user_id", settings.user_id)
      .is("deleted_at", null)
      .neq("stage", "kaybedildi");
    if (conflictError) return res.status(500).json({ error: conflictError.message });
    // appointment_concurrency (Ayarlar → Müsaitlik Saatleri → Eş zamanlı randevu
    // kapasitesi) - varsayılan 1, birden fazla uzman/koltuk/cihazı olan
    // işletmeler aynı saate N randevu alabilsin diye (api/appointment-
    // availability.js'teki AYNI mantık, bkz. sql/2026-08-03_appointment_concurrency.sql).
    const concurrency = Math.max(1, Number(settings.appointment_concurrency) || 1);
    const overlapCount = (existingDeals || []).filter((d) => {
      const dt = d.custom_fields?.[dateTimeKey];
      if (typeof dt !== "string" || !dt.startsWith(candidateDateStr)) return false;
      const otherStart = minutesOfDay(dt);
      const otherEnd = otherStart + Math.max(Number(d.custom_fields?.duration_minutes) || 1, 1);
      return candidateStart < otherEnd && otherStart < candidateEnd;
    }).length;
    if (overlapCount >= concurrency) return res.status(409).json({ error: "Bu saat az önce doldu, lütfen başka bir saat seçin." });

    // Kapora - KOBİ Ayarlar'dan açtıysa VE Ödeme Bağlantısı gerçekten kuruluysa,
    // deal "ödeme bekleniyor" (payment_mode=required) olarak oluşturulur ve
    // yanıtla birlikte bir approval_token dönülür - müşteri tarayıcıda hemen
    // deposit-checkout-init'e yönlendirilir (bkz. api/deal-approval.js). Ödemeyi
    // yarıda bırakırsa da bu kayıt kalıcı olarak durur, KOBİ talebi kaybetmez.
    // Hizmet fiyatı biliniyorsa (servicePrice > 0) kapora bu tutarı aşamaz -
    // aksi halde 3000 TL'lik bir hizmete 50 TL'lik bir hizmetle aynı sabit
    // kapora istenir, hatta hizmet bedelinden yüksek kapora istenmiş olurdu.
    let approvalToken = null;
    let effectiveDepositAmount = null;
    if (settings.appointment_deposit_amount > 0) {
      effectiveDepositAmount = servicePrice > 0 ? Math.min(settings.appointment_deposit_amount, servicePrice) : settings.appointment_deposit_amount;
      const { data: cred } = await supabaseAdmin.from("payment_credentials").select("id").eq("user_id", settings.user_id).maybeSingle();
      if (cred) approvalToken = crypto.randomUUID();
    }

    const dealId = crypto.randomUUID();

    // api/appointment-availability.js'teki handleBooking ile AYNI otomatik
    // kaynak atama mantığı (kasıtlı kopya) - bu güncellenmezse widget üzerinden
    // gelen randevular deals_resource_unit_no_overlap EXCLUDE CONSTRAINT'ini
    // tamamen bypass eder.
    let resourceUnitId = null, appointmentStart = null, appointmentEnd = null;
    const autoResourceId = await resolveAutoAssignResource(supabaseAdmin, settings.user_id);
    if (autoResourceId) {
      const bounds = buildAppointmentBounds(dateTime, serviceDurationMinutes || 1);
      if (bounds) {
        for (let attempt = 0; attempt < 3 && !resourceUnitId; attempt++) {
          const { data: unitId } = await supabaseAdmin.rpc("pick_free_resource_unit", {
            p_resource_id: autoResourceId, p_start: bounds.startIso, p_end: bounds.endIso, p_exclude_deal_id: dealId,
          });
          if (!unitId) break;
          resourceUnitId = unitId;
          appointmentStart = bounds.startIso;
          appointmentEnd = bounds.endIso;
        }
      }
      if (!resourceUnitId) return res.status(409).json({ error: "Bu saat az önce doldu, lütfen başka bir saat seçin." });
    }

    const { error: dealInsertError } = await supabaseAdmin.from("deals").insert({
      id: dealId,
      user_id: settings.user_id,
      customer_id: customerId,
      title: serviceName || (note || "").trim() || "Randevu talebi",
      value: servicePrice,
      stage: "ilk_gorusme",
      resource_unit_id: resourceUnitId, appointment_start: appointmentStart, appointment_end: appointmentEnd,
      custom_fields: {
        [dateTimeKey]: dateTime, portal_randevu_zamani: dateTime, kaynak: "randevu_widget",
        ...(serviceDurationMinutes > 0 ? { duration_minutes: serviceDurationMinutes } : {}),
      },
      ...(approvalToken ? { approval_token: approvalToken, payment_mode: "required" } : {}),
    });
    if (dealInsertError) {
      // 23P01 = exclusion_violation - resourceUnitId'yi başka bir eşzamanlı
      // istek, yukarıdaki kontrolden SONRA ama bu insert'ten ÖNCE kapmış.
      if (dealInsertError.code === "23P01") return res.status(409).json({ error: "Bu saat az önce doldu, lütfen başka bir saat seçin." });
      return res.status(500).json({ error: dealInsertError.message });
    }

    if (approvalToken) {
      return res.status(200).json({ ok: true, booked: true, needsDeposit: true, approvalToken, depositAmount: effectiveDepositAmount });
    }
    return res.status(200).json({ ok: true, booked: true });
  }

  const { error: insertError } = await supabaseAdmin.from("customers").insert({
    id: crypto.randomUUID(),
    user_id: settings.user_id,
    name: trimmedName,
    customer_type: "kurumsal",
    phone: trimmedPhone,
    email: trimmedEmail,
    address: trimmedAddress,
    notes: `Web formundan eklendi.${note ? ` Not: ${note.trim()}` : ""}`,
    last_contact: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...(consented ? { marketing_consent: true, marketing_consent_at: consentedAt, marketing_consent_source: "lead_capture", marketing_consent_ip: consentIp, marketing_consent_text: MARKETING_CONSENT_TEXT } : {}),
  });
  if (insertError) return res.status(500).json({ error: insertError.message });

  return res.status(200).json({ ok: true });
}
