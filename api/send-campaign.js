export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { recipients, subject, message, replyTo, companyName } = req.body || {};
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
            text: message,
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
