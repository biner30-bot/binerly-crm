import { useState, useEffect } from "react";

// Kamuya açık, giriş gerektirmeyen vitrin sayfası - /vitrin/{token}. AYNI
// token'ı, AYNI /api/lead-capture uç noktasını kullanır (Vercel Hobby'nin 12
// fonksiyon sınırı zaten dolu olduğu için ayrı bir api/*.js açılmadı) - GET
// ?view=vitrin ile ayrı bir dal. Sadece KOBİ'nin BeforeAfterPhotos panelinden
// tek tek "Vitrin sayfasında göster" işaretlediği öncesi/sonrası çiftlerini
// gösterir - fotoğraf izni verilmiş olması tek başına yeterli değil, herkese
// açık sergilemek ayrı bir KOBİ kararı (bkz. sql/2026-08-12_showcase_featured.sql).
export default function ShowcasePage() {
  const token = window.location.pathname.split("/")[2] || "";
  const [company, setCompany] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [openIndex, setOpenIndex] = useState(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError("Geçersiz bağlantı.");
      return;
    }
    fetch(`/api/lead-capture?token=${encodeURIComponent(token)}&view=vitrin`)
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

  const showcase = company?.showcase || [];
  const opened = openIndex !== null ? showcase[openIndex] : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f8fc",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "1rem",
      }}
    >
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        {loading ? (
          <p style={{ textAlign: "center", color: "#5b7088", marginTop: "3rem" }}>Yükleniyor…</p>
        ) : error ? (
          <p style={{ textAlign: "center", color: "#b91c1c", marginTop: "3rem" }}>{error}</p>
        ) : (
          <>
            <div style={{ textAlign: "center", padding: "2.5rem 1rem 1.5rem" }}>
              {company.logoUrl && (
                <img
                  src={company.logoUrl}
                  alt=""
                  style={{ maxHeight: 64, display: "block", margin: "0 auto 14px" }}
                />
              )}
              <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0c2540", margin: "0 0 6px" }}>
                {company.companyName} - Çalışmalarımız
              </h1>
              <p style={{ fontSize: 13.5, color: "#5b7088", margin: 0 }}>
                Öncesi ve sonrası - müşteri izniyle paylaşılmıştır
              </p>
            </div>
            {showcase.length === 0 ? (
              <p style={{ textAlign: "center", color: "#9aa8b8", padding: "2rem 1rem" }}>
                Henüz öne çıkan bir çalışma yayınlanmadı.
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: 16,
                  paddingBottom: "2.5rem",
                }}
              >
                {showcase.map((item, i) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setOpenIndex(i)}
                    style={{
                      background: "#fff",
                      border: "1px solid #e1e8f0",
                      borderRadius: 14,
                      overflow: "hidden",
                      padding: 0,
                      cursor: "pointer",
                      textAlign: "left",
                      boxShadow: "0 8px 24px rgba(12,37,64,0.06)",
                    }}
                  >
                    <div style={{ display: "flex" }}>
                      <img
                        src={item.beforeUrl}
                        alt="Öncesi"
                        style={{
                          width: "50%",
                          aspectRatio: "1",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                      <img
                        src={item.afterUrl}
                        alt="Sonrası"
                        style={{
                          width: "50%",
                          aspectRatio: "1",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    </div>
                    {item.title && (
                      <p
                        style={{
                          margin: 0,
                          padding: "10px 12px",
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#0c2540",
                        }}
                      >
                        {item.title}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {opened && (
        <div
          onClick={() => setOpenIndex(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(12,37,64,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            zIndex: 50,
          }}
        >
          <div style={{ maxWidth: 720, width: "100%" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1, textAlign: "center" }}>
                <img
                  src={opened.beforeUrl}
                  alt="Öncesi"
                  style={{ width: "100%", borderRadius: 10, display: "block" }}
                />
                <p style={{ color: "#fff", fontSize: 12, margin: "6px 0 0" }}>Öncesi</p>
              </div>
              <div style={{ flex: 1, textAlign: "center" }}>
                <img
                  src={opened.afterUrl}
                  alt="Sonrası"
                  style={{ width: "100%", borderRadius: 10, display: "block" }}
                />
                <p style={{ color: "#fff", fontSize: 12, margin: "6px 0 0" }}>Sonrası</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpenIndex(null)}
              style={{
                display: "block",
                margin: "16px auto 0",
                background: "rgba(255,255,255,0.15)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.4)",
                borderRadius: 8,
                padding: "8px 20px",
                cursor: "pointer",
              }}
            >
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
