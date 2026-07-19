import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { renderEmailHtml, plainTextFallback } from "./_email-template.js";

function secretsMatch(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || "";
  if (!process.env.CRON_SECRET || !secretsMatch(authHeader, `Bearer ${process.env.CRON_SECRET}`)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return res.status(500).json({ error: "Sunucu e-posta anahtarı ayarlanmamış." });
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data: dueDeals, error: dealsError } = await supabaseAdmin
      .from("deals")
      .select("id, user_id, customer_id, title, reminder, reminder_date, notify_customer")
      .is("deleted_at", null)
      .not("stage", "in", "(kazanildi,kaybedildi)")
      .neq("reminder", "")
      .lte("reminder_date", today);

    if (dealsError) {
      return res.status(500).json({ error: dealsError.message });
    }
    if (!dueDeals || dueDeals.length === 0) {
      return res.status(200).json({ usersNotified: 0 });
    }

    const customerIds = [...new Set(dueDeals.map((d) => d.customer_id))];
    const { data: customers } = await supabaseAdmin
      .from("customers")
      .select("id, name, email")
      .in("id", customerIds);
    const customerById = Object.fromEntries((customers || []).map((c) => [c.id, c]));
    const customerNameById = Object.fromEntries((customers || []).map((c) => [c.id, c.name]));

    // deal.user_id takım desteğiyle birlikte artık "hesap/takım kimliği" anlamına
    // geliyor (bkz. team_members) — bu yüzden gruplama zaten doğal olarak takım
    // başına tek e-posta, sahibe gönderiliyor; ekstra bir değişiklik gerekmiyor.
    const dealsByUser = {};
    for (const deal of dueDeals) {
      (dealsByUser[deal.user_id] ||= []).push(deal);
    }

    const { data: settingsRows } = await supabaseAdmin
      .from("company_settings")
      .select("user_id, company_name, logo_url, email")
      .in("user_id", Object.keys(dealsByUser));
    const settingsByUser = Object.fromEntries((settingsRows || []).map((s) => [s.user_id, s]));

    let usersNotified = 0;
    let failed = 0;
    let customersNotified = 0;

    for (const [userId, userDeals] of Object.entries(dealsByUser)) {
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
      const email = userData?.user?.email;
      if (userError || !email) {
        failed++;
        continue;
      }

      const lines = userDeals.map(
        (d) => `- ${customerNameById[d.customer_id] || "Bilinmeyen müşteri"}: ${d.title} — ${d.reminder}`
      );
      const ownerBodyText = `Bugün için hatırlatmalarınız:\n\n${lines.join("\n")}\n\nBinerly'ye giriş yaparak fırsatlarınızı görüntüleyebilirsiniz.`;
      const ownerFooterLines = ["Binerly Ekibi"];

      const sendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Binerly <noreply@binerly.com>",
          to: email,
          subject: `Bugünkü hatırlatmalarınız (${userDeals.length})`,
          html: renderEmailHtml({ bodyText: ownerBodyText, footerLines: ownerFooterLines }),
          text: plainTextFallback(ownerBodyText, null, null, ownerFooterLines),
        }),
      });

      if (sendRes.ok) usersNotified++;
      else failed++;

      // Müşteriye de gönder işaretliyse (DealForm'daki "Hatırlatma tarihinde
      // müşteriye de e-posta gönder" kutusu) — sadece müşterinin e-postası
      // varsa, ayrı ve dostane bir metinle.
      const settings = settingsByUser[userId] || {};
      const company = settings.company_name || "Binerly";
      for (const deal of userDeals) {
        if (!deal.notify_customer) continue;
        const customer = customerById[deal.customer_id];
        if (!customer?.email) continue;
        const bodyText = `Merhaba ${customer.name || ""},\n\n${company} tarafından hatırlatma: ${deal.reminder}`;
        const footerLines = [`${company} (Binerly ile)`, "Bu e-posta Binerly (binerly.com) altyapısıyla gönderildi."];
        const customerRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `${company} (Binerly ile) <noreply@binerly.com>`,
            to: customer.email,
            subject: `Hatırlatma: ${deal.title}`,
            html: renderEmailHtml({ logoUrl: settings.logo_url, bodyText, footerLines }),
            text: plainTextFallback(bodyText, null, null, footerLines),
            ...(settings.email ? { reply_to: settings.email } : {}),
          }),
        });
        if (customerRes.ok) customersNotified++;
      }
    }

    return res.status(200).json({ usersNotified, failed, customersNotified });
  } catch (err) {
    console.error("send-reminders fatal error:", err.message);
    return res.status(500).json({ error: "Gönderim sırasında hata oluştu." });
  }
}
