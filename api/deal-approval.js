import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import Iyzipay from "iyzipay";
import { renderEmailHtml, plainTextFallback } from "./_email-template.js";

const IYZICO_BASE_URL = { sandbox: "https://sandbox-api.iyzipay.com", production: "https://api.iyzipay.com" };

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

// Müşterinin kartla doğrudan ödeyebilmesi için iyzico Checkout Form başlatır —
// dönen paymentPageUrl'e müşteri yönlendirilir, kart bilgisi hiç bizim
// sunucumuzdan geçmez. checkoutforms zorunlu buyer/address alanları için
// customers tablosunda toplanmayan bilgiler (TCKN, açık adres) minimal/
// placeholder değerlerle dolduruluyor — bkz. plan notu.
async function initCheckout(supabaseAdmin, deal, customer, token) {
  const { data: cred, error: credError } = await supabaseAdmin
    .from("payment_credentials")
    .select("api_key, secret_key, sandbox")
    .eq("user_id", deal.user_id)
    .eq("provider", "iyzico")
    .maybeSingle();
  if (credError) console.error("payment_credentials query error:", credError.message, "deal.user_id:", deal.user_id);
  if (!cred) return { error: "Bu işletme için ödeme bağlantısı kurulmamış." };

  const iyzipay = new Iyzipay({
    apiKey: cred.api_key,
    secretKey: cred.secret_key,
    uri: cred.sandbox ? IYZICO_BASE_URL.sandbox : IYZICO_BASE_URL.production,
  });

  const nameParts = (customer?.name || "Müşteri").trim().split(/\s+/);
  const surname = nameParts.length > 1 ? nameParts.pop() : nameParts[0];
  const name = nameParts.join(" ") || surname;
  const cityOrFallback = customer?.region || "Belirtilmedi";
  const address = { address: cityOrFallback, contactName: customer?.name || "Müşteri", city: cityOrFallback, country: "Turkey" };

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
      registrationAddress: cityOrFallback,
      city: cityOrFallback,
      country: "Turkey",
    },
    shippingAddress: address,
    billingAddress: address,
    basketItems: [{ id: deal.id, price: String(deal.value), name: deal.title, category1: "Hizmet", itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL }],
  };

  const result = await new Promise((resolve) => {
    iyzipay.checkoutFormInitialize.create(request, (err, body) => resolve(err ? { status: "failure", errorMessage: err.message } : body));
  });

  if (result.status !== "success" || !result.paymentPageUrl) {
    return { error: result.errorMessage || "Ödeme başlatılamadı." };
  }
  return { paymentPageUrl: result.paymentPageUrl };
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
    .select("id, user_id, customer_id, title, value, stage, closed_at, payment_mode, payment_status, approved_at")
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

  const { error: paymentInsertError } = await supabaseAdmin.from("payments").insert({
    id: crypto.randomUUID(),
    user_id: deal.user_id,
    deal_id: deal.id,
    amount: deal.value,
    paid_at: new Date().toISOString().slice(0, 10),
    note: "iyzico ile online ödeme",
    provider: "iyzico",
    iyzico_payment_id: result.paymentId || null,
    iyzico_payment_transaction_id: result.itemTransactions?.[0]?.paymentTransactionId || null,
  });
  if (paymentInsertError) console.error("payments insert error:", paymentInsertError.message, "deal.id:", deal.id);
  else {
    // KOBİ'ye "ödeme alındı" bildirimi — deals/ticket_messages'ın aksine bunun
    // için ayrı bir Supabase webhook kurmak yerine api/send-push.js'i (yeni
    // "payments" dalı) doğrudan çağırıyoruz, aynı bildirim altyapısı yeniden
    // kullanılıyor. Bildirim gitmezse ödeme akışını asla bozmasın diye sessizce yutuluyor.
    fetch("https://binerly.com/api/send-push", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-push-secret": (process.env.PUSH_WEBHOOK_SECRET || "").trim() },
      body: JSON.stringify({ table: "payments", record: { deal_id: deal.id, amount: deal.value } }),
    }).catch(() => {});

    // iyzico, ödemeyi hesaba geçirmeden önce kendi komisyonunu kesiyor —
    // KOBİ'nin gerçek net kazancı deal.value'dan daha az. Bu farkı otomatik
    // bir gider olarak kaydediyoruz ki Gelir-Gider Defteri gerçeği yansıtsın.
    // Komisyonun kendi KDV'si var ama bu bizim satış KDV'mizle ilgisiz bir
    // ayrı işlem — kdv_rate bilinçli olarak boş bırakılıyor (KOBİ isterse
    // gideri düzenleyip kendi muhasebesine göre KDV oranı ekleyebilir).
    const item = result.itemTransactions?.[0];
    const commission = item ? Number(item.iyziCommissionRateAmount || 0) + Number(item.iyziCommissionFee || 0) : 0;
    if (commission > 0) {
      const { error: expenseError } = await supabaseAdmin.from("company_expenses").insert({
        id: crypto.randomUUID(),
        user_id: deal.user_id,
        title: "iyzico komisyonu",
        category: "Ödeme Komisyonu",
        amount: commission,
        expense_date: new Date().toISOString().slice(0, 10),
        note: `"${deal.title}" teklifinin online ödemesi için`,
        is_recurring: false,
        recurrence_interval: "monthly",
        kdv_rate: null,
      });
      if (expenseError) console.error("iyzico commission expense insert error:", expenseError.message, "deal.id:", deal.id);
    }
  }

  // Gerçek para tahsil edildiği için (payment_mode ne olursa olsun) teklif
  // kazanılmış sayılır — zaten kapanmış (kazanıldı/kaybedildi) bir aşamaya dokunulmaz.
  const isAlreadyClosed = deal.stage === "kazanildi" || deal.stage === "kaybedildi";
  const dealUpdate = { payment_status: "paid" };
  if (!isAlreadyClosed) {
    dealUpdate.stage = "kazanildi";
    dealUpdate.closed_at = deal.closed_at || new Date().toISOString();
  }
  const { error: dealUpdateError } = await supabaseAdmin.from("deals").update(dealUpdate).eq("id", deal.id);
  if (dealUpdateError) console.error("deals payment_status/stage update error:", dealUpdateError.message, "deal.id:", deal.id);

  // Ödeme, hangi modda olursa olsun onaydan daha güçlü bir sinyal — "isteğe
  // bağlı" modda ayrı bir "Onaylıyorum" adımı hâlâ sunuluyor, ama müşteri
  // onu hiç kullanmadan direkt öderse bu da onay yerine geçer.
  if (!deal.approved_at) {
    const { data: customer } = await supabaseAdmin.from("customers").select("name").eq("id", deal.customer_id).maybeSingle();
    await markApproved(supabaseAdmin, deal, customer, null, "ödeyerek onayladı").catch((e) => console.error("auto-approve error:", e.message));
  }

  return redirect(`${target}?paid=1`);
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || "85.34.78.112";
}

const REFUND_REASON_LABELS_TR = { buyer_request: "Müşteri talebi", double_payment: "Mükerrer ödeme", fraud: "Sahtecilik", other: "Diğer" };

// KOBİ'nin (müşterinin değil) bir online ödemeyi tam/kısmi iade edebildiği uç
// nokta — approval_token değil deal.id + payment.id ile çalışır, çünkü bunu
// tetikleyen işletme sahibinin kendi normal Supabase Auth oturumu (portal
// müşteri oturumu değil). Bu yüzden yetki kontrolü customers.portal_user_id
// yerine deal.user_id / team_members'a bakıyor. Online ödemeler artık asla
// doğrudan silinemiyor — tek "geri alma" yolu burası, gerçekten iyzico'ya
// iade isteği gönderiyor (bkz. İade Prosedürü planı).
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
  if (payment.provider !== "iyzico" || !payment.iyzico_payment_transaction_id) {
    return res.status(400).json({ error: "Bu tahsilat online ödeme değil, doğrudan silinebilir." });
  }
  if (payment.amount <= 0) return res.status(400).json({ error: "Bu kayıt zaten bir iade." });

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

  const { data: cred } = await supabaseAdmin
    .from("payment_credentials")
    .select("api_key, secret_key, sandbox")
    .eq("user_id", deal.user_id)
    .eq("provider", "iyzico")
    .maybeSingle();
  if (!cred) return res.status(400).json({ error: "iyzico bağlantısı bulunamadı." });

  const iyzipay = new Iyzipay({
    apiKey: cred.api_key,
    secretKey: cred.secret_key,
    uri: cred.sandbox ? IYZICO_BASE_URL.sandbox : IYZICO_BASE_URL.production,
  });
  const validReasons = Object.values(Iyzipay.REFUND_REASON);
  const refundReason = validReasons.includes(reason) ? reason : Iyzipay.REFUND_REASON.OTHER;

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

  const refundRow = {
    id: crypto.randomUUID(),
    user_id: deal.user_id,
    deal_id: dealId,
    amount: -refundAmount,
    paid_at: new Date().toISOString().slice(0, 10),
    note: `iyzico ile iade — ${REFUND_REASON_LABELS_TR[refundReason] || "Diğer"}`,
    provider: "iyzico",
    refund_of_payment_id: payment.id,
  };
  const { data: inserted, error: insertError } = await supabaseAdmin.from("payments").insert(refundRow).select().single();
  if (insertError) return res.status(500).json({ error: `İade iyzico'da yapıldı ama kayıt eklenemedi: ${insertError.message}` });

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

  // İşletme sahibinin iade isteği — token bazlı değil, ayrı ele alınır.
  if (req.method === "POST" && (req.body || {}).action === "refund") {
    return handleRefund(req, res, supabaseAdmin);
  }

  const token = req.method === "GET" ? url.searchParams.get("token") : (req.body || {}).token;
  const note = req.method === "POST" ? (req.body || {}).note || null : null;
  const action = req.method === "POST" ? (req.body || {}).action || "approve" : null;
  if (!token) return res.status(400).json({ error: "Eksik token." });

  const { data: deal, error: dealError } = await supabaseAdmin
    .from("deals")
    .select("id, user_id, customer_id, title, value, kdv_rate, approved_at, created_at, stage, payment_mode, payment_status")
    .eq("approval_token", token)
    .is("deleted_at", null)
    .maybeSingle();
  if (dealError) console.error("deal-approval query error:", dealError.message);
  if (dealError || !deal) return res.status(404).json({ error: "Teklif bulunamadı." });

  const [{ data: customer }, { data: settings }] = await Promise.all([
    supabaseAdmin.from("customers").select("name, email, phone, region, portal_user_id").eq("id", deal.customer_id).maybeSingle(),
    supabaseAdmin.from("company_settings").select("company_name, logo_url, sector").eq("user_id", deal.user_id).maybeSingle(),
  ]);

  const branding = { companyName: settings?.company_name || "Binerly", logoUrl: settings?.logo_url || null, sector: settings?.sector || null };

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
    return res.status(200).json({
      title: deal.title,
      value: deal.value,
      approved: !!deal.approved_at,
      approvedAt: deal.approved_at,
      createdAt: deal.created_at,
      customerName: customer?.name || "",
      paymentMode: deal.payment_mode || "none",
      paymentStatus: deal.payment_status || null,
      ...branding,
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (action === "checkout-init") {
    const result = await initCheckout(supabaseAdmin, deal, customer, token);
    if (result.error) return res.status(502).json({ error: result.error });
    return res.status(200).json({ paymentPageUrl: result.paymentPageUrl });
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
