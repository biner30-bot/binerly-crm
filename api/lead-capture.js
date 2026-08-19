import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

// KVKK ispat kaydı için — deal-approval.js'teki AYNI fonksiyon, aralarında
// import olmadığı için kopyalanmış (bkz. sql/2026-07-31_consent_ip_and_text.sql).
function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || "203.0.113.1";
}

// src/Sectors.jsx'teki dealWordKind'ın AYNI mantığı (kasıtlı kopya - api/*.js
// dosyaları src/*.jsx'ten import etmiyor). Vitrin CTA butonunun etiketini
// belirler: randevu (Güzellik&Bakım/Sağlık-Klinik), rezervasyon (Otel),
// üyelik (Spor Merkezi), diğerleri teklif.
function sectorCtaKind(sector) {
  if (sector === "spor_merkezi") return "uyelik";
  if (sector === "guzellik_bakim" || sector === "saglik_klinik") return "randevu";
  if (sector === "otel") return "rezervasyon";
  return "teklif";
}
const CTA_LABELS = { randevu: "Randevu Al", teklif: "Teklif Al", rezervasyon: "Rezervasyon Yap", uyelik: "Üye Ol" };

// vercel.json'daki /vitrin/:token rewrite'ı bu uç noktayı ?render=html ile
// çağırıyor - Google/paylaşım-önizleme botları JS çalıştırmadan/geç çalıştırıp
// gerçek başlık+meta+JSON-LD görsün diye. ShowcasePage.jsx'in kendi fetch'i
// bu parametreyi HİÇ göndermez, o yüzden normal JSON akışı etkilenmiyor.
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// O anki deploy'un GERÇEK build çıktısını okur (hashli script/link tag'leri
// dahil) - index.html'i elle kopyalamak/hardcode etmek her build'de kırılırdı.
async function fetchIndexHtml(req) {
  const res = await fetch(`https://${req.headers.host}/index.html`);
  return res.text();
}

// index.html'deki varsayılan (Binerly genel) meta/OG/twitter/JSON-LD
// etiketlerini şirkete özel değerlerle değiştirir. Regex'ler TAG YAPISINA
// (property/name attribute'una) göre eşleşiyor, tam içerik metnine göre
// değil - index.html'deki metin ileride değişse bile kırılmaz, sadece
// eşleşme bulunamazsa o etiket sessizce varsayılan kalır (soft-fail).
function renderVitrinHtml(baseHtml, payload, vitrinUrl) {
  const name = payload.companyName;
  const contactLine = [payload.address, payload.phone].filter(Boolean).join(" · ");
  const description = `${name}${contactLine ? " - " + contactLine : ""} - fiyat listesi ve kampanyalarını Binerly Vitrin'de görüntüleyin.`;
  const title = `${name} - Binerly Vitrin`;
  const image = payload.logoUrl || "https://binerly.com/og-image.png";
  const titleSafe = escapeHtml(title);
  const descSafe = escapeHtml(description);
  const urlSafe = escapeHtml(vitrinUrl);
  const imageSafe = escapeHtml(image);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name,
    ...(payload.logoUrl ? { image: payload.logoUrl } : {}),
    ...(payload.phone ? { telephone: payload.phone } : {}),
    ...(payload.address ? { address: payload.address } : {}),
    url: vitrinUrl,
  };
  const jsonLdSafe = JSON.stringify(jsonLd).replace(/</g, "\\u003c");

  return baseHtml
    .replace(/<title>.*?<\/title>/s, `<title>${titleSafe}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${descSafe}" />`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${urlSafe}" />`)
    .replace(/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${urlSafe}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${titleSafe}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${descSafe}" />`)
    .replace(/<meta property="og:image" content="[^"]*"\s*\/>/, `<meta property="og:image" content="${imageSafe}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${titleSafe}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${descSafe}" />`)
    .replace(/<meta name="twitter:image" content="[^"]*"\s*\/>/, `<meta name="twitter:image" content="${imageSafe}" />`)
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">${jsonLdSafe}</script>`);
}

// api/appointment-availability.js'teki AYNI yardımcı (kasıtlı kopya, projenin
// diğer "ayrı dosya, ayrı kopya" desenleriyle tutarlı).
function minutesOfDay(dateTimeStr) {
  const [hh, mm] = dateTimeStr.slice(11, 16).split(":").map(Number);
  return hh * 60 + mm;
}

// api/appointment-availability.js'teki AYNI fonksiyon (kasıtlı kopya) -
// seçilen hizmetlerin price_list_items.resource_id eşleşmesine göre doğru
// kaynağı otomatik atar; hiçbir hizmete hiç kaynak atanmamışsa (özellik hiç
// kullanılmıyor) eski davranışa (tek aktif kaynak varsa onu kullan) düşer.
async function resolveAutoAssignResource(supabaseAdmin, businessUserId, serviceIds) {
  const ids = Array.isArray(serviceIds) ? serviceIds.filter(Boolean) : [];
  if (ids.length > 0) {
    const { data: mapped } = await supabaseAdmin.from("price_list_items").select("resource_id").eq("user_id", businessUserId).in("id", ids);
    const distinct = [...new Set((mapped || []).map((m) => m.resource_id).filter(Boolean))];
    if (distinct.length === 1) return distinct[0];
    if (distinct.length > 1) return null;
  }
  const { data: anyMapped } = await supabaseAdmin.from("price_list_items").select("id").eq("user_id", businessUserId).not("resource_id", "is", null).limit(1);
  if (anyMapped && anyMapped.length > 0) return null;
  const { data } = await supabaseAdmin.from("resources").select("id").eq("user_id", businessUserId).eq("active", true);
  if (!data || data.length !== 1) return null;
  return data[0].id;
}
// src/Deals.jsx:lineItemsDurationMinutes ile AYNI ilke (kasıtlı kopya) -
// parallel_group'a göre gruplanır (boş/null her satır kendi tek kişilik
// grubunda), grup içi MAX (eşzamanlı), gruplar arası SUM (ardışık).
function groupedDurationMinutes(items) {
  const groups = new Map();
  (items || []).forEach((item, i) => {
    const key = item.parallel_group || `__solo_${item.id ?? i}`;
    groups.set(key, Math.max(groups.get(key) || 0, Number(item.duration_minutes) || 0));
  });
  return [...groups.values()].reduce((sum, v) => sum + v, 0);
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

// Aynı işletmede telefon/e-posta eşleşen bir müşteri varsa onu kullanır — her
// randevu talebinde/bekleme listesi kaydında yinelenen customers satırı
// oluşmasın (bkz. Gerçek engel istisnaları: mükerrer telefon/e-posta zaten
// hard-block sayılıyor, burada da aynı ruhla mükerrer kayıt yerine mevcut
// kayıt kullanılır). deleted_at IS NULL şart — çöp kutusundaki bir müşteriyle
// eşleşirse deal ona bağlanıyor ama ana ekranın customers listesi
// (deleted_at IS NULL filtreli) onu hiç göstermiyor: "Bilinmeyen müşteri" +
// customerType okunamadığı için "kurumsal" sekmesine düşme bugı buradan
// geliyordu (canlıda görüldü, 2026-07-31). Randevu talebi VE bekleme listesi
// kaydı AYNI mantığı kullansın diye ortak bir fonksiyona çıkarıldı.
async function findOrCreateAppointmentCustomer(supabaseAdmin, settings, { trimmedName, trimmedPhone, trimmedEmail, notes, consented, consentedAt, consentIp }) {
  let customerId = null;
  if (trimmedPhone) {
    const { data } = await supabaseAdmin.from("customers").select("id").eq("user_id", settings.user_id).eq("phone", trimmedPhone).is("deleted_at", null).limit(1).maybeSingle();
    customerId = data?.id || null;
  }
  if (!customerId && trimmedEmail) {
    const { data } = await supabaseAdmin.from("customers").select("id").eq("user_id", settings.user_id).eq("email", trimmedEmail).is("deleted_at", null).limit(1).maybeSingle();
    customerId = data?.id || null;
  }
  if (customerId) return { customerId };

  customerId = crypto.randomUUID();
  const { error } = await supabaseAdmin.from("customers").insert({
    id: customerId,
    user_id: settings.user_id,
    name: trimmedName,
    // Lead capture'daki "kurumsal" varsayılanından farklı — randevu alan/
    // bekleyen gerçek bir bireysel tüketicidir.
    customer_type: "bireysel",
    phone: trimmedPhone,
    email: trimmedEmail,
    notes,
    last_contact: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...(consented ? { marketing_consent: true, marketing_consent_at: consentedAt, marketing_consent_source: "lead_capture", marketing_consent_ip: consentIp, marketing_consent_text: MARKETING_CONSENT_TEXT } : {}),
  });
  return { customerId, error };
}

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
  // Aşağıdaki .or() filtresine ham girdi olarak gidiyor - token her zaman ya
  // bir UUID (crypto.randomUUID()) ya da bir slug (yalnızca [a-z0-9-]) olduğu
  // için bu karakter kümesi dışına çıkan bir istek zaten geçersizdir; erkenden
  // reddetmek PostgREST'in OR mini-dilinde filtre enjeksiyonunu (virgül/nokta
  // vb.) da önler.
  if (!/^[a-zA-Z0-9-]+$/.test(token)) return res.status(400).json({ error: "Geçersiz bağlantı." });
  // vercel.json'daki /vitrin/:token rewrite'ı bunu çağırıyor - ShowcasePage.jsx'in
  // kendi client-side fetch'i bu parametreyi hiç göndermez.
  const wantsHtml = url.searchParams.get("view") === "vitrin" && url.searchParams.get("render") === "html";

  // showcase_slug'ı da OR ile arıyoruz - Vitrin'in okunabilir adresi
  // (/vitrin/{slug}) aynı company_settings satırına, eski token'la birlikte
  // İKİ çözümleme yoluyla erişilebilir olsun diye (bkz. sql/2026-08-19_showcase_slug.sql).
  // Diğer sayfalar (lead/randevu-al) da aynı sorguyu paylaştığı için slug'ı
  // orada da kabul eder - zararsız, aynı company_settings satırına düşer.
  const { data: settings, error: settingsError } = await supabaseAdmin
    .from("company_settings")
    .select("user_id, company_name, logo_url, sector, appointment_deposit_amount, appointment_concurrency, address, phone, showcase_price_list_visible, showcase_slug")
    .or(`lead_capture_token.eq.${token},showcase_slug.eq.${token}`)
    .maybeSingle();
  if (settingsError) console.error("lead-capture query error:", settingsError.message);
  if (settingsError || !settings) {
    // wantsHtml'de düz JSON dönmek React'in hiç boot olmamasına (raw JSON
    // metni görünmesine) yol açardı - onun yerine değiştirilmemiş index.html'i
    // 404 status'uyla döneriz, SPA yine açılır ve ShowcasePage.jsx kendi
    // client-side fetch'iyle (view=vitrin, render'sız) normal "Bulunamadı."
    // durumunu gösterir.
    if (wantsHtml) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(404).send(await fetchIndexHtml(req));
    }
    return res.status(404).json({ error: "Bağlantı geçersiz." });
  }

  if (req.method === "GET") {
    // /vitrin/{token} (ShowcasePage) AYNI token'ı, AYNI endpoint'i kullanıyor
    // (Vercel Hobby'nin 12 fonksiyon sınırı zaten dolu olduğu için ayrı bir
    // api/*.js açılmadı) — ?view=vitrin ile ayrı bir dal, diğer sayfaların
    // (LeadCapturePage/AppointmentRequestPage) her GET'inde gereksiz sorgu
    // çalışmasın diye SADECE istendiğinde devreye girer.
    if (url.searchParams.get("view") === "vitrin") {
      // Vitrin artık tüm sektörlerde açık (önceden sadece Güzellik&Bakım/Sağlık-Klinik'te
      // çalışıyordu) - ayrı bir sektör kontrolüne gerek yok, showcase_featured zaten
      // sadece randevu sektörlerinde UI'dan (BeforeAfterPhotos) set edilebiliyor, diğer
      // sektörlerde bu sorgu doğal olarak boş döner.
      const { data: featuredDeals } = await supabaseAdmin
        .from("deals")
        .select("id, title, customer_id")
        .eq("user_id", settings.user_id)
        .eq("showcase_featured", true)
        .is("deleted_at", null);
      let showcase = [];
      if (featuredDeals?.length) {
        const dealIds = featuredDeals.map((d) => d.id);
        const customerIds = [...new Set(featuredDeals.map((d) => d.customer_id).filter(Boolean))];
        const [{ data: consentedCustomers }, { data: photos }] = await Promise.all([
          supabaseAdmin.from("customers").select("id").in("id", customerIds).eq("photo_consent", true),
          supabaseAdmin.from("attachments").select("id, entity_id, storage_path, photo_type").eq("entity_type", "deal_photos").in("entity_id", dealIds),
        ]);
        // Müşteri iznini sonradan geri almış olabilir - showcase_featured hâlâ
        // true olsa bile burada tekrar kontrol edilmezse geri çekilmiş bir izin
        // sessizce ihlal edilirdi (bkz. sql/2026-08-12_showcase_featured.sql).
        const consentedIds = new Set((consentedCustomers || []).map((c) => c.id));
        const photosByDeal = {};
        for (const p of photos || []) {
          (photosByDeal[p.entity_id] ||= {})[p.photo_type] = p.storage_path;
        }
        const entries = featuredDeals
          .filter((d) => consentedIds.has(d.customer_id))
          .map((d) => ({ id: d.id, title: d.title, beforePath: photosByDeal[d.id]?.before, afterPath: photosByDeal[d.id]?.after }))
          .filter((e) => e.beforePath && e.afterPath);
        const paths = entries.flatMap((e) => [e.beforePath, e.afterPath]);
        if (paths.length) {
          const { data: signed } = await supabaseAdmin.storage.from("attachments").createSignedUrls(paths, 3600);
          const urlByPath = {};
          (signed || []).forEach((s, i) => { if (s?.signedUrl) urlByPath[paths[i]] = s.signedUrl; });
          showcase = entries
            .map((e) => ({ id: e.id, title: e.title, beforeUrl: urlByPath[e.beforePath], afterUrl: urlByPath[e.afterPath] }))
            .filter((e) => e.beforeUrl && e.afterUrl);
        }
      }
      let priceList = [];
      if (settings.showcase_price_list_visible) {
        const { data: items } = await supabaseAdmin
          .from("price_list_items")
          .select("name, price, duration_minutes")
          .eq("user_id", settings.user_id)
          .order("sort_order");
        priceList = (items || []).map((i) => ({ name: i.name, price: i.price, durationMinutes: i.duration_minutes }));
      }

      const today = new Date().toISOString().slice(0, 10);
      const { data: campaignRows } = await supabaseAdmin
        .from("showcase_campaigns")
        .select("id, title, description, starts_at, ends_at")
        .eq("user_id", settings.user_id)
        .eq("active", true)
        .or(`ends_at.is.null,ends_at.gte.${today}`)
        .order("sort_order");
      const campaigns = (campaignRows || []).map((c) => ({ id: c.id, title: c.title, description: c.description, startsAt: c.starts_at, endsAt: c.ends_at }));

      // /randevu-al/{token} dalındaki (aşağıda) AYNI kontrol (kasıtlı kopya):
      // deal'lerde aktif bir datetime özel alanı var mı - varsa gerçek, giriş
      // gerektirmeyen öz-hizmet randevu widget'ı çalışır. Yoksa (veya Otel'de,
      // AppointmentRequestPage'in slot modeli oteli desteklemiyor) CTA butonu
      // Müşteri Kazanma Linki'ndeki (/lead/{token}) genel "bilgi bırak" formuna
      // düşer - KOBİ elle döner (bkz. plan: Otel/Spor Merkezi'nde gerçek anonim
      // rezervasyon/üyelik sistemi bilinçli olarak inşa edilmedi).
      const { data: apptFieldDefs } = await supabaseAdmin
        .from("custom_field_defs")
        .select("key")
        .eq("user_id", settings.user_id)
        .eq("entity", "deal")
        .eq("field_type", "datetime")
        .eq("active", true)
        .limit(1);
      const acceptsAppointments = !!apptFieldDefs?.[0]?.key && settings.sector !== "otel";
      const ctaKind = sectorCtaKind(settings.sector);

      const vitrinPayload = {
        companyName: settings.company_name || "Binerly",
        logoUrl: settings.logo_url || null,
        address: settings.address || null,
        phone: settings.phone || null,
        showcase,
        priceList,
        campaigns,
        ctaLabel: CTA_LABELS[ctaKind],
        ctaHref: acceptsAppointments ? `/randevu-al/${token}` : `/lead/${token}`,
      };

      if (wantsHtml) {
        const vitrinUrl = `https://binerly.com/vitrin/${settings.showcase_slug || token}`;
        const base = await fetchIndexHtml(req);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(200).send(renderVitrinHtml(base, vitrinPayload, vitrinUrl));
      }
      return res.status(200).json(vitrinPayload);
    }

    // /randevu-al/{token} (AppointmentRequestPage) aynı token'ı, aynı endpoint'i
    // kullanıyor — appointment-availability.js'teki AYNI sorguyla "bu işletmenin
    // aktif bir randevu tarihi alanı var mı" belirlenir (Vercel Hobby'nin 12
    // fonksiyon sınırı zaten dolu olduğu için ayrı bir api/*.js açılmadı).
    const [{ data: fieldDefs }, { data: services }, { data: cred }] = await Promise.all([
      supabaseAdmin.from("custom_field_defs").select("key").eq("user_id", settings.user_id).eq("entity", "deal").eq("field_type", "datetime").eq("active", true).limit(1),
      supabaseAdmin.from("price_list_items").select("id, name, price, duration_minutes, parallel_group").eq("user_id", settings.user_id).order("name"),
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

  const { name, phone, email, address, note, marketingConsent, dateTime, dateTimeKey, serviceIds, waitlistDate } = req.body || {};
  const cleanServiceIds = Array.isArray(serviceIds) ? serviceIds.filter((id) => typeof id === "string" && id) : [];
  const trimmedName = (name || "").trim();
  const trimmedPhone = (phone || "").trim();
  const trimmedEmail = (email || "").trim();
  const trimmedAddress = (address || "").trim();
  if (!trimmedName) return res.status(400).json({ error: "İsim gerekli." });
  if (!trimmedPhone && !trimmedEmail) return res.status(400).json({ error: "Telefon veya e-posta gerekli." });

  // --- Bekleme listesi kaydı (AppointmentRequestPage, dolu bir gün seçilince
  // "Bu gün için beni haberdar et") --- dateTime/dateTimeKey'den AYRI bir dal:
  // burada belirli bir SAAT değil sadece bir GÜN seçiliyor (bkz.
  // sql/2026-08-12_appointment_waitlist.sql). appointment-availability.js'teki
  // kaynak/eşzamanlılık-farkında tam slot hesabı BİLİNÇLİ OLARAK tekrarlanmadı -
  // send-reminders.js'teki günlük tarama, freedAppointmentAlerts'ın (Pano)
  // kullandığı AYNI basit sinyali (o gün için "kaybedildi" bir randevu var mı)
  // kullanır, tutarlılık için.
  if (waitlistDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(waitlistDate)) return res.status(400).json({ error: "Geçersiz tarih." });
    const { customerId, error: customerError } = await findOrCreateAppointmentCustomer(supabaseAdmin, settings, {
      trimmedName, trimmedPhone, trimmedEmail, consented: trimmedEmail && marketingConsent === true, consentedAt: new Date().toISOString(), consentIp: getClientIp(req),
      notes: `Bekleme listesi: ${waitlistDate} için boş yer talebi.`,
    });
    if (customerError) return res.status(500).json({ error: customerError.message });
    const { error: waitlistError } = await supabaseAdmin.from("appointment_waitlist").insert({
      user_id: settings.user_id, customer_id: customerId, requested_date: waitlistDate,
    });
    if (waitlistError) return res.status(500).json({ error: waitlistError.message });
    return res.status(200).json({ ok: true, waitlisted: true });
  }

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

    const { customerId, error: customerInsertError } = await findOrCreateAppointmentCustomer(supabaseAdmin, settings, {
      trimmedName, trimmedPhone, trimmedEmail, consented, consentedAt, consentIp,
      notes: `Randevu talebi formundan eklendi.${note ? ` Not: ${note.trim()}` : ""}`,
    });
    if (customerInsertError) return res.status(500).json({ error: customerInsertError.message });

    let serviceName = null;
    let servicePrice = 0;
    let serviceDurationMinutes = 0;
    if (cleanServiceIds.length > 0) {
      const { data: services } = await supabaseAdmin.from("price_list_items").select("id, name, price, duration_minutes, parallel_group").eq("user_id", settings.user_id).in("id", cleanServiceIds);
      if (services?.length) {
        serviceName = services.map((s) => s.name).join(", ");
        servicePrice = services.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
        // Miktar süreyi katlamıyor, kalem sayısı toplanıyor - App.jsx'teki
        // lineItemsDurationMinutes ile AYNI ilke (parallel_group dahil).
        serviceDurationMinutes = groupedDurationMinutes(services);
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

    // appointmentStart/End artık kaynak seçili olsun olmasın HER ZAMAN
    // hesaplanır (Aşama 2'de CRM tarafında düzeltilen AYNI sorunun widget
    // eşdeğeri) - aşağıdaki genel kapasite slotu için gerçek bir
    // appointment_range şart, sadece kaynak varsa dolması yetmiyordu.
    const bounds = buildAppointmentBounds(dateTime, serviceDurationMinutes || 1);
    let appointmentStart = bounds?.startIso || null;
    let appointmentEnd = bounds?.endIso || null;

    // api/appointment-availability.js'teki handleBooking ile AYNI otomatik
    // kaynak atama mantığı (kasıtlı kopya) - bu güncellenmezse widget üzerinden
    // gelen randevular deals_resource_unit_no_overlap EXCLUDE CONSTRAINT'ini
    // tamamen bypass eder.
    let resourceUnitId = null;
    const autoResourceId = await resolveAutoAssignResource(supabaseAdmin, settings.user_id, cleanServiceIds);
    if (autoResourceId && bounds) {
      for (let attempt = 0; attempt < 3 && !resourceUnitId; attempt++) {
        const { data: unitId } = await supabaseAdmin.rpc("pick_free_resource_unit", {
          p_resource_id: autoResourceId, p_start: bounds.startIso, p_end: bounds.endIso, p_exclude_deal_id: dealId,
        });
        if (!unitId) break;
        resourceUnitId = unitId;
      }
      if (!resourceUnitId) return res.status(409).json({ error: "Bu saat az önce doldu, lütfen başka bir saat seçin." });
    }

    // Genel "Eş zamanlı randevu kapasitesi" - yukarıdaki overlapCount sayımı
    // sadece ucuz/erken bir ön-kontrol, atomik değil. concurrency_slots (bkz.
    // sql/2026-08-09_deals_concurrency_slots.sql) resource_unit_id ile AYNI
    // desende gerçek/atomik son garanti - kaynak seçili olsun olmasın HER
    // randevu bir slotu tüketir (api/appointment-availability.js ile AYNI,
    // kasıtlı kopya).
    let concurrencySlotId = null;
    if (bounds) {
      for (let attempt = 0; attempt < 3 && !concurrencySlotId; attempt++) {
        const { data: slotId } = await supabaseAdmin.rpc("pick_free_concurrency_slot", {
          p_user_id: settings.user_id, p_start: bounds.startIso, p_end: bounds.endIso, p_exclude_deal_id: dealId,
        });
        if (!slotId) break;
        concurrencySlotId = slotId;
      }
      if (!concurrencySlotId) return res.status(409).json({ error: "Bu saat az önce doldu, lütfen başka bir saat seçin." });
    }

    const { error: dealInsertError } = await supabaseAdmin.from("deals").insert({
      id: dealId,
      user_id: settings.user_id,
      customer_id: customerId,
      title: serviceName || (note || "").trim() || "Randevu talebi",
      value: servicePrice,
      stage: "ilk_gorusme",
      resource_unit_id: resourceUnitId, concurrency_slot_id: concurrencySlotId,
      appointment_start: appointmentStart, appointment_end: appointmentEnd,
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
