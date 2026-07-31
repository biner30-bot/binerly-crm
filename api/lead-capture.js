import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

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
    .select("user_id, company_name, logo_url, sector")
    .eq("lead_capture_token", token)
    .maybeSingle();
  if (settingsError) console.error("lead-capture query error:", settingsError.message);
  if (settingsError || !settings) return res.status(404).json({ error: "Bağlantı geçersiz." });

  // Sectors.jsx JSX içerdiği için api/*.js'e import edilemiyor (deal-approval.js'deki
  // APPOINTMENT_SECTORS kopyalama deseniyle aynı) — sadece randevu sektörlerinde
  // (guzellik_bakim/saglik_klinik) fotoğraf saklama izni de anlamlı.
  const needsPhoto = settings.sector === "guzellik_bakim" || settings.sector === "saglik_klinik";

  if (req.method === "GET") {
    // /randevu-al/{token} (AppointmentRequestPage) aynı token'ı, aynı endpoint'i
    // kullanıyor — appointment-availability.js'teki AYNI sorguyla "bu işletmenin
    // aktif bir randevu tarihi alanı var mı" belirlenir (Vercel Hobby'nin 12
    // fonksiyon sınırı zaten dolu olduğu için ayrı bir api/*.js açılmadı).
    const [{ data: fieldDefs }, { data: services }] = await Promise.all([
      supabaseAdmin.from("custom_field_defs").select("key").eq("user_id", settings.user_id).eq("entity", "deal").eq("field_type", "datetime").eq("active", true).limit(1),
      supabaseAdmin.from("price_list_items").select("id, name, price").eq("user_id", settings.user_id).order("name"),
    ]);
    return res.status(200).json({
      companyName: settings.company_name || "Binerly",
      logoUrl: settings.logo_url || null,
      needsPhotoConsent: needsPhoto,
      businessUserId: settings.user_id,
      acceptsAppointments: !!fieldDefs?.[0]?.key,
      services: services || [],
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { name, phone, email, address, note, marketingConsent, dateTime, dateTimeKey, serviceId } = req.body || {};
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
  // Randevu sektörlerinde aynı checkbox/aynı onay fotoğraf saklama iznini de kapsıyor
  // (bkz. sql/2026-07-30_customer_photo_consent.sql) — ayrı bir soru YOK, tek metin.
  const consented = trimmedEmail && marketingConsent === true;
  const consentedAt = new Date().toISOString();

  // --- Randevu talebi (AppointmentRequestPage, /randevu-al/{token}) ---
  // Sadece dateTime+dateTimeKey gönderildiğinde bu dal çalışır; düz /lead/ formu
  // (bunlar YOK) davranışı aşağıda hiç değişmeden devam eder — regresyon riski yok.
  if (dateTime && dateTimeKey) {
    if (new Date(dateTime).getTime() < Date.now()) {
      return res.status(400).json({ error: "Geçmiş bir tarih/saat için randevu alınamaz." });
    }

    // Race condition koruması: iki ziyaretçi aynı saati aynı anda seçebilir —
    // availability uç noktasının döndüğü liste bir kaç saniye eski olabilir,
    // burada tekrar doğrulanır (bookAppointment'taki client-side kontrolün
    // sunucu tarafı eşleniği).
    const { data: existingDeals, error: conflictError } = await supabaseAdmin
      .from("deals")
      .select("custom_fields")
      .eq("user_id", settings.user_id)
      .is("deleted_at", null)
      .neq("stage", "kaybedildi");
    if (conflictError) return res.status(500).json({ error: conflictError.message });
    const taken = (existingDeals || []).some((d) => d.custom_fields?.[dateTimeKey] === dateTime);
    if (taken) return res.status(409).json({ error: "Bu saat az önce doldu, lütfen başka bir saat seçin." });

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
        ...(consented ? { marketing_consent: true, marketing_consent_at: consentedAt, marketing_consent_source: "lead_capture" } : {}),
        ...(consented && needsPhoto ? { photo_consent: true, photo_consent_at: consentedAt, photo_consent_source: "lead_capture" } : {}),
      });
      if (customerInsertError) return res.status(500).json({ error: customerInsertError.message });
    }

    let serviceName = null;
    let servicePrice = 0;
    if (serviceId) {
      const { data: service } = await supabaseAdmin.from("price_list_items").select("name, price").eq("id", serviceId).eq("user_id", settings.user_id).maybeSingle();
      if (service) { serviceName = service.name; servicePrice = Number(service.price) || 0; }
    }

    const { error: dealInsertError } = await supabaseAdmin.from("deals").insert({
      id: crypto.randomUUID(),
      user_id: settings.user_id,
      customer_id: customerId,
      title: serviceName || (note || "").trim() || "Randevu talebi",
      value: servicePrice,
      stage: "ilk_gorusme",
      custom_fields: { [dateTimeKey]: dateTime, portal_randevu_zamani: dateTime, kaynak: "randevu_widget" },
    });
    if (dealInsertError) return res.status(500).json({ error: dealInsertError.message });

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
    ...(consented ? { marketing_consent: true, marketing_consent_at: consentedAt, marketing_consent_source: "lead_capture" } : {}),
    ...(consented && needsPhoto ? { photo_consent: true, photo_consent_at: consentedAt, photo_consent_source: "lead_capture" } : {}),
  });
  if (insertError) return res.status(500).json({ error: insertError.message });

  return res.status(200).json({ ok: true });
}
