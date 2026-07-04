import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
      .select("id, user_id, customer_id, title, reminder, reminder_date")
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
      .select("id, name")
      .in("id", customerIds);
    const customerNameById = Object.fromEntries((customers || []).map((c) => [c.id, c.name]));

    // deal.user_id takım desteğiyle birlikte artık "hesap/takım kimliği" anlamına
    // geliyor (bkz. team_members) — bu yüzden gruplama zaten doğal olarak takım
    // başına tek e-posta, sahibe gönderiliyor; ekstra bir değişiklik gerekmiyor.
    const dealsByUser = {};
    for (const deal of dueDeals) {
      (dealsByUser[deal.user_id] ||= []).push(deal);
    }

    let usersNotified = 0;
    let failed = 0;

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
      const message =
        `Bugün için hatırlatmalarınız:\n\n${lines.join("\n")}\n\n` +
        `Binerly'ye giriş yaparak fırsatlarınızı görüntüleyebilirsiniz.`;

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
          text: message,
        }),
      });

      if (sendRes.ok) usersNotified++;
      else failed++;
    }

    return res.status(200).json({ usersNotified, failed });
  } catch {
    return res.status(500).json({ error: "Gönderim sırasında hata oluştu." });
  }
}
