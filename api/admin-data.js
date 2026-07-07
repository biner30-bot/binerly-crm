import { createClient } from "@supabase/supabase-js";

// Sadece kurucuya görünen yönetici paneli için — hesap/kullanım metaverisi
// döner (şirket adı, üye e-postaları, kayıt tarihi, müşteri/teklif SAYISI).
// Hiçbir KOBİ'nin gerçek müşteri/teklif İÇERİĞİ (isim, telefon, tutar, not)
// buradan asla okunmaz — sadece customers/deals'ın user_id kolonu okunup
// JS tarafında sayılır, bilinçli bir gizlilik sınırı.
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) return res.status(401).json({ error: "Unauthorized" });
  if (userData.user.email !== process.env.ADMIN_EMAIL) {
    return res.status(403).json({ error: "Bu sayfaya erişiminiz yok." });
  }

  const [{ data: usersList, error: usersError }, { data: settingsRows }, { data: memberRows }, { data: customerRows }, { data: dealRows }] =
    await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ perPage: 200 }),
      supabaseAdmin.from("company_settings").select("user_id, company_name, sector"),
      supabaseAdmin.from("team_members").select("team_id, member_id, joined_at"),
      supabaseAdmin.from("customers").select("user_id").is("deleted_at", null),
      supabaseAdmin.from("deals").select("user_id").is("deleted_at", null),
    ]);
  if (usersError) return res.status(500).json({ error: usersError.message });

  const emailById = new Map((usersList?.users || []).map((u) => [u.id, u.email]));
  const settingsByUser = new Map((settingsRows || []).map((r) => [r.user_id, r]));

  const membersByTeam = new Map();
  const memberOfByUser = new Map();
  for (const m of memberRows || []) {
    if (!membersByTeam.has(m.team_id)) membersByTeam.set(m.team_id, []);
    membersByTeam.get(m.team_id).push({ email: emailById.get(m.member_id) || m.member_id, joinedAt: m.joined_at });
    if (!memberOfByUser.has(m.member_id)) memberOfByUser.set(m.member_id, []);
    memberOfByUser.get(m.member_id).push(emailById.get(m.team_id) || m.team_id);
  }

  const countBy = (rows) => {
    const map = new Map();
    for (const r of rows || []) map.set(r.user_id, (map.get(r.user_id) || 0) + 1);
    return map;
  };
  const customerCounts = countBy(customerRows);
  const dealCounts = countBy(dealRows);

  const accounts = (usersList?.users || []).map((u) => {
    const settings = settingsByUser.get(u.id);
    return {
      id: u.id,
      email: u.email,
      createdAt: u.created_at,
      companyName: settings?.company_name || null,
      sector: settings?.sector || null,
      members: membersByTeam.get(u.id) || [],
      memberCount: (membersByTeam.get(u.id) || []).length,
      memberOfEmails: memberOfByUser.get(u.id) || [],
      customerCount: customerCounts.get(u.id) || 0,
      dealCount: dealCounts.get(u.id) || 0,
    };
  });

  return res.status(200).json({ accounts });
}
