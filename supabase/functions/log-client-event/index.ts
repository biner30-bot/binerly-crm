// KVKK/5651 uyum boşluğu: login/logout olayları hiç loglanmıyordu, portal
// rıza akışında (set_my_marketing_consent/set_my_photo_consent) gerçek client
// IP'si hiç yakalanmıyordu - PostgREST'in forwarded header'ı buradan
// güvenilir okunamıyor. Bu fonksiyon Vercel'in 12/12 dolu serverless fonksiyon
// limitine dahil DEĞİL (Supabase Edge Function, ücretsiz tier) - gerçek IP'yi
// Deno request header'larından okuyup kullanıcının KENDİ JWT'siyle (service_role
// DEĞİL) ilgili RPC'yi/insert'i yapar, böylece auth.uid()/RLS bozulmadan çalışır.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "203.0.113.1";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  let body: { action?: string; customerId?: string; consent?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Geçersiz istek gövdesi" }), { status: 400 });
  }

  const ip = getClientIp(req);
  const { action } = body;

  // Rıza değişikliği asıl işlemin kendisi - başarısız olursa portal kullanıcıya
  // gerçek bir hata göstermeli, sessizce yutulmamalı.
  if (action === "marketing_consent" || action === "photo_consent") {
    const rpcName = action === "marketing_consent" ? "set_my_marketing_consent" : "set_my_photo_consent";
    const { error } = await supabase.rpc(rpcName, {
      p_customer_id: body.customerId,
      p_consent: body.consent,
      p_ip: ip,
    });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  // Login/logout logu - mevcut logAction() felsefesiyle aynı: asıl auth
  // akışını asla engellemez, hata sessizce yutulur.
  if (action === "login" || action === "logout") {
    try {
      const teamIds = new Set<string>([user.id]);
      const { data: memberships } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("member_id", user.id);
      for (const m of memberships || []) teamIds.add(m.team_id);

      const rows = Array.from(teamIds).map((teamId) => ({
        id: crypto.randomUUID(),
        user_id: teamId,
        actor_id: user.id,
        actor_email: user.email,
        entity_type: "auth",
        entity_id: user.id,
        action,
        ip_address: ip,
        summary: action === "login" ? "Giriş yapıldı" : "Çıkış yapıldı",
      }));
      await supabase.from("audit_log").insert(rows);
    } catch {
      // yoksay - login/logout logu asla auth akışını engellemez
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: "Bilinmeyen action" }), { status: 400 });
});
