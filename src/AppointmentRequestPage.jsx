import { useState, useEffect } from "react";

// Kamuya açık, giriş gerektirmeyen randevu talebi sayfası — /randevu-al/{token}.
// LeadCapturePage ile AYNI token'ı, AYNI /api/lead-capture uç noktasını kullanır
// (Vercel Hobby'nin 12 fonksiyon sınırı zaten dolu olduğu için ayrı bir api/*.js
// açılmadı) — dateTime/dateTimeKey gönderilmezse /lead/ formuyla davranışı
// birebir aynıdır, burada sadece randevu alanları eklenerek POST edilir.

// CustomerPortal.jsx'teki AYNI fonksiyon (kasıtlı kopya, import EDİLMEDİ —
// oradan tek bir yardımcı fonksiyon için import etmek, route bazlı kod
// bölmenin tüm amacını (bu public sayfanın CustomerPortal'ın koca paketini
// hiç indirmemesi) boşa çıkarıyordu, build çıktısında doğrulandı). Europe/Istanbul
// takvim gününü doğrudan hesaplar — new Date(...) ile dolaylı çeviri, gece
// yarısından sonraki ilk saatlerde (UTC+3 farkı) günü bir geriye kaydırıyordu.
function istanbulDateStr(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

// shared.jsx'teki isValidPhone ile AYNI mantığın kopyası (route bazlı kod
// bölme, bkz. istanbulDateStr'daki aynı gerekçe) — api/lead-capture.js zaten
// aynı kontrolü sunucu tarafında da uyguluyor, burası sadece hızlı geri
// bildirim için.
function isValidPhone(phone) {
  const digits = (phone || "").replace(/\D/g, "").replace(/^90/, "").replace(/^0/, "");
  return /^[2-5]\d{9}$/.test(digits);
}

// "YYYY-MM-DD" -> "Sal", "15" gibi kısa gün/tarih etiketleri - müsaitlik
// şeridindeki her gün butonu için. Öğlen saatiyle (12:00 UTC) parse edilir,
// gece yarısı yakınında gün kaymasın diye (bkz. istanbulDateStr'daki AYNI risk).
function shortDayLabel(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat("tr-TR", { weekday: "short" }).format(d);
  return { weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1), day: String(d.getUTCDate()) };
}

// api/appointment-availability.js'teki AYNI ISO haftagünü hesaplama (kasıtlı
// kopya, Pazartesi=1..Pazar=7) - business_hours.weekday ile AYNI kodlama.
function isoWeekdayOf(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const jsWeekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return jsWeekday === 0 ? 7 : jsWeekday;
}

// requestOnlyMode'da gerçek slot/doluluk hiç gösterilmiyor ama işletmenin
// AÇIK OLDUĞU saatler doluluk bilgisi değil - saat tercihi alanına "gece
// 03:00" gibi anlamsız girişleri engelleyen bir min/max + görünür bir ipucu
// için kullanılır (bkz. api/lead-capture.js businessHours alanı).
function windowsForWeekday(businessHours, dateStr) {
  if (!dateStr) return [];
  const weekday = isoWeekdayOf(dateStr);
  return (businessHours || []).filter((h) => h.weekday === weekday).sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function minutesOfDayLocal(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// "HH:MM" + dakika kayması -> "HH:MM" (shared.jsx shiftTimeStr kopyası, aynı
// gerekçeyle import edilmedi - bkz. istanbulDateStr).
function shiftTimeLocal(hhmm, deltaMinutes) {
  if (!hhmm) return hhmm;
  const total = minutesOfDayLocal(hhmm) + deltaMinutes;
  if (total < 0) return "00:00";
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// Müşteriye gösterilen çalışma saatleri - mola/öğle arası KOBİ'yi ilgilendirir,
// müşteriye göstermeyiz; sadece açık pencereleri listeleriz
// ("09:00-12:00, 13:00-18:00"). shared.jsx formatWorkingHoursPlain kopyası.
function formatWindowsSummary(windows) {
  if (!windows || windows.length === 0) return "";
  return [...windows]
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map((w) => `${w.startTime}-${w.endTime}`)
    .join(", ");
}

// shared.jsx'teki getPortalUrl ile AYNI mantık (kasıtlı kopya, aynı gerekçeyle
// import edilmedi - bkz. istanbulDateStr). Portale davet, randevu alan kişiye
// zorunlu değil sadece opsiyonel bir bağlantı olarak gösteriliyor.
function portalUrlFor() {
  const host = window.location.hostname;
  if (host.split(".")[0] === "portal") return window.location.origin + "/";
  if (host === "binerly.com" || host === "www.binerly.com") return "https://portal.binerly.com/";
  return window.location.origin + "/portal";
}

export default function AppointmentRequestPage() {
  const token = window.location.pathname.split("/")[2] || "";
  const portalUrl = portalUrlFor();
  const [company, setCompany] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const todayStr = istanbulDateStr(new Date());
  const maxDateStr = istanbulDateStr(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));
  // company.widgetMode "request_only" ise (bkz. AppointmentPolicies.jsx
  // AppointmentRequestModeBox) işletmenin doluluk/müsaitlik bilgisi HİÇ
  // çekilmez/gösterilmez - müşteri sadece gün + sıralı saat tercihi bırakır,
  // KOBİ Pano'dan uygun olanı seçip tek bir teklif gönderir.
  const requestOnlyMode = company?.widgetMode === "request_only";
  const [serviceIds, setServiceIds] = useState([]);
  const [date, setDate] = useState(todayStr);
  const [slots, setSlots] = useState([]);
  const [dateTimeKey, setDateTimeKey] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [dayOverview, setDayOverview] = useState(null); // [{ date, slotCount }] - hangi günlerde boşluk olduğunu tek tek denemeden görebilsinler diye
  // requestOnlyMode'da kullanılır - en fazla 3, sıralı ("1. tercih" en yüksek
  // öncelikli). Boş string'ler gönderilmeden önce submit'te filtrelenir.
  const [timePrefs, setTimePrefs] = useState([""]);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  // Bot tuzağı - ekranda görünmez, gerçek kullanıcı doldurmaz (bkz.
  // api/lead-capture.js HONEYPOT_FIELD).
  const [website, setWebsite] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [deposit, setDeposit] = useState(null); // { approvalToken, depositAmount }
  const [payingDeposit, setPayingDeposit] = useState(false);
  const [depositError, setDepositError] = useState("");
  // Bekleme listesi ("bu gün için beni haberdar et") - hangi tarih için
  // katıldığını tutar, aynı günde tekrar tıklayınca ikinci kayıt açılmasın diye.
  const [waitlistedDate, setWaitlistedDate] = useState(null);
  const [joiningWaitlist, setJoiningWaitlist] = useState(false);
  const [waitlistError, setWaitlistError] = useState("");

  useEffect(() => {
    if (!token) { setLoading(false); setError("Geçersiz bağlantı."); return; }
    fetch(`/api/lead-capture?token=${encodeURIComponent(token)}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) { setError(data.error || "Bulunamadı."); setLoading(false); return; }
        setCompany(data);
        setLoading(false);
      })
      .catch(() => { setError("Yüklenemedi."); setLoading(false); });
  }, [token]);

  // Sekme başlığı: müşteri işletmenin adını görmeli - index.html'in varsayılanı
  // "Binerly - CRM | Müşteri Takibi, Satış..." beyaz-etiket hissini bozar.
  useEffect(() => {
    if (company?.companyName) document.title = `${company.companyName} - Randevu Al`;
  }, [company?.companyName]);

  useEffect(() => {
    if (requestOnlyMode || !company?.acceptsAppointments || !company?.businessUserId || !date) return;
    setLoadingSlots(true);
    setSlotsError("");
    setSelectedTime("");
    // serviceIds, sunucunun toplam süreyi hesaplayıp (candidateDuration) sadece
    // TAM saat eşleşmesine değil gerçek aralık çakışmasına bakmasını sağlar -
    // seçim değişince (hizmet eklenip/çıkarılınca) liste yeniden hesaplanmalı,
    // bkz. api/appointment-availability.js computeDaySlots.
    const serviceQuery = serviceIds.length ? `&serviceIds=${encodeURIComponent(serviceIds.join(","))}` : "";
    fetch(`/api/appointment-availability?businessUserId=${company.businessUserId}&date=${date}${serviceQuery}`)
      .then(async (r) => {
        // Gövde JSON değilse (502/504 HTML sayfası) r.json() ham SyntaxError
        // fırlatır ve o metin müşteriye aynen görünürdü - sabit metne düşür,
        // sadece sunucunun kontrollü { error } mesajını göster.
        const data = await r.json().catch(() => null);
        if (!r.ok) { setSlots([]); setSlotsError(data?.error || "Müsait saatler alınamadı."); return; }
        setSlots(data?.slots || []);
        setDateTimeKey(data?.dateTimeKey || null);
      })
      .catch(() => { setSlots([]); setSlotsError("Müsait saatler şu an alınamadı, lütfen birazdan tekrar deneyin."); })
      .finally(() => setLoadingSlots(false));
  }, [requestOnlyMode, company?.acceptsAppointments, company?.businessUserId, date, serviceIds]);

  // Önümüzdeki 14 günün boş saat sayısını TEK istekte çeker - müşteri hangi
  // günün müsait olduğunu tek tek tarih deneyerek bulmak zorunda kalmasın.
  // date state'inden bağımsız ama serviceIds'e bağımlı - hizmet seçilmeden
  // önce varsayılan (adım) süreyle hesaplanan sayı, seçim değişince o hizmetin
  // gerçek süresine göre yeniden hesaplanmazsa rozet olduğundan iyimser kalabilir
  // (ör. "5 boş" görünür ama 90dk'lık hizmet için gerçekte daha az yer sığar).
  useEffect(() => {
    if (requestOnlyMode || !company?.acceptsAppointments || !company?.businessUserId) return;
    const serviceQuery = serviceIds.length ? `&serviceIds=${encodeURIComponent(serviceIds.join(","))}` : "";
    fetch(`/api/appointment-availability?businessUserId=${company.businessUserId}&overview=14${serviceQuery}`)
      .then((r) => r.json())
      .then((data) => setDayOverview(data.days || []))
      .catch(() => setDayOverview([]));
  }, [requestOnlyMode, company?.acceptsAppointments, company?.businessUserId, serviceIds]);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !email.trim()) {
      setSubmitError("İsim, telefon ve e-posta gerekli.");
      return;
    }
    if (!isValidPhone(phone)) {
      setSubmitError("Geçerli bir telefon numarası girin.");
      return;
    }
    const cleanPrefs = timePrefs.filter(Boolean);
    if (requestOnlyMode ? cleanPrefs.length === 0 || closedToday : !selectedTime || !dateTimeKey) {
      setSubmitError(closedToday ? "İşletme bu gün kapalı, lütfen başka bir gün seçin." : "Lütfen en az bir saat girin.");
      return;
    }
    if (requestOnlyMode && dayMinTime && dayClose && cleanPrefs.some((t) => t < dayMinTime || (selectedDuration > 0 && minutesOfDayLocal(t) + selectedDuration > minutesOfDayLocal(dayClose)))) {
      setSubmitError(`Lütfen çalışma saatleri içinde ve kapanışa hizmet süresi kadar kala bir saat seçin (${formatWindowsSummary(dayWindows)}).`);
      return;
    }
    setSubmitError("");
    setSending(true);
    try {
      const res = await fetch("/api/lead-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token, name, phone, email, note, marketingConsent, website,
          serviceIds: serviceIds.length ? serviceIds : undefined,
          ...(requestOnlyMode
            ? { requestedDate: date, timePreferences: cleanPrefs }
            : { dateTime: `${date}T${selectedTime}:00`, dateTimeKey }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setSubmitError(data.error || "Gönderilemedi."); setSending(false); return; }
      // Randevu kaydı her durumda oluşmuş oluyor (kapora bekleniyor olsa bile) -
      // ödeme yarıda kalırsa bile işletme talebi kaybetmiyor.
      if (data.needsDeposit) {
        setDeposit({ approvalToken: data.approvalToken, depositAmount: data.depositAmount });
      } else {
        setDone(true);
      }
    } catch {
      setSubmitError("Bağlantı hatası, lütfen tekrar deneyin. İnternet bağlantınızı kontrol edin.");
    }
    setSending(false);
  };

  // Grup dersi Yedek Liste'siyle AYNI ilke: açık rızalı, sadece kendi isteğiyle
  // katılan bildirim alır (bkz. sql/2026-08-12_appointment_waitlist.sql).
  // İsim/iletişim alanları formun altında zaten var - burada tekrar sorulmaz.
  const joinWaitlist = async () => {
    if (!name.trim() || !phone.trim() || !email.trim()) {
      setWaitlistError("Önce aşağıya isim, telefon ve e-postanızı yazın.");
      return;
    }
    if (!isValidPhone(phone)) {
      setWaitlistError("Geçerli bir telefon numarası girin.");
      return;
    }
    setWaitlistError("");
    setJoiningWaitlist(true);
    try {
      const res = await fetch("/api/lead-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, phone, email, marketingConsent, waitlistDate: date, website }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setWaitlistError(data.error || "Gönderilemedi."); setJoiningWaitlist(false); return; }
      setWaitlistedDate(date);
    } catch {
      setWaitlistError("Bağlantı hatası, lütfen tekrar deneyin.");
    }
    setJoiningWaitlist(false);
  };

  const payDeposit = async () => {
    if (!deposit) return;
    setDepositError("");
    setPayingDeposit(true);
    try {
      const res = await fetch("/api/deal-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: deposit.approvalToken, action: "deposit-checkout-init" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.paymentPageUrl) {
        setDepositError(data.error || "Ödeme başlatılamadı, lütfen tekrar deneyin.");
        setPayingDeposit(false);
        return;
      }
      window.location.href = data.paymentPageUrl;
    } catch {
      setDepositError("Bağlantı hatası, lütfen tekrar deneyin.");
      setPayingDeposit(false);
    }
  };

  // 0 TL'lik bir fiyat kalemi zaten "ücretsiz" demek - ayrı bir "deneme" alanı
  // eklemek yerine bu sinyali widget'ta öne çıkarıyoruz (yeni kolon yok).
  // Ücretsiz kalemler kendi buton bölümünde ayrıca gösterildiği için normal
  // listeden çıkarılır - aksi halde aynı hizmet iki yerde birden görünür.
  const freeServices = (company?.services || []).filter((s) => Number(s.price) === 0);
  const paidServices = (company?.services || []).filter((s) => Number(s.price) !== 0);
  // Hizmet seçilmeden gün/saat seçilirse süre varsayılan adıma göre hesaplanır,
  // sonradan hizmet seçilince (gerçek süresi farklıysa) saat listesi sessizce
  // değişip müşteriyi şaşırtabiliyordu. Tanımlı hizmet varsa müşteri önce en az
  // birini seçmeden gün/saat adımına hiç geçemez - süre hep doğru baştan bilinir.
  // Hiç hizmet tanımlı değilse (KOBİ fiyat listesi hiç kullanmıyor) bu kısıt
  // anlamsız, eski akış (doğrudan gün/saat) aynen korunur.
  const hasServices = freeServices.length > 0 || paidServices.length > 0;
  const canPickTime = !hasServices || serviceIds.length > 0;
  // requestOnlyMode'da saat tercihi alanına makul bir min/max + görünür bir
  // ipucu koymak için - KOBİ hiç Müsaitlik Saatleri tanımlamadıysa (hoursConfigured
  // false) hiçbir kısıt uygulanmaz, elimizde veri yok demektir.
  const hoursConfigured = (company?.businessHours || []).length > 0;
  const dayWindows = windowsForWeekday(company?.businessHours, date);
  const closedToday = hoursConfigured && dayWindows.length === 0;
  const dayMinTime = dayWindows.length ? dayWindows[0].startTime : undefined;
  const dayClose = dayWindows.length ? dayWindows.reduce((max, w) => (w.endTime > max ? w.endTime : max), dayWindows[0].endTime) : undefined;
  // api/lead-capture.js'teki groupedDurationMinutes ile AYNI ilke (kasıtlı
  // kopya) - aynı parallel_group'taki hizmetler MAX (eşzamanlı), farklı
  // gruptaki/grupsuz hizmetler SUM (ardışık) alınır. Sunucunun booking anında
  // gerçekte ayıracağı süreyle tutarlı görünsün diye burada da uygulanıyor.
  const selectedDuration = (() => {
    const groups = new Map();
    (company?.services || [])
      .filter((s) => serviceIds.includes(s.id))
      .forEach((s, i) => {
        const key = s.parallel_group || `__solo_${s.id ?? i}`;
        groups.set(key, Math.max(groups.get(key) || 0, Number(s.duration_minutes) || 0));
      });
    return [...groups.values()].reduce((sum, v) => sum + v, 0);
  })();
  // Hizmet süresi kapanışı aşan bir başlangıç saati seçilemesin (kapanış 18:00,
  // süre 60 dk ise en geç 17:00).
  const dayMaxTime =
    dayClose && selectedDuration > 0 ? shiftTimeLocal(dayClose, -selectedDuration) : dayClose;

  const toggleService = (id) => {
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // KOBİ'nin fiyat listesinde ücretsiz kalemi zaten "Ücretsiz ..." diye
  // adlandırmış olması sık görülüyor - butonun kendisi de "- Ücretsiz" ekliyor,
  // ikisi üst üste bindiğinde tekrar görünüyor. Kelimeyi ismin içinden söküp
  // gösterim tarafında tekilleştiriyoruz, fiyat listesindeki gerçek isme dokunmuyoruz.
  const stripFreeWord = (name) => {
    // \b regex sınırı Türkçe "ü" harfini \w saymadığı için kelime başındaki
    // "Ücretsiz"i yakalamıyor (2026-08-01, canlı testte görüldü) - kelime bazlı
    // bölme/karşılaştırma bu sorunu tamamen atlıyor.
    const words = (name || "").split(/\s+/).filter((w) => w && w.localeCompare("ücretsiz", "tr", { sensitivity: "base" }) !== 0);
    return words.join(" ").trim() || name || "";
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f5f8fc", fontFamily: "system-ui, -apple-system, sans-serif", padding: "1rem" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "2.25rem 2rem", width: "100%", maxWidth: 420, border: "1px solid #e1e8f0", boxShadow: "0 20px 60px rgba(12,37,64,0.08)" }}>
        {loading ? (
          <p style={{ textAlign: "center", color: "#5b7088" }}>Yükleniyor…</p>
        ) : error ? (
          <p style={{ textAlign: "center", color: "#b91c1c" }}>{error}</p>
        ) : deposit ? (
          <>
            <p style={{ textAlign: "center", color: "#0c2540", fontWeight: 600, marginBottom: 8 }}>
              Randevu talebiniz alındı.
            </p>
            <p style={{ textAlign: "center", color: "#5b7088", fontSize: 14, marginBottom: 20 }}>
              Randevunuzu onaylamak için <strong>{deposit.depositAmount} TL</strong> kapora ödemeniz gerekiyor. Kapora, mevcut bir tahsilat olarak kaydedilir; iptal durumunda işletmeyle doğrudan görüşebilirsiniz.
            </p>
            {depositError && <p style={{ color: "#b91c1c", fontSize: 13, textAlign: "center", margin: "0 0 12px" }}>{depositError}</p>}
            <button
              type="button"
              onClick={payDeposit}
              disabled={payingDeposit}
              style={{ width: "100%", background: "#185fa5", color: "#fff", border: "none", borderRadius: 8, padding: "12px", fontWeight: 700, fontSize: 15, cursor: "pointer", opacity: payingDeposit ? 0.6 : 1 }}
            >
              {payingDeposit ? "Yönlendiriliyor…" : `Kaporayı Öde (${deposit.depositAmount} TL)`}
            </button>
            <p style={{ textAlign: "center", color: "#9aa8b8", fontSize: 12, margin: "16px 0 0" }}>
              Şimdi ödemezseniz de randevu talebiniz kayıtlı kalır, bu bağlantıya daha sonra dönüp ödeyebilirsiniz.
            </p>
          </>
        ) : done ? (
          <>
            <p style={{ textAlign: "center", color: "#15803d", fontWeight: 600 }}>✓ Randevu talebiniz alındı, işletme sizinle iletişime geçecek.</p>
            <p style={{ textAlign: "center", color: "#9aa8b8", fontSize: 12.5, margin: "16px 0 0" }}>
              Randevularınızı buradan takip etmek isterseniz{" "}
              <a href={portalUrl} style={{ color: "#185fa5" }}>hesap oluşturabilirsiniz</a> (opsiyonel).
            </p>
          </>
        ) : !company.acceptsAppointments ? (
          <>
            {company.logoUrl && <img src={company.logoUrl} alt="" style={{ maxHeight: 48, display: "block", margin: "0 auto 12px" }} />}
            <p style={{ textAlign: "center", color: "#5b7088" }}>
              {company.companyName} şu anda online randevu almıyor. Lütfen işletmeyle doğrudan iletişime geçin.
            </p>
          </>
        ) : (
          <>
            {company.logoUrl && <img src={company.logoUrl} alt="" style={{ maxHeight: 64, display: "block", margin: "0 auto 14px" }} />}
            <h1 style={{ fontSize: 21, fontWeight: 800, color: "#0c2540", textAlign: "center", margin: "0 0 24px", lineHeight: 1.3 }}>
              {company.companyName} - Randevu Al
            </h1>
            <form onSubmit={submit}>
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
              />
              {(freeServices.length > 0 || paidServices.length > 0) && (
                <p style={{ fontSize: 12.5, fontWeight: 700, color: "#185fa5", letterSpacing: 0.3, textTransform: "uppercase", margin: "0 0 10px" }}>
                  Hizmet Seçin
                </p>
              )}
              {freeServices.length > 0 && (
                <div style={{ marginBottom: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {freeServices.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleService(s.id)}
                      style={{
                        flex: "1 1 45%", textAlign: "left", padding: "14px", borderRadius: 12, cursor: "pointer",
                        border: serviceIds.includes(s.id) ? "2px solid #15803d" : "1px solid #bbf7d0",
                        background: serviceIds.includes(s.id) ? "#dcfce7" : "#f0fdf4", color: "#15803d", fontWeight: 700, fontSize: 14,
                      }}
                    >
                      🎁 {stripFreeWord(s.name)} - Ücretsiz{s.duration_minutes ? ` · ${s.duration_minutes} dk` : ""}{serviceIds.includes(s.id) ? " ✓" : ""}
                    </button>
                  ))}
                </div>
              )}
              {paidServices.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 13, color: "#5b7088", display: "block", marginBottom: 6 }}>Birden fazla seçebilirsiniz (opsiyonel)</label>
                  {paidServices.some((s) => !serviceIds.includes(s.id)) && (
                    <select
                      value=""
                      onChange={(e) => { if (e.target.value) toggleService(e.target.value); }}
                      style={{ width: "100%", borderRadius: 10, padding: "10px 12px" }}
                    >
                      <option value="">Hizmet ekle…</option>
                      {paidServices.filter((s) => !serviceIds.includes(s.id)).map((s) => (
                        <option key={s.id} value={s.id}>{s.name}{s.price ? ` - ${s.price} TL` : ""}{s.duration_minutes ? ` · ${s.duration_minutes} dk` : ""}</option>
                      ))}
                    </select>
                  )}
                  {paidServices.filter((s) => serviceIds.includes(s.id)).length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                      {paidServices.filter((s) => serviceIds.includes(s.id)).map((s) => (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 13.5, background: "#eaf2fb", border: "1px solid #cfe2f5", borderRadius: 10, padding: "10px 12px" }}>
                          <span style={{ fontWeight: 600, color: "#0c2540" }}>{s.name}{s.price ? ` - ${s.price} TL` : ""}{s.duration_minutes ? ` · ${s.duration_minutes} dk` : ""}</span>
                          <button type="button" onClick={() => toggleService(s.id)} style={{ fontSize: 12, padding: "3px 8px", flexShrink: 0, borderRadius: 20 }}>Kaldır</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {selectedDuration > 0 && (
                <p style={{ fontSize: 12, color: "#5b7088", margin: "0 0 14px" }}>
                  Tahmini süre: {selectedDuration} dk. Süreler tahminidir, hizmetin seyrine göre değişebilir.
                </p>
              )}
              <div style={{ borderTop: "1px solid #eef2f6", margin: "4px 0 16px" }} />
              {!canPickTime ? (
                <p style={{ fontSize: 13, color: "#5b7088", margin: "0 0 16px", textAlign: "center" }}>
                  Gün/saat seçmek için önce yukarıdan bir hizmet seçin.
                </p>
              ) : requestOnlyMode ? (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 13, color: "#5b7088", display: "block", marginBottom: 6 }}>Tercih ettiğiniz gün</label>
                    <input type="date" min={todayStr} max={maxDateStr} value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "100%", borderRadius: 10, padding: "10px 12px" }} />
                  </div>
                  {closedToday ? (
                    <p style={{ fontSize: 13, color: "#b91c1c", margin: "0 0 16px", textAlign: "center" }}>
                      İşletme bu gün kapalı, lütfen başka bir gün seçin.
                    </p>
                  ) : (
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 13, color: "#5b7088", display: "block", marginBottom: 6 }}>
                        Saat tercihleriniz <span style={{ color: "#9aa8b8" }}>(sırayla, ilki en çok tercih ettiğiniz)</span>
                      </label>
                      {dayWindows.length > 0 && (
                        <p style={{ fontSize: 12, color: "#9aa8b8", margin: "0 0 8px" }}>
                          Çalışma saatleri: {formatWindowsSummary(dayWindows)}
                        </p>
                      )}
                      {timePrefs.map((t, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 12.5, color: "#9aa8b8", width: 56, flexShrink: 0 }}>{i + 1}. tercih</span>
                          <input
                            type="time"
                            value={t}
                            min={dayMinTime}
                            max={dayMaxTime}
                            onChange={(e) => setTimePrefs((prev) => prev.map((x, xi) => (xi === i ? e.target.value : x)))}
                            style={{ flex: 1, borderRadius: 10, padding: "10px 12px" }}
                          />
                          {i > 0 && (
                            <button type="button" onClick={() => setTimePrefs((prev) => prev.filter((_, xi) => xi !== i))} style={{ fontSize: 12, padding: "6px 10px", flexShrink: 0, borderRadius: 20 }}>
                              Kaldır
                            </button>
                          )}
                        </div>
                      ))}
                      {timePrefs.length < 3 && (
                        <button
                          type="button"
                          onClick={() => setTimePrefs((prev) => [...prev, ""])}
                          style={{ background: "#f5f8fc", color: "#185fa5", border: "1px solid #d5dde6", borderRadius: 10, fontSize: 12.5, fontWeight: 600, padding: "8px 12px", cursor: "pointer" }}
                        >
                          + Farklı bir saat de ekle (opsiyonel)
                        </button>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {dayOverview && dayOverview.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <p style={{ fontSize: 12.5, fontWeight: 700, color: "#185fa5", letterSpacing: 0.3, textTransform: "uppercase", margin: "0 0 10px" }}>
                        Müsait Günler
                      </p>
                      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                        {dayOverview.map((d) => {
                          const { weekday, day } = shortDayLabel(d.date);
                          const selected = d.date === date;
                          const empty = d.slotCount === 0;
                          return (
                            <button
                              key={d.date}
                              type="button"
                              disabled={empty}
                              onClick={() => setDate(d.date)}
                              style={{
                                flex: "0 0 auto", width: 58, padding: "10px 4px", borderRadius: 12, textAlign: "center", cursor: empty ? "default" : "pointer",
                                border: selected ? "2px solid #185fa5" : "1px solid #e1e8f0",
                                background: selected ? "#eaf2fb" : empty ? "#f5f8fc" : "#fff",
                                boxShadow: selected ? "0 6px 16px rgba(24,95,165,0.18)" : "none",
                                opacity: empty ? 0.45 : 1,
                              }}
                            >
                              <div style={{ fontSize: 11, color: "#5b7088" }}>{weekday}</div>
                              <div style={{ fontSize: 15, fontWeight: 700, color: "#0c2540" }}>{day}</div>
                              <div style={{ fontSize: 10, color: empty ? "#9aa8b8" : "#15803d" }}>{d.closed ? "Kapalı" : empty ? "Dolu" : `${d.slotCount} boş`}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 13, color: "#5b7088", display: "block", marginBottom: 6 }}>Ya da farklı bir tarih seçin</label>
                    <input type="date" min={todayStr} max={maxDateStr} value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "100%", borderRadius: 10, padding: "10px 12px" }} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 13, color: "#5b7088", display: "block", marginBottom: 6 }}>Saat</label>
                    {loadingSlots ? (
                      <p style={{ fontSize: 13, color: "#9aa8b8" }}>Yükleniyor…</p>
                    ) : slotsError ? (
                      <p style={{ fontSize: 13, color: "#b91c1c" }}>{slotsError}</p>
                    ) : slots.length === 0 ? (
                      <div>
                        <p style={{ fontSize: 13, color: "#9aa8b8", margin: "0 0 8px" }}>Bu tarihte müsait saat yok.</p>
                        {waitlistedDate === date ? (
                          <p style={{ fontSize: 13, color: "#15803d", fontWeight: 600, margin: 0 }}>
                            ✓ Not edildi, bu günde yer açılırsa size haber vereceğiz.
                          </p>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={joinWaitlist}
                              disabled={joiningWaitlist}
                              style={{ background: "#f5f8fc", color: "#0c2540", border: "1px solid #d5dde6", borderRadius: 10, fontSize: 13, fontWeight: 600, padding: "9px 14px", cursor: "pointer", opacity: joiningWaitlist ? 0.6 : 1 }}
                            >
                              {joiningWaitlist ? "Gönderiliyor…" : "🔔 Bu gün için beni haberdar et"}
                            </button>
                            {waitlistError && <p style={{ fontSize: 12, color: "#b91c1c", margin: "6px 0 0" }}>{waitlistError}</p>}
                          </>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {slots.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setSelectedTime(s)}
                            style={{
                              background: selectedTime === s ? "#185fa5" : "#f5f8fc",
                              color: selectedTime === s ? "#fff" : "#0c2540",
                              border: "1px solid #e1e8f0", borderRadius: 10, fontSize: 13.5, fontWeight: 600, padding: "9px 14px", cursor: "pointer",
                              boxShadow: selectedTime === s ? "0 6px 16px rgba(24,95,165,0.25)" : "none",
                            }}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
              <div style={{ borderTop: "1px solid #eef2f6", margin: "4px 0 16px" }} />
              <p style={{ fontSize: 12.5, fontWeight: 700, color: "#185fa5", letterSpacing: 0.3, textTransform: "uppercase", margin: "0 0 12px" }}>
                İletişim Bilgileriniz
              </p>
              <div style={{ marginBottom: 10 }}>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ad Soyad *" required style={{ width: "100%", borderRadius: 10, padding: "10px 12px" }} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefon *" required style={{ width: "100%", borderRadius: 10, padding: "10px 12px" }} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-posta *" required style={{ width: "100%", borderRadius: 10, padding: "10px 12px" }} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Not (opsiyonel)" style={{ width: "100%", minHeight: 50, resize: "vertical", borderRadius: 10, padding: "10px 12px" }} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, color: email.trim() ? "#5b7088" : "#9aa8b8", cursor: email.trim() ? "pointer" : "default" }}>
                  <input
                    type="checkbox"
                    checked={marketingConsent}
                    disabled={!email.trim()}
                    onChange={(e) => setMarketingConsent(e.target.checked)}
                    style={{ marginTop: 2 }}
                  />
                  Kampanya ve değerlendirme isteği gibi e-postalar almak istiyorum (opsiyonel){!email.trim() && " - e-posta gerekli"}
                </label>
              </div>
              <p style={{ fontSize: 11, color: "#9aa8b8", margin: "0 0 16px" }}>
                Bilgileriniz {company.companyName} tarafından {marketingConsent ? "hizmet/randevu takibi ve onayladığınız kampanya e-postaları" : "yalnızca hizmet/randevu takibi"} amacıyla saklanır ve işlenir. Detaylar için{" "}
                <a href="/kvkk" target="_blank" rel="noopener noreferrer" style={{ color: "#185fa5" }}>KVKK Aydınlatma Metni</a>.
              </p>
              {submitError && <p style={{ color: "#b91c1c", fontSize: 13, margin: "0 0 12px" }}>{submitError}</p>}
              <button
                type="submit"
                disabled={sending || (requestOnlyMode ? timePrefs.every((t) => !t) || closedToday : !selectedTime)}
                style={{ width: "100%", background: "#185fa5", color: "#fff", border: "none", borderRadius: 10, padding: "14px", fontWeight: 700, fontSize: 15.5, cursor: "pointer", opacity: sending || (requestOnlyMode ? timePrefs.every((t) => !t) || closedToday : !selectedTime) ? 0.6 : 1, boxShadow: "0 10px 24px rgba(24,95,165,0.25)" }}
              >
                {sending ? "Gönderiliyor…" : "Randevu Talebi Gönder"}
              </button>
            </form>
          </>
        )}
      </div>
      <a href="https://binerly.com" target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 20, opacity: 0.6, textDecoration: "none" }}>
        <img src="/favicon.svg" alt="" style={{ width: 16, height: 16 }} />
        <span style={{ fontSize: 12, color: "#5b7088" }}>Binerly ile güvenle yönetiliyor</span>
      </a>
    </div>
  );
}
