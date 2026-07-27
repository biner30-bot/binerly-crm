import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import Iyzipay from "iyzipay";
import { renderEmailHtml, plainTextFallback } from "./_email-template.js";

const IYZICO_BASE_URL = { sandbox: "https://sandbox-api.iyzipay.com", production: "https://api.iyzipay.com" };
const PAYTR_GET_TOKEN_URL = "https://www.paytr.com/odeme/api/get-token";
const PAYTR_REFUND_URL = "https://www.paytr.com/odeme/iade";
const INSTALLMENT_TIERS = [1, 2, 3, 6, 9, 12]; // Türkiye'deki standart taksit kademeleri

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
// için) ödeme başarıyla tamamlandığında otomatik onaydan çağrılır.
async function markApproved(supabaseAdmin, deal, customer, note, contentSuffix) {
  const approvedAt = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin.from("deals").update({ approved_at: approvedAt }).eq("id", deal.id);
  if (updateError) throw new Error(updateError.message);

  await supabaseAdmin.from("activities").insert({
    id: crypto.randomUUID(),
    user_id: deal.user_id,
    customer_id: deal.customer_id,
    type: "note",
    content: `Müşteri "${deal.title}" teklifini ${contentSuffix}.${note ? ` Not: "${note}"` : ""}`,
  });

  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    const { data: ownerData } = await supabaseAdmin.auth.admin.getUserById(deal.user_id);
    const ownerEmail = ownerData?.user?.email;
    if (ownerEmail) {
      const bodyText =
        `${customer?.name || "Müşteriniz"}, "${deal.title}" (${deal.value} TL) teklifini ${contentSuffix}.` +
        (note ? `\n\nMüşterinin notu: "${note}"` : "") +
        `\n\nBinerly'ye giriş yaparak detayları görebilirsiniz.`;
      const footerLines = ["Binerly Ekibi"];
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Binerly <noreply@binerly.com>",
          to: ownerEmail,
          subject: `${customer?.name || "Müşteriniz"} "${deal.title}" teklifini onayladı`,
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

function renderAttendancePage({ logoUrl, title, message, formToken, formResponse, submitLabel }) {
  const logo = logoUrl || "https://binerly.com/pwa-512x512.png";
  const form = formToken
    ? `<form method="POST" action="/api/deal-approval" style="margin-top:8px;">
        <input type="hidden" name="action" value="confirm-attendance" />
        <input type="hidden" name="token" value="${escapeAttendanceHtml(formToken)}" />
        <input type="hidden" name="response" value="${escapeAttendanceHtml(formResponse)}" />
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
  const apptTime = raw ? new Date(`${raw}:00+03:00`).getTime() : NaN;

  if (response === "yes") {
    if (deal.custom_fields?.attendanceConfirmedAt) {
      return res.status(200).send(renderAttendancePage({ logoUrl, title: "Zaten onaylanmış", message: `Bu randevu için geleceğinizi zaten onaylamıştınız, sizi bekliyoruz. — ${company}` }));
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
    return res.status(200).send(renderAttendancePage({ logoUrl, title: "Teşekkürler!", message: `Randevunuz onaylandı, sizi bekliyoruz. — ${company}` }));
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

  return res.status(200).send(renderAttendancePage({ logoUrl, title: "Randevunuz iptal edildi", message: `Bize haber verdiğiniz için teşekkürler.${burnMessage} — ${company}` }));
}

async function fetchSector(supabaseAdmin, userId) {
  const { data } = await supabaseAdmin.from("company_settings").select("sector").eq("user_id", userId).maybeSingle();
  return data?.sector || null;
}

async function recordSuccessfulPayment(supabaseAdmin, deal, { provider, iyzicoPaymentId, iyzicoPaymentTransactionId, paytrMerchantOid, commissionAmount, sector }) {
  const { error: paymentInsertError } = await supabaseAdmin.from("payments").insert({
    id: crypto.randomUUID(),
    user_id: deal.user_id,
    deal_id: deal.id,
    amount: deal.value,
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
    body: JSON.stringify({ table: "payments", record: { deal_id: deal.id, amount: deal.value } }),
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
  // onu hiç kullanmadan direkt öderse bu da onay yerine geçer. Portaldan
  // kendi alınan randevu/üyelik/rezervasyonlarda ise onay diye bir kavram
  // hiç yok — approved_at bilerek hiç set edilmiyor, tek sinyal payment_status.
  const isSelfBooked = deal.custom_fields?.kaynak === "portal";
  if (!deal.approved_at && !isSelfBooked) {
    const { data: customer } = await supabaseAdmin.from("customers").select("name").eq("id", deal.customer_id).maybeSingle();
    await markApproved(supabaseAdmin, deal, customer, null, "ödeyerek onayladı").catch((e) => console.error("auto-approve error:", e.message));
  }
}

// Müşterinin kartla doğrudan ödeyebilmesi için iyzico Checkout Form başlatır —
// dönen paymentPageUrl'e müşteri yönlendirilir, kart bilgisi hiç bizim
// sunucumuzdan geçmez. checkoutforms zorunlu buyer/address alanları için
// customers tablosunda toplanmayan bilgiler (TCKN, açık adres) minimal/
// placeholder değerlerle dolduruluyor — bkz. plan notu.
async function initIyzicoCheckout(deal, customer, token, cred) {
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
    price: String(deal.value),
    paidPrice: String(deal.value),
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
    basketItems: [{ id: deal.id, price: String(deal.value), name: deal.title, category1: "Hizmet", itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL }],
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
async function initPayTRCheckout(req, supabaseAdmin, deal, customer, token, cred) {
  const merchantOid = crypto.randomUUID().replace(/-/g, "");
  const { error: oidError } = await supabaseAdmin.from("deals").update({ paytr_merchant_oid: merchantOid }).eq("id", deal.id);
  if (oidError) return { error: "Ödeme başlatılamadı." };

  const userIp = getClientIp(req);
  const email = customer?.email || "musteri@binerly.com";
  const paymentAmount = Math.round(Number(deal.value) * 100);
  const userBasket = Buffer.from(JSON.stringify([[deal.title, Number(deal.value).toFixed(2), 1]])).toString("base64");
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

async function initCheckout(req, supabaseAdmin, deal, customer, token) {
  const { data: cred, error: credError } = await supabaseAdmin
    .from("payment_credentials")
    .select("provider, api_key, secret_key, merchant_salt, sandbox, max_installment")
    .eq("user_id", deal.user_id)
    .maybeSingle();
  if (credError) console.error("payment_credentials query error:", credError.message, "deal.user_id:", deal.user_id);
  if (!cred) return { error: "Bu işletme için ödeme bağlantısı kurulmamış." };

  if (cred.provider === "paytr") return initPayTRCheckout(req, supabaseAdmin, deal, customer, token, cred);
  return initIyzicoCheckout(deal, customer, token, cred);
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
  console.error("payment-callback retrieve debug:", "deal.id:", deal.id, "basketId:", result.basketId, "conversationId:", result.conversationId, "paidPrice:", result.paidPrice, "price:", result.price);
  if (result.basketId !== deal.id && result.conversationId !== deal.id) {
    console.error("payment-callback deal mismatch — hiçbir alan deal.id ile eşleşmedi:", "deal.id:", deal.id, "basketId:", result.basketId, "conversationId:", result.conversationId);
    return redirect(`${target}?paid=0`);
  }

  if (!(await claimDealPayment(supabaseAdmin, deal.id))) return redirect(`${target}?paid=1`); // eş zamanlı başka bir istek zaten işledi

  const item = result.itemTransactions?.[0];
  const commissionAmount = item ? Number(item.iyziCommissionRateAmount || 0) + Number(item.iyziCommissionFee || 0) : 0;
  const sector = await fetchSector(supabaseAdmin, deal.user_id);

  await recordSuccessfulPayment(supabaseAdmin, deal, {
    provider: "iyzico",
    iyzicoPaymentId: result.paymentId || null,
    iyzicoPaymentTransactionId: item?.paymentTransactionId || null,
    commissionAmount,
    sector,
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
  if (expectedHash !== hash) {
    console.error("PayTR hash mismatch, merchant_oid:", merchantOid);
    return respondOk();
  }

  if (status === "success") {
    if (await claimDealPayment(supabaseAdmin, deal.id)) {
      const sector = await fetchSector(supabaseAdmin, deal.user_id);
      await recordSuccessfulPayment(supabaseAdmin, deal, { provider: "paytr", paytrMerchantOid: merchantOid, sector });
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
    return res.status(400).json({ error: `${providerLabel} bağlantısı bulunamadı — iade için önce bu sağlayıcıyı yeniden bağlamanız gerekiyor.` });
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
    note: `${providerLabel} ile iade — ${REFUND_REASON_LABELS_TR[refundReason] || "Diğer"}`,
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

  const token = req.method === "GET" ? url.searchParams.get("token") : (req.body || {}).token;
  const note = req.method === "POST" ? (req.body || {}).note || null : null;
  const action = req.method === "POST" ? (req.body || {}).action || "approve" : null;
  const attendanceAction = req.method === "GET" ? url.searchParams.get("action") : action;
  const attendanceResponse = req.method === "GET" ? url.searchParams.get("response") : (req.body || {}).response;
  if (!token) return res.status(400).json({ error: "Eksik token." });

  const { data: deal, error: dealError } = await supabaseAdmin
    .from("deals")
    .select("id, user_id, customer_id, title, value, kdv_rate, approved_at, created_at, stage, payment_mode, payment_status, custom_fields, first_viewed_at, view_duration_seconds")
    .eq("approval_token", token)
    .is("deleted_at", null)
    .maybeSingle();
  if (dealError) console.error("deal-approval query error:", dealError.message);
  if (dealError || !deal) return res.status(404).json({ error: "Teklif bulunamadı." });

  const [{ data: customer }, { data: settings }] = await Promise.all([
    supabaseAdmin.from("customers").select("name, email, phone, region, address, portal_user_id").eq("id", deal.customer_id).maybeSingle(),
    supabaseAdmin
      .from("company_settings")
      .select("company_name, logo_url, sector, appointment_cancel_hours, appointment_penalty_hours, appointment_penalty_strike_limit, appointment_penalty_burns_session")
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

  const authHeader = req.headers.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  let authedUserId = null;
  if (accessToken) {
    const { data: userData } = await supabaseAdmin.auth.getUser(accessToken);
    authedUserId = userData?.user?.id || null;
  }
  const isAuthorized = !!(authedUserId && customer?.portal_user_id && authedUserId === customer.portal_user_id);

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
    return res.status(200).json({
      title: deal.title,
      value: deal.value,
      stage: deal.stage,
      approved: !!deal.approved_at,
      approvedAt: deal.approved_at,
      createdAt: deal.created_at,
      customerName: customer?.name || "",
      paymentMode: deal.payment_mode || "none",
      paymentStatus: deal.payment_status || null,
      // Portaldan kendi alınan randevu/üyelik/rezervasyonlarda onay diye bir
      // kavram yok — müşteri zaten kendi almış, sayfa sadece "Öde" göstermeli.
      selfBooked: deal.custom_fields?.kaynak === "portal",
      ...branding,
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (action === "checkout-init") {
    const result = await initCheckout(req, supabaseAdmin, deal, customer, token);
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
      approvedAt = await markApproved(supabaseAdmin, deal, customer, note, "onayladı");
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(200).json({ ok: true, approvedAt });
}
