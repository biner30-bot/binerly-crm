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
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(todayStr);
  const [slots, setSlots] = useState([]);
  const [dateTimeKey, setDateTimeKey] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [selectedTime, setSelectedTime] = useState("");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState("");

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

  useEffect(() => {
    if (!company?.acceptsAppointments || !company?.businessUserId || !date) return;
    setLoadingSlots(true);
    setSlotsError("");
    setSelectedTime("");
    fetch(`/api/appointment-availability?businessUserId=${company.businessUserId}&date=${date}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || "Müsaitlik alınamadı.");
        setSlots(data.slots || []);
        setDateTimeKey(data.dateTimeKey || null);
      })
      .catch((err) => { setSlots([]); setSlotsError(err.message || "Müsaitlik alınamadı."); })
      .finally(() => setLoadingSlots(false));
  }, [company?.acceptsAppointments, company?.businessUserId, date]);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || (!phone.trim() && !email.trim())) {
      setSubmitError("İsim ve telefon veya e-postadan en az biri gerekli.");
      return;
    }
    if (!selectedTime || !dateTimeKey) {
      setSubmitError("Lütfen bir saat seçin.");
      return;
    }
    setSubmitError("");
    setSending(true);
    try {
      const res = await fetch("/api/lead-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token, name, phone, email, note, marketingConsent,
          dateTime: `${date}T${selectedTime}:00`, dateTimeKey, serviceId: serviceId || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setSubmitError(data.error || "Gönderilemedi."); setSending(false); return; }
      setDone(true);
    } catch {
      setSubmitError("Bağlantı hatası, lütfen tekrar deneyin. İnternet bağlantınızı kontrol edin.");
    }
    setSending(false);
  };

  // 0 TL'lik bir fiyat kalemi zaten "ücretsiz" demek - ayrı bir "deneme" alanı
  // eklemek yerine bu sinyali widget'ta öne çıkarıyoruz (yeni kolon yok).
  const freeServices = (company?.services || []).filter((s) => Number(s.price) === 0);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f8fc", fontFamily: "system-ui, -apple-system, sans-serif", padding: "1rem" }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: "2rem", width: "100%", maxWidth: 420, border: "1px solid #e1e8f0" }}>
        {loading ? (
          <p style={{ textAlign: "center", color: "#5b7088" }}>Yükleniyor…</p>
        ) : error ? (
          <p style={{ textAlign: "center", color: "#b91c1c" }}>{error}</p>
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
            {company.logoUrl && <img src={company.logoUrl} alt="" style={{ maxHeight: 48, display: "block", margin: "0 auto 12px" }} />}
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0c2540", textAlign: "center", margin: "0 0 20px" }}>
              {company.companyName} - Randevu Al
            </h1>
            <form onSubmit={submit}>
              {freeServices.length > 0 && (
                <div style={{ marginBottom: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  {freeServices.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setServiceId(s.id)}
                      style={{
                        width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 8, cursor: "pointer",
                        border: serviceId === s.id ? "2px solid #15803d" : "1px solid #bbf7d0",
                        background: serviceId === s.id ? "#dcfce7" : "#f0fdf4", color: "#15803d", fontWeight: 700, fontSize: 14,
                      }}
                    >
                      🎁 {s.name} - Ücretsiz{serviceId === s.id ? " ✓" : ""}
                    </button>
                  ))}
                </div>
              )}
              {company.services?.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} style={{ width: "100%" }}>
                    <option value="">Hizmet seçin (opsiyonel)</option>
                    {company.services.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}{s.price ? ` - ${s.price} TL` : ""}</option>
                    ))}
                  </select>
                </div>
              )}
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 13, color: "#5b7088", display: "block", marginBottom: 4 }}>Tarih</label>
                <input type="date" min={todayStr} max={maxDateStr} value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "100%" }} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 13, color: "#5b7088", display: "block", marginBottom: 4 }}>Saat</label>
                {loadingSlots ? (
                  <p style={{ fontSize: 13, color: "#9aa8b8" }}>Yükleniyor…</p>
                ) : slotsError ? (
                  <p style={{ fontSize: 13, color: "#b91c1c" }}>{slotsError}</p>
                ) : slots.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#9aa8b8" }}>Bu tarihte müsait saat yok.</p>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {slots.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSelectedTime(s)}
                        style={{
                          background: selectedTime === s ? "#185fa5" : "#f5f8fc",
                          color: selectedTime === s ? "#fff" : "#0c2540",
                          border: "1px solid #e1e8f0", borderRadius: 6, fontSize: 13, padding: "6px 10px", cursor: "pointer",
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ marginBottom: 10 }}>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ad Soyad" required style={{ width: "100%" }} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefon" style={{ width: "100%" }} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-posta" style={{ width: "100%" }} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Not (opsiyonel)" style={{ width: "100%", minHeight: 50, resize: "vertical" }} />
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
                Bilgileriniz {company.companyName} tarafından yalnızca hizmet/randevu takibi amacıyla saklanır ve işlenir.
              </p>
              {submitError && <p style={{ color: "#b91c1c", fontSize: 13, margin: "0 0 12px" }}>{submitError}</p>}
              <button
                type="submit"
                disabled={sending || !selectedTime}
                style={{ width: "100%", background: "#185fa5", color: "#fff", border: "none", borderRadius: 8, padding: "12px", fontWeight: 700, fontSize: 15, cursor: "pointer", opacity: sending || !selectedTime ? 0.6 : 1 }}
              >
                {sending ? "Gönderiliyor…" : "Randevu Talebi Gönder"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
