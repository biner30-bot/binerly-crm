import { createClient } from "@supabase/supabase-js";
import { renderEmailHtml, plainTextFallback } from "./_email-template.js";

const MAX_RECIPIENTS = 500; // tek seferde bir kampanya için makul bir üst sınır

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Bu uç nokta Binerly'nin kendi Resend hesabı/domaini üzerinden e-posta
  // gönderiyor — kimlik doğrulaması olmadan herkes bunu açık bir mail
  // aktarıcısı gibi kötüye kullanabilir (spam/phishing, binerly.com'un
  // gönderim itibarını riske atar). Geçerli bir Binerly oturumu şart.
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) return res.status(401).json({ error: "Unauthorized" });

  const { recipients: rawRecipients, customerIds, requireConsent, subject, message, replyTo, companyName, ctaUrl, ctaLabel, logoUrl } = req.body || {};
  if (!Array.isArray(rawRecipients) || rawRecipients.length === 0 || !subject || !message) {
    return res.status(400).json({ error: "Eksik bilgi." });
  }
  if (rawRecipients.length > MAX_RECIPIENTS) {
    return res.status(400).json({ error: `Tek seferde en fazla ${MAX_RECIPIENTS} alıcıya gönderilebilir.` });
  }

  // Kampanya Gönder buradan gerçek pazarlama e-postası gönderiyor — istemci
  // tarafındaki seçim/işaretleme her ne olursa olsun, İYS/ticari elektronik
  // ileti onayı burada TEKRAR (service-role ile) doğrulanmadan hiçbir alıcıya
  // gönderilmiyor. notifyCustomerByEmail'in transactional çağrıları (aşama
  // değişikliği, ödeme, izin isteğinin kendisi vb.) requireConsent göndermediği
  // için bu kontrolden hiç etkilenmiyor.
  let recipients = rawRecipients;
  if (requireConsent) {
    if (!Array.isArray(customerIds) || customerIds.length !== rawRecipients.length) {
      return res.status(400).json({ error: "Eksik müşteri bilgisi." });
    }
    const { data: rows, error: customersError } = await supabaseAdmin
      .from("customers")
      .select("id, email, user_id, marketing_consent")
      .in("id", customerIds);
    if (customersError) return res.status(500).json({ error: customersError.message });
    const byId = Object.fromEntries((rows || []).map((r) => [r.id, r]));

    // Yetki: alıcı sadece çağıran kullanıcının sahibi/üyesi olduğu bir hesabın
    // müşterisiyse gönderilir - handleRefund'daki (deal-approval.js) sahiplik
    // deseniyle aynı.
    const { data: teamRows } = await supabaseAdmin.from("team_members").select("team_id").eq("member_id", userData.user.id);
    const ownedTeamIds = new Set([userData.user.id, ...(teamRows || []).map((t) => t.team_id)]);

    recipients = [];
    for (let i = 0; i < rawRecipients.length; i++) {
      const row = byId[customerIds[i]];
      if (row && row.email === rawRecipients[i] && row.marketing_consent === true && ownedTeamIds.has(row.user_id)) {
        recipients.push(rawRecipients[i]);
      }
    }
    if (recipients.length === 0) {
      return res.status(400).json({ error: "Seçili müşterilerin hiçbirinden pazarlama izni alınmamış." });
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Sunucu e-posta anahtarı ayarlanmamış." });
  }

  // binerly.com dışında bir domainden gönderim yapamıyoruz (Resend'de sadece bu
  // domain doğrulanmış) — bunun yerine gönderen adında şirket ismini öne çıkarıp
  // "Binerly üzerinden" gönderildiğini açıkça belirtiyoruz, yanıtlar zaten
  // replyTo ile doğrudan şirkete gidiyor.
  const senderName = companyName ? `${companyName} (Binerly ile)` : "Binerly";
  const footerLines = [senderName, "Bu e-posta Binerly (binerly.com) altyapısıyla gönderildi."];
  const html = renderEmailHtml({ logoUrl, bodyText: message, ctaLabel, ctaUrl, footerLines });
  const text = plainTextFallback(message, ctaLabel, ctaUrl, footerLines);

  try {
    const results = await Promise.all(
      recipients.map((to) =>
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `${senderName} <noreply@binerly.com>`,
            to,
            subject,
            html,
            text,
            ...(replyTo ? { reply_to: replyTo } : {}),
          }),
        })
      )
    );

    const failed = results.filter((r) => !r.ok).length;
    if (failed > 0) {
      return res.status(500).json({ error: `${failed} e-posta gönderilemedi.` });
    }

    return res.status(200).json({ sent: recipients.length });
  } catch (err) {
    console.error("send-campaign fatal error:", err.message);
    return res.status(500).json({ error: "Gönderim sırasında hata oluştu." });
  }
}
