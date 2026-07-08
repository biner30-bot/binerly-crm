import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

// Müşterinin tek tıkla teklif onaylayabildiği kamuya açık uç nokta — Supabase
// auth GEREKTİRMEZ, token'ın kendisi (crypto.randomUUID) yetki kanıtı. Bilinçli
// olarak sadece teklif başlığı/tutarı/şirket-müşteri adı döner, telefon/not gibi
// hiçbir hassas alan hiçbir zaman okunmaz. Onay, teklifin aşamasını otomatik
// "Kazanıldı"ya taşımaz — sadece onayı kaydedip hesap sahibini bilgilendirir.
export default async function handler(req, res) {
  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const token = req.method === "GET" ? req.query.token : (req.body || {}).token;
  if (!token) return res.status(400).json({ error: "Eksik token." });

  const { data: deal, error: dealError } = await supabaseAdmin
    .from("deals")
    .select("id, user_id, customer_id, title, value, kdv_rate, approved_at")
    .eq("approval_token", token)
    .is("deleted_at", null)
    .maybeSingle();
  if (dealError || !deal) return res.status(404).json({ error: "Teklif bulunamadı." });

  const [{ data: customer }, { data: settings }] = await Promise.all([
    supabaseAdmin.from("customers").select("name").eq("id", deal.customer_id).maybeSingle(),
    supabaseAdmin.from("company_settings").select("company_name, logo_url").eq("user_id", deal.user_id).maybeSingle(),
  ]);

  if (req.method === "GET") {
    return res.status(200).json({
      title: deal.title,
      value: deal.value,
      approved: !!deal.approved_at,
      customerName: customer?.name || "",
      companyName: settings?.company_name || "Binerly",
      logoUrl: settings?.logo_url || null,
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!deal.approved_at) {
    const now = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin.from("deals").update({ approved_at: now }).eq("id", deal.id);
    if (updateError) return res.status(500).json({ error: updateError.message });

    await supabaseAdmin.from("activities").insert({
      id: crypto.randomUUID(),
      user_id: deal.user_id,
      customer_id: deal.customer_id,
      type: "note",
      content: `Müşteri "${deal.title}" teklifini onayladı.`,
    });

    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      const { data: ownerData } = await supabaseAdmin.auth.admin.getUserById(deal.user_id);
      const ownerEmail = ownerData?.user?.email;
      if (ownerEmail) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "Binerly <noreply@binerly.com>",
            to: ownerEmail,
            subject: `${customer?.name || "Müşteriniz"} teklifi onayladı`,
            text: `${customer?.name || "Müşteriniz"}, "${deal.title}" (${deal.value} TL) teklifini onayladı.\n\nBinerly'ye giriş yaparak detayları görebilirsiniz.`,
          }),
        }).catch(() => {});
      }
    }
  }

  return res.status(200).json({ ok: true });
}
