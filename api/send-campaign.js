import { renderEmailHtml, plainTextFallback } from "./_email-template.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { recipients, subject, message, replyTo, companyName, ctaUrl, ctaLabel, logoUrl } = req.body || {};
  if (!Array.isArray(recipients) || recipients.length === 0 || !subject || !message) {
    return res.status(400).json({ error: "Eksik bilgi." });
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
  } catch {
    return res.status(500).json({ error: "Gönderim sırasında hata oluştu." });
  }
}
