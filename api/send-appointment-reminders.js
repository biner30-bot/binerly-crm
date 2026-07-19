import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { renderEmailHtml, plainTextFallback } from "./_email-template.js";

function secretsMatch(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// GitHub Actions'tan (bkz. .github/workflows/appointment-reminders.yml) her 15
// dakikada bir tetiklenir — Vercel'in ücretsiz planındaki "cron günde 1 kez"
// kısıtını aşmak için ayrı bir zamanlayıcı kullanıyoruz, ekstra ücret gerekmiyor.
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
    // "Tarih & Saat" (datetime) tipindeki aktif özel alanlar — hangi şirketin
    // hangi alan adını (örn. randevu_tarihi) randevu saati olarak kullandığını
    // burada buluyoruz, sektöre göre sabit kodlamıyoruz.
    const { data: defs, error: defsError } = await supabaseAdmin
      .from("custom_field_defs")
      .select("user_id, key")
      .eq("entity", "deal")
      .eq("field_type", "datetime")
      .eq("active", true);

    if (defsError) return res.status(500).json({ error: defsError.message });
    if (!defs || defs.length === 0) return res.status(200).json({ remindersSent: 0 });

    const now = Date.now();
    const windowStart = now + 110 * 60 * 1000; // ~1sa50dk sonrası
    const windowEnd = now + 130 * 60 * 1000; // ~2sa10dk sonrası — 15dk'lık kontrol aralığına güvenli pay

    const userIds = [...new Set(defs.map((d) => d.user_id))];
    const [{ data: deals, error: dealsError }, { data: settingsRows }] = await Promise.all([
      supabaseAdmin
        .from("deals")
        .select("id, user_id, customer_id, title, custom_fields, stage, approval_token")
        .in("user_id", userIds)
        .is("deleted_at", null)
        .not("stage", "in", "(kazanildi,kaybedildi)")
        .is("appointment_reminder_sent_at", null),
      supabaseAdmin.from("company_settings").select("user_id, company_name, logo_url, email, sector, appointment_reminders_enabled").in("user_id", userIds),
    ]);

    if (dealsError) return res.status(500).json({ error: dealsError.message });
    if (!deals || deals.length === 0) return res.status(200).json({ remindersSent: 0 });

    const settingsByUser = Object.fromEntries((settingsRows || []).map((s) => [s.user_id, s]));
    const keysByUser = {};
    for (const d of defs) (keysByUser[d.user_id] ||= []).push(d.key);

    const dueDeals = deals.filter((deal) => {
      if (settingsByUser[deal.user_id]?.appointment_reminders_enabled === false) return false;
      const keys = keysByUser[deal.user_id] || [];
      return keys.some((key) => {
        const raw = deal.custom_fields?.[key];
        if (!raw) return false;
        // datetime-local değeri saat dilimi bilgisi taşımaz (örn. "2026-07-11T15:00")
        // — bu proje sadece Türkiye için, bu yüzden +03:00 olarak yorumluyoruz.
        // Bu adımı atlamak, sunucunun UTC saatiyle karşılaştırıp saatleri kaydırırdı.
        const apptTime = new Date(`${raw}:00+03:00`).getTime();
        return !isNaN(apptTime) && apptTime >= windowStart && apptTime <= windowEnd;
      });
    });

    if (dueDeals.length === 0) return res.status(200).json({ remindersSent: 0 });

    const customerIds = [...new Set(dueDeals.map((d) => d.customer_id))];
    const { data: customers } = await supabaseAdmin.from("customers").select("id, name, email").in("id", customerIds);
    const customerById = Object.fromEntries((customers || []).map((c) => [c.id, c]));

    let remindersSent = 0;

    // Her deal'i kendi try/catch'i içinde, gönderim BAŞARILI olur olmaz ANINDA
    // appointment_reminder_sent_at yazarak işliyoruz — önceden bu tek bir toplu
    // update ile döngü SONUNDA yapılıyordu, bu yüzden döngü ortasında bir
    // deal'de beklenmeyen bir hata (örn. fetch reddi) atarsa daha önce başarıyla
    // gönderilmiş hatırlatmalar hiç işaretlenmiyor, cron 15dk sonra tekrar
    // çalışınca aynı müşterilere mükerrer hatırlatma mailleri gidiyordu.
    for (const deal of dueDeals) {
      try {
        const customer = customerById[deal.customer_id];
        if (!customer?.email) {
          await supabaseAdmin.from("deals").update({ appointment_reminder_sent_at: new Date().toISOString() }).eq("id", deal.id);
          continue;
        }

        const key = (keysByUser[deal.user_id] || []).find((k) => deal.custom_fields?.[k]);
        const raw = deal.custom_fields?.[key];
        const timeLabel = raw ? raw.split("T")[1] : "";
        const settings = settingsByUser[deal.user_id] || {};
        const company = settings.company_name || "Binerly";

        // Hatırlatma mailinden de tek tıkla onaylanabilsin diye onay linki —
        // deal-approval.js'deki üretim mantığıyla aynı, token yoksa burada üretilir.
        let token = deal.approval_token;
        if (!token) {
          token = crypto.randomUUID();
          await supabaseAdmin.from("deals").update({ approval_token: token }).eq("id", deal.id);
        }
        const ctaUrl = `https://binerly.com/onay/${token}`;

        const bodyText =
          `Merhaba ${customer.name || ""},\n\n${company} bünyesindeki "${deal.title}" randevunuz ` +
          `bugün saat ${timeLabel}'de. Sizi görmekten mutluluk duyarız.`;
        const footerLines = [`${company} (Binerly ile)`, "Bu e-posta Binerly (binerly.com) altyapısıyla gönderildi."];
        const html = renderEmailHtml({ logoUrl: settings.logo_url, bodyText, ctaLabel: "Randevuyu Görüntüle", ctaUrl, footerLines });
        const text = plainTextFallback(bodyText, "Randevuyu Görüntüle", ctaUrl, footerLines);

        const sendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: `${company} (Binerly ile) <noreply@binerly.com>`,
            to: customer.email,
            subject: `Randevu hatırlatması — bugün saat ${timeLabel}`,
            html,
            text,
            ...(settings.email ? { reply_to: settings.email } : {}),
          }),
        });

        if (sendRes.ok) {
          remindersSent++;
          const dealUpdate = { appointment_reminder_sent_at: new Date().toISOString() };
          // Güzellik & Bakım'da "Müzakere" aşaması "Hatırlatma gönderildi" anlamına
          // geliyor (bkz. Sectors.jsx) — hatırlatma başarıyla gidince deal'i otomatik
          // oraya taşıyoruz. Diğer sektörlerde "Müzakere" farklı bir şey ifade ettiği
          // için (örn. gerçek bir pazarlık aşaması) bu otomatik taşıma yapılmıyor.
          if (settings.sector === "guzellik_bakim" && deal.stage !== "muzakere") dealUpdate.stage = "muzakere";
          await supabaseAdmin.from("deals").update(dealUpdate).eq("id", deal.id);
        } else {
          console.error("appointment reminder send failed, deal.id:", deal.id, sendRes.status, await sendRes.text().catch(() => ""));
          // appointment_reminder_sent_at bilinçli olarak YAZILMIYOR — bir sonraki
          // cron çalışmasında (15dk sonra) tekrar denensin.
        }
      } catch (dealErr) {
        console.error("appointment reminder error, deal.id:", deal.id, dealErr.message);
      }
    }

    return res.status(200).json({ remindersSent });
  } catch (err) {
    console.error("send-appointment-reminders fatal error:", err.message);
    return res.status(500).json({ error: "Gönderim sırasında hata oluştu." });
  }
}
