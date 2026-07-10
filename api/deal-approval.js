import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { renderEmailHtml, plainTextFallback } from "./_email-template.js";

// Müşterinin teklif onaylayabildiği uç nokta — token tek başına yetmez, müşteri
// portalına (Supabase Auth) giriş yapmış VE bu teklifin müşterisine bağlı
// (customers.portal_user_id) olmalı. Bilinçli olarak sadece teklif başlığı/
// tutarı/şirket-müşteri adı döner, telefon/not gibi hiçbir hassas alan
// okunmaz. Onay, teklifi otomatik "Kazanıldı" aşamasına taşır (tahsilat ayrı
// takip edildiği için bu "ödendi" anlamına gelmez, sadece "müşteri kabul
// etti" demektir) — zaten kapanmış (kazanıldı/kaybedildi) bir teklifin
// aşamasına dokunulmaz.
export default async function handler(req, res) {
  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // req.query bazı durumlarda güvenilir doldurulmuyor (bkz. whatsapp-webhook.js) —
  // sorgu parametresini doğrudan req.url'den elle ayrıştırıyoruz.
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const token = req.method === "GET" ? url.searchParams.get("token") : (req.body || {}).token;
  const note = req.method === "POST" ? (req.body || {}).note || null : null;
  if (!token) return res.status(400).json({ error: "Eksik token." });

  const { data: deal, error: dealError } = await supabaseAdmin
    .from("deals")
    .select("id, user_id, customer_id, title, value, kdv_rate, approved_at, created_at, stage")
    .eq("approval_token", token)
    .is("deleted_at", null)
    .maybeSingle();
  if (dealError) console.error("deal-approval query error:", dealError.message);
  if (dealError || !deal) return res.status(404).json({ error: "Teklif bulunamadı." });

  const [{ data: customer }, { data: settings }] = await Promise.all([
    supabaseAdmin.from("customers").select("name, portal_user_id").eq("id", deal.customer_id).maybeSingle(),
    supabaseAdmin.from("company_settings").select("company_name, logo_url").eq("user_id", deal.user_id).maybeSingle(),
  ]);

  const branding = { companyName: settings?.company_name || "Binerly", logoUrl: settings?.logo_url || null };

  const authHeader = req.headers.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  let authedUserId = null;
  if (accessToken) {
    const { data: userData } = await supabaseAdmin.auth.getUser(accessToken);
    authedUserId = userData?.user?.id || null;
  }
  const isAuthorized = !!(authedUserId && customer?.portal_user_id && authedUserId === customer.portal_user_id);

  if (!isAuthorized) {
    return res.status(401).json({ requiresAuth: true, ...branding });
  }

  if (req.method === "GET") {
    return res.status(200).json({
      title: deal.title,
      value: deal.value,
      approved: !!deal.approved_at,
      approvedAt: deal.approved_at,
      createdAt: deal.created_at,
      customerName: customer?.name || "",
      ...branding,
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let approvedAt = deal.approved_at;
  if (!deal.approved_at) {
    approvedAt = new Date().toISOString();
    const isClosed = deal.stage === "kazanildi" || deal.stage === "kaybedildi";
    const updatePayload = isClosed
      ? { approved_at: approvedAt }
      : { approved_at: approvedAt, stage: "kazanildi", closed_at: approvedAt };
    const { error: updateError } = await supabaseAdmin.from("deals").update(updatePayload).eq("id", deal.id);
    if (updateError) return res.status(500).json({ error: updateError.message });

    await supabaseAdmin.from("activities").insert({
      id: crypto.randomUUID(),
      user_id: deal.user_id,
      customer_id: deal.customer_id,
      type: "note",
      content: `Müşteri "${deal.title}" teklifini onayladı.${note ? ` Not: "${note}"` : ""}`,
    });

    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      const { data: ownerData } = await supabaseAdmin.auth.admin.getUserById(deal.user_id);
      const ownerEmail = ownerData?.user?.email;
      if (ownerEmail) {
        const bodyText =
          `${customer?.name || "Müşteriniz"}, "${deal.title}" (${deal.value} TL) teklifini onayladı.` +
          (note ? `\n\nMüşterinin notu: "${note}"` : "") +
          `\n\nBinerly'ye giriş yaparak detayları görebilirsiniz.`;
        const footerLines = ["Binerly Ekibi"];
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "Binerly <noreply@binerly.com>",
            to: ownerEmail,
            subject: `${customer?.name || "Müşteriniz"} teklifi onayladı`,
            html: renderEmailHtml({ bodyText, footerLines }),
            text: plainTextFallback(bodyText, null, null, footerLines),
          }),
        }).catch(() => {});
      }
    }
  }

  return res.status(200).json({ ok: true, approvedAt });
}
