import { useEffect, useRef, useState } from "react";

export function uid() {
  return crypto.randomUUID();
}

export const WEEKDAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

// Haftalık gün/saatten (1=Pazartesi..7=Pazar), Türkiye saatiyle (+03:00) bir
// sonraki gerçekleşme zamanını hesaplar — hem grup dersi iptal kesme kuralı
// hem randevu doluluk hesabında kullanılır.
export function nextWeeklyOccurrence(weekday, startTime) {
  const now = new Date();
  const nowTurkey = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
  const [h, m] = startTime.split(":").map(Number);
  const currentIsoWeekday = nowTurkey.getDay() === 0 ? 7 : nowTurkey.getDay();
  let daysAhead = weekday - currentIsoWeekday;
  const candidate = new Date(nowTurkey);
  candidate.setHours(h, m, 0, 0);
  if (daysAhead < 0 || (daysAhead === 0 && candidate <= nowTurkey)) daysAhead += 7;
  candidate.setDate(nowTurkey.getDate() + daysAhead);
  const offsetMs = now.getTime() - nowTurkey.getTime();
  return new Date(candidate.getTime() + offsetMs);
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
const SESSION_ACTIVITY_KEY = "binerly_last_activity";

// Supabase'in Pro plan gerektiren sunucu taraflı oturum zaman aşımı ayarlarına
// (Time-box/Inactivity timeout) alternatif, ücretsiz bir client-side denetim.
// Sayfa yenilense bile mutlak süre sıfırlanmasın diye başlangıç zamanı localStorage'da tutulur.
// Son etkileşim zamanı da localStorage'da (sekmeler arası paylaşılan) tutulur —
// aksi halde arka planda boşta duran bir sekme, aktif kullanılan sekmeyi de
// (signOut tüm sekmeler için ortak olduğundan) zamanından önce çıkışa zorlar.
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

    const markActivity = () => { localStorage.setItem(SESSION_ACTIVITY_KEY, String(Date.now())); };
    markActivity();
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, markActivity));

    const interval = setInterval(() => {
      const now = Date.now();
      const lastActivity = Number(localStorage.getItem(SESSION_ACTIVITY_KEY)) || now;
      if (now - lastActivity > SESSION_IDLE_LIMIT_MS || now - startedAt > SESSION_ABSOLUTE_LIMIT_MS) {
        localStorage.removeItem(SESSION_START_KEY);
        localStorage.removeItem(SESSION_ACTIVITY_KEY);
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

// Düz CSV yerine gerçek .xlsx — CSV'nin sütun genişliği bilgisi taşımaması
// Excel'de "10.07.2026" gibi biraz daha uzun değerlerin "####" görünmesine yol
// açıyordu (Excel her CSV açtığında sütun genişliğini yeniden tahmin ediyor).
// xlsx dosyasına gerçek sütun genişliği gömülüyor, tarihler de düz metin
// olarak yazıldığı için Excel'in kendi tarih biçimine dönüştürmesi de olmuyor.
export async function downloadXlsx(filename, headers, rows) {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet["!cols"] = headers.map((h, i) => {
    const headerLen = String(h ?? "").length;
    const maxRowLen = rows.reduce((max, row) => Math.max(max, String(row[i] ?? "").length), 0);
    return { wch: Math.min(Math.max(headerLen, maxRowLen) + 2, 50) };
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sayfa1");
  XLSX.writeFile(workbook, filename);
}

export function formatTL(n) {
  return new Intl.NumberFormat("tr-TR").format(Math.round(n || 0)) + " TL";
}

// portal.binerly.com üretimde ayrı bir alt alan adı; ama binerly.com/portal linki
// müşterilere zaten gönderilmiş olabileceğinden hâlâ çalışmalı, ve localhost/önizleme
// dağıtımlarında alt alan adı tanımlı olmadığından eski /portal yoluna düşülür.
export function getPortalUrl(suffix = "") {
  const host = window.location.hostname;
  const onPortalHost = host.split(".")[0] === "portal";
  const onProdMain = host === "binerly.com" || host === "www.binerly.com";
  if (onPortalHost) return `${window.location.origin}${suffix || "/"}`;
  if (onProdMain) return `https://portal.binerly.com${suffix || "/"}`;
  return `${window.location.origin}/portal${suffix}`;
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

export function TagInput({ tags, onChange, suggestions = [] }) {
  const [draft, setDraft] = useState("");
  const add = (t) => {
    const v = t.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
  };
  const remainingSuggestions = suggestions.filter((s) => !tags.includes(s));
  return (
    <div>
      {tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
          {tags.map((t) => (
            <span
              key={t}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "var(--surface-1)", color: "var(--text-secondary)", fontSize: 12, fontWeight: 500, padding: "3px 4px 3px 10px", borderRadius: "var(--radius)" }}
            >
              {t}
              <button
                type="button"
                onClick={() => onChange(tags.filter((x) => x !== t))}
                aria-label={`${t} etiketini kaldır`}
                style={{ width: 16, height: 16, padding: 0, background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <i className="ti ti-x" style={{ fontSize: 11 }} aria-hidden="true"></i>
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
            setDraft("");
          }
        }}
        placeholder="Etiket ekle, Enter'a basın"
        style={{ width: "100%" }}
      />
      {remainingSuggestions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          {remainingSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              style={{ fontSize: 12, padding: "2px 8px", background: "none", border: "1px dashed var(--border)", borderRadius: "var(--radius)", color: "var(--text-secondary)" }}
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const ICON_BUTTON_SIZES = {
  md: { box: 32, icon: 16 },
  sm: { box: 26, icon: 13 },
};

// Uygulama genelindeki tüm ikon butonların tek kaynağı — üst menü, liste satırı
// aksiyonları (düzenle/sil/PDF vb.) hepsi buradan geçer. Daha önce her yerde
// elle kopyalanmış farklı boyutlarda (22-32px) inline style vardı, bu tek
// bileşen sadece iki boyutu (md/sm) destekleyerek tutarlılığı zorunlu kılar.
export function IconButton({ icon, label, onClick, title, size = "md", active = false, type = "button", disabled = false, ...rest }) {
  const { box, icon: iconSize } = ICON_BUTTON_SIZES[size] || ICON_BUTTON_SIZES.md;
  return (
    <button
      type={type}
      onClick={onClick}
      title={title}
      aria-label={title || label}
      disabled={disabled}
      {...rest}
      style={
        label
          ? { display: "flex", alignItems: "center", gap: 4, height: box, fontSize: 12, color: "var(--text-secondary)", opacity: disabled ? 0.4 : 1, cursor: disabled ? "not-allowed" : "pointer" }
          : {
              width: box,
              height: box,
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: active ? "var(--text-accent)" : "var(--text-primary)",
              opacity: disabled ? 0.4 : 1,
              cursor: disabled ? "not-allowed" : "pointer",
            }
      }
    >
      <i className={`ti ${icon}`} style={{ fontSize: iconSize }} aria-hidden="true"></i>
      {label && <span>{label}</span>}
    </button>
  );
}

// Ayarlar hub'ı gibi men listelerinde kullanılan tam genişlikte, tıklanabilir satır.
export function MenuRow({ icon, label, description, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        background: "var(--surface-1)",
        border: "0.5px solid var(--border)",
        borderRadius: "var(--radius)",
        textAlign: "left",
      }}
    >
      <i className={`ti ${icon}`} style={{ fontSize: 18, color: "var(--text-accent)", flexShrink: 0 }} aria-hidden="true"></i>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 500 }}>{label}</span>
        {description && <span style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{description}</span>}
      </span>
      <i className="ti ti-chevron-right" style={{ fontSize: 16, color: "var(--text-muted)", flexShrink: 0 }} aria-hidden="true"></i>
    </button>
  );
}

// Tarayıcının yerleşik konuşma tanıma özelliğiyle metin alanlarına sesle yazma
// (Chrome/Edge destekliyor, Firefox/Safari desteklemiyor — desteklenmiyorsa
// bileşen hiç render olmaz, ücretsiz ve ek kütüphane gerektirmez).
export function VoiceInputButton({ onResult }) {
  const [listening, setListening] = useState(false);
  const SpeechRecognitionCtor = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  if (!SpeechRecognitionCtor) return null;

  const start = () => {
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "tr-TR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e) => onResult(e.results[0][0].transcript);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    setListening(true);
    recognition.start();
  };

  return <IconButton icon="ti-microphone" title="Sesle yaz" size="sm" active={listening} onClick={start} />;
}

const GOOGLE_CLIENT_ID = "1085737573085-om1meeq6h4msv433eo68ef22uutoecm2.apps.googleusercontent.com";

function loadGoogleIdentityScript() {
  if (document.getElementById("google-identity-script")) return;
  const script = document.createElement("script");
  script.id = "google-identity-script";
  script.src = "https://accounts.google.com/gsi/client";
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

// Google, kimlik doğrulama isteğinin gerçekten binerly.com'dan geldiğini görebildiği için
// "Sign in to binerly.com" gösterir — redirect tabanlı signInWithOAuth'ta ise istek Supabase'in
// kendi proje adresi üzerinden gittiğinden o (çirkin) adres gösteriliyordu.
async function generateGoogleNonce() {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce));
  const hashedNonce = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return [nonce, hashedNonce];
}

export function GoogleAuthButton({ onCredential }) {
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleIdentityScript();

    (async () => {
      while (!cancelled && !window.google?.accounts?.id) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (cancelled || !containerRef.current) return;

      const [nonce, hashedNonce] = await generateGoogleNonce();
      if (cancelled) return;

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        nonce: hashedNonce,
        callback: (response) => onCredential(response.credential, nonce),
        use_fedcm_for_prompt: true,
      });
      window.google.accounts.id.renderButton(containerRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
        locale: "tr",
        width: Math.min(400, Math.max(200, containerRef.current.offsetWidth || 300)),
      });
    })();

    return () => { cancelled = true; };
  }, [onCredential]);

  return <div ref={containerRef} style={{ display: "flex", justifyContent: "center" }} />;
}

export function AuthDivider() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0" }}>
      <div style={{ flex: 1, height: 1, background: "#e1e8f0" }} />
      <span style={{ fontSize: 12, color: "#94a7bb" }}>veya</span>
      <div style={{ flex: 1, height: 1, background: "#e1e8f0" }} />
    </div>
  );
}

export function InfoTip({ text, placement = "top" }) {
  return (
    <span className="info-tip" tabIndex={0}>
      <i className="ti ti-info-circle" style={{ fontSize: 14, color: "var(--text-muted)", cursor: "help" }} aria-hidden="true"></i>
      <span className={`info-tip-bubble${placement === "bottom" ? " info-tip-bubble--bottom" : ""}`} role="tooltip">{text}</span>
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

export function Modal({ title, onClose, wide, children }) {
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
          maxWidth: wide ? 620 : 420,
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

// KOBİ paneli ve müşteri portalı ortak uygulama-içi bildirim zili — push
// bildirimlerinden bağımsız (api/send-push.js aynı olayda hem push gönderir
// hem burada okunan notifications satırını yazar), böylece push izni
// verilmemiş/farklı cihazdaki kullanıcı da olayı kaçırmaz.
export function NotificationBell({ userId, supabase, dataTour }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const containerRef = useRef(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    setNotifications(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (userId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;
  const query = search.trim().toLowerCase();
  const filteredNotifications = notifications.filter((n) => {
    if (unreadOnly && n.read_at) return false;
    if (query && !n.title?.toLowerCase().includes(query) && !n.body?.toLowerCase().includes(query)) return false;
    return true;
  });

  const openBell = () => {
    setOpen((prev) => !prev);
    if (!open) load();
  };

  const openNotification = async (n) => {
    if (!n.read_at) {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
    }
    if (n.url) window.location.assign(n.url);
    else setOpen(false);
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", unreadIds);
    setNotifications((prev) => prev.map((n) => (unreadIds.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n)));
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }} data-tour={dataTour}>
      <div style={{ position: "relative" }}>
        <IconButton icon={unreadCount > 0 ? "ti-bell-ringing" : "ti-bell"} onClick={openBell} title="Bildirimler" active={open} />
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8,
              background: "var(--text-danger)", color: "var(--on-accent)", fontSize: 10, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", pointerEvents: "none",
            }}
          >
            {unreadCount}
          </span>
        )}
      </div>

      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, width: 320, maxHeight: 400, overflowY: "auto",
            background: "var(--surface-1)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)", zIndex: 50,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderBottom: "0.5px solid var(--border)" }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Bildirimler</span>
            {unreadCount > 0 && (
              <button type="button" onClick={markAllRead} style={{ fontSize: 12, background: "none", border: "none", color: "var(--text-accent)" }}>
                Tümünü okundu işaretle
              </button>
            )}
          </div>
          {notifications.length > 0 && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "8px 12px", borderBottom: "0.5px solid var(--border)" }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Bildirimlerde ara..."
                style={{ flex: 1, fontSize: 12, padding: "5px 8px" }}
              />
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-secondary)", cursor: "pointer", whiteSpace: "nowrap" }}>
                <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
                Okunmamış
              </label>
            </div>
          )}
          {loading ? (
            <p style={{ fontSize: 13, color: "var(--text-secondary)", padding: 16, margin: 0 }}>Yükleniyor…</p>
          ) : notifications.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)", padding: 16, margin: 0 }}>Henüz bildiriminiz yok.</p>
          ) : filteredNotifications.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)", padding: 16, margin: 0 }}>Aramayla eşleşen bildirim yok.</p>
          ) : (
            filteredNotifications.map((n) => (
              <div
                key={n.id}
                onClick={() => openNotification(n)}
                style={{
                  padding: "10px 12px", cursor: "pointer", borderBottom: "0.5px solid var(--border)",
                  background: n.read_at ? "transparent" : "var(--bg-accent)",
                }}
              >
                <p style={{ margin: 0, fontSize: 13, fontWeight: n.read_at ? 500 : 700 }}>{n.title}</p>
                {n.body && <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>{n.body}</p>}
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)" }}>{daysAgo(n.created_at)}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Yeni bir KOBİ ilk kez sektör seçince ("İşletmenizi tanıyalım" modalı, App.jsx)
// açılan kısa, adım adım tanıtım turu. Bilinçli sadelik: hangi sekme aktif
// olursa olsun DOM'da her zaman var olan header/sekme-çubuğu elemanlarını
// (data-tour="...") işaret eder — turun kendisi sekme değiştirmez, tüm ekranı
// karartan bir "spotlight" maskesi de kullanmaz, sadece hedefin etrafına ince
// bir çerçeve çizer. Bu, tab-switching + yeniden ölçüm senkronizasyonunu
// tamamen ortadan kaldırıyor.
const TOUR_STEPS = [
  { target: null, title: "Binerly'ye hoş geldiniz!", body: "Sistemi hızlıca tanıtalım, sadece birkaç adım sürecek." },
  { target: '[data-tour="tab-pano"]', title: "Pano", body: "Günlük özet, bugün yapılacaklar ve gelir/kâr grafiğinizi burada görürsünüz." },
  { target: '[data-tour="tab-musteri"]', title: "Müşteriler", body: "Müşterilerinizi buradan ekleyip yönetirsiniz." },
  { target: '[data-tour="tab-firsat"]', title: "Müşteri Takibi", body: "Teklif, randevu veya üyelik süreçlerinizi buradan takip edersiniz." },
  { target: '[data-tour="settings-gear"]', title: "Ayarlar", body: "Sektörünüzü, özel alanlarınızı, fiyat listenizi ve müsaitlik saatlerinizi buradan yönetirsiniz." },
  { target: '[data-tour="notification-bell"]', title: "Bildirimler", body: "Müşteri portaldan bir işlem yaptığında (randevu alma, mesaj vb.) burada anında görürsünüz." },
  { target: '[data-tour="tab-destek"]', title: "Destek", body: "Müşteri destek taleplerini buradan yönetirsiniz." },
  { target: '[data-tour="tab-finans"]', title: "Finans", body: "Gelir-Gider Defteri, tahsilatlar ve KDV Özet Raporu'nu burada görürsünüz." },
  { target: '[data-tour="ask-bubble"]', title: "Soru Sor", body: "Sağ alttaki baloncuktan istediğiniz zaman sorabilirsiniz — kendi verileriniz, \"nasıl yapılır\" rehberleri veya genel işletme tavsiyesi, hepsi tek arama kutusunda." },
  { target: null, title: "Hepsi bu kadar!", body: "İstediğiniz zaman Ayarlar'dan turu tekrar başlatabilirsiniz." },
];

export function OnboardingTour({ step, dealNavLabel, onStepChange, onClose }) {
  const [rect, setRect] = useState(null);
  // "Müşteri Takibi" sekmesi artık sektöre göre Teklifler/Randevular/Üyelikler/
  // Rezervasyonlar olarak adlanıyor — shared.jsx döngüsel import olmadan Sectors.jsx'i
  // (dealWordKind) kullanamadığı için, gerçek adı App.jsx zaten hesaplayıp prop olarak
  // geçiyor (bkz. dealWords.navLabel).
  const current = step === 3 && dealNavLabel ? { ...TOUR_STEPS[step], title: dealNavLabel } : TOUR_STEPS[step];

  useEffect(() => {
    const measure = () => {
      if (!current.target) { setRect(null); return; }
      const el = document.querySelector(current.target);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const isLast = step === TOUR_STEPS.length - 1;

  const tooltipStyle = rect
    ? {
        position: "fixed",
        top: Math.min(rect.bottom + 12, window.innerHeight - 180),
        left: Math.min(Math.max(rect.left, 12), window.innerWidth - 300),
        zIndex: 1201,
      }
    : {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 1201,
      };

  return (
    <>
      {rect && (
        <div
          style={{
            position: "fixed",
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            border: "2px solid var(--fill-accent)",
            borderRadius: 10,
            boxShadow: "0 0 0 4px rgba(24,95,165,0.2)",
            pointerEvents: "none",
            zIndex: 1200,
            transition: "all 0.2s ease",
          }}
        />
      )}
      <div
        style={{
          ...tooltipStyle,
          width: 280,
          background: "var(--surface-2)",
          border: "0.5px solid var(--border)",
          borderRadius: "var(--radius)",
          boxShadow: "0 12px 32px rgba(0,0,0,0.25)",
          padding: "14px 16px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{current.title}</p>
          <button onClick={onClose} aria-label="Turu kapat" style={{ width: 22, height: 22, padding: 0, background: "none", border: "none", flex: "none" }}>
            <i className="ti ti-x" style={{ fontSize: 14 }} aria-hidden="true"></i>
          </button>
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>{current.body}</p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{step + 1}/{TOUR_STEPS.length}</span>
          <div style={{ display: "flex", gap: 6 }}>
            {step > 0 && (
              <button type="button" onClick={() => onStepChange(step - 1)} style={{ fontSize: 12 }}>Geri</button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? onClose() : onStepChange(step + 1))}
              style={{ fontSize: 12, background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
            >
              {isLast ? "Bitir" : "İleri"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
