import { useState, useEffect } from "react";

// Kamuya açık, giriş gerektirmeyen sayfa — /lead/{token}. KOBİ'nin paylaştığı
// link/QR koddan gelen bir kişi kendi bilgisini bırakır, KOBİ elle girmez.
export default function LeadCapturePage() {
  const token = window.location.pathname.split("/")[2] || "";
  const [company, setCompany] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
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

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || (!phone.trim() && !email.trim())) {
      setSubmitError("İsim ve telefon veya e-postadan en az biri gerekli.");
      return;
    }
    setSubmitError("");
    setSending(true);
    const res = await fetch("/api/lead-capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, name, phone, email, note }),
    });
    const data = await res.json();
    if (!res.ok) { setSubmitError(data.error || "Gönderilemedi."); setSending(false); return; }
    setDone(true);
    setSending(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f8fc", fontFamily: "system-ui, -apple-system, sans-serif", padding: "1rem" }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: "2rem", width: "100%", maxWidth: 380, border: "1px solid #e1e8f0" }}>
        {loading ? (
          <p style={{ textAlign: "center", color: "#5b7088" }}>Yükleniyor…</p>
        ) : error ? (
          <p style={{ textAlign: "center", color: "#b91c1c" }}>{error}</p>
        ) : done ? (
          <p style={{ textAlign: "center", color: "#15803d", fontWeight: 600 }}>✓ Bilgileriniz iletildi, teşekkürler!</p>
        ) : (
          <>
            {company.logoUrl && <img src={company.logoUrl} alt="" style={{ maxHeight: 48, display: "block", margin: "0 auto 12px" }} />}
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0c2540", textAlign: "center", margin: "0 0 20px" }}>
              {company.companyName} ile iletişime geçin
            </h1>
            <form onSubmit={submit}>
              <div style={{ marginBottom: 10 }}>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ad Soyad / Firma" required style={{ width: "100%" }} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefon" style={{ width: "100%" }} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-posta" style={{ width: "100%" }} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Not (opsiyonel)" style={{ width: "100%", minHeight: 60, resize: "vertical" }} />
              </div>
              {submitError && <p style={{ color: "#b91c1c", fontSize: 13, margin: "0 0 12px" }}>{submitError}</p>}
              <button
                type="submit"
                disabled={sending}
                style={{ width: "100%", background: "#185fa5", color: "#fff", border: "none", borderRadius: 8, padding: "12px", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
              >
                {sending ? "Gönderiliyor…" : "Gönder"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
