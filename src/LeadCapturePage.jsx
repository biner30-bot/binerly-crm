import { useState, useEffect } from "react";

// shared.jsx'teki getPortalUrl / AppointmentRequestPage.jsx'teki portalUrlFor
// ile AYNI mantık (kasıtlı kopya - route bazlı kod bölme, bkz. o dosyadaki
// aynı isimli yorum).
function portalUrlFor() {
  const host = window.location.hostname;
  if (host.split(".")[0] === "portal") return window.location.origin + "/";
  if (host === "binerly.com" || host === "www.binerly.com") return "https://portal.binerly.com/";
  return window.location.origin + "/portal";
}

// Kamuya açık, giriş gerektirmeyen sayfa — /lead/{token}. KOBİ'nin paylaştığı
// link/QR koddan gelen bir kişi kendi bilgisini bırakır, KOBİ elle girmez.
export default function LeadCapturePage() {
  const token = window.location.pathname.split("/")[2] || "";
  const portalUrl = portalUrlFor();
  const [company, setCompany] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError("Geçersiz bağlantı.");
      return;
    }
    fetch(`/api/lead-capture?token=${encodeURIComponent(token)}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setError(data.error || "Bulunamadı.");
          setLoading(false);
          return;
        }
        setCompany(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Yüklenemedi.");
        setLoading(false);
      });
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || (!phone.trim() && !email.trim())) {
      setSubmitError("İsim ve telefon veya e-postadan en az biri gerekli.");
      return;
    }
    setSubmitError("");
    setSending(true);
    try {
      const res = await fetch("/api/lead-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, phone, email, address, note, marketingConsent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(data.error || "Gönderilemedi.");
        setSending(false);
        return;
      }
      setDone(true);
    } catch {
      setSubmitError("Bağlantı hatası, lütfen tekrar deneyin. İnternet bağlantınızı kontrol edin.");
    }
    setSending(false);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5f8fc",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "1rem",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: "2rem",
          width: "100%",
          maxWidth: 380,
          border: "1px solid #e1e8f0",
        }}
      >
        {loading ? (
          <p style={{ textAlign: "center", color: "#5b7088" }}>Yükleniyor…</p>
        ) : error ? (
          <p style={{ textAlign: "center", color: "#b91c1c" }}>{error}</p>
        ) : done ? (
          <>
            <p style={{ textAlign: "center", color: "#15803d", fontWeight: 600 }}>
              ✓ Bilgileriniz iletildi, teşekkürler!
            </p>
            <p
              style={{ textAlign: "center", color: "#9aa8b8", fontSize: 12.5, margin: "16px 0 0" }}
            >
              Talebinizi buradan takip etmek isterseniz{" "}
              <a href={portalUrl} style={{ color: "#185fa5" }}>
                hesap oluşturabilirsiniz
              </a>{" "}
              (opsiyonel).
            </p>
          </>
        ) : (
          <>
            {company.logoUrl && (
              <img
                src={company.logoUrl}
                alt=""
                style={{ maxHeight: 48, display: "block", margin: "0 auto 12px" }}
              />
            )}
            <h1
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "#0c2540",
                textAlign: "center",
                margin: "0 0 20px",
              }}
            >
              {company.companyName} ile iletişime geçin
            </h1>
            <form onSubmit={submit}>
              <div style={{ marginBottom: 10 }}>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ad Soyad / Firma"
                  required
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ marginBottom: 10 }}>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Telefon"
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ marginBottom: 10 }}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="E-posta"
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ marginBottom: 10 }}>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Açık Adres (opsiyonel)"
                  style={{ width: "100%", minHeight: 50, resize: "vertical" }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Not (opsiyonel)"
                  style={{ width: "100%", minHeight: 60, resize: "vertical" }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    fontSize: 12.5,
                    color: email.trim() ? "#5b7088" : "#9aa8b8",
                    cursor: email.trim() ? "pointer" : "default",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={marketingConsent}
                    disabled={!email.trim()}
                    onChange={(e) => setMarketingConsent(e.target.checked)}
                    style={{ marginTop: 2 }}
                  />
                  Kampanya ve değerlendirme isteği gibi e-postalar almak istiyorum (opsiyonel)
                  {!email.trim() && " - e-posta gerekli"}
                </label>
              </div>
              <p style={{ fontSize: 11, color: "#9aa8b8", margin: "0 0 16px" }}>
                Bilgileriniz {company.companyName} tarafından{" "}
                {marketingConsent
                  ? "hizmet/randevu takibi ve onayladığınız kampanya e-postaları"
                  : "yalnızca hizmet/randevu takibi"}{" "}
                amacıyla saklanır ve işlenir. Detaylar için{" "}
                <a
                  href="/kvkk"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#185fa5" }}
                >
                  KVKK Aydınlatma Metni
                </a>
                .
              </p>
              {submitError && (
                <p style={{ color: "#b91c1c", fontSize: 13, margin: "0 0 12px" }}>{submitError}</p>
              )}
              <button
                type="submit"
                disabled={sending}
                style={{
                  width: "100%",
                  background: "#185fa5",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "12px",
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: "pointer",
                }}
              >
                {sending ? "Gönderiliyor…" : "Gönder"}
              </button>
            </form>
          </>
        )}
      </div>
      <a
        href="https://binerly.com"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginTop: 20,
          opacity: 0.6,
          textDecoration: "none",
        }}
      >
        <img src="/favicon.svg" alt="" style={{ width: 16, height: 16 }} />
        <span style={{ fontSize: 12, color: "#5b7088" }}>Binerly ile güvenle yönetiliyor</span>
      </a>
    </div>
  );
}
