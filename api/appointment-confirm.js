import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

// Sectors.jsx'teki isAppointmentSector ile aynı liste — api/*.js JSX içeren
// Sectors.jsx'i import edemediği için (bkz. deal-approval.js) burada da
// küçük bir kopyası tutuluyor.
const APPOINTMENT_SECTORS = new Set(["guzellik_bakim", "saglik_klinik"]);

// Sectors.jsx computeAppointmentPenaltyBurn ile AYNI mantık — App.jsx (staff)
// ve CustomerPortal.jsx (portal girişli iptal) zaten bu fonksiyonu kullanıyor,
// burada (portal girişi OLMAYAN e-posta linki) da tutarlılık için birebir
// portlanmış kopyası tutuluyor.
function computeAppointmentPenaltyBurn({ customerId, deals, burnsSessionEnabled, strikeLimit }) {
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

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderPage({ logoUrl, title, message, formToken, formResponse, submitLabel }) {
  const logo = logoUrl || "https://binerly.com/pwa-512x512.png";
  const form = formToken
    ? `<form method="POST" action="/api/appointment-confirm" style="margin-top:8px;">
        <input type="hidden" name="token" value="${escapeHtml(formToken)}" />
        <input type="hidden" name="response" value="${escapeHtml(formResponse)}" />
        <button type="submit" style="display:inline-block;background:#185fa5;color:#ffffff;border:none;cursor:pointer;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">${escapeHtml(submitLabel)}</button>
      </form>`
    : "";
  return `<!doctype html>
<html lang="tr">
  <body style="margin:0;padding:32px 16px;background:#f5f8fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e1e8f0;text-align:center;">
      <div style="padding:28px 32px 20px;border-bottom:1px solid #e1e8f0;">
        <img src="${escapeHtml(logo)}" alt="" style="max-height:48px;max-width:200px;" />
      </div>
      <div style="padding:28px 32px;color:#0c2540;font-size:15px;line-height:1.7;">
        <p style="margin:0 0 16px;font-size:17px;font-weight:600;">${escapeHtml(title)}</p>
        <p style="margin:0 0 8px;">${escapeHtml(message)}</p>
        ${form}
      </div>
    </div>
  </body>
</html>`;
}

async function resolveContext(supabaseAdmin, token) {
  const { data: deal } = await supabaseAdmin
    .from("deals")
    .select("id, user_id, customer_id, title, stage, custom_fields, created_at")
    .eq("approval_token", token)
    .is("deleted_at", null)
    .maybeSingle();
  if (!deal) return { error: "Bu bağlantı geçersiz veya süresi dolmuş." };

  const { data: settings } = await supabaseAdmin
    .from("company_settings")
    .select("company_name, logo_url, sector, appointment_cancel_hours, appointment_penalty_hours, appointment_penalty_strike_limit, appointment_penalty_burns_session")
    .eq("user_id", deal.user_id)
    .maybeSingle();
  if (!settings || !APPOINTMENT_SECTORS.has(settings.sector)) return { error: "Bu bağlantı geçersiz." };

  const { data: defs } = await supabaseAdmin
    .from("custom_field_defs")
    .select("key")
    .eq("user_id", deal.user_id)
    .eq("entity", "deal")
    .eq("field_type", "datetime")
    .eq("active", true);
  const key = (defs || []).map((d) => d.key).find((k) => deal.custom_fields?.[k]);
  const raw = key ? deal.custom_fields[key] : null;
  const apptTime = raw ? new Date(`${raw}:00+03:00`).getTime() : NaN;

  return { deal, settings, apptTime };
}

function decideCancel(apptTime, settings) {
  const hoursLeft = isNaN(apptTime) ? null : (apptTime - Date.now()) / (60 * 60 * 1000);
  const canCancel = hoursLeft === null || settings.appointment_cancel_hours == null || hoursLeft >= settings.appointment_cancel_hours;
  const isLate = canCancel && hoursLeft !== null && settings.appointment_penalty_hours != null && hoursLeft < settings.appointment_penalty_hours;
  return { canCancel, isLate };
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const token = req.method === "GET" ? url.searchParams.get("token") : (req.body || {}).token;
  const response = req.method === "GET" ? url.searchParams.get("response") : (req.body || {}).response;

  if (!token || (response !== "yes" && response !== "no")) {
    return res.status(400).send(renderPage({ title: "Geçersiz bağlantı", message: "Bu bağlantı eksik ya da hatalı görünüyor." }));
  }

  const ctx = await resolveContext(supabaseAdmin, token);
  if (ctx.error) {
    return res.status(404).send(renderPage({ title: "Bağlantı bulunamadı", message: ctx.error }));
  }
  const { deal, settings, apptTime } = ctx;
  const logoUrl = settings.logo_url;
  const company = settings.company_name || "Binerly";

  if (deal.stage === "kazanildi" || deal.stage === "kaybedildi") {
    return res.status(200).send(renderPage({
      logoUrl,
      title: "Bu randevu için işlem zaten tamamlanmış",
      message: `"${deal.title}" randevusu için ${deal.stage === "kaybedildi" ? "iptal işlenmiş" : "işlem tamamlanmış"} durumda. Bir sorunuz varsa ${company} ile iletişime geçebilirsiniz.`,
    }));
  }

  if (response === "yes") {
    if (deal.custom_fields?.attendanceConfirmedAt) {
      return res.status(200).send(renderPage({ logoUrl, title: "Zaten onaylanmış", message: `Bu randevu için geleceğinizi zaten onaylamıştınız, sizi bekliyoruz. — ${company}` }));
    }
    if (req.method === "GET") {
      return res.status(200).send(renderPage({
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
    return res.status(200).send(renderPage({ logoUrl, title: "Teşekkürler!", message: `Randevunuz onaylandı, sizi bekliyoruz. — ${company}` }));
  }

  // response === "no"
  const { canCancel, isLate } = decideCancel(apptTime, settings);
  if (!canCancel) {
    return res.status(200).send(renderPage({
      logoUrl,
      title: "Bu saate çok yakın kaldı",
      message: `Randevu saatine çok az kaldığı için bu bağlantı üzerinden iptal edilemiyor. Lütfen doğrudan ${company} ile iletişime geçin.`,
    }));
  }

  if (req.method === "GET") {
    return res.status(200).send(renderPage({
      logoUrl,
      title: "Randevunuzu iptal etmek istiyor musunuz?",
      message: `"${deal.title}" randevunuzu iptal etmek için aşağıya tıklayın.${isLate ? " Randevu saatine az kaldığı için bu iptal geç iptal olarak kaydedilecek." : ""}`,
      formToken: token, formResponse: "no", submitLabel: "Evet, iptal ediyorum",
    }));
  }

  const lostReason = isLate ? "Geç iptal etti" : "İptal etti";

  // computeAppointmentPenaltyBurn geçmiş ihlal sayısını "bu iptalden ÖNCEKİ"
  // duruma göre sayıp +1 kendisi ekliyor (App.jsx applyAppointmentPenaltyBurn'daki
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
    const burn = computeAppointmentPenaltyBurn({
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

  return res.status(200).send(renderPage({ logoUrl, title: "Randevunuz iptal edildi", message: `Bize haber verdiğiniz için teşekkürler.${burnMessage} — ${company}` }));
}
