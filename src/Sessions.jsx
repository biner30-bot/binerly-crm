import { useState } from "react";
import { Badge, IconButton, SegmentedControl, parseAppointmentDateTime } from "./shared";

const SESSION_STATUS_OPTIONS = [
  { id: "kalanlar", label: "Kalanlar" },
  { id: "tumu", label: "Tümü" },
];

function formatApptDateTime(raw) {
  const dt = parseAppointmentDateTime(raw);
  if (!dt) return "-";
  return `${dt.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} ${dt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`;
}

// Seanslar YENİ bir varlık değil - deals'ın session_total>0 olan alt kümesi (bkz.
// incrementSessionUsage/handleUseSessionClick, App.jsx). Bu yüzden burada ayrı bir
// CRUD/form yok - "Seans kullanıldı" ve "Düzenle" mevcut deal akışlarına devrediyor.
export function SessionsTab({
  deals,
  customerById,
  appointmentDateTimeKey,
  onUseSession,
  onEditDeal,
}) {
  const [statusFilter, setStatusFilter] = useState("kalanlar");
  const [search, setSearch] = useState("");

  const packagedDeals = deals.filter((d) => d.sessionTotal > 0);
  const query = search.trim().toLowerCase();
  const rows = packagedDeals
    .filter((d) => statusFilter === "tumu" || d.sessionUsed < d.sessionTotal)
    .filter((d) => !query || (customerById(d.customerId)?.name || "").toLowerCase().includes(query))
    // Kalan seansı en az olan (paketi bitmek üzere olan) en üstte - kobi kimin
    // yakında yeni paket alması gerektiğini otomatik en üstte görsün diye.
    .sort((a, b) => a.sessionTotal - a.sessionUsed - (b.sessionTotal - b.sessionUsed));

  return (
    <div>
      <div
        className="list-toolbar"
        style={{
          display: "flex",
          gap: 16,
          marginBottom: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <SegmentedControl
          value={statusFilter}
          onChange={setStatusFilter}
          options={SESSION_STATUS_OPTIONS}
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Müşteri ara..."
          style={{ flex: 1, minWidth: 160 }}
        />
      </div>

      {rows.length === 0 ? (
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
          {packagedDeals.length > 0
            ? "Bu filtreye uyan bir paket yok."
            : 'Henüz seanslı bir paket satışı yok - Teklifler\'de yeni bir teklif açarken "Bu bir seans/paket satışı" seçeneğini işaretleyerek başlayabilirsiniz.'}
        </p>
      ) : (
        <table className="responsive-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Müşteri</th>
              <th style={{ textAlign: "left" }}>Paket</th>
              <th style={{ textAlign: "left" }}>Randevu tarihi</th>
              <th style={{ textAlign: "left" }}>Seans</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const customer = customerById(d.customerId);
              const breakdown = Array.isArray(d.customFields?.package_breakdown)
                ? d.customFields.package_breakdown
                : null;
              const done = d.sessionUsed >= d.sessionTotal;
              return (
                <tr key={d.id}>
                  <td data-label="Müşteri">
                    <div>{customer?.name || "-"}</div>
                    {customer?.phone && (
                      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        {customer.phone}
                      </div>
                    )}
                  </td>
                  <td data-label="Paket">
                    {d.title}
                    {breakdown && breakdown.length > 0 && (
                      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        {breakdown.map((b) => `${b.label}: ${b.used}/${b.total}`).join(", ")}
                      </div>
                    )}
                  </td>
                  <td data-label="Randevu tarihi">
                    {appointmentDateTimeKey
                      ? formatApptDateTime(d.customFields?.[appointmentDateTimeKey])
                      : "-"}
                  </td>
                  <td data-label="Seans">
                    <Badge tone={done ? "success" : "default"}>
                      {done ? "Paket tamamlandı" : `${d.sessionUsed}/${d.sessionTotal} seans`}
                    </Badge>
                  </td>
                  <td data-label="">
                    <div style={{ display: "flex", gap: 6 }}>
                      <IconButton
                        icon="ti-plus"
                        title="Seans kullanıldı"
                        size="sm"
                        disabled={done}
                        onClick={() => onUseSession(d)}
                      />
                      <IconButton
                        icon="ti-pencil"
                        title="Düzenle"
                        size="sm"
                        onClick={() => onEditDeal(d)}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
