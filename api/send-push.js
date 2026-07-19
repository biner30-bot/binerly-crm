import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

function secretsMatch(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// Vercel Hobby planındaki 12 serverless function sınırı yüzünden, farklı
// tablolardaki push bildirimleri ayrı dosyalar yerine burada, Supabase'in
// webhook payload'undaki `table` alanına göre dallanarak tek fonksiyonda
// toplanıyor. Her yeni bildirim türü için ayrı bir api/*.js açmak yerine
// buraya yeni bir "resolve*" fonksiyonu + dallanma eklenir.
export default async function handler(req, res) {
  const providedSecret = (req.headers["x-push-secret"] || "").trim();
  const secret = (process.env.PUSH_WEBHOOK_SECRET || "").trim();
  if (!secret || !secretsMatch(providedSecret, secret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Webhook her zaman hızlı 200 dönmeli — Supabase tarafında tekrar deneme yok,
  // burada takılırsak bildirim sessizce kaybolur ama uygulama içi rozet zaten yedek.
  try {
    const table = req.body?.table;
    if (table === "deals") return await handleAppointmentPush(req, res, supabaseAdmin);
    if (table === "payments") return await handlePaymentPush(req, res, supabaseAdmin);
    if (table === "deal_approvals") return await handleDealApprovalPush(req, res, supabaseAdmin);
    return await handleTicketMessagePush(req, res, supabaseAdmin);
  } catch (err) {
    return res.status(200).json({ error: "Gönderim sırasında hata oluştu.", detail: err?.message });
  }
}

async function handleTicketMessagePush(req, res, supabaseAdmin) {
  const record = req.body?.record;
  if (!record || record.is_internal || (record.direction !== "gelen" && record.direction !== "giden")) {
    return res.status(200).json({ skipped: true });
  }

  const vapidReady = ensureVapid();
  if (!vapidReady) return res.status(200).json({ skipped: true, reason: "VAPID keys not configured" });

  const { data: ticket, error: ticketError } = await supabaseAdmin
    .from("tickets")
    .select("id, user_id, customer_id, subject")
    .eq("id", record.ticket_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (ticketError) return res.status(200).json({ skipped: true, reason: "ticket query error", detail: ticketError.message });
  if (!ticket) return res.status(200).json({ skipped: true, reason: "ticket not found" });

  const { data: customer } = await supabaseAdmin
    .from("customers")
    .select("name, portal_user_id")
    .eq("id", ticket.customer_id)
    .maybeSingle();

  let recipientIds, title, url;
  if (record.direction === "gelen") {
    // Müşteriden şirkete: sahip + tüm takım üyeleri kendi cihazlarında bildirim alır.
    const { data: members } = await supabaseAdmin
      .from("team_members")
      .select("member_id")
      .eq("team_id", ticket.user_id);
    recipientIds = [ticket.user_id, ...(members || []).map((m) => m.member_id)];
    title = customer?.name || "Yeni mesaj";
    url = `/?ticket=${ticket.id}`;
  } else {
    // Şirketten müşteriye: sadece müşterinin portal hesabı varsa (customers.portal_user_id) bildirim gider.
    if (!customer?.portal_user_id) return res.status(200).json({ skipped: true, reason: "customer has no portal account" });
    recipientIds = [customer.portal_user_id];
    title = "Yanıt aldınız";
    url = `/portal?ticket=${ticket.id}`;
  }

  return await sendToRecipients(supabaseAdmin, res, recipientIds, {
    title,
    body: (record.content || "").slice(0, 140),
    url,
  });
}

// Müşteri portalından kendi kendine alınan/iptal edilen randevular için KOBİ'ye
// push bildirimi. Sadece bookAppointment'ın işaretlediği
// (custom_fields.kaynak === "portal") kayıtlarla ilgilenir — KOBİ'nin kendi elle
// oluşturduğu/güncellediği tekliflerde (aynı stage geçişlerinde bile) hiçbir
// bildirim gitmez.
async function handleAppointmentPush(req, res, supabaseAdmin) {
  const type = req.body?.type;
  const record = req.body?.record;
  const oldRecord = req.body?.old_record;
  if (!record || record.custom_fields?.kaynak !== "portal" || !record.custom_fields?.portal_randevu_zamani) {
    return res.status(200).json({ skipped: true });
  }

  let title;
  if (type === "INSERT") {
    title = "Yeni randevu talebi";
  } else if (type === "UPDATE" && record.stage === "kaybedildi" && oldRecord?.stage !== "kaybedildi") {
    title = "Randevu iptal edildi";
  } else {
    return res.status(200).json({ skipped: true });
  }

  const vapidReady = ensureVapid();
  if (!vapidReady) return res.status(200).json({ skipped: true, reason: "VAPID keys not configured" });

  const { data: customer } = await supabaseAdmin
    .from("customers")
    .select("name")
    .eq("id", record.customer_id)
    .maybeSingle();

  // timeZone AÇIKÇA belirtilmezse toLocaleString sunucunun kendi saat dilimini
  // (Vercel'de UTC) kullanır — "tr-TR" locale'i sadece biçimi (ay adı, sıra)
  // Türkçeleştirir, saati Türkiye'ye çevirmez. Bu eksikti, bildirimde randevu
  // saati 3 saat geride görünüyordu (09:00 yerine 06:00).
  const dateLabel = new Date(`${record.custom_fields.portal_randevu_zamani}+03:00`).toLocaleString("tr-TR", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul",
  });

  const { data: members } = await supabaseAdmin
    .from("team_members")
    .select("member_id")
    .eq("team_id", record.user_id);
  const recipientIds = [record.user_id, ...(members || []).map((m) => m.member_id)];

  return await sendToRecipients(supabaseAdmin, res, recipientIds, {
    title,
    body: `${customer?.name || "Bir müşteri"} — ${dateLabel}`,
    url: "/?tab=firsat",
  });
}

// Müşteri kendi onay linkinden online ödeme yaparsa (api/deal-approval.js:
// handlePaymentCallback), bu uç noktayı Supabase webhook'u yerine DOĞRUDAN
// kendisi çağırır (yeni bir webhook kurulumu gerekmesin diye) — record
// olarak yeni eklenen payments satırını gönderir. İadeler tetiklemez (KOBİ
// zaten kendi işlemi, bildirime gerek yok).
async function handlePaymentPush(req, res, supabaseAdmin) {
  const record = req.body?.record;
  if (!record || !(record.amount > 0)) return res.status(200).json({ skipped: true });

  const vapidReady = ensureVapid();
  if (!vapidReady) return res.status(200).json({ skipped: true, reason: "VAPID keys not configured" });

  const { data: deal } = await supabaseAdmin
    .from("deals")
    .select("id, title, user_id")
    .eq("id", record.deal_id)
    .maybeSingle();
  if (!deal) return res.status(200).json({ skipped: true, reason: "deal not found" });

  const { data: members } = await supabaseAdmin
    .from("team_members")
    .select("member_id")
    .eq("team_id", deal.user_id);
  const recipientIds = [deal.user_id, ...(members || []).map((m) => m.member_id)];

  const amountLabel = new Intl.NumberFormat("tr-TR").format(Math.round(record.amount)) + " TL";
  return await sendToRecipients(supabaseAdmin, res, recipientIds, {
    title: "Ödeme alındı",
    body: `${deal.title} — ${amountLabel}`,
    url: "/?tab=firsat",
  });
}

// Müşteri bir teklifi onaylayınca (manuel "Onaylıyorum" veya ödeme ile
// otomatik onay) — api/deal-approval.js:markApproved doğrudan çağırır,
// "deals" tablosu gerçek bir Supabase webhook payload'u olmadığı için
// tablo adı yerine sadece bir ayırt edici string olarak kullanılıyor.
async function handleDealApprovalPush(req, res, supabaseAdmin) {
  const record = req.body?.record;
  if (!record) return res.status(200).json({ skipped: true });

  const vapidReady = ensureVapid();
  if (!vapidReady) return res.status(200).json({ skipped: true, reason: "VAPID keys not configured" });

  const { data: members } = await supabaseAdmin
    .from("team_members")
    .select("member_id")
    .eq("team_id", record.user_id);
  const recipientIds = [record.user_id, ...(members || []).map((m) => m.member_id)];

  return await sendToRecipients(supabaseAdmin, res, recipientIds, {
    title: "Teklif onaylandı",
    body: `${record.customer_name || "Bir müşteri"} — ${record.title}`,
    url: "/?tab=firsat",
  });
}

function ensureVapid() {
  const vapidPublicKey = process.env.VITE_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  if (!vapidPublicKey || !vapidPrivateKey) return false;
  webpush.setVapidDetails("mailto:info@binerly.com", vapidPublicKey, vapidPrivateKey);
  return true;
}

async function sendToRecipients(supabaseAdmin, res, recipientIds, { title, body, url }) {
  // Uygulama içi bildirim — push izni olmasa/farklı cihazda olsa bile KOBİ/müşteri
  // panelde görülebilsin diye, push'tan bağımsız her zaman yazılır.
  await supabaseAdmin.from("notifications").insert(
    recipientIds.map((userId) => ({ user_id: userId, title, body, url }))
  );

  const { data: subscriptions } = await supabaseAdmin
    .from("push_subscriptions")
    .select("*")
    .in("user_id", recipientIds);
  if (!subscriptions || subscriptions.length === 0) {
    return res.status(200).json({ sent: 0 });
  }

  const payload = JSON.stringify({ title, body, url });

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth_key },
        },
        payload
      )
    )
  );

  const expiredIds = [];
  results.forEach((r, i) => {
    if (r.status === "rejected" && (r.reason?.statusCode === 404 || r.reason?.statusCode === 410)) {
      expiredIds.push(subscriptions[i].id);
    }
  });
  if (expiredIds.length > 0) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", expiredIds);
  }

  return res.status(200).json({ sent: results.filter((r) => r.status === "fulfilled").length });
}
