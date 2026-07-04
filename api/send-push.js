import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

export default async function handler(req, res) {
  const providedSecret = (req.headers["x-push-secret"] || "").trim();
  const secret = (process.env.PUSH_WEBHOOK_SECRET || "").trim();
  if (!secret || providedSecret !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Webhook her zaman hızlı 200 dönmeli — Supabase tarafında tekrar deneme yok,
  // burada takılırsak bildirim sessizce kaybolur ama uygulama içi rozet zaten yedek.
  try {
    const record = req.body?.record;
    if (!record || record.is_internal || (record.direction !== "gelen" && record.direction !== "giden")) {
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

    const { data: subscriptions } = await supabaseAdmin
      .from("push_subscriptions")
      .select("*")
      .in("user_id", recipientIds);
    if (!subscriptions || subscriptions.length === 0) {
      return res.status(200).json({ sent: 0 });
    }

    const payload = JSON.stringify({
      title,
      body: (record.content || "").slice(0, 140),
      url,
    });

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
  } catch (err) {
    return res.status(200).json({ error: "Gönderim sırasında hata oluştu.", detail: err?.message });
  }
}
