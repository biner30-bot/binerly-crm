export function uid() {
  return crypto.randomUUID();
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[";\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCsv(filename, headers, rows) {
  // Türkçe Excel için liste ayracı ";" — virgül ondalık ayracı olduğundan Excel "," ile sütunlara ayırmıyor.
  const lines = [headers, ...rows].map((row) => row.map(csvEscape).join(";"));
  const csv = lines.join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function formatTL(n) {
  return new Intl.NumberFormat("tr-TR").format(Math.round(n || 0)) + " TL";
}

export function daysAgo(dateStr) {
  if (!dateStr) return null;
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diff <= 0) return "Bugün";
  if (diff === 1) return "Dün";
  return `${diff} gün önce`;
}

export function Badge({ children, tone = "default" }) {
  const tones = {
    default: { background: "var(--surface-1)", color: "var(--text-secondary)" },
    warning: { background: "var(--bg-warning)", color: "var(--text-warning)" },
    success: { background: "var(--bg-success)", color: "var(--text-success)" },
    accent: { background: "var(--bg-accent)", color: "var(--text-accent)" },
    danger: { background: "var(--bg-danger)", color: "var(--text-danger)" },
  };
  return (
    <span
      style={{
        ...tones[tone],
        fontSize: 12,
        fontWeight: 500,
        padding: "3px 10px",
        borderRadius: "var(--radius)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export function InfoTip({ text }) {
  return (
    <span className="info-tip" tabIndex={0}>
      <i className="ti ti-info-circle" style={{ fontSize: 14, color: "var(--text-muted)", cursor: "help" }} aria-hidden="true"></i>
      <span className="info-tip-bubble" role="tooltip">{text}</span>
    </span>
  );
}

export function MetricCard({ label, value, tone }) {
  return (
    <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "1rem" }}>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 4px" }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 500, margin: 0, color: tone ? `var(--text-${tone})` : "var(--text-primary)" }}>
        {value}
      </p>
    </div>
  );
}

export function Toast({ message, tone = "danger", onClose }) {
  const isSuccess = tone === "success";
  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        background: isSuccess ? "var(--bg-success)" : "var(--bg-danger)",
        color: isSuccess ? "var(--text-success)" : "var(--text-danger)",
        border: "0.5px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 500,
        boxShadow: "0 8px 24px rgba(12,37,64,0.18)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        zIndex: 2000,
        maxWidth: "90vw",
      }}
    >
      <i className={`ti ${isSuccess ? "ti-circle-check" : "ti-alert-circle"}`} style={{ fontSize: 16, flexShrink: 0 }} aria-hidden="true"></i>
      <span>{message}</span>
      <button onClick={onClose} aria-label="Kapat" style={{ background: "none", border: "none", padding: 0, width: 20, height: 20, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <i className="ti ti-x" style={{ fontSize: 14 }} aria-hidden="true"></i>
      </button>
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        overflowY: "auto",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "var(--surface-2)",
          border: "0.5px solid var(--border)",
          borderRadius: 12,
          padding: "1.5rem",
          width: "100%",
          maxWidth: 420,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button onClick={onClose} aria-label="Kapat" style={{ width: 32, height: 32, padding: 0 }}>
            <i className="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title = "Emin misiniz?", message, confirmLabel = "Sil", onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 20px", lineHeight: 1.5 }}>{message}</p>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose}>Vazgeç</button>
        <button
          type="button"
          onClick={onConfirm}
          style={{ background: "var(--bg-danger)", color: "var(--text-danger)", border: "none", fontWeight: 600 }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
