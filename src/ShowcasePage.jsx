import { useState, useEffect } from "react";

// DealApprovalPage.jsx/shared.jsx'teki AYNI biçimlendirme (kasıtlı kopya, bu
// sayfa da tamamen bağımsız/herkese açık - bkz. api/lead-capture.js'teki
// "ayrı dosya, ayrı kopya" deseni).
function formatPrice(n) {
  return new Intl.NumberFormat("tr-TR").format(Math.round(n || 0)) + " TL";
}

function formatDateRange(startsAt, endsAt) {
  const fmt = (d) => new Date(d).toLocaleDateString("tr-TR");
  if (startsAt && endsAt) return `${fmt(startsAt)} - ${fmt(endsAt)}`;
  if (endsAt) return `${fmt(endsAt)} tarihine kadar`;
  if (startsAt) return `${fmt(startsAt)} itibarıyla`;
  return null;
}

// shared.jsx'teki getPortalUrl / AppointmentRequestPage.jsx'teki portalUrlFor
// ile AYNI mantık (kasıtlı kopya - route bazlı kod bölme, bu sayfa
// CustomerPortal'ın koca paketini hiç indirmesin diye import edilmiyor).
function portalUrlFor() {
  const host = window.location.hostname;
  if (host.split(".")[0] === "portal") return window.location.origin + "/";
  if (host === "binerly.com" || host === "www.binerly.com") return "https://portal.binerly.com/";
  return window.location.origin + "/portal";
}

// Kamuya açık, giriş gerektirmeyen vitrin sayfası - /vitrin/{token}. AYNI
// token'ı, AYNI /api/lead-capture uç noktasını kullanır (Vercel Hobby'nin 12
// fonksiyon sınırı zaten dolu olduğu için ayrı bir api/*.js açılmadı) - GET
// ?view=vitrin ile ayrı bir dal. Üç bağımsız, hepsi opsiyonel bölüm gösterir:
// kampanyalar, fiyat listesi (KOBİ bilinçli açtıysa) ve öncesi/sonrası foto
// galerisi (sadece randevu sektörlerinde, KOBİ'nin BeforeAfterPhotos panelinden
// tek tek "Vitrin sayfasında göster" işaretlediği çiftler - fotoğraf izni tek
// başına yeterli değil, herkese açık sergilemek ayrı bir KOBİ kararı, bkz.
// sql/2026-08-12_showcase_featured.sql).
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

  // Sekme başlığı: /vitrin sunucu tarafında zaten işletme adıyla render ediliyor
  // (api/lead-capture.js renderVitrinHtml) - React boot sonrası da korunsun diye.
  useEffect(() => {
    if (company?.companyName) document.title = company.companyName;
  }, [company?.companyName]);

  const showcase = company?.showcase || [];
  const priceList = company?.priceList || [];
  const campaigns = company?.campaigns || [];
  const opened = openIndex !== null ? showcase[openIndex] : null;
  const hasAnyContent = showcase.length > 0 || priceList.length > 0 || campaigns.length > 0;

  const sectionTitleStyle = { fontSize: 17, fontWeight: 800, color: "#0c2540", margin: "0 0 12px" };
  const cardStyle = {
    background: "#fff",
    border: "1px solid #e1e8f0",
    borderRadius: 14,
    padding: 16,
    boxShadow: "0 8px 24px rgba(12,37,64,0.06)",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(130% 520px at 50% -60px, rgba(79, 148, 217, 0.2), rgba(79, 148, 217, 0) 70%)",
        backgroundRepeat: "no-repeat",
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
                {company.companyName}
              </h1>
              {(company.address || company.phone) && (
                <p style={{ fontSize: 13, color: "#5b7088", margin: 0 }}>
                  {[company.address, company.phone].filter(Boolean).join(" · ")}
                </p>
              )}
              {company.ctaLabel && company.ctaHref && (
                <a
                  href={company.ctaHref}
                  style={{
                    display: "inline-block",
                    marginTop: 16,
                    background: "#185fa5",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 700,
                    textDecoration: "none",
                    borderRadius: 10,
                    padding: "12px 28px",
                    boxShadow: "0 8px 20px rgba(24,95,165,0.25)",
                  }}
                >
                  {company.ctaLabel}
                </a>
              )}
              <p style={{ fontSize: 12, color: "#9aa8b8", margin: "14px 0 0" }}>
                Zaten müşterimiz misiniz?{" "}
                <a href={portalUrlFor()} style={{ color: "#185fa5" }}>
                  Portala giriş yapın
                </a>
              </p>
            </div>

            {!hasAnyContent && (
              <p style={{ textAlign: "center", color: "#9aa8b8", padding: "2rem 1rem 3rem" }}>
                Bu işletme henüz vitrin içeriği yayınlamadı.
              </p>
            )}

            {campaigns.length > 0 && (
              <section style={{ marginBottom: "2.5rem" }}>
                <h2 style={sectionTitleStyle}>Kampanyalar</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {campaigns.map((c) => (
                    <div key={c.id} style={cardStyle}>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#0c2540" }}>
                        {c.title}
                      </p>
                      {c.description && (
                        <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "#425466" }}>
                          {c.description}
                        </p>
                      )}
                      {formatDateRange(c.startsAt, c.endsAt) && (
                        <p
                          style={{
                            margin: "8px 0 0",
                            fontSize: 12,
                            color: "#185fa5",
                            fontWeight: 600,
                          }}
                        >
                          {formatDateRange(c.startsAt, c.endsAt)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {priceList.length > 0 && (
              <section style={{ marginBottom: "2.5rem" }}>
                <h2 style={sectionTitleStyle}>Fiyat Listesi</h2>
                <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
                  {priceList.map((item, i) => (
                    <div
                      key={`${item.name}-${i}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 16px",
                        borderTop: i === 0 ? "none" : "1px solid #eef2f7",
                      }}
                    >
                      <div>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#0c2540" }}>
                          {item.name}
                        </p>
                        {item.durationMinutes ? (
                          <p style={{ margin: "2px 0 0", fontSize: 12, color: "#9aa8b8" }}>
                            {item.durationMinutes} dk
                          </p>
                        ) : null}
                      </div>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 14,
                          fontWeight: 700,
                          color: "#185fa5",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatPrice(item.price)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {showcase.length > 0 && (
              <section>
                <h2 style={sectionTitleStyle}>Çalışmalarımız</h2>
                <p style={{ fontSize: 13, color: "#5b7088", margin: "0 0 12px" }}>
                  Öncesi ve sonrası - müşteri izniyle paylaşılmıştır
                </p>
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
              </section>
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
