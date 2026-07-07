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

export default async function handler(req, res) {
  if (req.method === "GET") {
    // bodyParser: false ayarı Vercel'in otomatik doldurduğu req.query'yi de
    // devre dışı bırakıyor — bu yüzden sorgu parametrelerini doğrudan req.url'den
    // elle ayrıştırıyoruz.
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Forbidden");
  }
  if (req.method !== "POST") return res.status(405).end();

  const rawBody = await readRawBody(req);
  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(200).json({ ok: true });
  }

  const entry = payload?.entry?.[0];
  const pageScopedId = entry?.id;
  if (!pageScopedId) return res.status(200).json({ ok: true });

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: cred } = await supabaseAdmin
    .from("channel_credentials")
    .select("user_id, app_secret")
    .eq("channel", "instagram")
    .eq("external_id", pageScopedId)
    .maybeSingle();
  if (!cred) return res.status(200).json({ ok: true });

  const signatureHeader = req.headers["x-hub-signature-256"] || "";
  const expected = "sha256=" + crypto.createHmac("sha256", cred.app_secret).update(rawBody).digest("hex");
  const sigBuf = Buffer.from(signatureHeader);
  const expBuf = Buffer.from(expected);
  const validSignature = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
  if (!validSignature) return res.status(401).json({ error: "Invalid signature" });

  const events = entry?.messaging || [];
  for (const item of events) {
    // is_echo: Meta'nın kendi gönderdiğimiz mesajları geri yansıtması — atlanır.
    // message.text yoksa (medya, reaksiyon, postback vb.) v1 kapsamı dışında.
    if (!item.message || item.message.is_echo || !item.message.text) continue;

    const { data: existing } = await supabaseAdmin
      .from("channel_messages")
      .select("id")
      .eq("channel", "instagram")
      .eq("external_message_id", item.message.mid)
      .maybeSingle();
    if (existing) continue;

    await supabaseAdmin.from("channel_messages").insert({
      user_id: cred.user_id,
      channel: "instagram",
      direction: "in",
      external_message_id: item.message.mid,
      counterpart_id: item.sender?.id || "",
      customer_id: null,
      body: item.message.text,
    });
  }

  return res.status(200).json({ ok: true });
}
