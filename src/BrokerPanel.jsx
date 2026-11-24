import React, { useState } from "react";
import { Badge, formatTL } from "./shared";
import { authorizationStatus, CLOSED_STATUSES } from "./realEstate";

// Ofis sahibi (broker) için danışman bazlı özet. Mevcut takım modeliyle
// çalışır (tek ofis = tek takım); ofisler arası paylaşım/franchise katmanı
// ayrı bir güvenlik tasarımı gerektirdiği için burada yok.

const PERIODS = [
  { id: "30", label: "Son 30 gün", days: 30 },
  { id: "90", label: "Son 90 gün", days: 90 },
  { id: "365", label: "Son 1 yıl", days: 365 },
];

function StatCard({ label, value, sub, tone }) {
  return (
    <div
      style={{
        flex: "1 1 140px",
        border: "0.5px solid var(--border)",
        borderRadius: 8,
        padding: 12,
        background: "var(--surface-2)",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 600,
          color:
            tone === "danger"
              ? "var(--text-danger)"
              : tone === "warning"
                ? "var(--text-warning)"
                : undefined,
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

export function BrokerPanel({
  properties,
  showings,
  deals,
  teamMembers,
  currentUserId,
  currentUserName,
  onOpenProperty,
}) {
  const [periodId, setPeriodId] = useState("90");
  const period = PERIODS.find((p) => p.id === periodId);
  const since = new Date(Date.now() - period.days * 86400000);
  const inPeriod = (iso) => iso && new Date(iso) >= since;

  // Sorumlu atanmamış portföyler ayrı satırda - "kimsenin değil" görünür olsun.
  const agents = [
    { id: currentUserId, name: currentUserName ? `${currentUserName} (siz)` : "Siz" },
    ...teamMembers
      .filter((m) => m.id !== currentUserId)
      .map((m) => ({ id: m.id, name: m.name || m.email })),
    { id: null, name: "Atanmamış" },
  ];

  const propertyIds = new Set(properties.map((p) => p.id));
  // Hizmet bedeli geliri: portföye bağlı kazanılmış teklifler (tutar = hizmet
  // bedeli, KDV hariç - bkz. DealForm emlak tutar kuralı).
  const wonDeals = deals.filter(
    (d) =>
      d.stage === "kazanildi" &&
      d.propertyId &&
      propertyIds.has(d.propertyId) &&
      inPeriod(d.closedAt || d.createdAt),
  );

  const rows = agents
    .map((a) => {
      const mine = properties.filter((p) => (p.assignedTo || null) === a.id);
      const open = mine.filter((p) => ["aktif", "opsiyonlu"].includes(p.status));
      const mineIds = new Set(mine.map((p) => p.id));
      const shows = showings.filter((s) => mineIds.has(s.propertyId) && inPeriod(s.shownAt));
      const wet = shows.filter((s) => s.wetSignedAt).length;
      const closed = mine.filter((p) => CLOSED_STATUSES.includes(p.status));
      const newOnes = mine.filter((p) => inPeriod(p.createdAt));
      const fee = wonDeals
        .filter((d) => mineIds.has(d.propertyId))
        .reduce((s, d) => s + (Number(d.value) || 0), 0);
      const warnings = open.filter((p) => {
        const auth = authorizationStatus(p);
        return (
          !auth ||
          auth.expired ||
          (!auth.autoRenew && auth.daysLeft <= 30) ||
          p.eidsStatus !== "onaylandi"
        );
      });
      return {
        ...a,
        total: mine.length,
        open: open.length,
        newOnes: newOnes.length,
        shows: shows.length,
        wet,
        closed: closed.length,
        fee,
        warnings,
      };
    })
    .filter((r) => r.id !== null || r.total > 0);

  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  const allWarnings = rows.flatMap((r) => r.warnings.map((p) => ({ p, agent: r.name })));

  const th = {
    textAlign: "left",
    fontSize: 12,
    color: "var(--text-muted)",
    fontWeight: 500,
    padding: "6px 8px",
  };
  const td = { fontSize: 13, padding: "6px 8px", borderTop: "0.5px solid var(--border)" };

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPeriodId(p.id)}
            style={
              p.id === periodId
                ? { background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }
                : undefined
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <StatCard
          label="Açık portföy"
          value={sum("open")}
          sub={`${sum("newOnes")} yeni (${period.label.toLowerCase()})`}
        />
        <StatCard label="Gösterim" value={sum("shows")} sub={`${sum("wet")} ıslak imzalı belge`} />
        <StatCard label="Kapanan işlem" value={sum("closed")} sub="satıldı + kiralandı (tümü)" />
        <StatCard
          label="Hizmet bedeli"
          value={formatTL(sum("fee"))}
          sub="kazanılan teklifler, KDV hariç"
        />
        <StatCard
          label="Dikkat isteyen"
          value={allWarnings.length}
          sub="yetki/EİDS eksik veya bitiyor"
          tone={allWarnings.length ? "warning" : undefined}
        />
      </div>

      <div
        style={{
          overflowX: "auto",
          border: "0.5px solid var(--border)",
          borderRadius: 8,
          marginBottom: 16,
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
          <thead>
            <tr>
              <th style={th}>Danışman</th>
              <th style={th}>Açık</th>
              <th style={th}>Yeni</th>
              <th style={th}>Gösterim</th>
              <th style={th}>Islak imza</th>
              <th style={th}>Kapanan</th>
              <th style={th}>Hizmet bedeli</th>
              <th style={th}>Uyarı</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id || "none"}>
                <td style={{ ...td, fontWeight: 500 }}>{r.name}</td>
                <td style={td}>{r.open}</td>
                <td style={td}>{r.newOnes}</td>
                <td style={td}>{r.shows}</td>
                <td style={td}>{r.shows > 0 ? `${r.wet}/${r.shows}` : "-"}</td>
                <td style={td}>{r.closed}</td>
                <td style={td}>{formatTL(r.fee)}</td>
                <td style={td}>
                  {r.warnings.length > 0 ? <Badge tone="warning">{r.warnings.length}</Badge> : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {allWarnings.length > 0 && (
        <>
          <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 6px" }}>
            Dikkat isteyen portföyler
          </p>
          {allWarnings.map(({ p, agent }) => {
            const auth = authorizationStatus(p);
            const reasons = [
              !auth && "yetki sözleşmesi girilmemiş",
              auth?.expired && "yetki süresi dolmuş",
              auth &&
                !auth.expired &&
                !auth.autoRenew &&
                auth.daysLeft <= 30 &&
                `yetki ${auth.daysLeft} gün içinde bitiyor`,
              p.eidsStatus !== "onaylandi" && "EİDS yetkisi yok",
            ].filter(Boolean);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpenProperty(p)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  fontSize: 13,
                  padding: "8px 10px",
                  marginBottom: 6,
                  background: "var(--surface-1)",
                  border: "0.5px solid var(--border)",
                  borderRadius: "var(--radius)",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontWeight: 500 }}>{p.title}</span>
                <span style={{ color: "var(--text-muted)" }}>
                  {" "}
                  · {agent} · {reasons.join(", ")}
                </span>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}
