import { useState, useEffect } from "react";
import BackgroundScatter from "./BackgroundScatter.jsx";
import { ValuationRequestForm } from "./ValuationRequestForm";

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

// realEstate.js'ten import edilmiyor (bu sayfa bağımsız paket, bkz. yukarıdaki
// kasıtlı kopya notu) - sadece görünen etiketler.
const TX_LABELS = { satilik: "Satılık", kiralik: "Kiralık", devren_kiralik: "Devren Kiralık" };
const DETAIL_LABELS = {
  condition: "Durum",
  view: "Manzara",
  heating: "Isıtma",
  elevator: "Asansör",
  parking: "Otopark",
  in_site: "Site içinde",
  dues: "Aidat",
  facade: "Cephe",
  bathrooms: "Banyo",
  kitchen: "Mutfak",
  balcony: "Balkon",
  furnished: "Eşyalı",
  usage: "Kullanım durumu",
  deed_status: "Tapu durumu",
  credit_eligible: "Krediye uygun",
  energy_class: "Enerji sınıfı",
  deposit: "Depozito",
  monthly_rent: "Aylık kira",
};
const MONEY_DETAILS = new Set(["dues", "deposit", "monthly_rent"]);

function toWaNumber(phone) {
  const digits = (phone || "").replace(/\D/g, "").replace(/^0/, "");
  return digits.startsWith("90") ? digits : `90${digits}`;
}

function ShowcaseListings({ listings, phone, companyName, cardStyle }) {
  const [txFilter, setTxFilter] = useState("all");
  // Danışmanın WhatsApp'tan gönderdiği bağlantı (?ilan=<id>) ilanı doğrudan açar.
  const [openId, setOpenId] = useState(() => {
    const id = new URLSearchParams(window.location.search).get("ilan");
    return id && listings.some((l) => l.id === id) ? id : null;
  });
  const [photoIndex, setPhotoIndex] = useState(0);
  const types = [...new Set(listings.map((l) => l.transactionType))];
  const shown = listings.filter((l) => txFilter === "all" || l.transactionType === txFilter);
  const opened = listings.find((l) => l.id === openId);
  const priceText = (l) =>
    l.price
      ? `${formatPrice(l.price)}${l.transactionType === "kiralik" ? " / ay" : ""}`
      : "Fiyat için arayın";
  const specs = (l) =>
    [l.roomCount, l.netM2 || l.grossM2 ? `${l.netM2 || l.grossM2} m²` : null, l.propertyType]
      .filter(Boolean)
      .join(" · ");
  const pill = (active) => ({
    border: "1px solid #d5dde6",
    background: active ? "#185fa5" : "#fff",
    color: active ? "#fff" : "#0c2540",
    borderRadius: 999,
    padding: "6px 14px",
    fontSize: 13,
    cursor: "pointer",
  });
  return (
    <>
      {types.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button type="button" style={pill(txFilter === "all")} onClick={() => setTxFilter("all")}>
            Tümü
          </button>
          {types.map((t) => (
            <button
              key={t}
              type="button"
              style={pill(txFilter === t)}
              onClick={() => setTxFilter(t)}
            >
              {TX_LABELS[t] || t}
            </button>
          ))}
        </div>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 14,
        }}
      >
        {shown.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => {
              setOpenId(l.id);
              setPhotoIndex(0);
            }}
            style={{
              ...cardStyle,
              padding: 0,
              overflow: "hidden",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            <div style={{ aspectRatio: "4 / 3", background: "#eef2f7", position: "relative" }}>
              {l.photos[0] && (
                <img
                  src={l.photos[0]}
                  alt={l.title}
                  loading="lazy"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              )}
              <span
                style={{
                  position: "absolute",
                  left: 10,
                  top: 10,
                  background: "#185fa5",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                  borderRadius: 6,
                  padding: "3px 8px",
                }}
              >
                {TX_LABELS[l.transactionType]}
                {l.status === "opsiyonlu" ? " · Opsiyonlu" : ""}
              </span>
            </div>
            <div style={{ padding: 14 }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#0c2540" }}>
                {l.title}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 15, fontWeight: 800, color: "#185fa5" }}>
                {priceText(l)}
              </p>
              {l.location && (
                <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "#5b7088" }}>{l.location}</p>
              )}
              {specs(l) && (
                <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#5b7088" }}>{specs(l)}</p>
              )}
            </div>
          </button>
        ))}
      </div>

      {opened && (
        <div
          onClick={() => setOpenId(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(12,37,64,0.6)",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            overflowY: "auto",
            padding: "1rem",
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 14,
              maxWidth: 720,
              width: "100%",
              overflow: "hidden",
            }}
          >
            {opened.photos.length > 0 && (
              <div style={{ position: "relative", background: "#0c2540" }}>
                <img
                  src={opened.photos[photoIndex]}
                  alt={opened.title}
                  style={{ width: "100%", maxHeight: 460, objectFit: "contain", display: "block" }}
                />
                {opened.photos.length > 1 && (
                  <>
                    {[
                      [-1, "‹", { left: 8 }],
                      [1, "›", { right: 8 }],
                    ].map(([dir, ch, pos]) => (
                      <button
                        key={dir}
                        type="button"
                        aria-label={dir < 0 ? "Önceki fotoğraf" : "Sonraki fotoğraf"}
                        onClick={() =>
                          setPhotoIndex(
                            (i) => (i + dir + opened.photos.length) % opened.photos.length,
                          )
                        }
                        style={{
                          position: "absolute",
                          top: "50%",
                          transform: "translateY(-50%)",
                          ...pos,
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          border: "none",
                          background: "rgba(255,255,255,0.85)",
                          fontSize: 24,
                          cursor: "pointer",
                        }}
                      >
                        {ch}
                      </button>
                    ))}
                    <span
                      style={{
                        position: "absolute",
                        right: 10,
                        bottom: 10,
                        background: "rgba(0,0,0,0.6)",
                        color: "#fff",
                        fontSize: 12,
                        borderRadius: 6,
                        padding: "2px 8px",
                      }}
                    >
                      {photoIndex + 1} / {opened.photos.length}
                    </span>
                  </>
                )}
              </div>
            )}
            <div style={{ padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#185fa5" }}>
                    {TX_LABELS[opened.transactionType]}
                  </p>
                  <h3 style={{ margin: "2px 0 0", fontSize: 18, color: "#0c2540" }}>
                    {opened.title}
                  </h3>
                  {opened.location && (
                    <p style={{ margin: "4px 0 0", fontSize: 13, color: "#5b7088" }}>
                      {opened.location}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setOpenId(null)}
                  aria-label="Kapat"
                  style={{
                    border: "none",
                    background: "none",
                    fontSize: 22,
                    cursor: "pointer",
                    alignSelf: "flex-start",
                  }}
                >
                  ×
                </button>
              </div>
              <p style={{ margin: "10px 0 0", fontSize: 20, fontWeight: 800, color: "#185fa5" }}>
                {priceText(opened)}
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                  gap: "6px 16px",
                  margin: "14px 0",
                  fontSize: 13,
                }}
              >
                {[
                  ["Oda", opened.roomCount],
                  ["Brüt m²", opened.grossM2],
                  ["Net m²", opened.netM2],
                  ["Bina yaşı", opened.buildingAge],
                  [
                    "Kat",
                    opened.floor &&
                      `${opened.floor}${opened.totalFloors ? ` / ${opened.totalFloors}` : ""}`,
                  ],
                  ["Tip", opened.propertyType],
                  ...Object.entries(opened.details || {}).map(([k, v]) => [
                    DETAIL_LABELS[k] || k,
                    Array.isArray(v) ? v.join(", ") : MONEY_DETAILS.has(k) ? formatPrice(v) : v,
                  ]),
                ]
                  .filter(([, v]) => v !== null && v !== undefined && v !== "")
                  .map(([label, v]) => (
                    <div key={label}>
                      <span style={{ color: "#9aa8b8" }}>{label}: </span>
                      <span style={{ color: "#0c2540", fontWeight: 600 }}>{v}</span>
                    </div>
                  ))}
              </div>
              {opened.description && (
                <p
                  style={{
                    whiteSpace: "pre-wrap",
                    fontSize: 13.5,
                    color: "#425466",
                    lineHeight: 1.6,
                    margin: "0 0 14px",
                  }}
                >
                  {opened.description}
                </p>
              )}
              {phone && (
                <a
                  href={`https://wa.me/${toWaNumber(phone)}?text=${encodeURIComponent(
                    `Merhaba, ${companyName} vitrinindeki "${opened.title}" ilanı hakkında bilgi almak istiyorum.`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-block",
                    background: "#185fa5",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 14,
                    textDecoration: "none",
                    borderRadius: 10,
                    padding: "12px 22px",
                  }}
                >
                  Bu ilan hakkında bilgi al
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
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
  const listings = company?.listings || [];
  const opened = openIndex !== null ? showcase[openIndex] : null;
  const valuationForm = company?.valuationForm || null;
  const hasAnyContent =
    showcase.length > 0 ||
    priceList.length > 0 ||
    campaigns.length > 0 ||
    listings.length > 0 ||
    !!valuationForm;

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
      <BackgroundScatter sector={company?.sector} />
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
                  style={{
                    maxHeight: 64,
                    maxWidth: 240,
                    objectFit: "contain",
                    borderRadius: 8,
                    display: "block",
                    margin: "0 auto 14px",
                  }}
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
              {valuationForm && (
                <a
                  href="#degerleme"
                  style={{
                    display: "inline-block",
                    marginTop: 16,
                    marginLeft: 8,
                    background: "#fff",
                    color: "#185fa5",
                    border: "1.5px solid #185fa5",
                    fontSize: 14,
                    fontWeight: 700,
                    textDecoration: "none",
                    borderRadius: 10,
                    padding: "11px 24px",
                  }}
                >
                  Evim ne kadar eder?
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

            {valuationForm && (
              <section id="degerleme" style={{ marginBottom: "2.5rem", scrollMarginTop: 16 }}>
                <h2 style={sectionTitleStyle}>Evim ne kadar eder?</h2>
                <div style={cardStyle}>
                  <p style={{ fontSize: 13, color: "#5b7088", margin: "0 0 12px" }}>
                    Evinizin bilgilerini girin, {company.companyName} bölgenizdeki güncel ilan
                    fiyatlarıyla ücretsiz piyasa değeri raporunuzu hazırlasın.
                  </p>
                  <ValuationRequestForm
                    token={token}
                    companyName={company.companyName}
                    showRange={valuationForm.showRange}
                  />
                </div>
              </section>
            )}

            {listings.length > 0 && (
              <section style={{ marginBottom: "2.5rem" }}>
                <h2 style={sectionTitleStyle}>Portföyümüz</h2>
                <ShowcaseListings
                  listings={listings}
                  phone={company.phone}
                  companyName={company.companyName}
                  cardStyle={cardStyle}
                />
              </section>
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
                          fontSize: item.price == null ? 12 : 14,
                          fontWeight: item.price == null ? 500 : 700,
                          color: item.price == null ? "#9aa8b8" : "#185fa5",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.price == null
                          ? "Bilgi için iletişime geçin"
                          : formatPrice(item.price)}
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
