import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

// Müşterinin kendi bilgisini bırakabildiği kamuya açık form — Supabase auth
// gerektirmez, hesaba özel sabit bir token yetki kanıtı. GET sadece şirket
// adı/logosu döner, POST yeni bir customers satırı oluşturur (hesap sahibinin
// elle gireceği kaydı müşteri kendi giriyor).
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
  if (!token) return res.status(400).json({ error: "Eksik token." });

  const { data: settings, error: settingsError } = await supabaseAdmin
    .from("company_settings")
    .select("user_id, company_name, logo_url")
    .eq("lead_capture_token", token)
    .maybeSingle();
  if (settingsError) console.error("lead-capture query error:", settingsError.message);
  if (settingsError || !settings) return res.status(404).json({ error: "Bağlantı geçersiz." });

  if (req.method === "GET") {
    return res.status(200).json({ companyName: settings.company_name || "Binerly", logoUrl: settings.logo_url || null });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { name, phone, email, address, note } = req.body || {};
  const trimmedName = (name || "").trim();
  const trimmedPhone = (phone || "").trim();
  const trimmedEmail = (email || "").trim();
  const trimmedAddress = (address || "").trim();
  if (!trimmedName) return res.status(400).json({ error: "İsim gerekli." });
  if (!trimmedPhone && !trimmedEmail) return res.status(400).json({ error: "Telefon veya e-posta gerekli." });

  const { error: insertError } = await supabaseAdmin.from("customers").insert({
    id: crypto.randomUUID(),
    user_id: settings.user_id,
    name: trimmedName,
    customer_type: "kurumsal",
    phone: trimmedPhone,
    email: trimmedEmail,
    address: trimmedAddress,
    notes: `Web formundan eklendi.${note ? ` Not: ${note.trim()}` : ""}`,
    last_contact: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });
  if (insertError) return res.status(500).json({ error: insertError.message });

  return res.status(200).json({ ok: true });
}
