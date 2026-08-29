import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function uid() {
  return crypto.randomUUID();
}

// Kayıt formlarında (KOBİ, müşteri portalı, onay sayfası) gerçek kimlik
// doğrulaması yapamayız (KYC bu aşama için orantısız) — ama en azından
// bariz tek kelimelik takma adları/rastgele girişleri caydırmak için ad
// alanının en az iki kelime (ad + soyad) içermesini istiyoruz.
export function isFullNameValid(name) {
  return name.trim().split(/\s+/).filter(Boolean).length >= 2;
}

// KVKK/5651 uyum denetiminde tespit edilen boşluk - eskiden sadece 6 karakter
// minimum vardı, karmaşıklık kuralı yoktu. Kayıt formu ve şifre sıfırlama
// modalı (Auth.jsx) bu tek fonksiyonu kullanır, kural iki yerde ayrı ayrı
// tutulmaz. null döner = geçerli, aksi halde gösterilecek Türkçe hata metni.
export function validatePassword(password) {
  if ((password || "").length < 8) return "Şifre en az 8 karakter olmalı.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password))
    return "Şifre en az bir harf ve bir rakam içermeli.";
  return null;
}

// api/lead-capture.js'te AYNI mantığın kopyası (kasıtlı - api/*.js src/*.jsx'ten
// import etmiyor). "0"/"+90"/"90" öneki ve boşluk/tire/parantez toleranslı;
// geriye kalan 10 hanenin TR alan kodu/operatör deseniyle (2xx-5xx) başlaması
// gerekir - rastgele "12345" gibi girişleri kayıt anında reddetmek için
// (bkz. proje geneli mükerrer telefon/e-posta engeliyle AYNI "gerçek engel"
// kararı, feedback_hard_block_exceptions).
export function isValidPhone(phone) {
  const digits = (phone || "").replace(/\D/g, "").replace(/^90/, "").replace(/^0/, "");
  return /^[2-5]\d{9}$/.test(digits);
}

// Supabase Auth hataları İngilizce ve teknik geliyor ("Invalid login
// credentials" vb.) — hem KOBİ girişinde hem müşteri portalında bunu olduğu
// gibi göstermek kafa karıştırıyor/güvensizlik veriyordu. Bilinen mesajlar
// Türkçeye çevrilir, tanınmayanlar için genel ama anlaşılır bir metin döner.
const AUTH_ERROR_MAP = [
  [/invalid login credentials/i, "E-posta veya şifre hatalı."],
  [
    /email not confirmed/i,
    "E-posta adresiniz henüz doğrulanmadı. Gelen kutunuzu kontrol edip doğrulama linkine tıklayın.",
  ],
  [/user already registered/i, "Bu e-posta adresiyle zaten bir hesap var. Giriş yapmayı deneyin."],
  [/password should be at least/i, "Şifre çok kısa, daha uzun bir şifre deneyin."],
  [/unable to validate email address/i, "Geçerli bir e-posta adresi girin."],
  [/valid password/i, "Geçerli bir şifre girin."],
  [/new password should be different/i, "Yeni şifre, eski şifrenizden farklı olmalıdır."],
  [/security purposes|rate limit/i, "Çok sık deneme yapıldı, lütfen biraz sonra tekrar deneyin."],
  [
    /failed to fetch|network|load failed/i,
    "Bağlantı hatası, lütfen internet bağlantınızı kontrol edip tekrar deneyin.",
  ],
];

export function translateAuthError(message) {
  if (!message) return "İşlem tamamlanamadı, lütfen tekrar deneyin.";
  const match = AUTH_ERROR_MAP.find(([pattern]) => pattern.test(message));
  return match ? match[1] : "İşlem tamamlanamadı, lütfen tekrar deneyin.";
}

// Genel (Auth dışı) Postgres/Supabase/ağ hata metinleri de İngilizce ve
// teknik geliyor ("violates row-level security policy" vb.) - notify()'a
// giden 89+ çağrı noktasının (`Müşteri silinemedi: ${error.message}` gibi)
// HİÇBİRİNE tek tek dokunmadan, App.jsx/CustomerPortal.jsx'teki notify()
// tanımından çağrılır. Sadece BİLİNEN teknik kalıbı değiştirir, mesajın
// geri kalanı (kullanıcı-dostu önek) olduğu gibi kalır. Tanınmayan bir hata
// yanlış yorumlanıp yanıltıcı bir mesaj göstermektense OLDUĞU GİBİ bırakılır.
const DB_ERROR_PATTERNS = [
  [/duplicate key value violates unique constraint[^\n]*/i, "bu kayıt zaten mevcut"],
  [
    /update or delete on table "\w+" violates foreign key constraint[^\n]*/i,
    "bu kayıt başka bir yerde kullanıldığı için işlem yapılamadı",
  ],
  [
    /insert or update on table "\w+" violates foreign key constraint[^\n]*/i,
    "seçilen kayıt bulunamadı, sayfayı yenileyip tekrar deneyin",
  ],
  [
    /new row violates row-level security policy for table "\w+"|permission denied for table \w+/i,
    "bu işlem için yetkiniz yok",
  ],
  [
    /null value in column "\w+"[^\n]*violates not-null constraint/i,
    "zorunlu bir alan boş bırakılamaz",
  ],
  [/new row for relation "\w+" violates check constraint[^\n]*/i, "girilen değer geçerli değil"],
  [/JWT expired|invalid JWT|invalid claim/i, "oturumunuz sona erdi, lütfen tekrar giriş yapın"],
  [
    /Failed to fetch|NetworkError when attempting to fetch resource|network request failed/i,
    "bağlantı hatası, internet bağlantınızı kontrol edip tekrar deneyin",
  ],
];

export function humanizeDbMessage(message) {
  if (typeof message !== "string" || !message) return message;
  return DB_ERROR_PATTERNS.reduce(
    (msg, [pattern, replacement]) => msg.replace(pattern, replacement),
    message,
  );
}

export const WEEKDAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
// WEEKDAYS.map(w => w.slice(0,3)) "Cuma"/"Cumartesi" ve "Pazartesi"/"Pazar"
// için aynı "CUM"/"PAZ" kısaltmasını üretiyordu — ajanda başlığında iki gün
// aynı etiketle görünüyordu. Kısaltmalar burada sabit tutulur.
export const WEEKDAYS_SHORT = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

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
  { id: "bugun", label: "Bugün" },
  { id: "bu_hafta", label: "Bu hafta" },
  { id: "bu_ay", label: "Bu ay" },
  { id: "bu_ceyrek", label: "Bu çeyrek" },
  { id: "bu_yil", label: "Bu yıl" },
  { id: "son_6_ay", label: "Son 6 ay" },
  { id: "tum_zamanlar", label: "Tüm zamanlar" },
];

export function getRangeBounds(range, custom) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  if (range === "ozel") {
    return {
      start: custom?.from ? new Date(`${custom.from}T00:00:00`) : null,
      end: custom?.to ? new Date(`${custom.to}T23:59:59.999`) : end,
    };
  }
  if (range === "bugun")
    return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate()), end };
  if (range === "bu_hafta") {
    const dayOffset = now.getDay() === 0 ? -6 : 1 - now.getDay();
    return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset), end };
  }
  if (range === "bu_ay") return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
  if (range === "bu_ceyrek")
    return { start: new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1), end };
  if (range === "bu_yil") return { start: new Date(now.getFullYear(), 0, 1), end };
  if (range === "son_6_ay")
    return { start: new Date(now.getFullYear(), now.getMonth() - 5, 1), end };
  return { start: null, end };
}

// Sekme şeridi (segmented control). "Track"i modal/kart zemininden ayırmak için
// --bg zeminli + kenarlıklı bir kap; seçili segment dolgulu accent "thumb",
// diğerleri sönük metin. Buton başına gölge/hover-kalkma index.html'de
// .segmented-control kuralıyla bastırılır - yoksa her segment ayrı bir buton
// gibi görünüp "sekme" hissi kayboluyordu.
export function SegmentedControl({ value, onChange, options }) {
  return (
    <div
      className="segmented-control"
      style={{
        display: "inline-flex",
        gap: 2,
        background: "var(--bg)",
        border: "0.5px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: 3,
        maxWidth: "100%",
        flexWrap: "wrap",
      }}
    >
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            data-active={active ? "true" : "false"}
            onClick={() => onChange(o.id)}
            style={{
              border: "none",
              boxShadow: active ? "var(--shadow-sm)" : "none",
              borderRadius: "calc(var(--radius) - 3px)",
              padding: "6px 12px",
              background: active ? "var(--fill-accent)" : "transparent",
              color: active ? "var(--on-accent)" : "var(--text-secondary)",
              fontWeight: active ? 600 : 500,
              fontSize: 13,
              cursor: "pointer",
              whiteSpace: "nowrap",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function RangeFilter({ value, onChange, ranges = PANO_RANGES }) {
  return <SegmentedControl value={value} onChange={onChange} options={ranges} />;
}

export const THEME_OPTIONS = [
  {
    id: "light",
    label: (
      <>
        <i className="ti ti-sun" style={{ fontSize: 15 }} aria-hidden="true"></i>
        Açık
      </>
    ),
  },
  {
    id: "dark",
    label: (
      <>
        <i className="ti ti-moon" style={{ fontSize: 15 }} aria-hidden="true"></i>
        Koyu
      </>
    ),
  },
];

export function inRange(dateStr, { start, end }) {
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return false;
  if (start && t < start.getTime()) return false;
  return t <= end.getTime();
}

export function DateRangeFilter({ from, to, onFromChange, onToChange }) {
  // Safari/WebKit (özellikle iOS'a "Ana Ekrana Ekle" ile kurulmuş PWA), Chromium'un
  // aksine boş input[type=date] içine hiçbir yer tutucu ("gg.aa.yyyy") ya da belirgin
  // ikon çizmiyor - başka görsel içerik olmayınca kutu tamamen boş görünüyor ve title
  // (hover) attribute'u da dokunmatik cihazda hiç tetiklenmiyor. Bu yüzden her zaman
  // görünen kısa etiketler gerekiyor, sadece title'a güvenilemiyor.
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Başlangıç</span>
        <input
          type="date"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          style={{ fontSize: 16, padding: "6px 8px" }}
        />
      </label>
      <span style={{ fontSize: 12, color: "var(--text-muted)", paddingBottom: 7 }}>-</span>
      <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Bitiş</span>
        <input
          type="date"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          style={{ fontSize: 16, padding: "6px 8px" }}
        />
      </label>
      {(from || to) && (
        <button
          onClick={() => {
            onFromChange("");
            onToChange("");
          }}
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

    let stored;
    try {
      stored = JSON.parse(localStorage.getItem(SESSION_START_KEY) || "null");
    } catch {
      stored = null;
    }
    const startedAt = stored && stored.userId === session.user.id ? stored.startedAt : Date.now();
    if (!stored || stored.userId !== session.user.id) {
      localStorage.setItem(
        SESSION_START_KEY,
        JSON.stringify({ userId: session.user.id, startedAt }),
      );
    }

    const markActivity = () => {
      localStorage.setItem(SESSION_ACTIVITY_KEY, String(Date.now()));
    };
    markActivity();
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, markActivity));

    const interval = setInterval(() => {
      const now = Date.now();
      const lastActivity = Number(localStorage.getItem(SESSION_ACTIVITY_KEY)) || now;
      if (
        now - lastActivity > SESSION_IDLE_LIMIT_MS ||
        now - startedAt > SESSION_ABSOLUTE_LIMIT_MS
      ) {
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

// ilike/like sorgularında kullanıcıdan gelen bir değeri (örn. oturum e-postası)
// desen olarak geçirmeden önce % ve _ karakterlerini kaçırır - aksi halde bu
// karakterleri içeren bir e-posta adresi (örn. "j_n@x.com") wildcard gibi
// davranıp başka bir kaydı eşleştirebilir.
export function escapeIlikePattern(value) {
  return String(value ?? "").replace(/[\\%_]/g, (c) => `\\${c}`);
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
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="#25D366"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M12.004 2C6.486 2 2.01 6.476 2.01 11.994c0 2.113.652 4.073 1.766 5.688L2 22l4.436-1.744a9.96 9.96 0 0 0 5.568 1.688c5.518 0 9.994-4.476 9.994-9.994C22 6.476 17.522 2 12.004 2zm0 18.06a8.05 8.05 0 0 1-4.318-1.24l-.31-.185-3.204 1.006 1.02-3.127-.204-.322a8.03 8.03 0 0 1-1.238-4.267c0-4.442 3.612-8.054 8.06-8.054 4.44 0 8.05 3.612 8.05 8.054 0 4.44-3.61 8.135-8.056 8.135z" />
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

export function dayAndTime(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  const time = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  if (diff <= 0) return `Bugün, ${time}`;
  if (diff === 1) return `Dün, ${time}`;
  return `${d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}, ${time}`;
}

export const TONE_COLORS = {
  // background daha önce var(--surface-1) idi — bu, kart/tablo satırlarının en
  // yaygın arka plan rengiyle birebir aynı olduğu için (örn. Deals.jsx'teki
  // sevkiyat durumu rozeti, Inventory.jsx/Team.jsx'teki rozetler) Badge kendi
  // zemininde görünmez bir "pill" olarak kalıyordu. var(--border) hem light hem
  // dark temada surface'lerden görsel olarak ayrışıyor.
  default: { background: "var(--border)", color: "var(--text-secondary)" },
  warning: { background: "var(--bg-warning)", color: "var(--text-warning)" },
  success: { background: "var(--bg-success)", color: "var(--text-success)" },
  accent: { background: "var(--bg-accent)", color: "var(--text-accent)" },
  danger: { background: "var(--bg-danger)", color: "var(--text-danger)" },
};

export function Badge({ children, tone = "default" }) {
  return (
    <span
      style={{
        ...TONE_COLORS[tone],
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
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "var(--surface-1)",
                color: "var(--text-secondary)",
                fontSize: 12,
                fontWeight: 500,
                padding: "3px 4px 3px 10px",
                borderRadius: "var(--radius)",
              }}
            >
              {t}
              <button
                type="button"
                onClick={() => onChange(tags.filter((x) => x !== t))}
                aria-label={`${t} etiketini kaldır`}
                style={{
                  width: 16,
                  height: 16,
                  padding: 0,
                  background: "none",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
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
              style={{
                fontSize: 12,
                padding: "2px 8px",
                background: "none",
                border: "1px dashed var(--border)",
                borderRadius: "var(--radius)",
                color: "var(--text-secondary)",
              }}
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
export function IconButton({
  icon,
  label,
  onClick,
  title,
  size = "md",
  active = false,
  type = "button",
  disabled = false,
  ...rest
}) {
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
          ? {
              display: "flex",
              alignItems: "center",
              gap: 4,
              height: box,
              fontSize: 12,
              color: "var(--text-secondary)",
              opacity: disabled ? 0.4 : 1,
              cursor: disabled ? "not-allowed" : "pointer",
            }
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

// Elle sıralanabilir listelerde (Fiyat Listesi, Stok & Malzeme, Özel Alanlar) id'li
// bir öğeyi dizi içinde taşır - yeni bir dizi döner, kaynak diziyi değiştirmez.
export function moveItem(list, id, direction) {
  const idx = list.findIndex((item) => item.id === id);
  if (idx === -1) return list;
  const next = [...list];
  const [item] = next.splice(idx, 1);
  if (direction === "top") next.unshift(item);
  else if (direction === "up") next.splice(Math.max(0, idx - 1), 0, item);
  else next.splice(Math.min(next.length, idx + 1), 0, item);
  return next;
}

// Sürükle-bırak drop anında: sürüklenen öğeyi bırakılan öğenin yanına taşır -
// yön önemli. Her zaman "hedefin önüne" koysaydı, bir öğeyi aşağı sürükleyip
// hemen altındaki komşusuna bırakmak no-op oluyordu (öğe zaten o komşunun
// önündeydi, "önüne koy" onu olduğu yere geri koyuyordu) - kullanıcı "aşağı
// taşıma çalışmıyor" olarak fark etti. Aşağı sürüklerken hedefin ARDINA,
// yukarı sürüklerken hedefin ÖNÜNE konur - ikisi de sezgisel "bıraktığım yere
// otur" davranışını verir.
export function moveBeforeDrop(list, draggedId, targetId) {
  if (draggedId === targetId) return list;
  const draggedIdx = list.findIndex((item) => item.id === draggedId);
  const targetIdxBefore = list.findIndex((item) => item.id === targetId);
  if (draggedIdx === -1 || targetIdxBefore === -1) return list;
  const movingDown = draggedIdx < targetIdxBefore;
  const next = [...list];
  const [item] = next.splice(draggedIdx, 1);
  const targetIdx = next.findIndex((i) => i.id === targetId);
  const insertAt = targetIdx === -1 ? next.length : movingDown ? targetIdx + 1 : targetIdx;
  next.splice(insertAt, 0, item);
  return next;
}

// Masaüstünde sürükle tutamacı yeterli ama mobil/dokunmatikte native HTML5 drag
// çalışmıyor - bu yüzden her satırda ayrıca yukarı/aşağı/en-üste-taşı butonları var.
export function ReorderButtons({ onMoveTop, onMoveUp, onMoveDown, isFirst, isLast }) {
  return (
    <span style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
      <IconButton
        icon="ti-corner-left-up"
        title="En üste taşı"
        size="sm"
        onClick={onMoveTop}
        disabled={isFirst}
      />
      <IconButton
        icon="ti-chevron-up"
        title="Yukarı taşı"
        size="sm"
        onClick={onMoveUp}
        disabled={isFirst}
      />
      <IconButton
        icon="ti-chevron-down"
        title="Aşağı taşı"
        size="sm"
        onClick={onMoveDown}
        disabled={isLast}
      />
    </span>
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
      <i
        className={`ti ${icon}`}
        style={{ fontSize: 18, color: "var(--text-accent)", flexShrink: 0 }}
        aria-hidden="true"
      ></i>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 500 }}>{label}</span>
        {description && (
          <span
            style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}
          >
            {description}
          </span>
        )}
      </span>
      <i
        className="ti ti-chevron-right"
        style={{ fontSize: 16, color: "var(--text-muted)", flexShrink: 0 }}
        aria-hidden="true"
      ></i>
    </button>
  );
}

// Tarayıcının yerleşik konuşma tanıma özelliğiyle metin alanlarına sesle yazma
// (Chrome/Edge destekliyor, Firefox/Safari desteklemiyor — desteklenmiyorsa
// bileşen hiç render olmaz, ücretsiz ve ek kütüphane gerektirmez).
export function VoiceInputButton({ onResult }) {
  const [listening, setListening] = useState(false);
  const SpeechRecognitionCtor =
    typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
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

  return (
    <IconButton
      icon="ti-microphone"
      title="Sesle yaz"
      size="sm"
      active={listening}
      onClick={start}
    />
  );
}

const GOOGLE_CLIENT_ID =
  "1085737573085-om1meeq6h4msv433eo68ef22uutoecm2.apps.googleusercontent.com";

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
  const hashedNonce = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

    return () => {
      cancelled = true;
    };
  }, [onCredential]);

  return <div ref={containerRef} style={{ display: "flex", justifyContent: "center" }} />;
}

export function AuthDivider() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0" }}>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>veya</span>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );
}

// Balon eskiden .info-tip'in İÇİNDE, position:absolute ile açılıyordu — bu
// yüzden bir modal/kart gibi overflow:hidden (veya scroll için overflow-y:auto,
// bu da x eksenini aynı şekilde kırpar) olan HERHANGİ bir üst öğenin içindeyse
// balon görünüm dışına taşan kısmı KIRPILIYORDU (z-index bunu çözmez — overflow
// kırpması z-index'ten önce gelir). Kalıcı çözüm: balonu document.body'ye
// portal'la taşımak — artık hiçbir üst öğenin overflow'undan etkilenmiyor.
// AMA bu tek başına yeterli değil — ikon ekranın (viewport'un) kendisine çok
// yakınsa (örn. modal en üstte, balon uzun) balon artık bir üst öğe tarafından
// değil VIEWPORT'UN kendisi tarafından "kırpılır" (aslında kırpılmaz, sadece
// ekranın dışına taşar, görünmez olur). Bunu önlemek için balon önce OFF-SCREEN
// mount edilip gerçek boyutu ölçülüyor, sonra viewport sınırlarına göre
// placement/align GEREKİRSE otomatik ters çevriliyor/kırpılıyor (useLayoutEffect
// ile — boyama öncesi çalıştığı için kullanıcı yanlış konumu hiç görmüyor).
export function InfoTip({ text, placement = "top", align = "center" }) {
  const iconRef = useRef(null);
  const bubbleRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState(null);

  const show = () => setVisible(true);
  const hide = () => {
    setVisible(false);
    setCoords(null);
  };
  // Dokunmatik ekranlarda (telefon/tablet) hover/focus olayları hiç
  // tetiklenmiyor veya tutarsız tetikleniyor - hover'a dayalı bu bileşen,
  // sitedeki en yaygın "kafa karışıklığını açıkla" aracı olmasına rağmen
  // mobilde fiilen erişilemez kalıyordu. onClick ile aç/kapat eklenip
  // dışarı tıklanınca kapanması sağlanır - masaüstündeki hover davranışı
  // aynen korunur, bu sadece dokunmatik için bir ek yol.
  const toggle = (e) => {
    e.stopPropagation();
    setVisible((v) => !v);
  };

  useEffect(() => {
    if (!visible) return;
    const onDocClick = () => hide();
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [visible]);

  const reposition = () => {
    const iconEl = iconRef.current;
    const bubbleEl = bubbleRef.current;
    if (!iconEl || !bubbleEl) return;
    const rect = iconEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    const bw = bubbleEl.offsetWidth;
    const bh = bubbleEl.offsetHeight;

    let resolvedPlacement = placement;
    if (resolvedPlacement === "top" && rect.top - 7 - bh < margin) resolvedPlacement = "bottom";
    else if (resolvedPlacement === "bottom" && rect.bottom + 7 + bh > vh - margin)
      resolvedPlacement = "top";

    let left =
      align === "right" ? rect.right : align === "left" ? rect.left : rect.left + rect.width / 2;
    let translateX = align === "right" ? "-100%" : align === "left" ? "0" : "-50%";
    const effectiveLeft = align === "right" ? left - bw : align === "left" ? left : left - bw / 2;
    const effectiveRight = effectiveLeft + bw;
    if (effectiveLeft < margin) {
      left = margin;
      translateX = "0";
    } else if (effectiveRight > vw - margin) {
      left = vw - margin;
      translateX = "-100%";
    }

    const top = resolvedPlacement === "bottom" ? rect.bottom + 7 : rect.top - 7;
    const translateY = resolvedPlacement === "bottom" ? "0" : "-100%";
    setCoords({ top, left, transform: `translate(${translateX}, ${translateY})` });
  };

  useLayoutEffect(() => {
    if (!visible) return;
    reposition();
    const onScrollOrResize = () => reposition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <span
      ref={iconRef}
      className="info-tip"
      tabIndex={0}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onClick={toggle}
    >
      <i
        className="ti ti-info-circle"
        style={{ fontSize: 14, color: "var(--text-muted)", cursor: "help" }}
        aria-hidden="true"
      ></i>
      {visible &&
        createPortal(
          <span
            ref={bubbleRef}
            className="info-tip-bubble info-tip-bubble--portal"
            role="tooltip"
            // İlk mount'ta coords henüz yok — ekran dışına (ama ölçülebilir şekilde)
            // konumlanır, reposition() gerçek boyutu ölçüp doğru yere taşır.
            style={
              coords
                ? { top: coords.top, left: coords.left, transform: coords.transform }
                : { top: -9999, left: -9999 }
            }
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}

const COMMON_EMOJIS = [
  "😀",
  "😊",
  "🙂",
  "😉",
  "😂",
  "🥳",
  "😍",
  "😮",
  "😢",
  "😅",
  "👍",
  "👎",
  "🙏",
  "👏",
  "🙌",
  "🤝",
  "💪",
  "👋",
  "✅",
  "❌",
  "❤️",
  "🔥",
  "⭐",
  "🎉",
  "📅",
  "⏰",
  "📌",
  "📞",
  "💬",
  "👀",
];

// Mesajlaşma kutularında emoji eklemek için — OS'in kendi emoji panelleri
// (Win+. / Cmd+Ctrl+Space) zaten çalışır ama bunu bilmeyen kullanıcılar için
// görünür bir buton/panel. Seçilen emoji parent'a bildirilir, metni parent
// tutar — bu bileşen kendi state'ini yönetmez.
export function EmojiPickerButton({ onSelect }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Emoji ekle"
        style={{
          background: "var(--surface-1)",
          border: "0.5px solid var(--border)",
          width: 36,
          height: 36,
          padding: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
        }}
      >
        🙂
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            right: 0,
            marginBottom: 6,
            background: "var(--surface-2)",
            border: "0.5px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: 8,
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: 2,
            boxShadow: "var(--shadow-md)",
            zIndex: 30,
            width: 216,
          }}
        >
          {COMMON_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                onSelect(e);
                setOpen(false);
              }}
              style={{
                background: "none",
                border: "none",
                fontSize: 18,
                padding: 4,
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MetricCard({ label, value, sub, tone, onClick }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{
        background: "var(--surface-1)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
        padding: "1rem",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 4px" }}>{label}</p>
      <p
        style={{
          fontSize: 24,
          fontWeight: 500,
          margin: sub ? "0 0 2px" : 0,
          color: tone ? `var(--text-${tone})` : "var(--text-primary)",
        }}
      >
        {value}
      </p>
      {sub && <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>{sub}</p>}
    </div>
  );
}

const AVATAR_TONES = ["accent", "success", "warning"];

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// Gerçek kullanıcı fotoğrafı/avatar altyapısı yok - isimden türetilen baş
// harf rozeti, sahte veri olmadan kişiye özel görsel ayrım sağlıyor.
export function InitialsAvatar({ name, size = 28 }) {
  const label = (name || "?").trim();
  const parts = label.split(/\s+/).filter(Boolean);
  const initials = parts.length > 1 ? parts[0][0] + parts[1][0] : label.slice(0, 2);
  const tone = AVATAR_TONES[hashString(label) % AVATAR_TONES.length];
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `var(--bg-${tone})`,
        color: `var(--text-${tone})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        fontWeight: 600,
        flexShrink: 0,
        textTransform: "uppercase",
      }}
    >
      {initials.toUpperCase()}
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
        boxShadow: "var(--shadow-md)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        zIndex: 2000,
        maxWidth: "90vw",
      }}
    >
      <i
        className={`ti ${isSuccess ? "ti-circle-check" : "ti-alert-circle"}`}
        style={{ fontSize: 16, flexShrink: 0 }}
        aria-hidden="true"
      ></i>
      <span>{message}</span>
      <IconButton icon="ti-x" title="Kapat" onClick={onClose} size="sm" />
    </div>
  );
}

export function Modal({ title, onClose, wide, children }) {
  return (
    <div
      className="modal-overlay"
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
        className="modal-card"
        style={{
          background: "var(--surface-2)",
          border: "0.5px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "1.25rem",
          width: "100%",
          maxWidth: wide ? 640 : 420,
          margin: "auto",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
            flexShrink: 0,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{title}</h3>
          <IconButton icon="ti-x" title="Kapat" onClick={onClose} size="md" />
        </div>
        <div style={{ overflowY: "auto", overflowX: "hidden", minHeight: 0 }}>{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title = "Emin misiniz?",
  message,
  confirmLabel = "Sil",
  onConfirm,
  onClose,
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <p
        style={{
          fontSize: 14,
          color: "var(--text-secondary)",
          margin: "0 0 20px",
          lineHeight: 1.5,
        }}
      >
        {message}
      </p>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose}>
          Vazgeç
        </button>
        <button
          type="button"
          onClick={onConfirm}
          style={{
            background: "var(--bg-danger)",
            color: "var(--text-danger)",
            border: "none",
            fontWeight: 600,
          }}
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
    if (query && !n.title?.toLowerCase().includes(query) && !n.body?.toLowerCase().includes(query))
      return false;
    return true;
  });

  const openBell = () => {
    setOpen((prev) => !prev);
    if (!open) load();
  };

  const openNotification = async (n) => {
    if (!n.read_at) {
      const readAt = new Date().toISOString();
      await supabase.from("notifications").update({ read_at: readAt }).eq("id", n.id);
      // n.url varsa sayfa zaten degisiyor (state onemsiz olur) ama url'siz bir
      // bildirimde dropdown acik kalmaya devam ediyor - local state guncellenmezse
      // rozet/kalin yazi tipi bir sonraki load()'a kadar (dropdown kapanip
      // acilana dek) yanlislikla "okunmamis" gorunmeye devam ederdi.
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: readAt } : x)));
    }
    if (n.url) window.location.assign(n.url);
    else setOpen(false);
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds);
    setNotifications((prev) =>
      prev.map((n) => (unreadIds.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n)),
    );
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }} data-tour={dataTour}>
      <div style={{ position: "relative" }}>
        <IconButton
          icon={unreadCount > 0 ? "ti-bell-ringing" : "ti-bell"}
          onClick={openBell}
          title="Bildirimler"
          active={open}
        />
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              background: "var(--text-danger)",
              color: "var(--on-accent)",
              fontSize: 10,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 3px",
              pointerEvents: "none",
            }}
          >
            {unreadCount}
          </span>
        )}
      </div>

      {open && (
        <div
          className="notif-dropdown"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: 320,
            maxHeight: 400,
            overflowY: "auto",
            background: "var(--surface-1)",
            border: "0.5px solid var(--border)",
            borderRadius: "var(--radius)",
            boxShadow: "var(--shadow-md)",
            zIndex: 50,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 12px",
              borderBottom: "0.5px solid var(--border)",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600 }}>Bildirimler</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                style={{
                  fontSize: 12,
                  background: "none",
                  border: "none",
                  color: "var(--text-accent)",
                }}
              >
                Tümünü okundu işaretle
              </button>
            )}
          </div>
          {notifications.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                padding: "8px 12px",
                borderBottom: "0.5px solid var(--border)",
              }}
            >
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Bildirimlerde ara..."
                style={{ flex: 1, fontSize: 12, padding: "5px 8px" }}
              />
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                <input
                  type="checkbox"
                  checked={unreadOnly}
                  onChange={(e) => setUnreadOnly(e.target.checked)}
                />
                Okunmamış
              </label>
            </div>
          )}
          {loading ? (
            <p style={{ fontSize: 13, color: "var(--text-secondary)", padding: 16, margin: 0 }}>
              Yükleniyor…
            </p>
          ) : notifications.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)", padding: 16, margin: 0 }}>
              Henüz bildiriminiz yok.
            </p>
          ) : filteredNotifications.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)", padding: 16, margin: 0 }}>
              Aramayla eşleşen bildirim yok.
            </p>
          ) : (
            filteredNotifications.map((n) => (
              <div
                key={n.id}
                onClick={() => openNotification(n)}
                style={{
                  padding: "10px 12px",
                  cursor: "pointer",
                  borderBottom: "0.5px solid var(--border)",
                  background: n.read_at ? "transparent" : "var(--bg-accent)",
                }}
              >
                <p style={{ margin: 0, fontSize: 13, fontWeight: n.read_at ? 500 : 700 }}>
                  {n.title}
                </p>
                {n.body && (
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
                    {n.body}
                  </p>
                )}
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
                  {dayAndTime(n.created_at)}
                </p>
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
  {
    target: null,
    title: "Binerly'ye hoş geldiniz!",
    body: "Sistemi hızlıca tanıtalım, sadece birkaç adım sürecek.",
  },
  {
    target: '[data-tour="tab-pano"]',
    title: "Pano",
    body: "Günlük özet, bugün yapılacaklar ve gelir/kâr grafiğinizi burada görürsünüz.",
  },
  {
    target: '[data-tour="tab-musteri"]',
    title: "Müşteriler",
    body: "Müşterilerinizi buradan ekleyip yönetirsiniz.",
  },
  {
    target: '[data-tour="tab-firsat"]',
    title: "Müşteri Takibi",
    body: "Teklif, randevu veya üyelik süreçlerinizi buradan takip edersiniz.",
  },
  {
    target: '[data-tour="settings-gear"]',
    title: "Ayarlar",
    body: "Sektörünüzü, özel alanlarınızı, fiyat listenizi ve müsaitlik saatlerinizi buradan yönetirsiniz.",
  },
  {
    target: '[data-tour="notification-bell"]',
    title: "Bildirimler",
    body: "Müşteri portaldan bir işlem yaptığında (randevu alma, mesaj vb.) burada anında görürsünüz.",
  },
  {
    target: '[data-tour="tab-destek"]',
    title: "Destek",
    body: "Müşteri destek taleplerini buradan yönetirsiniz.",
  },
  {
    target: '[data-tour="tab-finans"]',
    title: "Finans",
    body: "Gelir-Gider Defteri, tahsilatlar ve KDV Özet Raporu'nu burada görürsünüz.",
  },
  {
    target: '[data-tour="ask-bubble"]',
    title: "Soru Sor",
    body: 'Sağ alttaki baloncuktan istediğiniz zaman sorabilirsiniz - kendi verileriniz, "nasıl yapılır" rehberleri veya genel işletme tavsiyesi, hepsi tek arama kutusunda.',
  },
  {
    target: null,
    title: "Hepsi bu kadar!",
    body: "İstediğiniz zaman Ayarlar'dan turu tekrar başlatabilirsiniz.",
  },
];

export function OnboardingTour({ step, dealNavLabel, dealTourBody, onStepChange, onClose }) {
  const [rect, setRect] = useState(null);
  // "Müşteri Takibi" sekmesi artık sektöre göre Teklifler/Randevular/Üyelikler/
  // Rezervasyonlar olarak adlanıyor — shared.jsx döngüsel import olmadan Sectors.jsx'i
  // (dealWordKind) kullanamadığı için, gerçek adı App.jsx zaten hesaplayıp prop olarak
  // geçiyor (bkz. dealWords.navLabel/tourBody). Otel'de title "Rezervasyonlar" olurken
  // body sabit "Teklif, randevu veya üyelik..." kalıyordu (rezervasyon hiç geçmiyordu) —
  // body de artık aynı şekilde dinamik.
  const current =
    step === 3 && dealNavLabel
      ? { ...TOUR_STEPS[step], title: dealNavLabel, body: dealTourBody || TOUR_STEPS[step].body }
      : TOUR_STEPS[step];

  useEffect(() => {
    const measure = () => {
      if (!current.target) {
        setRect(null);
        return;
      }
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
          boxShadow: "var(--shadow-md)",
          padding: "14px 16px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 6,
          }}
        >
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{current.title}</p>
          <IconButton icon="ti-x" title="Turu kapat" onClick={onClose} size="sm" />
        </div>
        <p
          style={{
            margin: "0 0 12px",
            fontSize: 13,
            color: "var(--text-secondary)",
            lineHeight: 1.5,
          }}
        >
          {current.body}
        </p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {step + 1}/{TOUR_STEPS.length}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            {step > 0 && (
              <button type="button" onClick={() => onStepChange(step - 1)} style={{ fontSize: 12 }}>
                Geri
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? onClose() : onStepChange(step + 1))}
              style={{
                fontSize: 12,
                background: "var(--fill-accent)",
                color: "var(--on-accent)",
                border: "none",
              }}
            >
              {isLast ? "Bitir" : "İleri"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// Müşterinin kendi kendine aldığı randevu için iki olası kaynak: müşteri
// portalından giriş yapıp alan (bookAppointment, "portal") veya hiç kaydı
// olmadan /randevu-al/{token} public widget'ından alan ("randevu_widget",
// lead-capture.js). İkisi de aynı "KOBİ'nin henüz dokunmadığı, gözden
// kaçmaması gereken talep" muamelesini görür. api/send-push.js'te AYNI liste
// ayrıca tutuluyor (src/ ile api/ arasında paylaşılan import yok) — biri
// değişirse diğeri de güncellenmeli.
export const SELF_BOOKED_SOURCES = ["portal", "randevu_widget"];

export function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const MAX_TEAM_SIZE = 5;

// deals.custom_fields'teki datetime-local değeri saat dilimi bilgisi taşımaz
// (örn. "2026-07-20T14:00") — bu proje sadece Türkiye için, +03:00 olarak
// yorumlanır (api/send-appointment-reminders.js'teki aynı yaklaşım).
export function parseAppointmentDateTime(raw) {
  if (typeof raw !== "string" || raw.length < 16) return null;
  const d = new Date(`${raw.slice(0, 16)}:00+03:00`);
  return isNaN(d.getTime()) ? null : d;
}

function minutesOfDay(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function formatBreakDuration(minutes) {
  if (minutes % 60 === 0) return `${minutes / 60} saat`;
  if (minutes < 60) return `${minutes} dk`;
  return `${Math.floor(minutes / 60)} saat ${minutes % 60} dk`;
}

// Öğle arasıyla ikiye bölünmüş bir günü ("09:00-12:00" + "13:00-18:00") ayrı
// ayrı satır yerine tek bir birleşik aralık + mola listesi olarak özetler.
// Pencereler arasında GERÇEK bir boşluk yoksa (art arda bitiş=başlangıç ya da
// tek pencere) breaks boş döner — her çok-pencereli gün öğle arası anlamına
// gelmiyor (bkz. gece vardiyası gibi kesintisiz art arda pencereler).
export function summarizeTimeWindows(windows) {
  if (!windows || windows.length === 0) return null;
  const sorted = [...windows].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const outerStart = sorted[0].startTime;
  const outerEnd = sorted.reduce(
    (max, w) => (w.endTime > max ? w.endTime : max),
    sorted[0].endTime,
  );
  const breaks = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].endTime < sorted[i + 1].startTime) {
      const start = sorted[i].endTime;
      const end = sorted[i + 1].startTime;
      breaks.push({
        start,
        end,
        durationLabel: formatBreakDuration(minutesOfDay(end) - minutesOfDay(start)),
      });
    }
  }
  return { rangeLabel: `${outerStart}-${outerEnd}`, breaks };
}

// summarizeTimeWindows'un tek satırlık metin hali: "09:00-18:00 (12:00-13:00
// arası 1 saat mola)". Metin sığdırma kısıtı olmayan yerlerde (liste satırı,
// ipucu metni) kullanılır; dar ızgara hücrelerinde summarizeTimeWindows'u
// doğrudan kullanıp aralık/mola'yı ayrı satırlara koymak daha okunur olur.
export function formatTimeWindowsSummary(windows) {
  const summary = summarizeTimeWindows(windows);
  if (!summary) return "";
  if (summary.breaks.length === 0) return summary.rangeLabel;
  const breakLabels = summary.breaks.map(
    (b) => `${b.start}-${b.end} arası ${b.durationLabel} mola`,
  );
  return `${summary.rangeLabel} (${breakLabels.join(", ")})`;
}

// Müşteriye (portal/widget) gösterilen çalışma saatleri - mola/öğle arası KOBİ'yi
// ilgilendirir, müşteriye göstermeyiz; sadece açık pencereleri listeleriz
// ("09:00-12:00, 13:00-18:00").
export function formatWorkingHoursPlain(windows) {
  if (!windows || windows.length === 0) return "";
  return [...windows]
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map((w) => `${w.startTime}-${w.endTime}`)
    .join(", ");
}

// "HH:MM" + dakika kayması -> "HH:MM". Randevu alma ekranlarında "kapanışa
// hizmet süresi kadar kala" son başlangıç saatini hesaplamak için.
export function shiftTimeStr(hhmm, deltaMinutes) {
  if (!hhmm) return hhmm;
  const total = minutesOfDay(hhmm) + deltaMinutes;
  if (total < 0) return "00:00";
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Müşteri Takibi satırındaki tekil ikon butonları (PDF, onay linki, tahsilat,
// kopyala, düzenle, sil...) sayı arttıkça (seans/paket alanlarıyla 7'ye kadar
// çıkabiliyordu) sıkışık ve okunaksız hale geliyordu. Tek bir "..." menüsünde
// yazılı etiketlerle toplanıyor — NotificationBell'deki aynı dışa-tıkla-kapat
// deseni kullanılıyor.
export function RowActionsMenu({ items }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const visibleItems = items.filter(Boolean);

  // Menü eskiden butonun içinde position:absolute ile açılıyordu — tablo
  // gövdesi gibi overflow-y:auto olan bir üst öğe içindeyse menü kırpılıp
  // görünmez oluyordu (InfoTip'te yaşanan aynı kök neden, bkz. shared.jsx
  // InfoTip). document.body'ye portal + fixed konumlandırma ile üst öğe
  // overflow'undan bağımsız hale getiriliyor.
  const reposition = () => {
    const btnEl = buttonRef.current;
    const menuEl = menuRef.current;
    if (!btnEl || !menuEl) return;
    const rect = btnEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    const mw = menuEl.offsetWidth;
    const mh = menuEl.offsetHeight;

    let top = rect.bottom + 4;
    if (top + mh > vh - margin) top = Math.max(margin, rect.top - 4 - mh);

    let right = vw - rect.right;
    if (vw - right - mw < margin) right = Math.max(margin, vw - mw - margin);

    setCoords({ top, right });
  };

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    const onScrollOrResize = () => reposition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (buttonRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (visibleItems.length === 0) return null;

  return (
    <div ref={buttonRef} style={{ display: "inline-block" }}>
      <IconButton
        icon="ti-dots-vertical"
        title="İşlemler"
        onClick={() => setOpen((v) => !v)}
        active={open}
      />
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              // İlk mount'ta coords henüz yok — ekran dışına (ama ölçülebilir
              // şekilde) konumlanır, reposition() gerçek boyutu ölçüp doğru yere taşır.
              top: coords ? coords.top : -9999,
              right: coords ? coords.right : -9999,
              minWidth: 210,
              background: "var(--surface-1)",
              border: "0.5px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-md)",
              zIndex: 2000,
              overflow: "hidden",
            }}
          >
            {visibleItems.map((item, i) => (
              <div
                key={item.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  borderBottom: i < visibleItems.length - 1 ? "0.5px solid var(--border)" : "none",
                }}
              >
                <button
                  type="button"
                  disabled={item.disabled}
                  title={item.title}
                  onClick={() => {
                    item.onClick();
                    setOpen(false);
                  }}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "9px 12px",
                    background: "none",
                    border: "none",
                    borderRadius: 0,
                    textAlign: "left",
                    fontSize: 13,
                    color: item.danger ? "var(--text-danger)" : "var(--text-primary)",
                    opacity: item.disabled ? 0.4 : 1,
                    cursor: item.disabled ? "not-allowed" : "pointer",
                  }}
                >
                  <i
                    className={`ti ${item.icon}`}
                    style={{ fontSize: 15, flexShrink: 0 }}
                    aria-hidden="true"
                  ></i>
                  {item.label}
                </button>
                {/* Buton İÇİNE değil YANINA konuyor - aksi halde tıklamak (özellikle
                  dokunmatik) native DOM bubble ile butonun onClick'ini de tetikler. */}
                {item.info && (
                  <div style={{ paddingRight: 10, flexShrink: 0 }}>
                    <InfoTip text={item.info} align="right" />
                  </div>
                )}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function AttachmentList({
  entityType,
  entityId,
  attachments,
  onUpload,
  onDownload,
  onDelete,
  onToggleShare,
}) {
  const [uploading, setUploading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const items = attachments.filter((a) => a.entityType === entityType && a.entityId === entityId);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    await onUpload(entityType, entityId, file);
    setUploading(false);
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <label
        style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}
      >
        Dosyalar
      </label>
      {items.length === 0 && (
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 6px" }}>
          Henüz dosya eklenmedi.
        </p>
      )}
      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
          {items.map((a) => (
            <div
              key={a.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                fontSize: 12.5,
                background: "var(--surface-1)",
                border: "0.5px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "6px 10px",
                flexWrap: "wrap",
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {a.fileName}{" "}
                <span style={{ color: "var(--text-muted)" }}>· {formatFileSize(a.fileSize)}</span>
                {a.sharedWithCustomer && (
                  <span style={{ marginLeft: 6 }}>
                    <Badge tone="accent">Müşteriyle paylaşıldı</Badge>
                  </span>
                )}
              </span>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {entityType === "deals" && onToggleShare && (
                  <button
                    type="button"
                    onClick={() => onToggleShare(a.id, !a.sharedWithCustomer)}
                    style={{ fontSize: 12 }}
                  >
                    {a.sharedWithCustomer ? "Paylaşımı Kaldır" : "Müşteriyle Paylaş"}
                  </button>
                )}
                <button type="button" onClick={() => onDownload(a)} style={{ fontSize: 12 }}>
                  İndir
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(a.id)}
                  style={{ fontSize: 12, color: "var(--text-danger)" }}
                >
                  Sil
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <label
        style={{
          background: "var(--surface-1)",
          border: "0.5px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "6px 12px",
          fontSize: 12.5,
          cursor: uploading ? "default" : "pointer",
          display: "inline-block",
        }}
      >
        {uploading ? "Yükleniyor…" : "+ Dosya Ekle"}
        <input type="file" onChange={handleFile} disabled={uploading} style={{ display: "none" }} />
      </label>
      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>En fazla 10 MB.</p>
      {confirmDeleteId && (
        <ConfirmDialog
          title="Dosya silinsin mi?"
          message="Bu dosya çöp kutusuna taşınır."
          onConfirm={() => {
            onDelete(confirmDeleteId);
            setConfirmDeleteId(null);
          }}
          onClose={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}

export const PRICE_ITEM_NAME_EXAMPLES = {
  emlak: "Ekspertiz Hizmeti",
  dijital_ajans: "Sosyal Medya Yönetimi (Aylık)",
  saglik_klinik: "Muayene",
  uretim_satis: "Toptan Palet",
  hizmet_danismanlik: "Saatlik Danışmanlık",
  perakende: "Standart Paket",
  guzellik_bakim: "Manikür",
  spor_merkezi: "Aylık Üyelik",
  egitim_kurs: "Aylık Yabancı Dil Paketi",
  sanayi_esnaf: "Yağ Bakımı",
  otel: "Standart Oda (Gecelik)",
};

export function ExportSelectionModal({
  title,
  items,
  columns,
  filename,
  getLabel,
  getRow,
  getPaymentStatus,
  onClose,
}) {
  const [query, setQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [selected, setSelected] = useState(() => new Set(items.map((i) => i.id)));

  const queryLower = query.trim().toLowerCase();
  const filtered = items.filter((i) => {
    if (getPaymentStatus && paymentFilter !== "all" && getPaymentStatus(i) !== paymentFilter)
      return false;
    return !queryLower || getLabel(i).toLowerCase().includes(queryLower);
  });
  const allVisibleSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id));
  const selectedItems = items.filter((i) => selected.has(i.id));

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filtered.forEach((i) => next.delete(i.id));
      else filtered.forEach((i) => next.add(i.id));
      return next;
    });
  };

  return (
    <Modal title={title} onClose={onClose}>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 12px" }}>
        Arayıp istediklerinizi seçin - hepsini dışa aktarabilir, ya da tek bir kaydı bile seçip
        sadece onu indirebilirsiniz.
      </p>
      <div
        className="list-toolbar"
        style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ara..."
          style={{ flex: 1, minWidth: 140, fontSize: 13 }}
        />
        {getPaymentStatus && (
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            style={{ fontSize: 13 }}
          >
            <option value="all">Tüm ödeme durumları</option>
            <option value="odendi">Ödendi</option>
            <option value="kismi">Kısmi ödeme</option>
            <option value="odenmedi">Ödenmedi</option>
          </select>
        )}
      </div>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12.5,
          color: "var(--text-secondary)",
          padding: "2px 0 6px",
          cursor: filtered.length === 0 ? "default" : "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={allVisibleSelected}
          disabled={filtered.length === 0}
          onChange={toggleAllVisible}
        />
        Görünen {filtered.length} kaydın tümünü seç / kaldır
      </label>
      <div
        style={{
          maxHeight: 260,
          overflowY: "auto",
          border: "0.5px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: 8,
          marginBottom: 12,
        }}
      >
        {filtered.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: 0 }}>
            Filtreye uyan kayıt yok.
          </p>
        ) : (
          filtered.map((item) => (
            <label
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                padding: "4px 0",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                onChange={() => toggle(item.id)}
              />
              {getLabel(item)}
            </label>
          ))
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
          {selectedItems.length} kayıt seçili
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onClose}>
            Vazgeç
          </button>
          <button
            type="button"
            disabled={selectedItems.length === 0}
            onClick={() => {
              downloadXlsx(filename, columns, selectedItems.map(getRow));
              onClose();
            }}
            style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
          >
            {selectedItems.length} kaydı indir
          </button>
        </div>
      </div>
    </Modal>
  );
}

export const SECTORS = [
  "İnşaat",
  "Medikal / Sağlık",
  "Gıda",
  "Tekstil",
  "Elektrik / Elektronik",
  "Otomotiv",
  "Mobilya",
  "Perakende / Mağazacılık",
  "Toptan Ticaret",
  "Lojistik / Nakliye",
  "Turizm / Otelcilik",
  "Eğitim",
  "Danışmanlık",
  "Hukuk",
  "Muhasebe / Mali Müşavirlik",
  "Bilişim / Yazılım",
  "Reklam / Pazarlama",
  "Emlak",
  "Güzellik / Kuaförlük",
  "Temizlik",
  "Güvenlik",
  "Ambalaj",
  "Kimya",
  "Metal / Makine",
  "Enerji",
  "Tarım",
  "Sigorta",
  "Finans / Bankacılık",
  "Spor",
  "Sanat / Kültür",
  "Diğer",
];
