import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

// Müşteri portalından kendi kendine alınan/iptal edilen randevular için KOBİ'ye
// push bildirimi. deals tablosu üzerinde INSERT + UPDATE için ayrı bir Database
// Webhook ile tetiklenir (aynı X-Push-Secret başlığıyla, send-push.js ile aynı
// desen). Sadece bookAppointment'ın işaretlediği (custom_fields.kaynak === "portal")
// kayıtlarla ilgilenir — KOBİ'nin kendi elle oluşturduğu/güncellediği tekliflerde
// (aynı stage geçişlerinde bile) hiçbir bildirim gitmez.
export default async function handler(req, res) {
  const providedSecret = (req.headers["x-push-secret"] || "").trim();
  const secret = (process.env.PUSH_WEBHOOK_SECRET || "").trim();
  if (!secret || providedSecret !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const type = req.body?.type;
    const record = req.body?.record;
    const oldRecord = req.body?.old_record;
    if (!record || record.custom_fields?.kaynak !== "portal" || !record.custom_fields?.randevu_tarihi) {
      return res.status(200).json({ skipped: true });
    }

    let title, body;
    if (type === "INSERT") {
      title = "Yeni randevu talebi";
    } else if (type === "UPDATE" && record.stage === "kaybedildi" && oldRecord?.stage !== "kaybedildi") {
      title = "Randevu iptal edildi";
    } else {
      return res.status(200).json({ skipped: true });
    }

    const vapidPublicKey = process.env.VITE_VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    if (!vapidPublicKey || !vapidPrivateKey) {
      return res.status(200).json({ skipped: true, reason: "VAPID keys not configured" });
    }
    webpush.setVapidDetails("mailto:info@binerly.com", vapidPublicKey, vapidPrivateKey);

    const supabaseAdmin = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: customer } = await supabaseAdmin
      .from("customers")
      .select("name")
      .eq("id", record.customer_id)
      .maybeSingle();

    const dateLabel = new Date(`${record.custom_fields.randevu_tarihi}+03:00`).toLocaleString("tr-TR", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
    body = `${customer?.name || "Bir müşteri"} — ${dateLabel}`;

    const { data: members } = await supabaseAdmin
      .from("team_members")
      .select("member_id")
      .eq("team_id", record.user_id);
    const recipientIds = [record.user_id, ...(members || []).map((m) => m.member_id)];

    const { data: subscriptions } = await supabaseAdmin
      .from("push_subscriptions")
      .select("*")
      .in("user_id", recipientIds);
    if (!subscriptions || subscriptions.length === 0) {
      return res.status(200).json({ sent: 0 });
    }

    const payload = JSON.stringify({ title, body, url: "/?tab=firsat" });

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
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
  } catch (err) {
    return res.status(200).json({ error: "Gönderim sırasında hata oluştu.", detail: err?.message });
  }
}
