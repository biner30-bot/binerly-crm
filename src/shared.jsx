import { useEffect, useState } from "react";

export function uid() {
  return crypto.randomUUID();
}

// Herhangi bir tarih alanını (ISO string) opsiyonel bir başlangıç/bitiş tarih
// aralığıyla karşılaştırır — müşteri/teklif arama kutuları, çöp kutusu ve
// geçmiş ekranı gibi birden fazla listede aynı mantıkla tekrar kullanılır.
export function matchesDateRange(dateStr, fromDate, toDate) {
  if (!fromDate && !toDate) return true;
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  if (fromDate && t < new Date(`${fromDate}T00:00:00`).getTime()) return false;
  if (toDate && t > new Date(`${toDate}T23:59:59.999`).getTime()) return false;
  return true;
}

export const PANO_RANGES = [
  { id: "bu_ay", label: "Bu ay" },
  { id: "bu_ceyrek", label: "Bu çeyrek" },
  { id: "bu_yil", label: "Bu yıl" },
  { id: "son_6_ay", label: "Son 6 ay" },
  { id: "tum_zamanlar", label: "Tüm zamanlar" },
];

export function getRangeBounds(range) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  if (range === "bu_ay") return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
  if (range === "bu_ceyrek") return { start: new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1), end };
  if (range === "bu_yil") return { start: new Date(now.getFullYear(), 0, 1), end };
  if (range === "son_6_ay") return { start: new Date(now.getFullYear(), now.getMonth() - 5, 1), end };
  return { start: null, end };
}

export function inRange(dateStr, { start, end }) {
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return false;
  if (start && t < start.getTime()) return false;
  return t <= end.getTime();
}

export function DateRangeFilter({ from, to, onFromChange, onToChange }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input
        type="date"
        value={from}
        onChange={(e) => onFromChange(e.target.value)}
        title="Başlangıç tarihi"
        style={{ fontSize: 12, padding: "6px 8px" }}
      />
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>–</span>
      <input
        type="date"
        value={to}
        onChange={(e) => onToChange(e.target.value)}
        title="Bitiş tarihi"
        style={{ fontSize: 12, padding: "6px 8px" }}
      />
      {(from || to) && (
        <button
          onClick={() => { onFromChange(""); onToChange(""); }}
          title="Tarih filtresini temizle"
          style={{ width: 28, height: 28, padding: 0 }}
        >
          <i className="ti ti-x" style={{ fontSize: 13 }} aria-hidden="true"></i>
        </button>
      )}
    </div>
  );
}

const SESSION_IDLE_LIMIT_MS = 30 * 60 * 1000; // 30 dakika hareketsizlik
const SESSION_ABSOLUTE_LIMIT_MS = 24 * 60 * 60 * 1000; // 24 saat, hareket olsa bile
const SESSION_START_KEY = "binerly_session_started_at";

// Supabase'in Pro plan gerektiren sunucu taraflı oturum zaman aşımı ayarlarına
// (Time-box/Inactivity timeout) alternatif, ücretsiz bir client-side denetim.
// Sayfa yenilense bile mutlak süre sıfırlanmasın diye başlangıç zamanı localStorage'da tutulur.
export function useSessionTimeout(session, onTimeout) {
  useEffect(() => {
    if (!session) return;

    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(SESSION_START_KEY) || "null");
    } catch {
      stored = null;
    }
    const startedAt =
      stored && stored.userId === session.user.id ? stored.startedAt : Date.now();
    if (!stored || stored.userId !== session.user.id) {
      localStorage.setItem(SESSION_START_KEY, JSON.stringify({ userId: session.user.id, startedAt }));
    }

    let lastActivity = Date.now();
    const markActivity = () => { lastActivity = Date.now(); };
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, markActivity));

    const interval = setInterval(() => {
      const now = Date.now();
      if (now - lastActivity > SESSION_IDLE_LIMIT_MS || now - startedAt > SESSION_ABSOLUTE_LIMIT_MS) {
        localStorage.removeItem(SESSION_START_KEY);
        onTimeout();
      }
    }, 60000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, markActivity));
      clearInterval(interval);
    };
  }, [session?.user?.id]);
}

export function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem("binerly_theme") || "light");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("binerly_theme", theme);
  }, [theme]);
  return [theme, setTheme];
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

export function toWhatsAppNumber(phone) {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("90")) return digits;
  if (digits.startsWith("0")) return "90" + digits.slice(1);
  return "90" + digits;
}

export function WhatsAppIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#25D366" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12.004 2C6.486 2 2.01 6.476 2.01 11.994c0 2.113.652 4.073 1.766 5.688L2 22l4.436-1.744a9.96 9.96 0 0 0 5.568 1.688c5.518 0 9.994-4.476 9.994-9.994C22 6.476 17.522 2 12.004 2zm0 18.06a8.05 8.05 0 0 1-4.318-1.24l-.31-.185-3.204 1.006 1.02-3.127-.204-.322a8.03 8.03 0 0 1-1.238-4.267c0-4.442 3.612-8.054 8.06-8.054 4.44 0 8.05 3.612 8.05 8.054 0 4.44-3.61 8.135-8.056 8.135z"/>
    </svg>
  );
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

export function MetricCard({ label, value, sub, tone, onClick }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "1rem", cursor: onClick ? "pointer" : "default" }}
    >
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 4px" }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 500, margin: sub ? "0 0 2px" : 0, color: tone ? `var(--text-${tone})` : "var(--text-primary)" }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>{sub}</p>}
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
          margin: "auto",
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
