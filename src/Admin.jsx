import React, { useState, useEffect } from "react";
import { Badge, MetricCard } from "./shared";

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diff <= 0) return "Bugün";
  if (diff === 1) return "Dün";
  return `${diff} gün önce`;
}

// Sadece kurucuya görünen yönetici paneli — api/admin-data.js'ten hesap/kullanım
// metaverisi çeker (şirket adı, üye e-postaları, kayıt tarihi, müşteri/teklif
// SAYISI). Hiçbir KOBİ'nin gerçek müşteri/teklif verisi burada görünmez, bilinçli
// bir gizlilik sınırı — bkz. api/admin-data.js'teki yorum.
export default function AdminPanel({ session }) {
  const [accounts, setAccounts] = useState(null);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    fetch("/api/admin-data", { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) { setError(data.error || "Yüklenemedi."); return; }
        setAccounts(data.accounts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
      })
      .catch(() => setError("Yüklenemedi."));
  }, [session.access_token]);

  if (error) return <p style={{ fontSize: 14, color: "var(--text-danger)" }}>{error}</p>;
  if (!accounts) return <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Yükleniyor…</p>;

  const oneWeekAgo = Date.now() - 7 * 86400000;
  const newThisWeek = accounts.filter((a) => new Date(a.createdAt).getTime() >= oneWeekAgo).length;
  const totalMembers = accounts.reduce((sum, a) => sum + a.memberCount, 0);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 12, marginBottom: 20 }}>
        <MetricCard label="Toplam Hesap" value={accounts.length} />
        <MetricCard label="Toplam Takım Üyesi" value={totalMembers} />
        <MetricCard label="Bu Hafta Yeni Kayıt" value={newThisWeek} tone={newThisWeek > 0 ? "success" : undefined} />
      </div>

      {accounts.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>Henüz hesap yok.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 8px" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>Hesap</th>
              <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>Sektör</th>
              <th style={{ textAlign: "right", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>Üye</th>
              <th style={{ textAlign: "right", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>Müşteri</th>
              <th style={{ textAlign: "right", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>Teklif</th>
              <th style={{ textAlign: "left", padding: "0 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>Kayıt</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <React.Fragment key={a.id}>
                <tr
                  onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
                  style={{ background: "var(--surface-1)", cursor: a.memberCount > 0 ? "pointer" : "default" }}
                >
                  <td style={{ padding: "10px 12px", borderRadius: "var(--radius) 0 0 var(--radius)" }}>
                    <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>{a.companyName || "İsimsiz hesap"}</p>
                    <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
                      {a.email}
                      {a.memberOfEmails.length > 0 && ` · ${a.memberOfEmails.join(", ")} takımının üyesi`}
                    </p>
                  </td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                    {a.sector ? <Badge>{a.sector}</Badge> : <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>}
                  </td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap", textAlign: "right", fontSize: 13 }}>{a.memberCount}</td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap", textAlign: "right", fontSize: 13 }}>{a.customerCount}</td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap", textAlign: "right", fontSize: 13 }}>{a.dealCount}</td>
                  <td style={{ padding: "10px 12px", borderRadius: "0 var(--radius) var(--radius) 0", whiteSpace: "nowrap", fontSize: 12, color: "var(--text-secondary)" }}>
                    {timeAgo(a.createdAt)}
                  </td>
                </tr>
                {expandedId === a.id && a.memberCount > 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: "0 12px 10px" }}>
                      <div style={{ background: "var(--bg-accent)", borderRadius: "var(--radius)", padding: "8px 12px" }}>
                        <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>Takım üyeleri</p>
                        {a.members.map((m) => (
                          <p key={m.email} style={{ margin: 0, fontSize: 13 }}>
                            {m.email} <span style={{ color: "var(--text-muted)" }}>· katıldı {timeAgo(m.joinedAt)}</span>
                          </p>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
