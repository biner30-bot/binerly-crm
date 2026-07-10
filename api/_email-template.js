// Vercel, api/ altında "_" ile başlayan dosyaları route olarak değil, import
// edilebilir paylaşılan modül olarak görür — bu dosya bir endpoint değil.

export const BINERLY_LOGO_URL = "https://binerly.com/pwa-512x512.png";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function linesToParagraphs(text) {
  return text
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p style="margin:0 0 14px;">${escapeHtml(block).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

// Hem müşteriye ("İşletme Adı (Binerly ile)") hem KOBİ sahibine/takıma
// (Binerly) giden mailler için tek şablon — logoUrl'e göre kimin markası
// öne çıktığı değişir, iskelet aynı kalır.
export function renderEmailHtml({ logoUrl, bodyText, ctaLabel, ctaUrl, footerLines = [] }) {
  const logo = logoUrl || BINERLY_LOGO_URL;
  const cta = ctaUrl
    ? `<div style="text-align:center;margin:8px 0 20px;">
        <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#185fa5;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">${escapeHtml(ctaLabel || "Görüntüle")}</a>
      </div>`
    : "";
  const footer = footerLines
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 4px;">${escapeHtml(line)}</p>`)
    .join("");

  return `<!doctype html>
<html lang="tr">
  <body style="margin:0;padding:32px 16px;background:#f5f8fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e1e8f0;">
      <div style="padding:28px 32px 20px;text-align:center;border-bottom:1px solid #e1e8f0;">
        <img src="${escapeHtml(logo)}" alt="" style="max-height:48px;max-width:200px;" />
      </div>
      <div style="padding:28px 32px 8px;color:#0c2540;font-size:15px;line-height:1.7;">
        ${linesToParagraphs(bodyText)}
      </div>
      ${cta}
      <div style="padding:16px 32px 28px;border-top:1px solid #e1e8f0;color:#94a7bb;font-size:12px;line-height:1.6;">
        ${footer}
      </div>
    </div>
  </body>
</html>`;
}

export function plainTextFallback(bodyText, ctaLabel, ctaUrl, footerLines = []) {
  const ctaBlock = ctaUrl ? `\n\n${ctaLabel || "Görüntüle"}: ${ctaUrl}` : "";
  const footerBlock = footerLines.filter(Boolean).join("\n");
  return `${bodyText}${ctaBlock}${footerBlock ? `\n\n${footerBlock}` : ""}`;
}
