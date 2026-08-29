import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import Iyzipay from "iyzipay";
import { renderEmailHtml, plainTextFallback } from "./_email-template.js";
import { applyServiceCapacity } from "./_appointment-concurrency.js";

const IYZICO_BASE_URL = { sandbox: "https://sandbox-api.iyzipay.com", production: "https://api.iyzipay.com" };
const PAYTR_GET_TOKEN_URL = "https://www.paytr.com/odeme/api/get-token";
const PAYTR_REFUND_URL = "https://www.paytr.com/odeme/iade";
const INSTALLMENT_TIERS = [1, 2, 3, 6, 9, 12]; // Türkiye'deki standart taksit kademeleri

// api/whatsapp-webhook.js / api/instagram-webhook.js'teki AYNI ilke (kasıtlı
// kopya, projenin diğer "ayrı dosya, ayrı kopya" desenleriyle tutarlı) —
// düz === karşılaştırması bir zamanlama yan kanalı (timing side-channel)
// bırakır, PayTR imza doğrulamasında bunun yerine kullanılır.
function secretsMatch(a, b) {
  const bufA = Buffer.from(String(a || ""));
  const bufB = Buffer.from(String(b || ""));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// İzin verilirken kaydedilen TAM metin — istemciden ASLA alınmaz (client kendi
// metnini uydurup gönderebilirdi, kanıtı değersizleştirirdi). lead-capture.js'te
// de aynı MARKETING_CONSENT_TEXT sabiti var, aralarında import olmadığı için elle
// senkron tutulmalı (bkz. sql/2026-07-31_consent_ip_and_text.sql).
const MARKETING_CONSENT_TEXT = "Kampanya ve değerlendirme isteği gibi e-postalar almak istiyorum";
const PHOTO_CONSENT_TEXT = "Hizmet öncesi/sonrası fotoğraflarımın çekilip saklanmasına izin veriyorum";

function hmacSha256Base64(str, key) {
  return crypto.createHmac("sha256", key).update(str).digest("base64");
}

// Callback'ler önce SELECT ile payment_status kontrol edip sonra ayrı bir
// adımda UPDATE ediyor — sağlayıcının (özellikle PayTR'nin, "OK" dönene
// kadar tekrar tekrar deneyen) neredeyse eş zamanlı iki bildirimi arada bu
// SELECT/UPDATE boşluğuna denk gelirse ikisi de "henüz ödenmemiş" görüp
// mükerrer payments/komisyon/bildirim kaydı üretebilirdi. Bunun yerine
// deals satırını ATOMİK olarak "işleniyor" durumuna claim ediyoruz — DB
// satırının O ANKİ payment_status'u hâlâ 'paid' değilse tek bir istek
// başarılı olur, diğerleri claimed=false alıp sessizce çıkar.
async function claimDealPayment(supabaseAdmin, dealId) {
  // İlk ödemesini alan bir teklifte payment_status genelde NULL'dır (henüz hiç
  // set edilmemiş) — Postgres'te "payment_status <> 'paid'" koşulu NULL
  // satırları EŞLEŞMİYOR sayar (üç değerli mantık), bu yüzden .neq() tek
  // başına NULL olan (yani en yaygın, ilk ödeme) durumda hiçbir satır
  // bulamayıp claim'i sessizce başarısız gösteriyordu — ödeme iyzico'da
  // başarılı olsa bile sitede hiç işlenmiyordu. .or() ile NULL de kapsanıyor.
  const { data, error } = await supabaseAdmin
    .from("deals")
    .update({ payment_status: "paid" })
    .eq("id", dealId)
    .or("payment_status.is.null,payment_status.neq.paid")
    .select("id");
  if (error) {
    console.error("claimDealPayment error:", error.message, "deal.id:", dealId);
    return false;
  }
  return (data || []).length > 0;
}

// "Teklif okundu" bildirimi için — müşteri onay linkini kimliği doğrulanmış
// olarak ilk kez açtığı anı yakalar. claimDealPayment'teki gibi atomik: sadece
// first_viewed_at hâlâ NULL'sa güncelleme bir satır döner, bu isteği "kazanan"
// (ve dolayısıyla bildirimi tetikleyecek) istek olur — art arda gelen
// GET'lerde (örn. giriş öncesi/sonrası iki istek, veya müşterinin sayfayı
// tekrar açması) yalnızca gerçekten ilk seferde bildirim gider.
async function claimFirstView(supabaseAdmin, dealId) {
  const { data, error } = await supabaseAdmin
    .from("deals")
    .update({ first_viewed_at: new Date().toISOString() })
    .eq("id", dealId)
    .is("first_viewed_at", null)
    .select("id");
  if (error) {
    console.error("claimFirstView error:", error.message, "deal.id:", dealId);
    return false;
  }
  return (data || []).length > 0;
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  // Vercel normalde x-forwarded-for'u hep dolduruyor, buraya düşmek çok nadir —
  // ama düşerse gerçek/başkasına ait olabilecek bir IP yerine RFC 5737 "TEST-NET-3"
  // (203.0.113.0/24, dokümantasyon için ayrılmış, hiçbir gerçek müşteriye ait
  // olamaz) kullanılıyor; sağlayıcının syntax olarak geçerli bir IPv4 beklentisini
  // karşılarken fraud/velocity skorlamasını gerçek bir kişinin IP'siyle kirletmiyor.
  return req.socket?.remoteAddress || "203.0.113.1";
}

// Deal'i onaylanmış işaretler + KOBİ'ye bilgi maili atar — hem müşterinin
// normal "Onaylıyorum" akışından hem de (payment_mode='required' teklifler
// için) ödeme başarıyla tamamlandığında otomatik onaydan çağrılır. sector
// parametresi opsiyonel (bazı çağrı yerlerinde henüz elde taze okunmamış
// olabilir) — eksikse dealWordAcc/formatAppointmentDateTime sessizce "teklif"
// diline ve tarihsiz metne düşer, hata fırlatmaz.
async function markApproved(supabaseAdmin, deal, customer, note, contentSuffix, sector) {
  const approvedAt = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin.from("deals").update({ approved_at: approvedAt }).eq("id", deal.id);
  if (updateError) throw new Error(updateError.message);

  const wordAcc = dealWordAcc(sector);
  // Randevu tarihi/saati SADECE randevu sektörlerinde anlamlı (otel check-in/
  // check-out'u, üyelikte süre var ama "randevu saati" kavramı yok) - diğer
  // sektörlerde gereksiz bir DB sorgusu yapmadan atlanır.
  const appointmentDateTimeLabel = APPOINTMENT_SECTORS.has(sector)
    ? formatAppointmentDateTime(await resolveAppointmentDateTime(supabaseAdmin, deal))
    : null;

  await supabaseAdmin.from("activities").insert({
    id: crypto.randomUUID(),
    user_id: deal.user_id,
    customer_id: deal.customer_id,
    type: "note",
    content: `Müşteri "${deal.title}" ${wordAcc} ${contentSuffix}.${note ? ` Not: "${note}"` : ""}`,
  });

  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    const { data: ownerData } = await supabaseAdmin.auth.admin.getUserById(deal.user_id);
    const ownerEmail = ownerData?.user?.email;
    if (ownerEmail) {
      const bodyText =
        `${customer?.name || "Müşteriniz"}, "${deal.title}" (${deal.value} TL) ${wordAcc} ${contentSuffix}.` +
        (appointmentDateTimeLabel ? `\n\nRandevu tarihi: ${appointmentDateTimeLabel}` : "") +
        (note ? `\n\nMüşterinin notu: "${note}"` : "") +
        `\n\nBinerly'ye giriş yaparak detayları görebilirsiniz.`;
      const footerLines = ["Binerly Ekibi"];
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Binerly <noreply@binerly.com>",
          to: ownerEmail,
          subject: `${customer?.name || "Müşteriniz"} "${deal.title}" ${wordAcc} onayladı`,
          html: renderEmailHtml({ bodyText, footerLines }),
          text: plainTextFallback(bodyText, null, null, footerLines),
        }),
      }).catch(() => {});
    }
  }

  // Hem normal "Onaylıyorum" akışından hem ödeme ile otomatik onaydan tek
  // yerden çağrıldığı için bildirim de burada — deals/ticket_messages gibi
  // ayrı bir Supabase webhook kurmaya gerek yok, doğrudan çağrılıyor.
  fetch("https://binerly.com/api/send-push", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-push-secret": (process.env.PUSH_WEBHOOK_SECRET || "").trim() },
    body: JSON.stringify({ table: "deal_approvals", record: { deal_id: deal.id, user_id: deal.user_id, title: deal.title, customer_name: customer?.name || null } }),
  }).catch(() => {});

  return approvedAt;
}

// Bir online ödeme başarıyla tamamlandığında yapılması gereken HER ŞEY —
// hangi sağlayıcıdan geldiği (iyzico/PayTR) fark etmeksizin tek yerden:
// payments kaydı, bildirim, (varsa) komisyon gideri, payment_status/stage
// güncellemesi, gerekirse otomatik onay. Hem handlePaymentCallback (iyzico)
// hem handlePayTRCallback buraya çağrı yapar — kod tekrarı yok.
// Sectors.jsx'teki isAppointmentSector ile aynı liste — api/*.js JSX içeren
// Sectors.jsx'i import edemediği için burada küçük bir kopyası tutuluyor.
const APPOINTMENT_SECTORS = new Set(["guzellik_bakim", "saglik_klinik"]);

// Sectors.jsx'teki dealWordKind ile AYNI sektör->kelime eşlemesi, ama burada
// doğrudan "Müşteri X'ini onayladı" kalıbında kullanılacak iyelik+belirtme
// çekimli hali (staticData.js DEAL_WORD_FORMS'taki "acc"/"possYoursAcc"
// alanları 3. tekil iyelik+belirtme birleşimini karşılamıyor, o yüzden ayrı
// tutuluyor) — KOBİ'ye giden onay e-postası artık "teklifini" yerine sektöre
// göre "randevusunu"/"üyeliğini"/"rezervasyonunu" diyebilsin diye.
function dealWordAcc(sector) {
  if (sector === "spor_merkezi") return "üyeliğini";
  if (APPOINTMENT_SECTORS.has(sector)) return "randevusunu";
  if (sector === "otel") return "rezervasyonunu";
  return "teklifini";
}

// DealApprovalPage.jsx/CustomerPortal.jsx/Support.jsx'teki formatDateTime ile
// AYNI yöntem (timeZone belirtmeden "tr-TR" locale) — dateStr zaten
// appointment-availability.js'den gelen, timezone'suz/yerel bir string
// olduğu için hem tarayıcıda hem Vercel'in sunucu saat diliminde (TZ farketmez,
// parse ve format simetrik) aynı saat/dakika değerini üretir.
function formatAppointmentDateTime(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return (
    d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" }) +
    " · " +
    d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
  );
}

// GET yanıtındaki "Randevu tarihi" alanı eskiden hep deal.created_at (kaydın
// OLUŞTURULMA zamanı) gösteriyordu — randevu sektörlerinde bu yanlış: müşteri
// bugün rezervasyon yaptırıp 3 gün sonrasına randevu alabilir, o zaman
// created_at bugünü, gerçek randevu ise 3 gün sonrasını gösterir. Asıl saat ya
// self-booked (portal/randevu_widget) randevularda portal_randevu_zamani'nda,
// ya da personelin CRM'de elle oluşturduğu randevularda kobinin kendi
// tanımladığı "Tarih & Saat" özel alanında duruyor — handleConfirmAttendance'
// taki (aşağıda) AYNI çözümleme mantığı.
async function resolveAppointmentDateTime(supabaseAdmin, deal) {
  if (deal.custom_fields?.portal_randevu_zamani) return deal.custom_fields.portal_randevu_zamani;
  const { data: defs } = await supabaseAdmin
    .from("custom_field_defs")
    .select("key")
    .eq("user_id", deal.user_id)
    .eq("entity", "deal")
    .eq("field_type", "datetime")
    .eq("active", true);
  const dtKey = (defs || []).map((d) => d.key).find((k) => deal.custom_fields?.[k]);
  return dtKey ? deal.custom_fields[dtKey] : null;
}

// Sectors.jsx computeAppointmentPenaltyBurn ile AYNI mantık — App.jsx (staff)
// ve CustomerPortal.jsx (portal girişli iptal) zaten bu fonksiyonu kullanıyor,
// burada (portal girişi OLMAYAN e-posta linki) da tutarlılık için birebir
// portlanmış kopyası tutuluyor.
function computeAttendanceBurn({ customerId, deals, burnsSessionEnabled, strikeLimit }) {
  if (!burnsSessionEnabled || !strikeLimit) return null;
  const activePackage = deals
    .filter((d) => d.customer_id === customerId && d.stage === "kazanildi" && d.session_total > 0 && (d.session_used || 0) < d.session_total)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  if (!activePackage) return null;
  const pastViolations = deals.filter((d) => d.customer_id === customerId && d.stage === "kaybedildi" && (d.lost_reason === "Randevuya gelmedi" || d.lost_reason === "Geç iptal etti")).length;
  const nextViolationCount = pastViolations + 1;
  if (nextViolationCount < strikeLimit) return null;
  return { packageDealId: activePackage.id, newSessionUsed: (activePackage.session_used || 0) + 1 };
}

// CustomerPortal.jsx appointmentCancelDecision ile AYNI mantık.
function decideAttendanceCancel(apptTime, settings) {
  const hoursLeft = isNaN(apptTime) ? null : (apptTime - Date.now()) / (60 * 60 * 1000);
  const canCancel = hoursLeft === null || settings.appointment_cancel_hours == null || hoursLeft >= settings.appointment_cancel_hours;
  const isLate = canCancel && hoursLeft !== null && settings.appointment_penalty_hours != null && hoursLeft < settings.appointment_penalty_hours;
  return { canCancel, isLate };
}

function escapeAttendanceHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderAttendancePage({ logoUrl, title, message, note, formToken, formResponse, submitLabel, formAction = "confirm-attendance", collectEmail = false }) {
  const logo = logoUrl || "https://binerly.com/pwa-512x512.png";
  const emailInput = collectEmail
    ? `<input type="email" name="email" placeholder="E-posta adresiniz" required style="width:100%;box-sizing:border-box;padding:11px 12px;margin:4px 0 12px;border:1px solid #d5dde6;border-radius:8px;font-size:14px;" />`
    : "";
  const form = formToken
    ? `<form method="POST" action="/api/deal-approval" style="margin-top:8px;">
        <input type="hidden" name="action" value="${escapeAttendanceHtml(formAction)}" />
        <input type="hidden" name="token" value="${escapeAttendanceHtml(formToken)}" />
        ${formResponse ? `<input type="hidden" name="response" value="${escapeAttendanceHtml(formResponse)}" />` : ""}
        ${emailInput}
        <button type="submit" style="display:inline-block;background:#185fa5;color:#ffffff;border:none;cursor:pointer;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">${escapeAttendanceHtml(submitLabel)}</button>
      </form>`
    : "";
  return `<!doctype html>
<html lang="tr">
  <body style="margin:0;padding:32px 16px;background:#f5f8fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e1e8f0;text-align:center;">
      <div style="padding:28px 32px 20px;border-bottom:1px solid #e1e8f0;">
        <img src="${escapeAttendanceHtml(logo)}" alt="" style="max-height:48px;max-width:200px;" />
      </div>
      <div style="padding:28px 32px;color:#0c2540;font-size:15px;line-height:1.7;">
        <p style="margin:0 0 16px;font-size:17px;font-weight:600;">${escapeAttendanceHtml(title)}</p>
        <p style="margin:0 0 8px;">${escapeAttendanceHtml(message)}</p>
        ${note ? `<p style="margin:0 0 8px;font-size:12px;color:#8a97a8;">${escapeAttendanceHtml(note)}</p>` : ""}
        ${form}
      </div>
    </div>
  </body>
</html>`;
}

// Randevu hatırlatma mailindeki "✓ Evet, geliyorum" / "Hayır, gelemeyeceğim"
// linklerinin hedefi — portal girişi GEREKTİRMEZ, token tek başına yeterli.
// GET bir onay/iptal sayfası gösterir (tek büyük buton), gerçek mutasyon
// SADECE POST'ta olur — e-posta güvenlik botlarının linki otomatik "tıklayıp"
// yanlışlıkla iptal tetiklemesini engellemek için.
async function handleConfirmAttendance(req, res, supabaseAdmin, deal, settings, response) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const token = req.method === "GET" ? new URL(req.url, `http://${req.headers.host || "localhost"}`).searchParams.get("token") : (req.body || {}).token;

  if (!settings || !APPOINTMENT_SECTORS.has(settings.sector)) {
    return res.status(404).send(renderAttendancePage({ title: "Bağlantı bulunamadı", message: "Bu bağlantı geçersiz." }));
  }
  if (response !== "yes" && response !== "no") {
    return res.status(400).send(renderAttendancePage({ title: "Geçersiz bağlantı", message: "Bu bağlantı eksik ya da hatalı görünüyor." }));
  }

  const logoUrl = settings.logo_url;
  const company = settings.company_name || "Binerly";

  if (deal.stage === "kazanildi" || deal.stage === "kaybedildi") {
    return res.status(200).send(renderAttendancePage({
      logoUrl,
      title: "Bu randevu için işlem zaten tamamlanmış",
      message: `"${deal.title}" randevusu için ${deal.stage === "kaybedildi" ? "iptal işlenmiş" : "işlem tamamlanmış"} durumda. Bir sorunuz varsa ${company} ile iletişime geçebilirsiniz.`,
    }));
  }

  const { data: defs } = await supabaseAdmin
    .from("custom_field_defs")
    .select("key")
    .eq("user_id", deal.user_id)
    .eq("entity", "deal")
    .eq("field_type", "datetime")
    .eq("active", true);
  const dtKey = (defs || []).map((d) => d.key).find((k) => deal.custom_fields?.[k]);
  const raw = dtKey ? deal.custom_fields[dtKey] : null;
  // slice(0,16) ŞART: portal/widget self-booking saniyeli yazıyor
  // ("...T09:00:00") - bkz. send-appointment-reminders.js'teki aynı fix.
  const apptTime = raw ? new Date(`${raw.slice(0, 16)}:00+03:00`).getTime() : NaN;

  if (response === "yes") {
    if (deal.custom_fields?.attendanceConfirmedAt) {
      return res.status(200).send(renderAttendancePage({ logoUrl, title: "Zaten onaylanmış", message: `Bu randevu için geleceğinizi zaten onaylamıştınız, sizi bekliyoruz. - ${company}` }));
    }
    if (req.method === "GET") {
      return res.status(200).send(renderAttendancePage({
        logoUrl,
        title: "Randevunuzu onaylıyor musunuz?",
        message: `"${deal.title}" randevunuza geleceğinizi onaylamak için aşağıya tıklayın.`,
        formToken: token, formResponse: "yes", submitLabel: "Evet, geliyorum",
      }));
    }
    await supabaseAdmin.from("deals").update({ custom_fields: { ...(deal.custom_fields || {}), attendanceConfirmedAt: new Date().toISOString() } }).eq("id", deal.id);
    await supabaseAdmin.from("activities").insert({
      id: crypto.randomUUID(), user_id: deal.user_id, customer_id: deal.customer_id, type: "note",
      content: `Müşteri, "${deal.title}" randevusuna e-posta üzerinden geleceğini onayladı.`,
    });
    return res.status(200).send(renderAttendancePage({ logoUrl, title: "Teşekkürler!", message: `Randevunuz onaylandı, sizi bekliyoruz. - ${company}` }));
  }

  // response === "no"
  const { canCancel, isLate } = decideAttendanceCancel(apptTime, settings);
  if (!canCancel) {
    return res.status(200).send(renderAttendancePage({
      logoUrl,
      title: "Bu saate çok yakın kaldı",
      message: `Randevu saatine çok az kaldığı için bu bağlantı üzerinden iptal edilemiyor. Lütfen doğrudan ${company} ile iletişime geçin.`,
    }));
  }

  if (req.method === "GET") {
    return res.status(200).send(renderAttendancePage({
      logoUrl,
      title: "Randevunuzu iptal etmek istiyor musunuz?",
      message: `"${deal.title}" randevunuzu iptal etmek için aşağıya tıklayın.${isLate ? " Randevu saatine az kaldığı için bu iptal geç iptal olarak kaydedilecek." : ""}`,
      formToken: token, formResponse: "no", submitLabel: "Evet, iptal ediyorum",
    }));
  }

  const lostReason = isLate ? "Geç iptal etti" : "İptal etti";

  // computeAttendanceBurn geçmiş ihlal sayısını "bu iptalden ÖNCEKİ" duruma
  // göre sayıp +1 kendisi ekliyor (App.jsx applyAppointmentPenaltyBurn'daki
  // dealsBeforeChange ile AYNI kural) — bu yüzden müşterinin deal geçmişi, bu
  // deal'in stage'i "kaybedildi"ye çevrilmeden ÖNCE çekilmeli, yoksa bu ihlal
  // hem DB'den gelen listede hem +1'de sayılıp eşik bir ihlal ERKEN tetiklenir.
  let customerDeals = [];
  if (isLate) {
    const { data } = await supabaseAdmin
      .from("deals")
      .select("id, customer_id, stage, session_total, session_used, lost_reason, created_at")
      .eq("user_id", deal.user_id)
      .eq("customer_id", deal.customer_id)
      .is("deleted_at", null);
    customerDeals = data || [];
  }

  await supabaseAdmin.from("deals").update({ stage: "kaybedildi", lost_reason: lostReason }).eq("id", deal.id);
  await supabaseAdmin.from("activities").insert({
    id: crypto.randomUUID(), user_id: deal.user_id, customer_id: deal.customer_id, type: "note",
    content: `Müşteri, "${deal.title}" randevusunu e-posta üzerinden iptal etti (${lostReason}).`,
  });

  let burnMessage = "";
  if (isLate) {
    const burn = computeAttendanceBurn({
      customerId: deal.customer_id,
      deals: customerDeals,
      burnsSessionEnabled: settings.appointment_penalty_burns_session === true,
      strikeLimit: settings.appointment_penalty_strike_limit,
    });
    if (burn) {
      await supabaseAdmin.from("deals").update({ session_used: burn.newSessionUsed }).eq("id", burn.packageDealId);
      await supabaseAdmin.from("activities").insert({
        id: crypto.randomUUID(), user_id: deal.user_id, customer_id: deal.customer_id, type: "note",
        content: `Geç iptal cezası: ${burn.newSessionUsed}. seans otomatik düşüldü (e-posta üzerinden iptal).`,
      });
      burnMessage = " Bu iptal, paketinizden 1 seans düşürdü.";
    }
  }

  return res.status(200).send(renderAttendancePage({ logoUrl, title: "Randevunuz iptal edildi", message: `Bize haber verdiğiniz için teşekkürler.${burnMessage} - ${company}` }));
}

// "Sadece talep al" widget modunda (bkz. AppointmentPolicies.jsx
// AppointmentRequestModeBox) KOBİ'nin önerdiği TEK saati okunaklı Türkçeye
// çevirir - hem giden teklif e-postasında hem onay sayfasında kullanılır.
function formatOfferDateTime(d) {
  const dateLabel = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", weekday: "long", timeZone: "Europe/Istanbul" }).format(d);
  const timeLabel = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul", hour12: false }).format(d);
  return `${dateLabel} saat ${timeLabel}`;
}

// AppointmentRequestPage.jsx istanbulDateStr'ın AYNI "en-CA" hilesi (kasıtlı
// kopya) - gerçek bir zaman damgasını (appointment_offer_time, timestamptz)
// Avrupa/İstanbul takviminde "YYYY-MM-DDTHH:MM" datetime-local string'ine
// çevirir - deal'in randevu özel alanına yazılacak format bu (bkz.
// api/send-appointment-reminders.js'teki AYNI +03:00 yorumlama kuralı).
function toIstanbulLocalString(d) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

// api/lead-capture.js'teki AYNI fonksiyon (kasıtlı kopya, ayrı dosya) -
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

// Pano.jsx "Randevu Talepleri" widget'ından ("Bu Saati Öner" butonu) çağrılır -
// handleRefund ile AYNI owner/team_member Bearer-auth ilkesi. Diğer token
// bazlı action'lardan farklı olarak burada henüz approval_token yok - dealId
// ile bulunur, token (yoksa) BURADA üretilir.
//
// Saat GERÇEKTEN burada tutulur (sadece bir "hatırlatma" değil) - lead-capture.js
// POST'taki (dateTime dalı) AYNI atomik pick_free_resource_unit/pick_free_
// concurrency_slot mantığı (kasıtlı kopya). Bunun nedeni: müşteriye "şu kadar
// süre geçerli" denip o süre içinde AYNI saat başka bir müşteriye de önerilebilseydi
// (ya da KOBİ CRM'den elle başka birini o saate alabilseydi) verilen süre bir
// anlam ifade etmezdi - kullanıcı sorusu (2026-08-21) bu tutarsızlığı buldu.
// custom_fields[randevu tarihi alanı] BİLEREK BURADA YAZILMAZ - o alan
// send-appointment-reminders.js'nin ana hatırlatma taramasının kullandığı ALAN,
// erken yazılırsa müşteri henüz onaylamadan "yarın randevunuz var" maili gider.
// Reddedilirse/süresi dolarsa handleConfirmAppointmentOffer "no" dalı ve
// send-appointment-reminders.js'teki auto-expire pass'i bu tutuşu serbest bırakır.
async function handleSendAppointmentOffer(req, res, supabaseAdmin) {
  const { dealId, offerTime } = req.body || {};
  if (!dealId || !offerTime || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(offerTime)) {
    return res.status(400).json({ error: "Eksik ya da geçersiz bilgi." });
  }

  const authHeader = req.headers.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!accessToken) return res.status(401).json({ error: "Yetkisiz." });
  const { data: userData } = await supabaseAdmin.auth.getUser(accessToken);
  const authedUserId = userData?.user?.id || null;
  if (!authedUserId) return res.status(401).json({ error: "Yetkisiz." });

  const { data: deal } = await supabaseAdmin.from("deals").select("id, user_id, customer_id, title, approval_token, custom_fields").eq("id", dealId).is("deleted_at", null).maybeSingle();
  if (!deal) return res.status(404).json({ error: "Kayıt bulunamadı." });

  let authorized = authedUserId === deal.user_id;
  if (!authorized) {
    const { data: tm } = await supabaseAdmin.from("team_members").select("team_id").eq("member_id", authedUserId).eq("team_id", deal.user_id).maybeSingle();
    authorized = !!tm;
  }
  if (!authorized) return res.status(403).json({ error: "Bu işlemi yapma yetkiniz yok." });

  const offerDate = new Date(`${offerTime}:00+03:00`);
  if (isNaN(offerDate.getTime())) return res.status(400).json({ error: "Geçersiz saat." });
  const offerIso = offerDate.toISOString();
  const durationMinutes = Math.max(Number(deal.custom_fields?.duration_minutes) || 0, 1);
  const endIso = new Date(offerDate.getTime() + durationMinutes * 60000).toISOString();

  const serviceIds = Array.isArray(deal.custom_fields?.service_ids) ? deal.custom_fields.service_ids : [];
  const conflictError = { error: "Bu saat başka bir randevuyla dolu, lütfen farklı bir saat seçin." };

  const [{ data: customer }, { data: settings }] = await Promise.all([
    supabaseAdmin.from("customers").select("name, email, phone").eq("id", deal.customer_id).maybeSingle(),
    supabaseAdmin.from("company_settings").select("company_name, logo_url, email, appointment_offer_validity_hours, appointment_concurrency").eq("user_id", deal.user_id).maybeSingle(),
  ]);

  // Hizmet bazlı personel yetkinliği (Takım > Hizmetler): önerilen hizmeti
  // sınırlı sayıda personel yapabiliyorsa, global concurrency_slot havuzu bunu
  // bilmediği için ek bir ön-kontrol - o saatte hizmeti yapabilen personelin
  // tamamı doluysa öneri gönderilmez (lead-capture.js / appointment-availability.js
  // ile AYNI mantık, bkz. _appointment-concurrency.js). concurrency_slots atomik
  // havuzu hâlâ per-hizmet DEĞİL, bu kontrol kaynak ön-kontrolüyle aynı güven
  // seviyesinde.
  {
    const baseConcurrency = Math.max(1, Number(settings?.appointment_concurrency) || 1);
    const { effectiveConcurrency, competes } = await applyServiceCapacity(
      supabaseAdmin,
      deal.user_id,
      serviceIds,
      baseConcurrency,
    );
    if (effectiveConcurrency < baseConcurrency) {
      const offerStartMs = offerDate.getTime();
      const offerEndMs = offerStartMs + durationMinutes * 60000;
      const { data: activeAppts } = await supabaseAdmin
        .from("deals")
        .select("custom_fields, appointment_start, appointment_end")
        .eq("user_id", deal.user_id)
        .is("deleted_at", null)
        .neq("stage", "kaybedildi")
        .neq("id", deal.id)
        .not("appointment_start", "is", null);
      const overlap = (activeAppts || []).filter((d) => {
        if (!competes(d.custom_fields)) return false;
        const s = new Date(d.appointment_start).getTime();
        const e = new Date(d.appointment_end || d.appointment_start).getTime();
        return offerStartMs < e && s < offerEndMs;
      }).length;
      if (overlap >= effectiveConcurrency) {
        return res.status(409).json({
          error: "Bu saatte bu hizmeti yapabilen personelin tamamı dolu, lütfen farklı bir saat seçin.",
        });
      }
    }
  }

  let resourceUnitId = null;
  const autoResourceId = await resolveAutoAssignResource(supabaseAdmin, deal.user_id, serviceIds);
  if (autoResourceId) {
    for (let attempt = 0; attempt < 3 && !resourceUnitId; attempt++) {
      const { data: unitId } = await supabaseAdmin.rpc("pick_free_resource_unit", { p_resource_id: autoResourceId, p_start: offerIso, p_end: endIso, p_exclude_deal_id: deal.id });
      if (!unitId) break;
      resourceUnitId = unitId;
    }
    if (!resourceUnitId) return res.status(409).json(conflictError);
  }

  let concurrencySlotId = null;
  for (let attempt = 0; attempt < 3 && !concurrencySlotId; attempt++) {
    const { data: slotId } = await supabaseAdmin.rpc("pick_free_concurrency_slot", { p_user_id: deal.user_id, p_start: offerIso, p_end: endIso, p_exclude_deal_id: deal.id });
    if (!slotId) break;
    concurrencySlotId = slotId;
  }
  if (!concurrencySlotId) return res.status(409).json(conflictError);

  const token = deal.approval_token || crypto.randomUUID();
  const validityHours = Math.max(1, Number(settings?.appointment_offer_validity_hours) || 24);
  const expiresAt = new Date(Date.now() + validityHours * 60 * 60 * 1000).toISOString();

  const { error: updateError } = await supabaseAdmin.from("deals").update({
    approval_token: token,
    appointment_offer_time: offerIso,
    appointment_offer_expires_at: expiresAt,
    appointment_offer_status: "sent",
    resource_unit_id: resourceUnitId,
    concurrency_slot_id: concurrencySlotId,
    appointment_start: offerIso,
    appointment_end: endIso,
  }).eq("id", deal.id);
  if (updateError) {
    if (updateError.code === "23P01") return res.status(409).json(conflictError);
    return res.status(500).json({ error: updateError.message });
  }

  const company = settings?.company_name || "Binerly";
  const dateLabel = formatOfferDateTime(new Date(offerIso));
  const yesUrl = `https://binerly.com/api/deal-approval?action=confirm-appointment-offer&token=${token}&response=yes`;
  const noUrl = `https://binerly.com/api/deal-approval?action=confirm-appointment-offer&token=${token}&response=no`;

  let emailSent = false;
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey && customer?.email) {
    const bodyText = `Merhaba ${customer?.name || ""},\n\n${company} olarak "${deal.title}" randevu talebiniz için ${dateLabel} saatini önerebiliriz. Bu saat size uygun mu?`;
    const footerLines = [`${company} (Binerly ile)`, "Bu e-posta Binerly (binerly.com) altyapısıyla gönderildi."];
    const html = renderEmailHtml({ logoUrl: settings?.logo_url, bodyText, ctaLabel: "✓ Bu saat uygun", ctaUrl: yesUrl, secondaryCtaLabel: "Uygun değil", secondaryCtaUrl: noUrl, footerLines });
    const text = plainTextFallback(bodyText, "✓ Bu saat uygun", yesUrl, footerLines, "Uygun değil", noUrl);
    const sendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${company} (Binerly ile) <noreply@binerly.com>`,
        to: customer.email,
        subject: `${company} - randevu saatiniz önerildi`,
        html,
        text,
        ...(settings?.email ? { reply_to: settings.email } : {}),
      }),
    });
    emailSent = sendRes.ok;
    if (!sendRes.ok) console.error("appointment offer email send failed, deal.id:", deal.id, sendRes.status, await sendRes.text().catch(() => ""));
  }

  return res.status(200).json({
    ok: true,
    emailSent,
    confirmUrl: `https://binerly.com/api/deal-approval?action=confirm-appointment-offer&token=${token}&response=yes`,
  });
}

// "Randevu Talepleri" teklif e-postasındaki Evet/Hayır linklerinin hedefi -
// handleConfirmAttendance ile AYNI güvenlik ilkesi (gerçek mutasyon SADECE
// POST'ta). Saat/kaynak/concurrency-slot ZATEN handleSendAppointmentOffer'da
// atomik olarak tutulmuş durumda - "Evet" burada sadece bu tutuşu kalıcı
// (custom_fields'taki randevu tarihi alanına yazarak müşteri/hatırlatma
// akışlarına görünür) hale getirir, YENİDEN bir tahsis denemesi yapmaz.
// "Hayır" ve süresi dolma durumları ise tutuşu SERBEST BIRAKIR (resource_unit_id/
// concurrency_slot_id/appointment_start/end null'lanır) - aksi halde reddedilen/
// süresi dolan bir teklif o saati sonsuza kadar hayalet gibi işgal ederdi.
async function handleConfirmAppointmentOffer(req, res, supabaseAdmin, deal, settings, response, token) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (response !== "yes" && response !== "no") {
    return res.status(400).send(renderAttendancePage({ title: "Geçersiz bağlantı", message: "Bu bağlantı eksik ya da hatalı görünüyor." }));
  }

  const logoUrl = settings?.logo_url;
  const company = settings?.company_name || "Binerly";
  const releaseHold = (extra) => supabaseAdmin
    .from("deals")
    .update({ resource_unit_id: null, concurrency_slot_id: null, appointment_start: null, appointment_end: null, ...extra })
    .eq("id", deal.id);

  if (!deal.appointment_offer_time || deal.appointment_offer_status !== "sent") {
    return res.status(200).send(renderAttendancePage({
      logoUrl, title: "Bu teklif artık geçerli değil",
      message: `Bu randevu teklifi için işlem zaten tamamlanmış ya da geçersiz. Bir sorunuz varsa ${company} ile iletişime geçebilirsiniz.`,
    }));
  }

  const expired = deal.appointment_offer_expires_at && new Date(deal.appointment_offer_expires_at).getTime() < Date.now();
  if (expired) {
    await releaseHold({ appointment_offer_status: "expired" }).eq("appointment_offer_status", "sent");
    return res.status(200).send(renderAttendancePage({
      logoUrl, title: "Bu teklifin süresi doldu",
      message: `Önerilen randevu saatinin geçerlilik süresi doldu. Lütfen ${company} ile tekrar iletişime geçin.`,
    }));
  }

  const offerDate = new Date(deal.appointment_offer_time);
  const dateLabel = formatOfferDateTime(offerDate);

  if (response === "yes") {
    if (req.method === "GET") {
      return res.status(200).send(renderAttendancePage({
        logoUrl, title: "Randevunuzu onaylıyor musunuz?",
        message: `"${deal.title}" için önerilen ${dateLabel} randevusunu onaylamak üzeresiniz.`,
        formToken: token, formResponse: "yes", submitLabel: "Evet, bu saat uygun",
        formAction: "confirm-appointment-offer",
      }));
    }

    const { data: fieldDefs } = await supabaseAdmin
      .from("custom_field_defs")
      .select("key")
      .eq("user_id", deal.user_id)
      .eq("entity", "deal")
      .eq("field_type", "datetime")
      .eq("active", true)
      .limit(1);
    const dtKey = fieldDefs?.[0]?.key;
    if (!dtKey) {
      return res.status(200).send(renderAttendancePage({ logoUrl, title: "Bir sorun oluştu", message: `Randevu alanı bulunamadı, lütfen ${company} ile iletişime geçin.` }));
    }

    const dateTimeLocalStr = toIstanbulLocalString(offerDate);
    const { error: updateError } = await supabaseAdmin
      .from("deals")
      .update({
        custom_fields: { ...(deal.custom_fields || {}), [dtKey]: dateTimeLocalStr, portal_randevu_zamani: dateTimeLocalStr },
        appointment_offer_status: "confirmed",
      })
      .eq("id", deal.id);
    if (updateError) {
      return res.status(500).send(renderAttendancePage({ logoUrl, title: "Bir sorun oluştu", message: `Lütfen tekrar deneyin veya ${company} ile iletişime geçin.` }));
    }

    await supabaseAdmin.from("activities").insert({
      id: crypto.randomUUID(), user_id: deal.user_id, customer_id: deal.customer_id, type: "note",
      content: `Müşteri, önerilen ${dateLabel} randevu saatini e-posta üzerinden onayladı.`,
    });
    return res.status(200).send(renderAttendancePage({ logoUrl, title: "Randevunuz onaylandı!", message: `${dateLabel} için randevunuz kesinleşti. Sizi bekliyoruz. - ${company}` }));
  }

  // response === "no"
  if (req.method === "GET") {
    return res.status(200).send(renderAttendancePage({
      logoUrl, title: "Bu saat size uygun değil mi?",
      message: `"${deal.title}" için önerilen ${dateLabel} saatini reddetmek üzeresiniz - ${company} size başka bir saat önerecektir.`,
      formToken: token, formResponse: "no", submitLabel: "Bu saat uygun değil", formAction: "confirm-appointment-offer",
    }));
  }

  await releaseHold({ appointment_offer_status: "declined" });
  await supabaseAdmin.from("activities").insert({
    id: crypto.randomUUID(), user_id: deal.user_id, customer_id: deal.customer_id, type: "note",
    content: `Müşteri, önerilen ${dateLabel} randevu saatini e-posta üzerinden reddetti.`,
  });
  return res.status(200).send(renderAttendancePage({ logoUrl, title: "Bildiğiniz için teşekkürler", message: `${company} size başka bir saat önerecektir.` }));
}

// renderAttendancePage'in tek-form kalıbına uymuyor (iki seçenekli soru +
// olumsuzda ek bir metin alanı) - o yüzden aynı görsel kabuğu tekrar eden
// ayrı, küçük bir render fonksiyonu (bkz. CLAUDE.md: üç benzer satır, erken
// soyutlamadan iyidir).
function renderReviewPage({ logoUrl, bodyHtml }) {
  const logo = logoUrl || "https://binerly.com/pwa-512x512.png";
  return `<!doctype html>
<html lang="tr">
  <body style="margin:0;padding:32px 16px;background:#f5f8fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e1e8f0;text-align:center;">
      <div style="padding:28px 32px 20px;border-bottom:1px solid #e1e8f0;">
        <img src="${escapeAttendanceHtml(logo)}" alt="" style="max-height:48px;max-width:200px;" />
      </div>
      <div style="padding:28px 32px;color:#0c2540;font-size:15px;line-height:1.7;">
        ${bodyHtml}
      </div>
    </div>
  </body>
</html>`;
}

// Google değerlendirme e-postasındaki linkin hedefi - müşteriyi DOĞRUDAN
// Google'a göndermeden önce kısa bir memnuniyet sorusu sorar, mutsuz bir
// müşteriyi hiç sormadan herkese açık Google'a yönlendirmemek için (bkz.
// sql/2026-08-12_review_satisfaction_gate.sql). confirm-attendance ile AYNI
// güvenlik önlemi: gerçek kayıt (rating) SADECE POST'ta olur - GET'ler sadece
// soru/form gösterir, e-posta güvenlik botlarının linki otomatik "tıklayıp"
// yanlışlıkla bir rating kaydetmesini engeller.
async function handleReviewGate(req, res, supabaseAdmin, deal, settings, rating, feedbackText, token) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const logoUrl = settings?.logo_url;
  const company = escapeAttendanceHtml(settings?.company_name || "Binerly");

  if (deal.review_submitted_at) {
    return res.status(200).send(renderReviewPage({
      logoUrl,
      bodyHtml: `<p style="margin:0 0 8px;font-size:17px;font-weight:600;">Teşekkürler!</p><p style="margin:0;color:#5b7088;">Görüşünüzü zaten aldık. - ${company}</p>`,
    }));
  }

  if (req.method === "GET" && rating !== "negative") {
    return res.status(200).send(renderReviewPage({
      logoUrl,
      bodyHtml: `
        <p style="margin:0 0 16px;font-size:17px;font-weight:600;">${company} ile deneyiminiz nasıldı?</p>
        <form method="POST" action="/api/deal-approval" style="margin:0 0 10px;">
          <input type="hidden" name="action" value="submit-review" />
          <input type="hidden" name="token" value="${escapeAttendanceHtml(token)}" />
          <input type="hidden" name="rating" value="positive" />
          <button type="submit" style="display:block;width:100%;box-sizing:border-box;background:#15803d;color:#ffffff;border:none;cursor:pointer;padding:14px;border-radius:8px;font-weight:600;font-size:15px;margin-bottom:10px;">😊 Memnun kaldım</button>
        </form>
        <a href="/api/deal-approval?action=review&token=${encodeURIComponent(token)}&rating=negative" style="display:block;box-sizing:border-box;background:#f5f8fc;color:#0c2540;border:1px solid #d5dde6;padding:14px;border-radius:8px;font-weight:600;font-size:15px;text-decoration:none;">🙁 Memnun kalmadım</a>
      `,
    }));
  }

  if (req.method === "GET" && rating === "negative") {
    // "Memnun kalmadım" seçildi - rating burada HENÜZ kaydedilmiyor (kullanıcı
    // sayfayı kapatıp geri dönmeyebilir), sadece form gösterilir.
    return res.status(200).send(renderReviewPage({
      logoUrl,
      bodyHtml: `
        <p style="margin:0 0 8px;font-size:17px;font-weight:600;">Üzgünüz, daha iyisini yapmalıydık.</p>
        <p style="margin:0 0 16px;color:#5b7088;">Bize ne oldu anlatır mısınız? Bu not sadece ${company} ile paylaşılır, herkese açık gösterilmez.</p>
        <form method="POST" action="/api/deal-approval">
          <input type="hidden" name="action" value="submit-review" />
          <input type="hidden" name="token" value="${escapeAttendanceHtml(token)}" />
          <input type="hidden" name="rating" value="negative" />
          <textarea name="feedback" rows="4" placeholder="(opsiyonel)" style="width:100%;box-sizing:border-box;padding:11px 12px;margin:0 0 12px;border:1px solid #d5dde6;border-radius:8px;font-size:14px;font-family:inherit;"></textarea>
          <button type="submit" style="display:block;width:100%;box-sizing:border-box;background:#185fa5;color:#ffffff;border:none;cursor:pointer;padding:14px;border-radius:8px;font-weight:600;font-size:15px;">Gönder</button>
        </form>
      `,
    }));
  }

  // POST submit-review
  if (rating !== "positive" && rating !== "negative") {
    return res.status(400).send(renderReviewPage({ logoUrl, bodyHtml: `<p style="margin:0;">Geçersiz bağlantı.</p>` }));
  }
  const trimmedFeedback = (feedbackText || "").trim().slice(0, 2000);
  await supabaseAdmin
    .from("deals")
    .update({
      review_rating: rating,
      review_feedback_text: rating === "negative" && trimmedFeedback ? trimmedFeedback : null,
      review_submitted_at: new Date().toISOString(),
    })
    .eq("id", deal.id);

  if (rating === "negative") {
    // İşletme sahibine ÖZEL bildirim - bu not asla müşteri portalında ya da
    // herkese açık bir yerde görünmez, sadece bu e-postayla iletilir.
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      const { data: ownerData } = await supabaseAdmin.auth.admin.getUserById(deal.user_id);
      const ownerEmail = settings?.email || ownerData?.user?.email;
      if (ownerEmail) {
        const bodyText = `"${deal.title}" için müşteri memnuniyetsizlik bildirdi.${trimmedFeedback ? `\n\nMüşterinin notu:\n"${trimmedFeedback}"` : "\n\nMüşteri ek bir not bırakmadı."}`;
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "Binerly <noreply@binerly.com>",
            to: ownerEmail,
            subject: `Memnuniyetsizlik bildirimi: ${deal.title}`,
            html: renderEmailHtml({ bodyText, footerLines: ["Binerly Ekibi"] }),
            text: plainTextFallback(bodyText, null, null, ["Binerly Ekibi"]),
          }),
        }).catch((err) => console.error("review feedback owner email error:", err.message));
      }
    }
    return res.status(200).send(renderReviewPage({
      logoUrl,
      bodyHtml: `<p style="margin:0 0 8px;font-size:17px;font-weight:600;">Teşekkürler.</p><p style="margin:0;color:#5b7088;">Geri bildiriminiz için teşekkür ederiz, ${company} ile paylaşıldı.</p>`,
    }));
  }

  // rating === "positive"
  const reviewLink = settings?.google_review_link;
  const cta = reviewLink
    ? `<a href="${escapeAttendanceHtml(reviewLink)}" target="_blank" rel="noopener noreferrer" style="display:block;box-sizing:border-box;background:#185fa5;color:#ffffff;padding:14px;border-radius:8px;font-weight:600;font-size:15px;text-decoration:none;margin-top:16px;">Bizi Google'da Değerlendirin</a>`
    : "";
  return res.status(200).send(renderReviewPage({
    logoUrl,
    bodyHtml: `<p style="margin:0 0 8px;font-size:17px;font-weight:600;">Ne mutlu bize!</p><p style="margin:0;color:#5b7088;">Bunu duymak çok güzel.${reviewLink ? " Birkaç saniyenizi ayırıp Google'da da paylaşır mısınız?" : ""}</p>${cta}`,
  }));
}

// Müşteri Kayıtları'ndan "İzin e-postası gönder" veya bir müşteri ilk kez
// e-postalı olarak eklendiğinde otomatik giden e-postadaki linkin hedefi —
// KOBİ'nin kendi beyanı değil, müşterinin kendisinin tıklayarak verdiği gerçek
// bir onay (çift onay/double opt-in). Portal girişi GEREKTİRMEZ, token tek
// başına yeterli. confirm-attendance ile AYNI güvenlik önlemi: gerçek mutasyon
// SADECE POST'ta olur, GET sadece bir buton gösterir — e-posta güvenlik
// botlarının linki otomatik "tıklayıp" yanlışlıkla izin vermiş gibi görünmesini
// engellemek için.
// SADECE pazarlama iznini kapsar — fotoğraf izni 2026-07-31'de ayrı bir action'a
// (confirm-photo-consent, handlePhotoConsentConfirm) taşındı, bkz. o fonksiyonun
// yorumu. Öncesinde ikisi aynı linkle birlikte isteniyordu, KVKK'daki "belirli
// rıza" ilkesine aykırıydı ve ilk temasta müşteriyi ürkütüyordu.
async function handleMarketingConsentConfirm(req, res, supabaseAdmin, token) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (!token) {
    return res.status(400).send(renderAttendancePage({ title: "Geçersiz bağlantı", message: "Bu bağlantı eksik ya da hatalı görünüyor." }));
  }

  const { data: customer, error } = await supabaseAdmin
    .from("customers")
    .select("id, user_id, name, email, marketing_consent")
    .eq("marketing_consent_token", token)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) console.error("marketing-consent-confirm query error:", error.message);
  if (error || !customer) {
    return res.status(404).send(renderAttendancePage({ title: "Bağlantı bulunamadı", message: "Bu bağlantı geçersiz ya da süresi dolmuş görünüyor." }));
  }

  const { data: settings } = await supabaseAdmin.from("company_settings").select("company_name, logo_url").eq("user_id", customer.user_id).maybeSingle();
  const company = settings?.company_name || "Binerly";
  const logoUrl = settings?.logo_url || null;

  if (customer.marketing_consent) {
    return res.status(200).send(renderAttendancePage({ logoUrl, title: "Zaten onaylanmış", message: `İzniniz zaten kayıtlı, teşekkürler. - ${company}` }));
  }

  // Bu link WhatsApp/panodan paylaşılmış olabilir (customers.email hiç yoksa) —
  // bu durumda sayfa önce e-posta adresini de topluyor, tek adımda hem e-posta
  // kaydediliyor hem izin veriliyor.
  const needsEmail = !customer.email;

  if (req.method === "GET") {
    return res.status(200).send(renderAttendancePage({
      logoUrl,
      title: "İzniniz gerekiyor",
      message: needsEmail
        ? `${company}, size kampanya ve değerlendirme isteği gibi e-postalar gönderebilmek için e-posta adresinizi ve izninizi ihtiyaç duyuyor.`
        : `${company}, size kampanya ve değerlendirme isteği gibi e-postalar gönderebilmek için izninize ihtiyaç duyuyor. Onaylamak için aşağıya tıklayın.`,
      note: `Bilgileriniz ${company} tarafından yalnızca hizmet/randevu takibi amacıyla saklanır ve işlenir - bu ayrı, zaten geçerli olan bir durumdur; yukarıdaki izin sadece ek olarak istenen tercihler içindir.`,
      formToken: token, submitLabel: needsEmail ? "Kaydet ve izin ver" : "Evet, izin veriyorum",
      formAction: "confirm-marketing-consent", collectEmail: needsEmail,
    }));
  }

  const providedEmail = ((req.body || {}).email || "").trim();
  if (needsEmail && !providedEmail) {
    return res.status(400).send(renderAttendancePage({ logoUrl, title: "E-posta gerekli", message: "Devam etmek için bir e-posta adresi girmeniz gerekiyor." }));
  }

  const nowIso = new Date().toISOString();
  const updatePayload = {
    marketing_consent: true,
    marketing_consent_at: nowIso,
    marketing_consent_source: "email_confirmation",
    marketing_consent_ip: getClientIp(req),
    marketing_consent_text: MARKETING_CONSENT_TEXT,
    marketing_consent_token: null,
  };
  if (needsEmail) updatePayload.email = providedEmail;

  await supabaseAdmin
    .from("customers")
    .update(updatePayload)
    .eq("id", customer.id)
    .eq("marketing_consent_token", token);

  return res.status(200).send(renderAttendancePage({ logoUrl, title: "Teşekkürler!", message: `İzniniz kaydedildi. - ${company}` }));
}

// requestPhotoConsent'in (App.jsx) gönderdiği linkin hedefi — SADECE fotoğraf
// saklama izni içindir, marketing_consent'e hiç dokunmaz. handleMarketingConsentConfirm
// ile aynı güvenlik deseni (gerçek mutasyon sadece POST'ta) ve aynı paylaşılan
// customers.marketing_consent_token kolonu üzerinden çalışır — iki istek aynı anda
// açık olmadığı için (biri diğerini token'ı değiştirerek geçersiz kılar) çakışma
// riski yok, ayrı bir kolon açmaya gerek görülmedi.
async function handlePhotoConsentConfirm(req, res, supabaseAdmin, token) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (!token) {
    return res.status(400).send(renderAttendancePage({ title: "Geçersiz bağlantı", message: "Bu bağlantı eksik ya da hatalı görünüyor." }));
  }

  const { data: customer, error } = await supabaseAdmin
    .from("customers")
    .select("id, user_id, name, email, photo_consent")
    .eq("marketing_consent_token", token)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) console.error("photo-consent-confirm query error:", error.message);
  if (error || !customer) {
    return res.status(404).send(renderAttendancePage({ title: "Bağlantı bulunamadı", message: "Bu bağlantı geçersiz ya da süresi dolmuş görünüyor." }));
  }

  const { data: settings } = await supabaseAdmin.from("company_settings").select("company_name, logo_url").eq("user_id", customer.user_id).maybeSingle();
  const company = settings?.company_name || "Binerly";
  const logoUrl = settings?.logo_url || null;

  if (customer.photo_consent) {
    return res.status(200).send(renderAttendancePage({ logoUrl, title: "Zaten onaylanmış", message: `İzniniz zaten kayıtlı, teşekkürler. - ${company}` }));
  }

  const needsEmail = !customer.email;

  if (req.method === "GET") {
    return res.status(200).send(renderAttendancePage({
      logoUrl,
      title: "Fotoğraf izniniz gerekiyor",
      message: needsEmail
        ? `${company}, hizmet öncesi/sonrası fotoğraflarınızı çekip saklayabilmek için e-posta adresinizi ve izninizi ihtiyaç duyuyor.`
        : `${company}, hizmet öncesi/sonrası fotoğraflarınızı çekip saklayabilmek için izninize ihtiyaç duyuyor. Onaylamak için aşağıya tıklayın.`,
      note: `Bilgileriniz ${company} tarafından yalnızca hizmet/randevu takibi amacıyla saklanır ve işlenir - bu ayrı, zaten geçerli olan bir durumdur; yukarıdaki izin sadece ek olarak istenen bir tercihtir.`,
      formToken: token, submitLabel: needsEmail ? "Kaydet ve izin ver" : "Evet, izin veriyorum",
      formAction: "confirm-photo-consent", collectEmail: needsEmail,
    }));
  }

  const providedEmail = ((req.body || {}).email || "").trim();
  if (needsEmail && !providedEmail) {
    return res.status(400).send(renderAttendancePage({ logoUrl, title: "E-posta gerekli", message: "Devam etmek için bir e-posta adresi girmeniz gerekiyor." }));
  }

  const nowIso = new Date().toISOString();
  const updatePayload = {
    photo_consent: true,
    photo_consent_at: nowIso,
    photo_consent_source: "email_confirmation",
    photo_consent_ip: getClientIp(req),
    photo_consent_text: PHOTO_CONSENT_TEXT,
    marketing_consent_token: null,
  };
  if (needsEmail) updatePayload.email = providedEmail;

  await supabaseAdmin
    .from("customers")
    .update(updatePayload)
    .eq("id", customer.id)
    .eq("marketing_consent_token", token);

  return res.status(200).send(renderAttendancePage({ logoUrl, title: "Teşekkürler!", message: `İzniniz kaydedildi. - ${company}` }));
}

async function fetchSector(supabaseAdmin, userId) {
  const { data } = await supabaseAdmin.from("company_settings").select("sector").eq("user_id", userId).maybeSingle();
  return data?.sector || null;
}

async function recordSuccessfulPayment(supabaseAdmin, deal, { provider, iyzicoPaymentId, iyzicoPaymentTransactionId, paytrMerchantOid, commissionAmount, sector, amount = deal.value }) {
  const { error: paymentInsertError } = await supabaseAdmin.from("payments").insert({
    id: crypto.randomUUID(),
    user_id: deal.user_id,
    deal_id: deal.id,
    amount,
    paid_at: new Date().toISOString().slice(0, 10),
    note: provider === "paytr" ? "PayTR ile online ödeme" : "iyzico ile online ödeme",
    provider,
    iyzico_payment_id: iyzicoPaymentId || null,
    iyzico_payment_transaction_id: iyzicoPaymentTransactionId || null,
    paytr_merchant_oid: paytrMerchantOid || null,
  });
  if (paymentInsertError) {
    console.error("payments insert error:", paymentInsertError.message, "deal.id:", deal.id);
    return;
  }

  fetch("https://binerly.com/api/send-push", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-push-secret": (process.env.PUSH_WEBHOOK_SECRET || "").trim() },
    body: JSON.stringify({ table: "payments", record: { deal_id: deal.id, amount } }),
  }).catch(() => {});

  // Sağlayıcı, ödemeyi hesaba geçirmeden önce kendi komisyonunu kesiyor —
  // KOBİ'nin gerçek net kazancı deal.value'dan az. Bu farkı otomatik bir
  // gider olarak kaydediyoruz ki Gelir-Gider Defteri gerçeği yansıtsın.
  // Komisyonun kendi KDV'si var ama bu bizim satış KDV'mizle ilgisiz bir
  // ayrı işlem — kdv_rate bilinçli olarak boş bırakılıyor. (PayTR'nin
  // bildirim callback'i komisyon tutarını vermiyor — bu yüzden commissionAmount
  // sadece iyzico'da doluyor, v1 sınırı.)
  if (commissionAmount > 0) {
    const { error: expenseError } = await supabaseAdmin.from("company_expenses").insert({
      id: crypto.randomUUID(),
      user_id: deal.user_id,
      title: provider === "paytr" ? "PayTR komisyonu" : "iyzico komisyonu",
      category: "Ödeme Komisyonu",
      amount: commissionAmount,
      // expense_date bir timestamptz — sadece "YYYY-MM-DD" gönderilirse Postgres
      // bunu UTC gece yarısı olarak saklar; Türkiye saatinde (+3) görüntülenirken
      // her zaman 03:00 gibi sahte bir saat gösteriyordu. Tam zaman damgası
      // (gerçek işlem anı) gönderilir, saat kısmı da doğru görüntülenir.
      expense_date: new Date().toISOString(),
      note: `"${deal.title}" teklifinin online ödemesi için`,
      is_recurring: false,
      recurrence_interval: "monthly",
      kdv_rate: null,
    });
    if (expenseError) console.error("commission expense insert error:", expenseError.message, "deal.id:", deal.id);
  }

  // Gerçek para tahsil edildiği için (payment_mode ne olursa olsun) teklif
  // kazanılmış sayılır — zaten kapanmış (kazanıldı/kaybedildi) bir aşamaya dokunulmaz.
  // İSTİSNA: randevu sektörlerinde (Güzellik & Bakım, Sağlık/Klinik) "kazanıldı"
  // = "Hizmet/Tedavi tamamlandı" demek — önceden ödeme alınmış olması hizmetin
  // FİİLEN verildiği anlamına gelmez (randevu tarihi hâlâ ileride olabilir).
  // Diğer sektörlerde (teklif/üyelik/rezervasyon) "kazanıldı" onay/kazanma/
  // rezervasyon-onayı anlamına geliyor — ödeme (kapora dahil) bunu doğrudan
  // tetikler, o yüzden SADECE randevu sektörlerinde bu adım atlanır. Kim
  // oluşturduğu (KOBİ mi müşteri mi) fark etmez, sadece sektöre bakılır.
  // NOT: payment_status burada koşulsuz "paid" yazılıyor (kapora gibi kısmi
  // ödemelerde bile) — claimDealPayment bu kolonu AYNI ZAMANDA eş zamanlı
  // çift-işlem koruması (mutex) olarak kullanıyor, "paid" dışında bir değere
  // çekmek (örn. null) bu korumayı bozar ve aynı ödemenin iki kez işlenmesine
  // (mükerrer payments satırına) yol açabilir. "Ödendi/Kısmi ödeme" ayrımı
  // zaten her yerde totalPaidForDeal vs value karşılaştırmasından CANLI
  // hesaplanıyor (src/App.jsx:14047) — kapora için DealForm'daki "✓ Online
  // ödendi" rozeti ayrıca `totalPaid >= value` şartıyla süzülüyor (bkz.
  // src/App.jsx, ilgili Badge), bu kolonun kendisi değiştirilmiyor.
  const isAppointmentSector = APPOINTMENT_SECTORS.has(sector);
  const isAlreadyClosed = deal.stage === "kazanildi" || deal.stage === "kaybedildi";
  const dealUpdate = { payment_status: "paid" };
  if (!isAlreadyClosed && !isAppointmentSector) {
    dealUpdate.stage = "kazanildi";
    dealUpdate.closed_at = deal.closed_at || new Date().toISOString();
  }
  const { error: dealUpdateError } = await supabaseAdmin.from("deals").update(dealUpdate).eq("id", deal.id);
  if (dealUpdateError) console.error("deals payment_status/stage update error:", dealUpdateError.message, "deal.id:", deal.id);

  // Ödeme, hangi modda olursa olsun onaydan daha güçlü bir sinyal — "isteğe
  // bağlı" modda ayrı bir "Onaylıyorum" adımı hâlâ sunuluyor, ama müşteri
  // onu hiç kullanmadan direkt öderse bu da onay yerine geçer. Önceden
  // portaldan kendi alınan randevu/üyelik/rezervasyonlar bu kapsam dışı
  // bırakılıyordu ("onay diye bir kavram yok" gerekçesiyle) — ama bu,
  // ödenmiş bir kaydın hâlâ "Onay bekleniyor" aşama etiketiyle görünmesine
  // (çelişkili görünmesine) yol açıyordu. Ödeyen müşteri kaynağı ne olursa
  // olsun zaten onaylamış sayılır, o yüzden istisna kaldırıldı.
  if (!deal.approved_at) {
    const { data: customer } = await supabaseAdmin.from("customers").select("name").eq("id", deal.customer_id).maybeSingle();
    await markApproved(supabaseAdmin, deal, customer, null, "ödeyerek onayladı", sector).catch((e) => console.error("auto-approve error:", e.message));
  }
}

// Müşterinin kartla doğrudan ödeyebilmesi için iyzico Checkout Form başlatır —
// dönen paymentPageUrl'e müşteri yönlendirilir, kart bilgisi hiç bizim
// sunucumuzdan geçmez. checkoutforms zorunlu buyer/address alanları için
// customers tablosunda toplanmayan bilgiler (TCKN, açık adres) minimal/
// placeholder değerlerle dolduruluyor — bkz. plan notu.
async function initIyzicoCheckout(deal, customer, token, cred, chargeAmount = deal.value) {
  const iyzipay = new Iyzipay({
    apiKey: cred.api_key,
    secretKey: cred.secret_key,
    uri: cred.sandbox ? IYZICO_BASE_URL.sandbox : IYZICO_BASE_URL.production,
  });

  const nameParts = (customer?.name || "Müşteri").trim().split(/\s+/);
  const surname = nameParts.length > 1 ? nameParts.pop() : nameParts[0];
  const name = nameParts.join(" ") || surname;
  const cityOrFallback = customer?.region || "Belirtilmedi";
  // Açık adres (sokak/mahalle) ile şehir ayrı alanlar — customers.address
  // boşsa şehirle doldurmak yerine "Belirtilmedi" kullanılır, iyzico'nun
  // ürettiği faturada şehir adı iki kez tekrarlanmasın diye.
  const openAddress = customer?.address || "Belirtilmedi";
  const address = { address: openAddress, contactName: customer?.name || "Müşteri", city: cityOrFallback, country: "Turkey" };

  const request = {
    locale: Iyzipay.LOCALE.TR,
    conversationId: deal.id,
    price: String(chargeAmount),
    paidPrice: String(chargeAmount),
    currency: Iyzipay.CURRENCY.TRY,
    basketId: deal.id,
    paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
    callbackUrl: `https://binerly.com/api/deal-approval?action=payment-callback&dealToken=${token}`,
    buyer: {
      id: deal.customer_id,
      name,
      surname,
      identityNumber: "11111111111",
      email: customer?.email || "musteri@binerly.com",
      gsmNumber: customer?.phone || "+905000000000",
      registrationAddress: openAddress,
      city: cityOrFallback,
      country: "Turkey",
    },
    shippingAddress: address,
    billingAddress: address,
    basketItems: [{ id: deal.id, price: String(chargeAmount), name: deal.title, category1: "Hizmet", itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL }],
    // enabledInstallments belirli taksit sayılarının bir DİZİSİ (iyzipay SDK
    // örneklerinden doğrulandı, örn. [1,2,3,6,9,12]) — Türkiye'deki standart
    // taksit kademeleri kullanılıyor. KOBİ Ayarlar'dan taksit izni vermediyse
    // (max_installment=1) sadece [1] gönderilip tek çekime zorlanıyor.
    enabledInstallments: INSTALLMENT_TIERS.filter((t) => t <= (cred.max_installment || 1)),
  };

  const result = await new Promise((resolve) => {
    iyzipay.checkoutFormInitialize.create(request, (err, body) => resolve(err ? { status: "failure", errorMessage: err.message } : body));
  });

  if (result.status !== "success" || !result.paymentPageUrl) {
    return { error: result.errorMessage || "Ödeme başlatılamadı." };
  }
  return { paymentPageUrl: result.paymentPageUrl };
}

// PayTR'nin iFrame API'siyle ödeme başlatır — iyzico'dan farklı olarak
// bildirim URL'i dinamik geçilemiyor (KOBİ'nin PayTR panelinde BİR KEZ,
// sabit olarak ayarlanması gerekiyor), bu yüzden hangi deal olduğunu
// callback'te bulabilmek için ürettiğimiz merchant_oid'i deals.paytr_merchant_oid'e
// geçici olarak kaydediyoruz.
async function initPayTRCheckout(req, supabaseAdmin, deal, customer, token, cred, chargeAmount = deal.value) {
  const merchantOid = crypto.randomUUID().replace(/-/g, "");
  const { error: oidError } = await supabaseAdmin.from("deals").update({ paytr_merchant_oid: merchantOid }).eq("id", deal.id);
  if (oidError) return { error: "Ödeme başlatılamadı." };

  const userIp = getClientIp(req);
  const email = customer?.email || "musteri@binerly.com";
  const paymentAmount = Math.round(Number(chargeAmount) * 100);
  const userBasket = Buffer.from(JSON.stringify([[deal.title, Number(chargeAmount).toFixed(2), 1]])).toString("base64");
  // no_installment=1 taksiti tamamen kapatır; max_installment=0 PayTR'nin
  // kendi varsayılanına bırakır — KOBİ'nin Ayarlar'daki seçimini olduğu
  // gibi yansıtmak için tek çekim isteniyorsa açıkça kapatılıyor.
  const allowInstallments = (cred.max_installment || 1) > 1;
  const noInstallment = allowInstallments ? 0 : 1;
  const maxInstallment = allowInstallments ? cred.max_installment : 0;
  const currency = "TL";
  const testMode = cred.sandbox ? 1 : 0;

  const hashStr =
    `${cred.api_key}${userIp}${merchantOid}${email}${paymentAmount}${userBasket}` +
    `${noInstallment}${maxInstallment}${currency}${testMode}`;
  const paytrToken = hmacSha256Base64(hashStr + cred.merchant_salt, cred.secret_key);

  const body = new URLSearchParams({
    merchant_id: cred.api_key,
    user_ip: userIp,
    merchant_oid: merchantOid,
    email,
    payment_amount: String(paymentAmount),
    paytr_token: paytrToken,
    user_basket: userBasket,
    no_installment: String(noInstallment),
    max_installment: String(maxInstallment),
    currency,
    test_mode: String(testMode),
    user_name: customer?.name || "Müşteri",
    // PayTR'de iyzico'dan farklı olarak ayrı bir şehir alanı yok — tek
    // metin alanına açık adres + şehir birlikte gönderiliyor.
    user_address: [customer?.address, customer?.region].filter(Boolean).join(", ") || "Belirtilmedi",
    user_phone: customer?.phone || "5000000000",
    merchant_ok_url: `https://binerly.com/onay/${token}?paid=1`,
    merchant_fail_url: `https://binerly.com/onay/${token}?paid=0`,
  });

  const resp = await fetch(PAYTR_GET_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await resp.json().catch(() => ({}));
  if (data.status !== "success" || !data.token) {
    return { error: data.reason || "Ödeme başlatılamadı." };
  }
  return { paymentPageUrl: `https://www.paytr.com/odeme/guvenli/${data.token}` };
}

async function initCheckout(req, supabaseAdmin, deal, customer, token, chargeAmount = deal.value) {
  const { data: cred, error: credError } = await supabaseAdmin
    .from("payment_credentials")
    .select("provider, api_key, secret_key, merchant_salt, sandbox, max_installment")
    .eq("user_id", deal.user_id)
    .maybeSingle();
  if (credError) console.error("payment_credentials query error:", credError.message, "deal.user_id:", deal.user_id);
  if (!cred) return { error: "Bu işletme için ödeme bağlantısı kurulmamış." };

  if (cred.provider === "paytr") return initPayTRCheckout(req, supabaseAdmin, deal, customer, token, cred, chargeAmount);
  return initIyzicoCheckout(deal, customer, token, cred, chargeAmount);
}

// iyzico'nun ödeme sonucunu bildirmek için tarayıcıyı yönlendirdiği uç nokta —
// gelen isteğin kimliği doğrulanmış bir portal kullanıcısından geldiğine dair
// hiçbir garanti yok, bu yüzden iyzico'nun kendi token'ıyla retrieve API'sine
// sunucu-sunucu sorgusu atıp gerçek ödeme durumunu doğruluyoruz.
async function handlePaymentCallback(req, res, supabaseAdmin, url) {
  const dealToken = url.searchParams.get("dealToken");
  const iyzicoToken = (req.body || {}).token;
  const redirect = (path) => res.writeHead(302, { Location: path }).end();
  if (!dealToken || !iyzicoToken) return redirect("https://binerly.com/");

  const target = `https://binerly.com/onay/${dealToken}`;

  const { data: deal } = await supabaseAdmin
    .from("deals")
    .select("id, user_id, customer_id, title, value, stage, closed_at, payment_mode, payment_status, approved_at, custom_fields")
    .eq("approval_token", dealToken)
    .is("deleted_at", null)
    .maybeSingle();
  if (!deal) return redirect("https://binerly.com/");
  if (deal.payment_status === "paid") return redirect(`${target}?paid=1`); // aynı callback tekrar tetiklenirse mükerrer işlem yapma

  const { data: cred, error: credError } = await supabaseAdmin
    .from("payment_credentials")
    .select("api_key, secret_key, sandbox")
    .eq("user_id", deal.user_id)
    .eq("provider", "iyzico")
    .maybeSingle();
  if (credError) console.error("payment_credentials query error:", credError.message, "deal.user_id:", deal.user_id);
  if (!cred) return redirect(`${target}?paid=0`);

  const iyzipay = new Iyzipay({
    apiKey: cred.api_key,
    secretKey: cred.secret_key,
    uri: cred.sandbox ? IYZICO_BASE_URL.sandbox : IYZICO_BASE_URL.production,
  });
  const result = await new Promise((resolve) => {
    iyzipay.checkoutForm.retrieve({ locale: Iyzipay.LOCALE.TR, token: iyzicoToken }, (err, body) => resolve(err ? null : body));
  });
  if (!result || result.paymentStatus !== "SUCCESS") return redirect(`${target}?paid=0`);

  // iyzicoToken, tarayıcıdan (istemciden) geliyor ve TEORİK olarak müşterinin
  // kendi başka bir teklifi için aldığı gerçek/geçerli bir token olabilir —
  // retrieve SUCCESS dönse bile bu ödemenin gerçekten dealToken'ın işaret
  // ettiği TEKLİFE ait olduğunu doğrulamadan asla ödendi işaretleme. Hem
  // basketId hem conversationId checkout başlatılırken deal.id olarak
  // set edilmişti (initIyzicoCheckout) — SDK'nın hangisini/ikisini birden
  // döndürdüğü net belgelenmediği için ikisinden biri eşleşirse yeterli
  // sayılıyor (aşırı katı tek-alan kontrolü gerçek ödemeleri de reddedebilir).
  if (result.basketId !== deal.id && result.conversationId !== deal.id) {
    console.error("payment-callback deal mismatch - hiçbir alan deal.id ile eşleşmedi:", "deal.id:", deal.id, "basketId:", result.basketId, "conversationId:", result.conversationId);
    return redirect(`${target}?paid=0`);
  }

  if (!(await claimDealPayment(supabaseAdmin, deal.id))) return redirect(`${target}?paid=1`); // eş zamanlı başka bir istek zaten işledi

  const item = result.itemTransactions?.[0];
  const commissionAmount = item ? Number(item.iyziCommissionRateAmount || 0) + Number(item.iyziCommissionFee || 0) : 0;
  const sector = await fetchSector(supabaseAdmin, deal.user_id);
  // Sağlayıcının GERÇEKTEN tahsil ettiği tutar — deal.value'yu varsaymak yerine
  // (kapora gibi kısmi ödemelerde deal.value'dan küçük olabilir) iyzico'nun
  // kendi raporladığı tutar kullanılıyor.
  const chargedAmount = Number(result.paidPrice || result.price) || deal.value;

  await recordSuccessfulPayment(supabaseAdmin, deal, {
    provider: "iyzico",
    iyzicoPaymentId: result.paymentId || null,
    iyzicoPaymentTransactionId: item?.paymentTransactionId || null,
    commissionAmount,
    sector,
    amount: chargedAmount,
  });

  return redirect(`${target}?paid=1`);
}

// PayTR'nin bildirim_url'e (KOBİ'nin kendi PayTR panelinde bir kez ayarladığı
// SABİT bir adres) attığı POST — hangi deal olduğunu deals.paytr_merchant_oid
// üzerinden buluyoruz. PayTR bu uç noktadan MUTLAKA düz metin "OK" bekliyor,
// aksi halde bildirimi tekrar tekrar dener.
async function handlePayTRCallback(req, res, supabaseAdmin) {
  const respondOk = () => { res.status(200).setHeader("Content-Type", "text/plain"); res.end("OK"); };

  const body = req.body || {};
  const { merchant_oid: merchantOid, status, total_amount: totalAmount, hash } = body;
  if (!merchantOid || !status || !hash) return respondOk();

  const { data: deal } = await supabaseAdmin
    .from("deals")
    .select("id, user_id, customer_id, title, value, stage, closed_at, payment_mode, payment_status, approved_at, custom_fields")
    .eq("paytr_merchant_oid", merchantOid)
    .is("deleted_at", null)
    .maybeSingle();
  if (!deal) return respondOk();
  if (deal.payment_status === "paid") return respondOk(); // aynı bildirim tekrar gelirse mükerrer işlem yapma

  const { data: cred } = await supabaseAdmin
    .from("payment_credentials")
    .select("api_key, secret_key, merchant_salt")
    .eq("user_id", deal.user_id)
    .eq("provider", "paytr")
    .maybeSingle();
  if (!cred) return respondOk();

  const expectedHash = hmacSha256Base64(`${merchantOid}${cred.merchant_salt}${status}${totalAmount}`, cred.secret_key);
  if (!secretsMatch(expectedHash, hash)) {
    console.error("PayTR hash mismatch, merchant_oid:", merchantOid);
    return respondOk();
  }

  if (status === "success") {
    if (await claimDealPayment(supabaseAdmin, deal.id)) {
      const sector = await fetchSector(supabaseAdmin, deal.user_id);
      // total_amount PayTR'de kuruş cinsinden geliyor (initPayTRCheckout'taki
      // paymentAmount ile aynı birim) — deal.value yerine sağlayıcının GERÇEKTEN
      // tahsil ettiği tutar kullanılıyor (kapora gibi kısmi ödemelerde farklı olabilir).
      const chargedAmount = Number(totalAmount) / 100 || deal.value;
      await recordSuccessfulPayment(supabaseAdmin, deal, { provider: "paytr", paytrMerchantOid: merchantOid, sector, amount: chargedAmount });
    } // false ise: PayTR'nin "OK" almadan yaptığı tekrar denemesi, zaten işlendi
  }

  return respondOk();
}

const REFUND_REASON_LABELS_TR = { buyer_request: "Müşteri talebi", double_payment: "Mükerrer ödeme", fraud: "Sahtecilik", other: "Diğer" };

// KOBİ'nin (müşterinin değil) bir online ödemeyi tam/kısmi iade edebildiği uç
// nokta — approval_token değil deal.id + payment.id ile çalışır, çünkü bunu
// tetikleyen işletme sahibinin kendi normal Supabase Auth oturumu (portal
// müşteri oturumu değil). Bu yüzden yetki kontrolü customers.portal_user_id
// yerine deal.user_id / team_members'a bakıyor. Online ödemeler artık asla
// doğrudan silinemiyor — tek "geri alma" yolu burası, gerçekten sağlayıcıya
// (iyzico veya PayTR) iade isteği gönderiyor (bkz. İade Prosedürü planı).
// Kredi, HANGİ sağlayıcıyla alındıysa (payment.provider) o sağlayıcının
// credentials'ı aranıyor — KOBİ o sırada başka bir sağlayıcıya geçmiş olsa
// bile (tek-aktif-sağlayıcı modeli) eski ödemenin geçmişi bozulmaz.
async function handleRefund(req, res, supabaseAdmin) {
  const { dealId, paymentId, amount, reason } = req.body || {};
  if (!dealId || !paymentId) return res.status(400).json({ error: "Eksik bilgi." });

  const authHeader = req.headers.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!accessToken) return res.status(401).json({ error: "Yetkisiz." });
  const { data: userData } = await supabaseAdmin.auth.getUser(accessToken);
  const authedUserId = userData?.user?.id || null;
  if (!authedUserId) return res.status(401).json({ error: "Yetkisiz." });

  const { data: deal } = await supabaseAdmin.from("deals").select("id, user_id, payment_status").eq("id", dealId).maybeSingle();
  if (!deal) return res.status(404).json({ error: "Teklif bulunamadı." });

  let authorized = authedUserId === deal.user_id;
  if (!authorized) {
    const { data: tm } = await supabaseAdmin.from("team_members").select("team_id").eq("member_id", authedUserId).eq("team_id", deal.user_id).maybeSingle();
    authorized = !!tm;
  }
  if (!authorized) return res.status(403).json({ error: "Bu işlemi yapma yetkiniz yok." });

  const { data: payment } = await supabaseAdmin.from("payments").select("*").eq("id", paymentId).eq("deal_id", dealId).is("deleted_at", null).maybeSingle();
  if (!payment) return res.status(404).json({ error: "Tahsilat bulunamadı." });
  if (payment.amount <= 0) return res.status(400).json({ error: "Bu kayıt zaten bir iade." });
  if (payment.provider === "iyzico" && !payment.iyzico_payment_transaction_id) {
    return res.status(400).json({ error: "Bu tahsilat online ödeme değil, doğrudan silinebilir." });
  }
  if (payment.provider === "paytr" && !payment.paytr_merchant_oid) {
    return res.status(400).json({ error: "Bu tahsilat online ödeme değil, doğrudan silinebilir." });
  }
  if (payment.provider !== "iyzico" && payment.provider !== "paytr") {
    return res.status(400).json({ error: "Bu tahsilat online ödeme değil, doğrudan silinebilir." });
  }

  const { data: existingRefunds } = await supabaseAdmin
    .from("payments")
    .select("amount")
    .eq("refund_of_payment_id", payment.id)
    .is("deleted_at", null);
  const alreadyRefunded = (existingRefunds || []).reduce((sum, r) => sum + Math.abs(r.amount || 0), 0);
  const refundable = payment.amount - alreadyRefunded;
  const refundAmount = Number(amount) > 0 ? Number(amount) : refundable;
  if (refundAmount > refundable + 0.01) {
    return res.status(400).json({ error: `En fazla ${refundable} TL iade edilebilir.` });
  }

  // Ödemenin alındığı sağlayıcının credentials'ı aranıyor — KOBİ o sırada
  // başka bir sağlayıcıya geçmiş olabilir, bu kasıtlı olarak payment.provider'a bakıyor.
  const { data: cred } = await supabaseAdmin
    .from("payment_credentials")
    .select("api_key, secret_key, merchant_salt, sandbox")
    .eq("user_id", deal.user_id)
    .eq("provider", payment.provider)
    .maybeSingle();
  if (!cred) {
    const providerLabel = payment.provider === "paytr" ? "PayTR" : "iyzico";
    return res.status(400).json({ error: `${providerLabel} bağlantısı bulunamadı - iade için önce bu sağlayıcıyı yeniden bağlamanız gerekiyor.` });
  }

  const validReasons = Object.values(Iyzipay.REFUND_REASON);
  const refundReason = validReasons.includes(reason) ? reason : Iyzipay.REFUND_REASON.OTHER;

  if (payment.provider === "paytr") {
    const returnAmount = refundAmount.toFixed(2);
    const hashStr = `${cred.api_key}${payment.paytr_merchant_oid}${returnAmount}${cred.merchant_salt}`;
    const paytrToken = hmacSha256Base64(hashStr, cred.secret_key);
    const body = new URLSearchParams({
      merchant_id: cred.api_key,
      merchant_oid: payment.paytr_merchant_oid,
      return_amount: returnAmount,
      paytr_token: paytrToken,
    });
    const resp = await fetch(PAYTR_REFUND_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    const data = await resp.json().catch(() => ({}));
    if (data.status !== "success") {
      return res.status(502).json({ error: data.err_msg || "İade işlemi başarısız oldu." });
    }
  } else {
    const iyzipay = new Iyzipay({
      apiKey: cred.api_key,
      secretKey: cred.secret_key,
      uri: cred.sandbox ? IYZICO_BASE_URL.sandbox : IYZICO_BASE_URL.production,
    });
    const result = await new Promise((resolve) => {
      iyzipay.refund.create(
        {
          locale: Iyzipay.LOCALE.TR,
          paymentTransactionId: payment.iyzico_payment_transaction_id,
          price: String(refundAmount),
          ip: getClientIp(req),
          currency: Iyzipay.CURRENCY.TRY,
          reason: refundReason,
        },
        (err, body) => resolve(err ? { status: "failure", errorMessage: err.message } : body)
      );
    });
    if (result.status !== "success") {
      return res.status(502).json({ error: result.errorMessage || "İade işlemi başarısız oldu." });
    }
  }

  const providerLabel = payment.provider === "paytr" ? "PayTR" : "iyzico";
  const refundRow = {
    id: crypto.randomUUID(),
    user_id: deal.user_id,
    deal_id: dealId,
    amount: -refundAmount,
    paid_at: new Date().toISOString().slice(0, 10),
    note: `${providerLabel} ile iade - ${REFUND_REASON_LABELS_TR[refundReason] || "Diğer"}`,
    provider: payment.provider,
    refund_of_payment_id: payment.id,
  };
  const { data: inserted, error: insertError } = await supabaseAdmin.from("payments").insert(refundRow).select().single();
  if (insertError) return res.status(500).json({ error: `İade sağlayıcıda yapıldı ama kayıt eklenemedi: ${insertError.message}` });

  let dealPaymentStatusCleared = false;
  const isFullRefund = refundAmount >= refundable - 0.01;
  if (isFullRefund && deal.payment_status === "paid") {
    const { error: dealError } = await supabaseAdmin.from("deals").update({ payment_status: null }).eq("id", dealId);
    if (!dealError) dealPaymentStatusCleared = true;
  }

  return res.status(200).json({ ok: true, payment: inserted, dealPaymentStatusCleared });
}

// Müşterinin teklif onaylayabildiği (ve isteğe bağlı/zorunlu online ödeme
// yapabildiği) uç nokta — token tek başına yetmez, müşteri portalına
// (Supabase Auth) giriş yapmış VE bu teklifin müşterisine bağlı
// (customers.portal_user_id) olmalı. Bilinçli olarak sadece teklif başlığı/
// tutarı/şirket-müşteri adı döner, telefon/not gibi hiçbir hassas alan
// okunmaz. Onay, teklifi otomatik "Kazanıldı" aşamasına taşır (tahsilat ayrı
// takip edildiği için bu "ödendi" anlamına gelmez, sadece "müşteri kabul
// etti" demektir) — zaten kapanmış (kazanıldı/kaybedildi) bir teklifin
// aşamasına dokunulmaz.
export default async function handler(req, res) {
  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // req.query bazı durumlarda güvenilir doldurulmuyor (bkz. whatsapp-webhook.js) —
  // sorgu parametresini doğrudan req.url'den elle ayrıştırıyoruz.
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  // iyzico'nun kendi sunucusundan gelen callback — portal oturumu yok, ayrı ele alınır.
  if (req.method === "POST" && url.searchParams.get("action") === "payment-callback") {
    return handlePaymentCallback(req, res, supabaseAdmin, url);
  }

  // PayTR'nin sabit bildirim URL'ine gelen callback — portal oturumu yok, ayrı ele alınır.
  if (req.method === "POST" && url.searchParams.get("action") === "paytr-callback") {
    return handlePayTRCallback(req, res, supabaseAdmin);
  }

  // İşletme sahibinin iade isteği — token bazlı değil, ayrı ele alınır.
  if (req.method === "POST" && (req.body || {}).action === "refund") {
    return handleRefund(req, res, supabaseAdmin);
  }

  // Pano.jsx "Randevu Talepleri" widget'ından - KOBİ bir talebe uygun bir saat
  // seçip müşteriye tek bir teklif gönderir. handleRefund ile AYNI ilke:
  // henüz bir approval_token yok (burada üretiliyor), dealId + owner/team_member
  // Bearer auth'la çalışır, token bazlı değil.
  if (req.method === "POST" && (req.body || {}).action === "send-appointment-offer") {
    return handleSendAppointmentOffer(req, res, supabaseAdmin);
  }

  // Pazarlama izni onay linki — deal/approval_token akışından tamamen bağımsız,
  // kendi token'ı (customers.marketing_consent_token) üzerinden çalışır.
  if (
    (req.method === "GET" && url.searchParams.get("action") === "confirm-marketing-consent") ||
    (req.method === "POST" && (req.body || {}).action === "confirm-marketing-consent")
  ) {
    const consentToken = req.method === "GET" ? url.searchParams.get("token") : (req.body || {}).token;
    return handleMarketingConsentConfirm(req, res, supabaseAdmin, consentToken);
  }

  // Fotoğraf saklama izni onay linki — 2026-07-31'de marketing-consent'ten AYRILDI
  // (bkz. handlePhotoConsentConfirm), aynı token kolonunu paylaşır ama ayrı action.
  if (
    (req.method === "GET" && url.searchParams.get("action") === "confirm-photo-consent") ||
    (req.method === "POST" && (req.body || {}).action === "confirm-photo-consent")
  ) {
    const consentToken = req.method === "GET" ? url.searchParams.get("token") : (req.body || {}).token;
    return handlePhotoConsentConfirm(req, res, supabaseAdmin, consentToken);
  }

  const token = req.method === "GET" ? url.searchParams.get("token") : (req.body || {}).token;
  const note = req.method === "POST" ? (req.body || {}).note || null : null;
  const action = req.method === "POST" ? (req.body || {}).action || "approve" : null;
  const attendanceAction = req.method === "GET" ? url.searchParams.get("action") : action;
  const attendanceResponse = req.method === "GET" ? url.searchParams.get("response") : (req.body || {}).response;
  const reviewRating = req.method === "GET" ? url.searchParams.get("rating") : (req.body || {}).rating;
  const reviewFeedback = req.method === "POST" ? (req.body || {}).feedback : null;
  if (!token) return res.status(400).json({ error: "Eksik token." });

  const { data: deal, error: dealError } = await supabaseAdmin
    .from("deals")
    .select("id, user_id, customer_id, title, value, kdv_rate, approved_at, created_at, stage, payment_mode, payment_status, custom_fields, first_viewed_at, view_duration_seconds, appointment_start, review_submitted_at, appointment_offer_time, appointment_offer_expires_at, appointment_offer_status")
    .eq("approval_token", token)
    .is("deleted_at", null)
    .maybeSingle();
  if (dealError) console.error("deal-approval query error:", dealError.message);
  if (dealError || !deal) return res.status(404).json({ error: "Teklif bulunamadı." });

  const [{ data: customer }, { data: settings }] = await Promise.all([
    supabaseAdmin.from("customers").select("name, email, phone, region, address, portal_user_id").eq("id", deal.customer_id).maybeSingle(),
    supabaseAdmin
      .from("company_settings")
      .select("company_name, logo_url, sector, email, google_review_link, appointment_cancel_hours, appointment_penalty_hours, appointment_penalty_strike_limit, appointment_penalty_burns_session, appointment_deposit_amount")
      .eq("user_id", deal.user_id)
      .maybeSingle(),
  ]);

  const branding = { companyName: settings?.company_name || "Binerly", logoUrl: settings?.logo_url || null, sector: settings?.sector || null };

  // Randevu hatırlatma mailindeki Evet/Hayır butonları — ayrı bir serverless
  // fonksiyon (Vercel Hobby planında 12 fonksiyon sınırı var) yerine buraya,
  // zaten token bazlı deal/customer/settings'i çeken bu uç noktaya bir action
  // dalı olarak eklendi. BİLİNÇLİ OLARAK isAuthorized kontrolünden ÖNCE —
  // portal girişi gerektirmez, token tek başına yeterli (2 saat önceden giden
  // bir hatırlatmada giriş zorunluluğu sürtünmeyi öldürürdü).
  if (attendanceAction === "confirm-attendance") {
    return handleConfirmAttendance(req, res, supabaseAdmin, deal, settings, attendanceResponse);
  }

  // "Randevu Talepleri" e-postasındaki Evet/Hayır linklerinin hedefi - AYNI
  // ilke (token tek başına yeterli, isAuthorized kontrolünden ÖNCE). Bu deal
  // henüz gerçek bir randevu saatine sahip DEĞİL (appointment_offer_time
  // sadece bir ÖNERİ) - handleConfirmAttendance'tan farklı olarak "yes"
  // yanıtı burada gerçek atomik saat/kaynak tahsisini TETİKLER.
  if (attendanceAction === "confirm-appointment-offer") {
    return handleConfirmAppointmentOffer(req, res, supabaseAdmin, deal, settings, attendanceResponse, token);
  }

  // Google değerlendirme e-postasındaki linkin hedefi — AYNI ilke (token tek
  // başına yeterli, isAuthorized kontrolünden ÖNCE). "review" GET'te soru
  // sayfasını, "submit-review" POST'ta gerçek kaydı yapar (bkz. handleReviewGate).
  if (attendanceAction === "review" || attendanceAction === "submit-review") {
    return handleReviewGate(req, res, supabaseAdmin, deal, settings, reviewRating, reviewFeedback, token);
  }

  // Randevu widget'ından (misafir, portal hesabı YOK) gelen booking-anı kapora
  // ödemesini başlatır — confirm-attendance ile AYNI ilkeyle isAuthorized
  // kontrolünden ÖNCE, token tek başına yeterli. Normal tam-ödeme onay linki
  // akışını (checkout-init, portal-auth'lu) hijack etmek için kötüye
  // kullanılamaması için deal'in GERÇEKTEN randevu widget'ından gelmiş,
  // ödeme bekleyen bir kayıt olması şart koşuluyor. Tutar İSTEMCİDEN ASLA
  // alınmıyor - her seferinde company_settings'ten taze okunuyor.
  if (req.method === "POST" && action === "deposit-checkout-init") {
    if (deal.custom_fields?.kaynak !== "randevu_widget" || deal.payment_mode !== "required" || deal.payment_status === "paid") {
      return res.status(400).json({ error: "Bu işlem için uygun değil." });
    }
    // settings biraz yukarıda (deal ile birlikte) zaten aynı istekte taze
    // okundu - burada tekrar sorgulamıyoruz. Hizmet fiyatı biliniyorsa
    // (deal.value > 0) kapora bu tutarı aşamaz - lead-capture.js POST'taki
    // AYNI sınırlama, tahsilatı başlatan asıl yerde de tekrarlanıyor çünkü
    // tutar istemciden asla alınmıyor, her seferinde burada belirleniyor.
    const rawDepositAmount = settings?.appointment_deposit_amount;
    const depositAmount = deal.value > 0 ? Math.min(rawDepositAmount || 0, deal.value) : rawDepositAmount;
    if (!(depositAmount > 0)) return res.status(400).json({ error: "Kapora tanımlı değil." });
    const result = await initCheckout(req, supabaseAdmin, deal, customer, token, depositAmount);
    if (result.error) return res.status(502).json({ error: result.error });
    return res.status(200).json({ paymentPageUrl: result.paymentPageUrl });
  }

  const authHeader = req.headers.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  let authedUserId = null;
  if (accessToken) {
    const { data: userData } = await supabaseAdmin.auth.getUser(accessToken);
    authedUserId = userData?.user?.id || null;
  }
  // Randevu widget'ından (misafir) kendi randevusunu alan müşterinin hiç
  // portal hesabı yok - kapora ödedikten sonra bu sayfaya (/onay/{token})
  // döndüğünde "giriş yap" duvarına çarpmasın diye (kayıtsız/hızlı randevu
  // felsefesiyle çelişirdi) token tek başına yeterli sayılıyor - tıpkı
  // confirm-attendance/confirm-marketing-consent'teki gibi. Portal hesabı
  // OLUŞTUKTAN sonra (customer.portal_user_id set edildikten sonra) bu yol
  // artık geçerli olmaz, normal portal-auth'a döner.
  const isSelfBookedGuest = !customer?.portal_user_id && deal.custom_fields?.kaynak === "randevu_widget";
  const isAuthorized = !!(authedUserId && customer?.portal_user_id && authedUserId === customer.portal_user_id) || isSelfBookedGuest;

  if (!isAuthorized) {
    return res.status(401).json({ requiresAuth: true, ...branding });
  }

  if (req.method === "GET") {
    if (await claimFirstView(supabaseAdmin, deal.id)) {
      fetch("https://binerly.com/api/send-push", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-push-secret": (process.env.PUSH_WEBHOOK_SECRET || "").trim() },
        body: JSON.stringify({ table: "deal_viewed", record: { user_id: deal.user_id, title: deal.title, customer_name: customer?.name || null } }),
      }).catch(() => {});
    }
    const appointmentDate = APPOINTMENT_SECTORS.has(settings?.sector) ? await resolveAppointmentDateTime(supabaseAdmin, deal) : null;
    return res.status(200).json({
      title: deal.title,
      value: deal.value,
      stage: deal.stage,
      approved: !!deal.approved_at,
      approvedAt: deal.approved_at,
      createdAt: deal.created_at,
      appointmentDate,
      customerName: customer?.name || "",
      paymentMode: deal.payment_mode || "none",
      paymentStatus: deal.payment_status || null,
      // Portaldan veya randevu widget'ından kendi alınan randevu/üyelik/
      // rezervasyonlarda onay diye bir kavram yok — müşteri zaten kendi almış,
      // sayfa sadece "Öde" göstermeli.
      selfBooked: deal.custom_fields?.kaynak === "portal" || deal.custom_fields?.kaynak === "randevu_widget",
      // Sadece randevu widget'ından gelen, henüz tam ödenmemiş "ödeme bekleniyor"
      // kayıtlarda anlamlı — sayfa "Kaporanız X TL alındı" yerine "Kaporanızı
      // ödeyin" gösterebilsin diye. deposit-checkout-init'teki AYNI sınırlama
      // (kapora hizmet fiyatını aşamaz) burada da uygulanır, yoksa gösterilen
      // tutar gerçekte tahsil edilenden farklı olurdu.
      // Randevu widget'ından VEYA portaldan kendi RANDEVUSUNU (appointment_start
      // dolu) alan, henüz tam ödenmemiş kayıtlarda anlamlı - sayfa "Öde" yerine
      // "Kaporayı Öde" gösterebilsin diye. checkout-init'teki AYNI sınırlama
      // (kapora hizmet fiyatını aşamaz) burada da uygulanır, yoksa gösterilen
      // tutar gerçekte tahsil edilenden farklı olurdu.
      depositAmount: (() => {
        const isSelfBookedAppointment =
          (deal.custom_fields?.kaynak === "randevu_widget" || deal.custom_fields?.kaynak === "portal") &&
          !!deal.appointment_start;
        if (!isSelfBookedAppointment || deal.payment_mode !== "required") return null;
        const raw = settings?.appointment_deposit_amount;
        return (deal.value > 0 ? Math.min(raw || 0, deal.value) : raw) || null;
      })(),
      ...branding,
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (action === "checkout-init") {
    // Portaldan kendi randevusunu alan müşteride deal.value artık sunucu
    // tarafında (api/appointment-availability.js handleBooking) hesaplanıyor,
    // ama burada YİNE DE ikinci bir savunma katmanı olarak fiyat listesinden
    // seçilmiş kalemler (custom_fields.service_ids) varsa tahsilat tutarı
    // DB'den TAZE okunan gerçek fiyatla yeniden hesaplanır - deal.value'ya
    // körlemesine güvenilmez. Elle girilen (service_ids'siz) tutarlarda
    // mevcut davranış (deal.value) korunur - bilinçli bir esneklik,
    // deposit-checkout-init'teki AYNI ilke.
    let chargeAmount = deal.value;
    const serviceIds = Array.isArray(deal.custom_fields?.service_ids) ? deal.custom_fields.service_ids : [];
    if (deal.custom_fields?.kaynak === "portal" && serviceIds.length > 0) {
      const { data: priceItems } = await supabaseAdmin
        .from("price_list_items")
        .select("price")
        .in("id", serviceIds)
        .eq("user_id", deal.user_id);
      if (priceItems?.length) chargeAmount = priceItems.reduce((sum, p) => sum + (Number(p.price) || 0), 0);
    }
    // Randevu widget'ından veya portaldan kendi RANDEVUSUNU (appointment_start
    // dolu) alan müşterilerde ödeme artık kapora bazlı - deposit-checkout-init'teki
    // AYNI ilke, tam tutar değil KOBİ'nin Ayarlar'dan belirlediği kapora tutarı
    // (hizmet fiyatını aşmaz) tahsil edilir. Tutar istemciden asla alınmıyor,
    // taze company_settings'ten okunuyor. CRM'den gönderilen normal tekliflerde
    // (bu iki kaynak dışında) davranış DEĞİŞMEDİ - hâlâ tam tutar.
    // payment_mode === "required" şartı GET'teki (satır ~1577) aynı filtreyle
    // tutarlı olsun diye eklendi - appointment-availability.js handleBooking
    // sadece appointment_deposit_amount>0 iken "required" set ediyor, bu yüzden
    // "optional"/"none" olan (kapora hiç tanımlı olmayan KOBİ'lerin varsayılanı)
    // randevularda burası zorla kapora moduna girip "Kapora tanımlı değil"
    // hatasıyla tam tutar ödemesini tamamen kilitliyordu.
    const isSelfBookedAppointment =
      (deal.custom_fields?.kaynak === "portal" || deal.custom_fields?.kaynak === "randevu_widget") &&
      !!deal.appointment_start &&
      deal.payment_mode === "required";
    if (isSelfBookedAppointment) {
      const rawDepositAmount = settings?.appointment_deposit_amount;
      const depositAmount = chargeAmount > 0 ? Math.min(rawDepositAmount || 0, chargeAmount) : rawDepositAmount;
      if (!(depositAmount > 0)) return res.status(400).json({ error: "Kapora tanımlı değil." });
      chargeAmount = depositAmount;
    }
    const result = await initCheckout(req, supabaseAdmin, deal, customer, token, chargeAmount);
    if (result.error) return res.status(502).json({ error: result.error });
    return res.status(200).json({ paymentPageUrl: result.paymentPageUrl });
  }

  // Basit "ısı haritası": gerçek AI/sayfa-bazlı analiz değil, müşterinin onay
  // sayfasında AKTİF (sekme görünürken) geçirdiği toplam süreyi biriktirir —
  // sayfa kapanırken/arka plana geçerken tarayıcıdan tek seferlik gönderilir.
  // "3 dakika baktı ama onaylamadı" gibi bir tereddüt sinyali vermek için yeterli.
  if (action === "track-view") {
    const seconds = Math.max(0, Math.round(Number((req.body || {}).seconds) || 0));
    if (seconds > 0) {
      const { error: viewError } = await supabaseAdmin
        .from("deals")
        .update({ view_duration_seconds: (deal.view_duration_seconds || 0) + seconds })
        .eq("id", deal.id);
      if (viewError) console.error("track-view update error:", viewError.message, "deal.id:", deal.id);
    }
    return res.status(200).json({ ok: true });
  }

  let approvedAt = deal.approved_at;
  if (!deal.approved_at) {
    try {
      approvedAt = await markApproved(supabaseAdmin, deal, customer, note, "onayladı", settings?.sector);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(200).json({ ok: true, approvedAt });
}
