import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const { teamId, to, body, customerId } = req.body || {};
  if (!teamId || !to || !body) return res.status(400).json({ error: "Eksik bilgi." });

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) return res.status(401).json({ error: "Unauthorized" });
  const callerId = userData.user.id;

  let authorized = callerId === teamId;
  if (!authorized) {
    const { data: membership } = await supabaseAdmin
      .from("team_members")
      .select("team_id")
      .eq("team_id", teamId)
      .eq("member_id", callerId)
      .maybeSingle();
    authorized = !!membership;
  }
  if (!authorized) return res.status(403).json({ error: "Bu takıma erişiminiz yok." });

  const { data: cred } = await supabaseAdmin
    .from("channel_credentials")
    .select("*")
    .eq("user_id", teamId)
    .eq("channel", "instagram")
    .maybeSingle();
  if (!cred) return res.status(400).json({ error: "Instagram bağlantısı yapılandırılmamış." });

  const { data: lastInbound } = await supabaseAdmin
    .from("channel_messages")
    .select("created_at")
    .eq("user_id", teamId)
    .eq("channel", "instagram")
    .eq("counterpart_id", to)
    .eq("direction", "in")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const withinWindow = lastInbound && Date.now() - new Date(lastInbound.created_at).getTime() <= 24 * 3600 * 1000;
  if (!withinWindow) {
    return res.status(400).json({ error: "24 saatlik yanıt penceresi kapandı. Bu kişiye şu an serbest metinli mesaj gönderilemez." });
  }

  const metaRes = await fetch(`https://graph.facebook.com/v21.0/${cred.external_id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cred.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: to }, message: { text: body }, messaging_type: "RESPONSE" }),
  });
  const metaData = await metaRes.json();
  if (!metaRes.ok) {
    return res.status(502).json({ error: "Instagram gönderimi başarısız.", detail: metaData?.error?.message });
  }

  await supabaseAdmin.from("channel_messages").insert({
    user_id: teamId,
    channel: "instagram",
    direction: "out",
    external_message_id: metaData?.message_id || null,
    counterpart_id: to,
    customer_id: customerId || null,
    body,
  });

  return res.status(200).json({ ok: true });
}
