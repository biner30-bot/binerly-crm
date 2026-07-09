import { useState, useEffect } from "react";

function formatTL(n) {
  return new Intl.NumberFormat("tr-TR").format(Math.round(n || 0)) + " TL";
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

function formatDateTime(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" }) +
    " · " + new Date(dateStr).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

// Kamuya açık, giriş gerektirmeyen sayfa — /onay/{token}. Sadece api/deal-approval.js
// tarafından döndürülen minimal bilgiyi (başlık/tutar/şirket-müşteri adı) gösterir.
export default function DealApprovalPage() {
  const token = window.location.pathname.split("/")[2] || "";
  const [state, setState] = useState({ loading: true, error: "", deal: null });
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    if (!token) { setState({ loading: false, error: "Geçersiz bağlantı.", deal: null }); return; }
    fetch(`/api/deal-approval?token=${encodeURIComponent(token)}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) { setState({ loading: false, error: data.error || "Bulunamadı.", deal: null }); return; }
        setState({ loading: false, error: "", deal: data });
      })
      .catch(() => setState({ loading: false, error: "Yüklenemedi.", deal: null }));
  }, [token]);

  const approve = async () => {
    setApproving(true);
    const res = await fetch("/api/deal-approval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      setState((s) => ({ ...s, deal: { ...s.deal, approved: true, approvedAt: data.approvedAt || new Date().toISOString() } }));
    }
    setApproving(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f5f8fc", fontFamily: "system-ui, -apple-system, sans-serif", padding: "1rem" }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: "2rem", width: "100%", maxWidth: 420, border: "1px solid #e1e8f0", textAlign: "center", boxShadow: "0 4px 24px rgba(12,37,64,0.06)" }}>
        {state.loading ? (
          <p style={{ color: "#5b7088" }}>Yükleniyor…</p>
        ) : state.error ? (
          <p style={{ color: "#b91c1c" }}>{state.error}</p>
        ) : (
          <>
            {state.deal.logoUrl && <img src={state.deal.logoUrl} alt="" style={{ maxHeight: 48, marginBottom: 16 }} />}
            <p style={{ fontSize: 13, color: "#94a7bb", margin: "0 0 4px" }}>{state.deal.companyName}</p>
            {state.deal.customerName && (
              <p style={{ fontSize: 14, color: "#5b7088", margin: "0 0 12px" }}>Sayın {state.deal.customerName},</p>
            )}
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0c2540", margin: "0 0 8px" }}>{state.deal.title}</h1>
            <p style={{ fontSize: 24, fontWeight: 800, color: "#185fa5", margin: "0 0 4px" }}>{formatTL(state.deal.value)}</p>
            {state.deal.createdAt && (
              <p style={{ fontSize: 12, color: "#94a7bb", margin: "0 0 20px" }}>Teklif tarihi: {formatDate(state.deal.createdAt)}</p>
            )}
            {state.deal.approved ? (
              <div>
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "14px 16px" }}>
                  <p style={{ color: "#15803d", fontWeight: 600, margin: "0 0 4px" }}>✓ Bu teklifi onayladınız</p>
                  {state.deal.approvedAt && (
                    <p style={{ fontSize: 12, color: "#5b7088", margin: 0 }}>{formatDateTime(state.deal.approvedAt)} tarihinde kaydedildi</p>
                  )}
                </div>
                <p style={{ fontSize: 12, color: "#94a7bb", margin: "12px 0 0" }}>
                  {state.deal.companyName} en kısa sürede sizinle iletişime geçecek.
                </p>
              </div>
            ) : (
              <>
                <button
                  onClick={approve}
                  disabled={approving}
                  style={{ width: "100%", background: "#185fa5", color: "#fff", border: "none", borderRadius: 8, padding: "12px", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
                >
                  {approving ? "Onaylanıyor…" : "Onaylıyorum"}
                </button>
                <p style={{ fontSize: 11.5, color: "#94a7bb", margin: "12px 0 0", lineHeight: 1.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <i className="ti ti-lock" style={{ fontSize: 13 }} aria-hidden="true"></i>
                  Bu bağlantı yalnızca size özel oluşturuldu, onayınız zaman damgasıyla kaydedilir.
                </p>
              </>
            )}
          </>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 20, opacity: 0.6 }}>
        <img src="/favicon.svg" alt="" style={{ width: 16, height: 16 }} />
        <span style={{ fontSize: 12, color: "#5b7088" }}>Binerly ile güvenle yönetiliyor</span>
      </div>
    </div>
  );
}
