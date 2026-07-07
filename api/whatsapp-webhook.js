import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

// Meta'nın imza doğrulaması ham byte'lara ihtiyaç duyduğu için Vercel'in
// otomatik JSON body-parser'ı burada devre dışı bırakılıyor.
export const config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// src/shared.jsx'teki toWhatsAppNumber ile birebir aynı — api/ dosyaları
// src/'den import edemediği için burada kopyalanmıştır, elle senkron tutulmalı.
function toWhatsAppNumber(phone) {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("90")) return digits;
  if (digits.startsWith("0")) return "90" + digits.slice(1);
  return "90" + digits;
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    // bodyParser: false ayarı Vercel'in otomatik doldurduğu req.query'yi de
    // devre dışı bırakıyor — bu yüzden sorgu parametrelerini doğrudan req.url'den
    // elle ayrıştırıyoruz.
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
    if (mode === "subscribe" && token === expected) {
      return res.status(200).send(challenge);
    }
    // Gerçek bir doğrulama denemesi değilse (hub.mode hiç yok) — muhtemelen
    // periyodik bir sağlık kontrolü, 403 ile reddetmek yerine sessizce 200
    // dönüyoruz. Sadece gerçek bir "subscribe" denemesinde token yanlışsa 403.
    if (!mode) return res.status(200).send("OK");
    return res.status(403).send("Forbidden");
  }
  if (req.method !== "POST") return res.status(405).end();

  const rawBody = await readRawBody(req);
  console.log("[whatsapp-webhook] raw body length:", rawBody.length);

  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch (e) {
    console.log("[whatsapp-webhook] JSON parse failed:", e.message);
    return res.status(200).json({ ok: true });
  }

  const phoneNumberId = payload?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
  console.log("[whatsapp-webhook] phoneNumberId:", phoneNumberId);
  if (!phoneNumberId) return res.status(200).json({ ok: true });

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: cred, error: credError } = await supabaseAdmin
    .from("channel_credentials")
    .select("user_id, app_secret")
    .eq("channel", "whatsapp")
    .eq("external_id", phoneNumberId)
    .maybeSingle();
  console.log("[whatsapp-webhook] credential found:", !!cred, "error:", credError?.message);
  if (!cred) return res.status(200).json({ ok: true });

  // Geçici teşhis işareti: imza kontrolünden BAĞIMSIZ olarak, isteğin buraya
  // kadar ulaştığını doğrudan Mesajlar sekmesinde görebilmek için.
  await supabaseAdmin.from("channel_messages").insert({
    user_id: cred.user_id, channel: "whatsapp", direction: "in",
    counterpart_id: "debug", body: "DEBUG: POST isteği buraya ulaştı (imza kontrolünden önce)",
  });

  const signatureHeader = req.headers["x-hub-signature-256"] || "";
  const expected = "sha256=" + crypto.createHmac("sha256", cred.app_secret).update(rawBody).digest("hex");
  const sigBuf = Buffer.from(signatureHeader);
  const expBuf = Buffer.from(expected);
  const validSignature = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
  console.log("[whatsapp-webhook] signature header present:", !!signatureHeader, "valid:", validSignature);
  if (!validSignature) return res.status(401).json({ error: "Invalid signature" });

  const messages = payload.entry?.[0]?.changes?.[0]?.value?.messages || [];
  console.log("[whatsapp-webhook] messages count:", messages.length);
  if (messages.length > 0) {
    const { data: customers } = await supabaseAdmin
      .from("customers")
      .select("id, phone")
      .eq("user_id", cred.user_id)
      .is("deleted_at", null);

    for (const msg of messages) {
      if (msg.type !== "text") continue;

      const { data: existing } = await supabaseAdmin
        .from("channel_messages")
        .select("id")
        .eq("channel", "whatsapp")
        .eq("external_message_id", msg.id)
        .maybeSingle();
      if (existing) continue;

      const senderNumber = toWhatsAppNumber(msg.from);
      const matched = (customers || []).find((c) => toWhatsAppNumber(c.phone) === senderNumber);

      const { error: insertError } = await supabaseAdmin.from("channel_messages").insert({
        user_id: cred.user_id,
        channel: "whatsapp",
        direction: "in",
        external_message_id: msg.id,
        counterpart_id: senderNumber,
        customer_id: matched?.id || null,
        body: msg.text?.body || "",
      });
      console.log("[whatsapp-webhook] insert error:", insertError?.message || "none");
    }
  }

  return res.status(200).json({ ok: true });
}
