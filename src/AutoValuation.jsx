import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog, InfoTip, Modal, discardFormDraft, formatTL, useFormDraft } from "./shared";
import { buildValuationReportHtml } from "./ValuationReport";
import { LocationFields, resolveOfficialPlace } from "./LocationFields";
import {
  TKGM_PARSEL_SORGU_URL,
  geocodeArea,
  isValidLocation,
  mapsUrl,
  parseCoordinates,
  suggestPlaces,
  renderMapImage,
  streetViewUrl,
} from "./geo";
import { ageCoverage, bandForAge, pasteChecks, subjectChecks } from "./valuationChecks";
import { PROPERTY_DETAIL_FIELDS, PROPERTY_TYPE_OPTIONS, ROOM_COUNT_OPTIONS } from "./realEstate";
import {
  AGE_BANDS,
  AVM_FACTOR_DEFAULTS,
  MIN_NEAR_AGE_LISTINGS,
  NEAR_AGE_YEARS,
  ageStats,
  aliasFor,
  groupByNeighborhood,
  closedTransactions,
  officeAskingDiscount,
  AVM_FACTOR_LABELS,
  CONDITION_OPTIONS,
  VIEW_OPTIONS,
  estimateValue,
  findRegion,
  mergeListings,
  REGION_OLD_DAYS,
  REGION_STALE_DAYS,
  regionAgeDays,
  parseSearchPages,
  nearBandsFor,
  normalizeSahibindenUrl,
  sahibindenBandUrl,
  marketMoves,
  istanbulToday,
  regionKey,
  summarizeListings,
} from "./priceEstimate";

const DISCLAIMER =
  "Bu çalışma, bölgedeki güncel ilan fiyatları ve dairenin özelliklerinden hesaplanan otomatik bir piyasa fiyat tahminidir; Sermaye Piyasası Kurulu (SPK) mevzuatı kapsamında lisanslı değerleme uzmanınca hazırlanan bir gayrimenkul değerleme raporu DEĞİLDİR. Kredi, mahkeme, kamulaştırma veya resmi işlemlerde kullanılamaz.";

const labelStyle = {
  fontSize: 12,
  color: "var(--text-secondary)",
  display: "block",
  marginBottom: 4,
};
const box = {
  border: "0.5px solid var(--border)",
  borderRadius: 8,
  padding: 12,
  marginBottom: 12,
};
const fmtUnit = (n) => `${new Intl.NumberFormat("tr-TR").format(Math.round(n))} TL/m²`;
const fmtDate = (d) =>
  d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString("tr-TR") : "";
const daysSince = (d) => (d ? Math.floor((Date.now() - new Date(`${d}T00:00:00`)) / 86400000) : 0);

const MIN_GROUP_LISTINGS = 3;
const normalizeName = (s) =>
  String(s || "")
    .replace(/\s+(Mah\.?|Mahallesi|Mh\.?)$/i, "")
    .trim()
    .toLocaleLowerCase("tr");

// Panodaki metin bir Sahibinden arama sonuç sayfası mı? Değilse hiç
// işlenmez (danışmanın panosundaki başka bir şey okunup tutulmaz).
function looksLikeSahibindenSearch(raw) {
  const t = String(raw || "");
  return /aramanızda/.test(t) && /#\d{7,}/.test(t) && /(sahibinden|İlan Başlığı)/i.test(t);
}

// Ofiste aynı mahalle için birden fazla kayıt olabilir - en günceline eklenir.
const latestRegion = (regions, base) =>
  regions
    .filter((r) => regionKey(r) === regionKey(base))
    .sort((a, b) => String(b.asOf || "").localeCompare(String(a.asOf || "")))[0];

const optionsFor = (key) => PROPERTY_DETAIL_FIELDS.find((f) => f.key === key)?.options || [];

function subjectFrom(p) {
  const d = p?.details || {};
  return {
    city: p?.city || "",
    district: p?.district || "",
    neighborhood: p?.neighborhood || "",
    propertyType: p?.propertyType || "Daire",
    grossM2: p?.grossM2 ?? "",
    netM2: p?.netM2 ?? "",
    roomCount: p?.roomCount || "",
    buildingAge: p?.buildingAge ?? "",
    floor: p?.floor || "",
    totalFloors: p?.totalFloors ?? "",
    details: {
      elevator: d.elevator || "",
      parking: d.parking || "",
      in_site: d.in_site || "",
      facade: Array.isArray(d.facade) ? d.facade : d.facade ? String(d.facade).split(/,\s*/) : [],
      view: Array.isArray(d.view) ? d.view : d.view ? String(d.view).split(/,\s*/) : [],
      condition: d.condition || "",
      heating: d.heating || "",
    },
    address: {
      street: p?.address || "",
      buildingNo: "",
      unitNo: p?.unitNo || "",
      siteName: "",
      parcelBlock: p?.parcelBlock || "",
      parcelNo: p?.parcelNo || "",
    },
    location: isValidLocation(d.geo) ? { lat: d.geo.lat, lng: d.geo.lng } : null,
    photo: null,
  };
}

// Kayıtlı analizin konusu, eski kayıtlarda olmayan alanlar boş kalacak
// şekilde güncel şablonla birleştirilir.
function subjectFromValuation(v, property) {
  const base = subjectFrom(property);
  const sub = v?.subject || {};
  return {
    ...base,
    ...sub,
    details: { ...base.details, ...(sub.details || {}) },
    address: { ...base.address, ...(sub.address || {}) },
  };
}

export function fullAddress(s) {
  const a = s.address || {};
  const line1 = [
    a.siteName,
    a.street,
    a.buildingNo && `No: ${a.buildingNo}`,
    a.unitNo && `Daire: ${a.unitNo}`,
  ]
    .filter(Boolean)
    .join(" ");
  const place = [s.neighborhood && `${s.neighborhood} Mah.`, s.district, s.city]
    .filter(Boolean)
    .join(", ");
  return [line1, place].filter(Boolean).join(", ");
}

function valuationTitle(s, property) {
  if (s.name && s.name.trim()) return s.name.trim();
  const a = s.address || {};
  const street = [a.street, a.buildingNo && `No: ${a.buildingNo}`, a.unitNo && `D: ${a.unitNo}`]
    .filter(Boolean)
    .join(" ");
  return [street, s.neighborhood].filter(Boolean).join(", ") || property?.title || "Adsız analiz";
}

// Fotoğraf analiz kaydının içinde (kişiye özel tablo) tutulur - küçültülür ki
// kayıt şişmesin.
async function resizeImage(file, max = 1280) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const LocationMap = lazy(() => import("./LocationMap"));

// Analiz açıkken yeni sürüm yayınlanırsa otomatik yenileme ertelenir; bu arada
// eski harita dosyası sunucudan silinmiş olur. Hata bütün uygulamayı değil sadece
// harita kutusunu etkilesin - girilenler taslakta, yenileyince geri gelir.
class MapErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        style={{
          ...box,
          fontSize: 12.5,
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <span style={{ flex: "1 1 240px" }}>
          Harita yüklenemedi - büyük olasılıkla Binerly'nin yeni sürümü yayınlandı. Girdiğiniz
          bilgiler korunuyor, sayfayı yenileyin.
        </span>
        <button type="button" style={{ fontSize: 12.5 }} onClick={() => window.location.reload()}>
          Sayfayı yenile
        </button>
      </div>
    );
  }
}

// Google Haritalar gibi yazarken öneren arama: aynı adlı mahalle/sokak başka
// ilçelerde de olduğu için tek sonuca atlamak yanlış yere götürüyordu.
function PlaceSearch({ bias, district, city, onPick }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const biasRef = useRef(bias);
  biasRef.current = bias;
  useEffect(() => {
    if (q.trim().length < 3) {
      setItems([]);
      return undefined;
    }
    let alive = true;
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await suggestPlaces(q, { bias: biasRef.current, district, city });
      if (!alive) return;
      setLoading(false);
      setItems(res);
      setActive(0);
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, district, city]);
  const pick = (it) => {
    onPick(it);
    setQ(it.title);
    setOpen(false);
  };
  return (
    <div style={{ position: "relative", marginBottom: 6 }}>
      <i
        className="ti ti-search"
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 9,
          top: "50%",
          transform: "translateY(-50%)",
          color: "var(--text-muted)",
          fontSize: 14,
          pointerEvents: "none",
        }}
      />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!items.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, items.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(items[active] || items[0]);
          } else if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Haritada ara: mahalle, sokak, site, okul, cami... (ör. Mevlana Bornova)"
        aria-autocomplete="list"
        style={{ width: "100%", fontSize: 12.5, paddingLeft: 28 }}
      />
      {open && q.trim().length >= 3 && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 2px)",
            left: 0,
            right: 0,
            zIndex: 1000,
            background: "var(--surface-1)",
            border: "0.5px solid var(--border)",
            borderRadius: "var(--radius)",
            boxShadow: "var(--shadow-md)",
            maxHeight: 280,
            overflowY: "auto",
          }}
        >
          {items.length === 0 ? (
            <p
              style={{ margin: 0, padding: "8px 10px", fontSize: 12.5, color: "var(--text-muted)" }}
            >
              {loading
                ? "Aranıyor…"
                : "Sonuç yok - ilçe adını da ekleyin ya da yakındaki okul/cami adını deneyin."}
            </p>
          ) : (
            items.map((it, i) => (
              <button
                key={`${it.title}|${it.subtitle}`}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(it)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "7px 10px",
                  border: "none",
                  borderRadius: 0,
                  boxShadow: "none",
                  background: i === active ? "var(--surface-2)" : "none",
                  fontSize: 12.5,
                }}
              >
                {it.kind && (
                  <span
                    style={{
                      fontSize: 10.5,
                      padding: "1px 6px",
                      marginRight: 6,
                      borderRadius: 4,
                      border: "0.5px solid var(--border)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {it.kind}
                  </span>
                )}
                <span style={{ fontWeight: 600 }}>{it.title}</span>
                {it.subtitle && (
                  <span style={{ color: "var(--text-muted)" }}> - {it.subtitle}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function AddressSection({ s, setS, hasPropertyPhoto, notify, focus, top }) {
  const a = s.address || {};
  const setA = (k) => (e) =>
    setS((p) => ({ ...p, address: { ...(p.address || {}), [k]: e.target.value } }));
  const [center, setCenter] = useState(null);
  const [coordText, setCoordText] = useState("");
  const applyCoords = () => {
    const c = parseCoordinates(coordText);
    if (!c) {
      notify("Koordinat okunamadı - örnek: 38.4664, 27.0880");
      return;
    }
    if (c.outsideTurkey) notify("Bu koordinat Türkiye dışında görünüyor - kontrol edin.");
    setS((p) => ({ ...p, location: { lat: c.lat, lng: c.lng } }));
    setCoordText("");
  };
  const [showMap, setShowMap] = useState(true);
  const hasLoc = isValidLocation(s.location);

  // Pin yoksa harita mahalleye götürülür (sadece mahalle/ilçe/il gönderilir).
  useEffect(() => {
    if (hasLoc || (!s.neighborhood && !s.district)) return undefined;
    let alive = true;
    const t = setTimeout(() => {
      geocodeArea({
        street: a.street,
        neighborhood: s.neighborhood,
        district: s.district,
        city: s.city,
      }).then((c) => alive && c && setCenter(c));
    }, 900);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [a.street, s.neighborhood, s.district, s.city, hasLoc]);

  const field = (k, label, flex = "1 1 120px") => (
    <div style={{ flex }}>
      <label style={labelStyle}>{label}</label>
      <input value={a[k] ?? ""} onChange={setA(k)} style={{ width: "100%" }} />
    </div>
  );
  return (
    <div style={box}>
      {/* Konumla ilgili her şey tek yerde: arama -> il/ilçe/mahalle (fiyat için
          gerekli) -> harita -> isteğe bağlı adres ayrıntıları (rapor/harita için;
          danışmanlar ada/parseli zorunlu sanıyordu). */}
      <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 8px" }}>Konum</p>
      {top}
      <div
        style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}
      >
        <span style={{ color: hasLoc ? "var(--text-success)" : "var(--text-warning)" }}>
          <i className={`ti ${hasLoc ? "ti-map-pin-check" : "ti-map-pin"}`} aria-hidden="true" />{" "}
          {hasLoc
            ? "Konum işaretlendi - iğneyi sürükleyerek düzeltebilirsiniz."
            : "Haritada binaya tıklayarak konumu işaretleyin."}
        </span>
        {hasLoc && (
          <>
            <a href={streetViewUrl(s.location)} target="_blank" rel="noopener noreferrer">
              Sokak görünümünde aç
            </a>
            <a href={mapsUrl(s.location)} target="_blank" rel="noopener noreferrer">
              Haritada aç
            </a>
            <button
              type="button"
              style={{ fontSize: 12 }}
              onClick={() => setS((p) => ({ ...p, location: null }))}
            >
              Konumu kaldır
            </button>
          </>
        )}
        <button
          type="button"
          style={{ fontSize: 12, marginLeft: "auto" }}
          onClick={() => setShowMap((v) => !v)}
        >
          {showMap ? "Haritayı gizle" : "Haritayı göster"}
        </button>
      </div>
      {showMap && (
        <div style={{ marginTop: 8 }}>
          <MapErrorBoundary>
            <Suspense
              fallback={
                <div style={{ height: 280, fontSize: 12, color: "var(--text-muted)" }}>
                  Harita yükleniyor…
                </div>
              }
            >
              <LocationMap
                location={s.location}
                center={center}
                focus={focus}
                onChange={(loc) => setS((p) => ({ ...p, location: loc }))}
              />
            </Suspense>
          </MapErrorBoundary>
          <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "4px 0 0" }}>
            Harita OpenStreetMap. Haritayı konumlamak için dış servise sokak, mahalle, ilçe, il ve
            arama kutusuna yazdığınız gönderilir; bina ve daire numarası gönderilmez.
          </p>
        </div>
      )}
      <p style={{ fontSize: 12.5, fontWeight: 600, margin: "12px 0 6px" }}>
        Adres ayrıntıları{" "}
        <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
          - isteğe bağlı, fiyatı etkilemez; raporda ve haritada görünür
        </span>
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {field("street", "Cadde / sokak", "2 1 220px")}
        {field("buildingNo", "Bina no", "0 1 90px")}
        {field("unitNo", "Daire no", "0 1 90px")}
        {field("siteName", "Site / apartman adı", "1 1 160px")}
        {field("parcelBlock", "Ada", "0 1 80px")}
        {field("parcelNo", "Parsel", "0 1 80px")}
      </div>
      <div
        style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}
      >
        <a
          href={TKGM_PARSEL_SORGU_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 12.5,
            padding: "4px 10px",
            border: "0.5px solid var(--border)",
            borderRadius: "var(--radius)",
            textDecoration: "none",
          }}
        >
          <i className="ti ti-map-search" aria-hidden="true" /> Parsel Sorgu'da aç
        </a>
        <input
          value={coordText}
          onChange={(e) => setCoordText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              applyCoords();
            }
          }}
          placeholder="Koordinat yapıştır: 38.4664, 27.0880"
          style={{ flex: "1 1 220px", fontSize: 12.5 }}
        />
        <button
          type="button"
          style={{ fontSize: 12.5 }}
          disabled={!coordText.trim()}
          onClick={applyCoords}
        >
          Konuma git
        </button>
        <InfoTip text="Tam konum için: Parsel Sorgu'da il/ilçe/mahalle/ada/parsel ile hangi bina olduğunu görün, sonra aynı binayı Google Haritalar'da bulup çatısına sağ tıklayın (telefonda basılı tutun) - en üstte çıkan koordinata tıklayınca kopyalanır, buraya yapıştırın. Parsel Sorgu'nun araç çubuğundaki koordinat yaklaşıktır (~10 m). Koordinat yerine aşağıdaki haritada binaya tıklayıp iğneyi sürükleyebilirsiniz de." />
      </div>
      <div
        style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}
      >
        {s.photo ? (
          <>
            <img
              src={s.photo}
              alt="Bina fotoğrafı"
              style={{ height: 70, borderRadius: 6, border: "0.5px solid var(--border)" }}
            />
            <button
              type="button"
              style={{ fontSize: 12, color: "var(--text-danger)" }}
              onClick={() => setS((p) => ({ ...p, photo: null }))}
            >
              Fotoğrafı kaldır
            </button>
          </>
        ) : (
          <label
            style={{
              fontSize: 12.5,
              padding: "4px 10px",
              border: "0.5px solid var(--border)",
              borderRadius: "var(--radius)",
              cursor: "pointer",
            }}
          >
            <i className="ti ti-camera" aria-hidden="true" /> Bina fotoğrafı ekle
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  const photo = await resizeImage(file);
                  setS((p) => ({ ...p, photo }));
                } catch {
                  notify("Fotoğraf okunamadı - JPG veya PNG deneyin.");
                }
              }}
            />
          </label>
        )}
        <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
          {s.photo
            ? "Rapor kapağında bu fotoğraf kullanılır."
            : hasPropertyPhoto
              ? "Eklemezseniz portföyün kapak fotoğrafı kullanılır."
              : "Raporun kapağına girer. Kendi çektiğiniz fotoğrafı kullanın - Google Haritalar görüntüleri izinsiz kullanılamaz."}
        </span>
      </div>
    </div>
  );
}

function SubjectForm({ s, setS, regionPrices = [], missing = new Set(), hideLocation = false }) {
  const lbl = (k, label) => (
    <label style={labelStyle}>
      {label}
      {missing.has(k) && (
        <span
          style={{ color: "var(--text-warning)", fontWeight: 600 }}
          title="Girilmedi - fiyatı etkiler"
        >
          {" "}
          • eksik
        </span>
      )}
    </label>
  );
  const set = (k) => (e) => setS((p) => ({ ...p, [k]: e.target.value }));
  const setD = (k, v) => setS((p) => ({ ...p, details: { ...p.details, [k]: v } }));
  const toggle = (k, opt) =>
    setD(
      k,
      s.details[k].includes(opt) ? s.details[k].filter((x) => x !== opt) : [...s.details[k], opt],
    );
  const input = (k, label, type = "text", flex = "1 1 110px") => (
    <div style={{ flex }}>
      {lbl(k, label)}
      <input type={type} value={s[k] ?? ""} onChange={set(k)} style={{ width: "100%" }} />
    </div>
  );
  const select = (k, label, options, flex = "1 1 130px") => (
    <div style={{ flex }}>
      {lbl(k, label)}
      <select
        value={s.details[k] ?? ""}
        onChange={(e) => setD(k, e.target.value)}
        style={{ width: "100%" }}
      >
        <option value="">Seçiniz</option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
  const checks = (k, label, options) => (
    <div style={{ flex: "1 1 200px" }}>
      {lbl(k, label)}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
        {options.map((o) => (
          <label key={o} style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={s.details[k].includes(o)}
              onChange={() => toggle(k, o)}
            />
            {o}
          </label>
        ))}
      </div>
    </div>
  );
  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {!hideLocation && (
          <LocationFields
            value={s}
            onChange={(patch) => setS((p) => ({ ...p, ...patch }))}
            suggestions={regionPrices.map((r) => ({
              name: r.neighborhood,
              city: r.city,
              district: r.district,
              tag: "bölge fiyatı var",
            }))}
            labelStyle={labelStyle}
            fieldStyle={{ flex: "1 1 110px" }}
          />
        )}
        {/* Konum Daire'den ayrılınca Tip satırda tek kalıp tüm genişliğe yayılıyordu. */}
        <div style={{ flex: hideLocation ? "0 1 260px" : "1 1 120px" }}>
          <label style={labelStyle}>Tip</label>
          <select value={s.propertyType} onChange={set("propertyType")} style={{ width: "100%" }}>
            {PROPERTY_TYPE_OPTIONS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {input("grossM2", "Brüt m²", "number")}
        {input("netM2", "Net m²", "number")}
        <div style={{ flex: "1 1 100px" }}>
          <label style={labelStyle}>Oda</label>
          <select value={s.roomCount} onChange={set("roomCount")} style={{ width: "100%" }}>
            <option value="">Seçiniz</option>
            {ROOM_COUNT_OPTIONS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
        {input("buildingAge", "Bina yaşı", "number")}
        {input("floor", "Bulunduğu kat")}
        {input("totalFloors", "Kat sayısı", "number")}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {select("condition", "Durum", CONDITION_OPTIONS)}
        {select("elevator", "Asansör", optionsFor("elevator"))}
        {select("parking", "Otopark", optionsFor("parking"))}
        {select("in_site", "Site içinde", optionsFor("in_site"))}
        {select("heating", "Isıtma", optionsFor("heating"))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {checks("facade", "Cephe", optionsFor("facade"))}
        {checks("view", "Manzara", VIEW_OPTIONS)}
      </div>
    </>
  );
}

function RegionPaste({
  regionPrices,
  subject,
  aliasTo,
  clipboardInput,
  onSaveRegion,
  onParsedLocation,
  notify,
}) {
  const [text, setText] = useState("");
  const [autoPending, setAutoPending] = useState(false);
  const [draft, setDraft] = useState(null);
  const [manual, setManual] = useState(false);
  const [manualM2, setManualM2] = useState("");
  const [typicalAge, setTypicalAge] = useState("");
  const [ageBandLabel, setAgeBandLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchUrl, setSearchUrl] = useState("");

  const read = (raw = text) => {
    const parsed = parseSearchPages(raw);
    if (parsed.listings.length === 0) {
      notify(
        "İlan bulunamadı - Sahibinden'de arama sonuç sayfasını (liste görünümü) Ctrl+A, Ctrl+C ile kopyalayın.",
      );
      return;
    }
    const base = {
      city: parsed.city || subject.city,
      district: parsed.district || subject.district,
      neighborhood: parsed.neighborhood || subject.neighborhood,
      propertyType: parsed.propertyType || subject.propertyType || "Daire",
      transactionType: parsed.transactionType || "satilik",
    };
    const groups = groupByNeighborhood(parsed.listings);
    if (!base.neighborhood && !groups) {
      notify("Mahalle okunamadı - aramada tek bir mahalle seçip tekrar kopyalayın.");
      return;
    }
    // Aynı aramanın diğer sayfaları (ya da diğer yaş aralıkları) 14 gün içinde
    // yapıştırılırsa birleştirilir.
    const existing = latestRegion(regionPrices, base);
    const mergeable =
      existing && existing.source === "ilan_yapistirma" && daysSince(existing.asOf) <= 14;
    setDraft({ ...base, parsed, existing, merged: mergeable, groups });
    setAgeBandLabel(parsed.ageBand || "");
    setTypicalAge(existing?.typicalAge ?? "");
    setSearchUrl(existing?.searchUrl || "");
  };
  const multiPage = !!draft?.parsed.pages;
  const band = AGE_BANDS.find((b) => b.label === ageBandLabel) || null;
  // Bir kez yaşı bilinen ilan (aynı ilan no) sonraki filtresiz güncellemelerde
  // de yaşını korur - her yaş aralığı mahalle başına bir kez yapıştırılır.
  const knownAges = new Map(
    regionPrices
      .flatMap((r) => r.listings || [])
      .filter((l) => l.age != null)
      .map((l) => [l.id, l]),
  );
  const withAge = (l) => {
    if (!multiPage && band) return { ...l, age: band.age, ageBand: band.label };
    if (l.age != null) return l;
    const known = knownAges.get(l.id);
    return known
      ? { ...l, age: known.age, ageBand: known.ageBand }
      : { ...l, age: null, ageBand: null };
  };

  // Yaş aralığı menüden değiştirilebildiği için birleştirme/özet her çizimde.
  const incoming = draft ? draft.parsed.listings.map(withAge) : [];
  // Eksiksiz arama: tek sayfa, yaş/oda/fiyat filtresi yok, toplam = okunan.
  const pasteComplete =
    !!draft &&
    !draft.parsed.pages &&
    !draft.parsed.ageBand &&
    (!draft.parsed.page || draft.parsed.page.total === 1) &&
    draft.parsed.totalCount != null &&
    draft.parsed.totalCount <= draft.parsed.listings.length &&
    !/(Bina Yaşı|Oda Sayısı|Fiyat|m² \(|Bulunduğu Kat|Kat Sayısı|Isıtma|Site İçerisinde|Kimden)/.test(
      (text.match(/Seçtiklerimi Gizle([\s\S]*?)Tümünü Temizle/) || [])[1] || "",
    );
  const draftListings = draft
    ? draft.merged
      ? mergeListings(draft.existing.listings, incoming)
      : incoming
    : [];
  const summary = draft ? summarizeListings(draftListings) : null;

  // Piyasa hareketi sadece önceki güncelleme başka bir gündeyse hesaplanır -
  // aynı gün aynı aramanın 2. sayfası "yeni ilan" sayılmasın.
  const movesFor = (existingRegion, incomingRows, complete) => {
    if (!existingRegion?.listings?.length) return existingRegion?.marketMoves ?? null;
    const today = istanbulToday();
    if (String(existingRegion.asOf || "") >= today) return existingRegion.marketMoves ?? null;
    return marketMoves(existingRegion.listings, incomingRows, { complete, today });
  };
  const regionFrom = (base, listings, existingRegion, summ, moves) => ({
    id: existingRegion?.id,
    city: base.city,
    district: base.district,
    neighborhood: base.neighborhood,
    propertyType: base.propertyType,
    transactionType: base.transactionType,
    medianM2: summ.medianM2,
    q1M2: summ.q1M2,
    q3M2: summ.q3M2,
    medianArea: summ.medianArea,
    listingCount: summ.listingCount,
    typicalAge: summ.typicalAge ?? existingRegion?.typicalAge ?? null,
    asOf: istanbulToday(),
    source: "ilan_yapistirma",
    searchUrl: normalizeSahibindenUrl(searchUrl) || existingRegion?.searchUrl || "",
    ...(moves !== undefined ? { marketMoves: moves } : {}),
    listings: listings.map(({ id, m2, rooms, price, date, age, ageBand, neighborhood }) => ({
      id,
      m2,
      rooms,
      price,
      date,
      age: age ?? null,
      ageBand: ageBand ?? null,
      neighborhood: neighborhood ?? null,
    })),
  });

  // Semt/çoklu mahalle aramasında her mahalle kendi bölgesi olur - karışık
  // ortanca hiçbir mahalleyi doğru temsil etmez.
  const multi = draft?.groups
    ? draft.groups.map((g) => {
        const base = { ...draft, neighborhood: g.neighborhood };
        const existingG = latestRegion(regionPrices, base);
        const mergeableG =
          existingG && existingG.source === "ilan_yapistirma" && daysSince(existingG.asOf) <= 14;
        const inc = g.listings.map(withAge);
        const all = mergeableG ? mergeListings(existingG.listings, inc) : inc;
        return {
          base,
          existing: existingG,
          incoming: inc,
          incomingCount: inc.length,
          listings: all,
          summary: summarizeListings(all),
          enough: all.length >= MIN_GROUP_LISTINGS,
        };
      })
    : null;

  const saveAll = async () => {
    setSaving(true);
    let savedCount = 0;
    let last = null;
    for (const g of multi.filter((x) => x.enough && x.summary)) {
      const region = regionFrom(
        g.base,
        g.listings,
        g.existing,
        g.summary,
        movesFor(g.existing, g.incoming, false),
      );
      if (await onSaveRegion(region)) {
        savedCount += 1;
        if (!last || normalizeName(g.base.neighborhood) === normalizeName(subject.neighborhood))
          last = region;
      }
    }
    setSaving(false);
    if (savedCount) {
      notify(`${savedCount} mahallenin bölge fiyatı kaydedildi.`, "success");
      setText("");
      setDraft(null);
      onParsedLocation(last);
    }
  };

  const save = async (region) => {
    setSaving(true);
    const ok = await onSaveRegion(region);
    setSaving(false);
    if (ok) {
      setText("");
      setDraft(null);
      setManual(false);
      setManualM2("");
      onParsedLocation(region);
    }
    return ok;
  };

  const checkItems =
    draft && !multi
      ? pasteChecks({
          raw: text,
          parsed: draft.parsed,
          subject,
          existing: draft.merged ? draft.existing : null,
          mergedCount: draftListings.length,
          ageBandLabel,
          aliasTo,
        })
      : [];

  // Panodan gelen metin: okunur; uyarı yoksa ayrıca "Kaydet" beklemeden
  // bölgeye eklenir, uyarı varsa danışmana gösterilir.
  const startFrom = (raw, auto) => {
    setText(raw);
    read(raw);
    setAutoPending(auto);
  };
  useEffect(() => {
    if (clipboardInput?.text) startFrom(clipboardInput.text, clipboardInput.auto);
    // sadece yeni pano içeriği geldiğinde
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipboardInput?.nonce]);
  useEffect(() => {
    if (!autoPending || !draft || saving) return;
    setAutoPending(false);
    if (multi || !summary || checkItems.some((c) => c.tone !== "info")) return;
    const region = regionFrom(
      draft,
      draftListings,
      draft.existing,
      summary,
      movesFor(draft.existing, incoming, pasteComplete),
    );
    const added = draftListings.length - (draft.merged ? draft.existing.listings.length : 0);
    save(region).then((ok) => {
      if (ok)
        notify(
          `${region.neighborhood} bölgesine ${Math.max(added, 0)} yeni ilan eklendi${draft.parsed.pages ? "" : draft.parsed.ageBand ? ` (${draft.parsed.ageBand})` : ""} - toplam ${region.listingCount} ilan.`,
          "success",
        );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPending, draft]);

  const pasteFromClipboard = async () => {
    let raw;
    try {
      raw = await navigator.clipboard.readText();
    } catch {
      notify("Panoya erişilemedi - tarayıcıda pano iznine izin verin ya da kutuya Ctrl+V yapın.");
      return;
    }
    if (!looksLikeSahibindenSearch(raw)) {
      notify(
        "Panoda Sahibinden arama sayfası yok - Sahibinden'de sonuç sayfasında Ctrl+A, Ctrl+C yapın.",
      );
      return;
    }
    startFrom(raw, true);
  };

  return (
    <div style={{ marginTop: 8 }}>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDraft(null);
        }}
        rows={3}
        placeholder="Sahibinden'de mahalle + emlak tipi ile arama yapın (liste görünümü, sayfa başına 50), sayfada Ctrl+A, Ctrl+C yapıp buraya yapıştırın"
        style={{ width: "100%", resize: "vertical", marginBottom: 6 }}
      />
      <details style={{ fontSize: 12.5, marginBottom: 6, color: "var(--text-secondary)" }}>
        <summary style={{ cursor: "pointer" }}>En isabetli sonuç için nasıl yapıştırılır?</summary>
        <ol style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.6 }}>
          <li>Sahibinden'de Emlak &gt; Konut &gt; Satılık (veya Kiralık) &gt; Daire'ye girin.</li>
          <li>Adres'ten il, ilçe ve sadece TEK bir mahalle seçin.</li>
          <li>
            Soldaki Bina Yaşı'ndan tek bir aralık seçin - önce dairenizin aralığı
            {bandForAge(subject.buildingAge) ? ` ("${bandForAge(subject.buildingAge).label}")` : ""}
            . Oda sayısı, m², fiyat, kat gibi başka filtre SEÇMEYİN; bölge fiyatı mahallenin
            tamamını temsil etmeli.
          </li>
          <li>Liste görünümünde "sayfa başına 50" seçin.</li>
          <li>
            Sayfada Ctrl+A, Ctrl+C; buraya Ctrl+V. Birden fazla sayfa varsa her birini ayrı
            yapıştırın.
          </li>
          <li>
            Diğer yaş aralıklarını da (0-5, 6-10, 11-20, 21-30, 31+) aynı şekilde ekleyin - 14 gün
            içindeki yapıştırmalar birleşir; yaşı bilinen 12+ ilanla yaşın etkisi bu mahalleden
            ölçülür.
          </li>
        </ol>
      </details>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button
          type="button"
          style={{
            fontSize: 12.5,
            background: "var(--fill-accent)",
            color: "var(--on-accent)",
            border: "none",
          }}
          onClick={pasteFromClipboard}
        >
          <i className="ti ti-clipboard-check" aria-hidden="true" /> Panodan ekle
        </button>
        <button
          type="button"
          style={{ fontSize: 12.5 }}
          disabled={!text.trim()}
          onClick={() => read()}
        >
          İlanları oku
        </button>
        <button type="button" style={{ fontSize: 12.5 }} onClick={() => setManual((v) => !v)}>
          Elle m² fiyatı gir
        </button>
      </div>

      {draft && multi && (
        <div style={{ ...box, marginTop: 8, background: "var(--surface-1)" }}>
          <p style={{ fontSize: 13, margin: "0 0 6px" }}>
            <b>Bu arama birden fazla mahalle içeriyor</b> ({draft.parsed.listings.length} ilan).
            Bölge fiyatı mahalle bazında tutulur - ilanlar mahallelerine ayrıldı:
          </p>
          <div style={{ fontSize: 12.5, marginBottom: 6 }}>
            {multi.map((g) => (
              <div
                key={g.base.neighborhood}
                style={{
                  padding: "3px 0",
                  color: g.enough ? undefined : "var(--text-muted)",
                  fontWeight:
                    normalizeName(g.base.neighborhood) === normalizeName(subject.neighborhood)
                      ? 600
                      : 400,
                }}
              >
                {g.base.neighborhood}: {g.incomingCount} ilan
                {g.listings.length > g.incomingCount ? ` (kayıtlılarla ${g.listings.length})` : ""}
                {g.summary ? ` · ortanca ${fmtUnit(g.summary.medianM2)}` : ""}
                {!g.enough && ` · ${MIN_GROUP_LISTINGS}'ten az ilan, kaydedilmez`}
              </div>
            ))}
          </div>
          {subject.neighborhood &&
            !multi.some(
              (g) => normalizeName(g.base.neighborhood) === normalizeName(subject.neighborhood),
            ) && (
              <p style={{ fontSize: 12, color: "var(--text-warning)", margin: "0 0 6px" }}>
                Bu sayfada {subject.neighborhood} mahallesinden ilan yok.
              </p>
            )}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 220px" }}>
              <label style={labelStyle}>Bu sayfadaki ilanların bina yaşı</label>
              <select
                value={ageBandLabel}
                onChange={(e) => setAgeBandLabel(e.target.value)}
                style={{ width: "100%" }}
              >
                <option value="">Filtre yok / karışık</option>
                {AGE_BANDS.map((b) => (
                  <option key={b.label} value={b.label}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "6px 0 0" }}>
            Daha isabetli sonuç için Sahibinden'de semt yerine tek bir mahalle seçip arayın - tek
            mahallede sayfa başına daha çok ilan gelir.
          </p>
          <button
            type="button"
            disabled={saving || !multi.some((g) => g.enough)}
            onClick={saveAll}
            style={{
              marginTop: 8,
              background: "var(--fill-accent)",
              color: "var(--on-accent)",
              border: "none",
            }}
          >
            {saving
              ? "Kaydediliyor…"
              : `${multi.filter((g) => g.enough).length} mahalleyi ayrı ayrı kaydet`}
          </button>
        </div>
      )}

      {draft && !multi && summary && (
        <div style={{ ...box, marginTop: 8, background: "var(--surface-1)" }}>
          <p style={{ fontSize: 13, margin: "0 0 6px" }}>
            <b>
              {draft.neighborhood}
              {draft.district ? `, ${draft.district}` : ""}
              {draft.city ? `, ${draft.city}` : ""}
            </b>{" "}
            · {draft.transactionType === "kiralik" ? "Kiralık" : "Satılık"} {draft.propertyType}
          </p>
          {multiPage && (
            <p style={{ fontSize: 12.5, margin: "0 0 6px" }}>
              <i className="ti ti-files" aria-hidden="true" /> {draft.parsed.pages.length} sayfa
              okundu:{" "}
              {draft.parsed.pages
                .map((pg) => `${pg.ageBand || "yaş filtresi yok"} (${pg.count} ilan)`)
                .join(" · ")}
            </p>
          )}
          <p style={{ fontSize: 12.5, margin: "0 0 6px", color: "var(--text-secondary)" }}>
            {multiPage ? "Toplam" : "Bu sayfadan"} {draft.parsed.listings.length} ilan okundu
            {draft.merged ? `, önceki yapıştırmalarla birlikte ${draftListings.length} ilan` : ""}
            {draft.parsed.totalCount ? ` (bu aramada toplam ${draft.parsed.totalCount} ilan)` : ""}.
            {summary.outliers > 0 && ` ${summary.outliers} uç değer hesaba katılmadı.`} Ortanca ilan
            fiyatı <b>{fmtUnit(summary.medianM2)}</b>, tipik daire {summary.medianArea} m².
          </p>
          <Notices items={checkItems} />
          {draft.parsed.page && draft.parsed.page.current < draft.parsed.page.total && (
            <p style={{ fontSize: 12, margin: "0 0 6px", color: "var(--text-warning)" }}>
              Aramada {draft.parsed.page.total} sayfa var. Kaydettikten sonra diğer sayfaları da
              yapıştırırsanız ilanlar birleştirilir (ya da sayfa başına 50 sonuç seçin).
            </p>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            {!multiPage && (
              <div style={{ flex: "1 1 220px" }}>
                <label style={labelStyle}>
                  Bu sayfadaki ilanların bina yaşı
                  <InfoTip text="Sahibinden'de Bina Yaşı filtresiyle aradıysanız sayfadan okunup kendiliğinden seçilir. Filtre kullanmadıysanız boş bırakın - daha önce yaşı öğrenilmiş ilanlar yaşını korur." />
                </label>
                <select
                  value={ageBandLabel}
                  onChange={(e) => setAgeBandLabel(e.target.value)}
                  style={{ width: "100%" }}
                >
                  <option value="">Filtre yok / karışık</option>
                  {AGE_BANDS.map((b) => (
                    <option key={b.label} value={b.label}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ flex: "2 1 260px" }}>
              <label style={labelStyle}>
                Sahibinden arama bağlantısı (isteğe bağlı)
                <InfoTip text="Sahibinden'de bu mahallenin aramasını yaptığınız sayfanın adres çubuğundaki bağlantı. Bir kez eklerseniz eksik yaş aralıklarının filtreli aramasını buradan tek tıkla açabilirsiniz." />
              </label>
              <input
                value={searchUrl}
                onChange={(e) => setSearchUrl(e.target.value)}
                placeholder="https://www.sahibinden.com/satilik-daire/..."
                style={{ width: "100%" }}
              />
              {searchUrl && !normalizeSahibindenUrl(searchUrl) && (
                <span style={{ fontSize: 11.5, color: "var(--text-warning)" }}>
                  Bu bir sahibinden.com bağlantısı değil.
                </span>
              )}
            </div>
          </div>
          {summary.agedCount > 0 && (
            <p style={{ fontSize: 12, margin: "6px 0 0", color: "var(--text-secondary)" }}>
              Yaşı bilinen ilan: {summary.agedCount}
              {summary.typicalAge != null &&
                ` · tipik bina yaşı ${summary.typicalAge} (ilanlardan)`}
              {summary.ageSlope != null
                ? ` · yaşın etkisi bölge verisinden: yılda %${summary.ageSlope}`
                : " · yaş etkisini bölge verisinden ölçmek için en az 12 ilan ve 2 farklı yaş aralığı gerekir"}
            </p>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              save(
                regionFrom(
                  draft,
                  draftListings,
                  draft.existing,
                  summary,
                  movesFor(draft.existing, incoming, pasteComplete),
                ),
              )
            }
            style={{
              marginTop: 8,
              background: "var(--fill-accent)",
              color: "var(--on-accent)",
              border: "none",
            }}
          >
            {saving ? "Kaydediliyor…" : "Bölge fiyatı olarak kaydet"}
          </button>
        </div>
      )}

      {manual && (
        <div
          style={{
            ...box,
            marginTop: 8,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          <div style={{ flex: "1 1 160px" }}>
            <label style={labelStyle}>
              {subject.neighborhood || "Mahalle"} ortalama ilan m² fiyatı (brüt)
            </label>
            <input
              type="number"
              value={manualM2}
              onChange={(e) => setManualM2(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ flex: "0 1 160px" }}>
            <label style={labelStyle}>Tipik bina yaşı</label>
            <input
              type="number"
              value={typicalAge}
              onChange={(e) => setTypicalAge(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
          <button
            type="button"
            disabled={!Number(manualM2) || !subject.neighborhood || saving}
            onClick={() => {
              const base = {
                city: subject.city,
                district: subject.district,
                neighborhood: subject.neighborhood,
                propertyType: subject.propertyType || "Daire",
                transactionType: "satilik",
              };
              const existing = latestRegion(regionPrices, base);
              save({
                ...base,
                id: existing?.id,
                medianM2: Number(manualM2),
                q1M2: null,
                q3M2: null,
                medianArea: null,
                listingCount: 0,
                typicalAge: typicalAge === "" ? null : Number(typicalAge),
                asOf: istanbulToday(),
                source: "elle",
                listings: [],
              });
            }}
          >
            Kaydet
          </button>
          {!subject.neighborhood && (
            <p style={{ fontSize: 12, color: "var(--text-warning)", margin: 0, flexBasis: "100%" }}>
              Önce yukarıda mahalleyi yazın.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Fotoğraf imzalı URL'si async geldiği için pencere tıklama anında (popup
// engeline takılmadan) açılıp içerik sonradan yazılır.
async function printReport(args, getPhotoUrl) {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write("<p style='font-family:Arial;padding:24px'>Rapor hazırlanıyor…</p>");
  let photoUrl;
  try {
    photoUrl = args.subject.photo || (getPhotoUrl ? await getPhotoUrl() : null);
  } catch {
    photoUrl = null;
  }
  let mapImage = null;
  if (isValidLocation(args.subject.location)) {
    try {
      mapImage = await renderMapImage(args.subject.location, {
        width: photoUrl ? 330 : 680,
        height: 330,
      });
    } catch {
      mapImage = null; // harita olmadan da rapor çıksın
    }
  }
  win.document.open();
  win.document.write(
    buildValuationReportHtml({ ...args, photoUrl, mapImage, disclaimer: DISCLAIMER }),
  );
  win.document.close();
  return true;
}

// Piyasa analizinde girilen daire bilgileri portföy kaydına geri yazılabilsin
// (bir sonraki analizde ve ilan metninde tekrar girilmesin).
function subjectPatch(s) {
  const n = (v) => (v === "" || v == null ? null : Number(v));
  const details = Object.fromEntries(
    Object.entries(s.details).filter(([, v]) => (Array.isArray(v) ? v.length : v)),
  );
  return {
    grossM2: n(s.grossM2),
    netM2: n(s.netM2),
    roomCount: s.roomCount || "",
    buildingAge: n(s.buildingAge),
    floor: s.floor || "",
    totalFloors: n(s.totalFloors),
    details: isValidLocation(s.location)
      ? { ...details, geo: { lat: s.location.lat, lng: s.location.lng } }
      : details,
  };
}

const TONE_COLORS = {
  danger: { bg: "var(--bg-danger)", fg: "var(--text-danger)", icon: "ti-alert-octagon" },
  warning: { bg: "var(--bg-warning)", fg: "var(--text-warning)", icon: "ti-alert-triangle" },
  info: { bg: "var(--surface-1)", fg: "var(--text-secondary)", icon: "ti-info-circle" },
};

function Notices({ items }) {
  if (!items.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
      {items.map((w, i) => {
        const t = TONE_COLORS[w.tone] || TONE_COLORS.info;
        return (
          <div
            key={i}
            style={{
              fontSize: 12.5,
              padding: "6px 10px",
              borderRadius: 6,
              background: t.bg,
              borderLeft: `3px solid ${t.fg}`,
              lineHeight: 1.45,
            }}
          >
            <i className={`ti ${t.icon}`} aria-hidden="true" style={{ color: t.fg }} /> {w.text}
          </div>
        );
      })}
    </div>
  );
}

// Dairenin yaşı için gereken Sahibinden yaş aralıkları, her birinden kaç
// ilan olduğu ve (bağlantı kayıtlıysa) filtreli aramayı açan düğme.
function NeededBands({ region, subjectAge, onSaveRegion }) {
  const [urlDraft, setUrlDraft] = useState("");
  const bands = nearBandsFor(subjectAge);
  if (!region || !bands.length) return null;
  const counts = new Map();
  for (const l of region.listings || []) {
    if (l.ageBand) counts.set(l.ageBand, (counts.get(l.ageBand) || 0) + 1);
  }
  const total = bands.reduce((t, b) => t + (counts.get(b.label) || 0), 0);
  const ok = total >= MIN_NEAR_AGE_LISTINGS;
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ color: ok ? "var(--text-success)" : "var(--text-warning)" }}>
          <i className={`ti ${ok ? "ti-circle-check" : "ti-list-check"}`} aria-hidden="true" /> Bu
          daire ({subjectAge} yaş) için gereken emsal: {total}/{MIN_NEAR_AGE_LISTINGS}
        </span>
        {bands.map((b) => {
          const n = counts.get(b.label) || 0;
          const url = region.searchUrl ? sahibindenBandUrl(region.searchUrl, b.label) : null;
          return (
            <span
              key={b.label}
              style={{
                fontSize: 11.5,
                padding: "2px 8px",
                borderRadius: 10,
                background: n ? "var(--surface-1)" : "var(--bg-warning)",
                border: "0.5px solid var(--border)",
              }}
            >
              {n ? "✓" : "✗"} {b.label}: {n} ilan
              {url && (
                <>
                  {" · "}
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    Sahibinden'de aç
                  </a>
                </>
              )}
            </span>
          );
        })}
      </div>
      {!region.searchUrl && !ok && onSaveRegion && (
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          <input
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="Sahibinden'de bu mahallenin arama bağlantısı (bir kez)"
            style={{ flex: "1 1 260px", fontSize: 12 }}
          />
          <button
            type="button"
            style={{ fontSize: 12 }}
            disabled={!normalizeSahibindenUrl(urlDraft)}
            onClick={() => {
              const { aliasFrom: _a, ...clean } = region;
              onSaveRegion({ ...clean, searchUrl: normalizeSahibindenUrl(urlDraft) });
              setUrlDraft("");
            }}
          >
            Bağlantıyı kaydet
          </button>
          <span style={{ fontSize: 11.5, color: "var(--text-muted)", flexBasis: "100%" }}>
            Kaydederseniz eksik yaş aralıklarının filtreli araması buradan tek tıkla açılır.
          </span>
        </div>
      )}
    </div>
  );
}

function RegionAgeTag({ days }) {
  if (days <= REGION_STALE_DAYS)
    return <span style={{ color: "var(--text-muted)" }}>({days} gün)</span>;
  const old = days > REGION_OLD_DAYS;
  return (
    <span
      style={{
        fontSize: 11,
        padding: "1px 6px",
        borderRadius: 4,
        background: old ? "var(--bg-danger)" : "var(--bg-warning)",
        color: old ? "var(--text-danger)" : "var(--text-warning)",
      }}
    >
      {days} gün - güncelleyin
    </span>
  );
}

export function AutoValuation({
  property,
  properties = [],
  regionPrices,
  marketIndex: liveMarketIndex,
  companySettings,
  agent,
  getPhotoUrl,
  onSaveRegion: saveRegionProp,
  onDeleteRegion,
  onSaveFactors,
  onSaveAliases,
  onApplyPrice,
  onSaveSubject,
  valuation = null,
  onSaveValuation,
  onValuationSaved,
  hasPropertyPhoto = false,
  notify,
  detailed,
}) {
  // Sekme değişince / sürüm güncellemesiyle sayfa yenilenince girilenler
  // kaybolmasın. Portföy/kayıt sonradan değiştiyse eski taslak kullanılmaz.
  const initial = useMemo(
    () => (valuation ? subjectFromValuation(valuation, property) : subjectFrom(property)),
    // sadece açılışta
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const draftStore = useFormDraft(
    valuation ? `valuation:v:${valuation.id}` : `valuation:${property?.id || "free"}`,
    true,
  );
  const [baseline, setBaseline] = useState(initial);
  const [s, setS] = useState(() =>
    draftStore.draft.subject &&
    JSON.stringify(draftStore.draft.baseline) === JSON.stringify(initial)
      ? draftStore.draft.subject
      : initial,
  );
  const [valuationId, setValuationId] = useState(valuation?.id || null);
  const [savedJson, setSavedJson] = useState(() => (valuation ? JSON.stringify(initial) : null));
  const [savingValuation, setSavingValuation] = useState(false);
  const [valuationStatus, setValuationStatus] = useState(valuation?.status || null);
  const [autoSavedAt, setAutoSavedAt] = useState(null);
  // Otomatik kayıt ile elle kayıt aynı anda çalışırsa iki ayrı kayıt
  // oluşmasın diye kimlik ve süren kayıt ref'te tutulur.
  const valuationIdRef = useRef(valuation?.id || null);
  const inFlightRef = useRef(null);
  const subjectUnsaved = savedJson !== JSON.stringify(s);
  const resultKeyOf = (r) => (r ? [r.low, r.mid, r.high, r.rentMonthly ?? ""].join("|") : "");
  const [savedResultKey, setSavedResultKey] = useState(() =>
    valuation ? resultKeyOf(valuation.result) : null,
  );
  const dirty = JSON.stringify(s) !== JSON.stringify(baseline);
  const { persist, clear: clearDraft } = draftStore;
  // Yeni (kaydı olmayan) analiz veritabanına bir kez yazıldıysa ortak "yeni
  // analiz" taslağı silinir ve bir daha yazılmaz: aksi halde her "Yeni analiz"
  // bir öncekinin bilgileriyle açılıyor, düzenlenince otomatik kayıt onu yeni
  // bir taslak analiz olarak çoğaltıyordu. Kayıtlı analiz zaten kendiliğinden kaydediliyor.
  // Kayıttan sonra üst bileşen valuation'ı doldurur ama taslak anahtarı açılıştaki kalır.
  const openedAsNew = useRef(!valuation).current;
  const savedFreeAnalysis = openedAsNew && !!valuationId;
  useEffect(() => {
    if (savedFreeAnalysis) clearDraft();
    else persist({ subject: s, baseline }, dirty);
  }, [s, baseline, dirty, persist, clearDraft, savedFreeAnalysis]);
  const [savingSubject, setSavingSubject] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [showFactors, setShowFactors] = useState(false);
  const [showRegions, setShowRegions] = useState(false);
  const [showDetailed, setShowDetailed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [staleReportPrompt, setStaleReportPrompt] = useState(false);
  const [clipOffer, setClipOffer] = useState(null);
  const [pasteIncoming, setPasteIncoming] = useState(null);
  // Adres tek yerden girilsin: aramadan seçilen yer formun BOŞ alanlarını doldurur.
  // Başka ilçedeki bir yer seçildiyse (yakındaki okul vb.) alanlara dokunulmaz.
  const [mapFocus, setMapFocus] = useState(null);
  const pickPlace = async (p) => {
    setMapFocus({ lat: p.lat, lng: p.lng, zoom: p.zoom, at: Date.now() });
    const off = await resolveOfficialPlace(p.parts);
    const lc = (v) => String(v || "").toLocaleLowerCase("tr");
    const next = { ...s, address: { ...(s.address || {}) } };
    const filled = [];
    if (!s.city && off.city) {
      next.city = off.city;
      filled.push("il");
    }
    const cityOk = !!off.city && lc(next.city) === lc(off.city);
    if (cityOk && !s.district && off.district) {
      next.district = off.district;
      filled.push("ilçe");
    }
    const districtOk = cityOk && !!off.district && lc(next.district) === lc(off.district);
    if (!districtOk) {
      const otherDistrict = s.district && off.district && lc(s.district) !== lc(off.district);
      if (otherDistrict) {
        notify(
          `Seçilen yer ${off.district} ilçesinde, formda ${s.district} seçili - alanlar değiştirilmedi.`,
        );
        return;
      }
      // İlçesi bilinmeyen yer (OSM'de eksik): sadece il ve bina konumu.
      if (cityOk && p.parts.building && !isValidLocation(s.location)) {
        next.location = { lat: p.lat, lng: p.lng };
        filled.push("haritada konum");
      }
      if (filled.length) {
        setS(next);
        notify(`Dolduruldu: ${filled.join(", ")}. İlçe ve mahalleyi seçin.`, "success");
      }
      return;
    }
    let mahalleNote = null;
    if (!s.neighborhood) {
      if (off.neighborhood) {
        next.neighborhood = off.neighborhood;
        filled.push("mahalle");
      } else if (p.parts.neighborhood)
        mahalleNote = `"${p.parts.neighborhood}" resmi mahalle listesinde yok - mahalleyi listeden seçin.`;
    }
    if (!next.address.street && p.parts.street) {
      next.address.street = p.parts.street;
      filled.push("sokak");
    }
    if (!next.address.siteName && p.parts.siteName) {
      next.address.siteName = p.parts.siteName;
      filled.push("site/apartman adı");
    }
    if (!next.address.buildingNo && p.parts.buildingNo) {
      next.address.buildingNo = p.parts.buildingNo;
      filled.push("bina no");
    }
    if (p.parts.building && !isValidLocation(s.location)) {
      next.location = { lat: p.lat, lng: p.lng };
      filled.push("haritada konum");
    }
    if (filled.length) setS(next);
    const rest = [!next.address.buildingNo && "bina no", !next.address.unitNo && "daire no"]
      .filter(Boolean)
      .join(" ve ");
    const msg = [
      filled.length ? `Dolduruldu: ${filled.join(", ")}.` : null,
      filled.length && rest ? `Aşağıda ${rest} girin.` : null,
      mahalleNote,
    ]
      .filter(Boolean)
      .join(" ");
    if (msg) notify(msg, mahalleNote ? undefined : "success");
  };
  // Kayıtlı analiz kaydedildiği günün verileriyle açılır - mal sahibine verilen
  // rapor, bölgeye sonradan ilan eklenince (ofisteki başka biri eklese bile)
  // sessizce değişmesin. Danışman isterse "güncel verilerle güncelle" der ya da
  // analizin içinden bölgeyi kendisi günceller (kullanıcı kararı, 25 Kas).
  const frozen = valuation?.inputs || null;
  const [live, setLive] = useState(!valuation);
  const savedFactors = companySettings?.realEstateSettings?.avmFactors || {};
  const [factors, setFactors] = useState(() => ({
    ...AVM_FACTOR_DEFAULTS,
    ...(valuation && frozen?.factors ? frozen.factors : savedFactors),
  }));
  const onSaveRegion = saveRegionProp
    ? async (region) => {
        const ok = await saveRegionProp(region);
        if (ok) setLive(true);
        return ok;
      }
    : undefined;

  const aliases = companySettings?.realEstateSettings?.neighborhoodAliases || [];
  const liveSaleRegion = findRegion(regionPrices, s, "satilik", aliases);
  const liveRentRegion = findRegion(regionPrices, s, "kiralik", aliases);
  // Mahalle/ilçe/tip değiştirildiyse saklanan bölge bu daireye ait değil.
  const sameArea = ["city", "district", "neighborhood", "propertyType"].every(
    (k) => String(s[k] || "") === String(initial[k] || ""),
  );
  const useSnapshot = !live && !!frozen && sameArea;
  const saleRegion = useSnapshot && frozen.saleRegion ? frozen.saleRegion : liveSaleRegion;
  const rentRegion = useSnapshot && frozen.rentRegion ? frozen.rentRegion : liveRentRegion;
  const marketIndex = useMemo(
    () =>
      useSnapshot && frozen.asOf
        ? (liveMarketIndex || []).filter((m) => String(m.period) <= frozen.asOf)
        : liveMarketIndex,
    [useSnapshot, frozen, liveMarketIndex],
  );
  const [aliasTarget, setAliasTarget] = useState("");
  const aliasCandidates = [
    ...new Map(
      regionPrices
        .filter(
          (r) =>
            !s.district ||
            !r.district ||
            r.district.toLocaleLowerCase("tr") === s.district.toLocaleLowerCase("tr"),
        )
        .map((r) => [r.neighborhood.toLocaleLowerCase("tr"), r.neighborhood]),
    ).values(),
  ].sort((a, b) => a.localeCompare(b, "tr"));
  const linkAlias = (to) => {
    const from = s.neighborhood.trim();
    const rest = aliases.filter(
      (a) => a.from.toLocaleLowerCase("tr") !== from.toLocaleLowerCase("tr"),
    );
    onSaveAliases?.(
      to ? [...rest, { city: s.city || "", district: s.district || "", from, to }] : rest,
    );
  };
  const extraSpread = subjectChecks({ subject: s, region: saleRegion, factors }).extraSpread;
  const result = useMemo(
    () => estimateValue({ subject: s, saleRegion, rentRegion, marketIndex, factors, extraSpread }),
    [s, saleRegion, rentRegion, marketIndex, factors, extraSpread],
  );
  // Sabit analizde güncel verilerin vereceği değer - sadece bilgi için gösterilir.
  const liveResult = useMemo(() => {
    if (live || !valuation) return null;
    const r = estimateValue({
      subject: s,
      saleRegion: liveSaleRegion,
      rentRegion: liveRentRegion,
      marketIndex: liveMarketIndex,
      factors,
      extraSpread: subjectChecks({ subject: s, region: liveSaleRegion, factors }).extraSpread,
    });
    return r.error ? null : r;
  }, [live, valuation, s, liveSaleRegion, liveRentRegion, liveMarketIndex, factors]);
  const shownMid = useSnapshot ? (result.error ? null : result.value.mid) : valuation?.result?.mid;
  const liveDiffers =
    !!liveResult &&
    shownMid != null &&
    Math.abs(liveResult.value.mid - shownMid) / shownMid >= 0.005;
  const resultSnapshot = result.error
    ? null
    : {
        low: result.value.low,
        mid: result.value.mid,
        high: result.value.high,
        rentMonthly: result.rent?.monthly ?? null,
        region: result.region?.neighborhood || null,
        regionAsOf: result.region?.asOf || null,
      };
  // Daire bilgisi aynı kalsa da bölgeye yeni ilan eklenince / hesap kuralı
  // değişince değer değişebilir - kayıttaki değer güncel değere çekilir
  // (kullanıcı bildirdi: fiyat düştü ama listede eski değer kaldı).
  const resultChanged = !!valuationId && live && savedResultKey !== resultKeyOf(resultSnapshot);
  const unsavedAnalysis = subjectUnsaved || resultChanged;
  const checks = subjectChecks({ subject: s, region: saleRegion, result, property, factors });
  const missingKeys = new Set(checks.missing.map((m) => m.key));
  const coverage = ageCoverage(saleRegion?.listings, s.buildingAge);
  const subjectDirty =
    property &&
    onSaveSubject &&
    JSON.stringify(subjectPatch(s)) !== JSON.stringify(subjectPatch(baseline));
  const closed = useMemo(
    () =>
      closedTransactions(
        properties.filter((p) => p.id !== property?.id),
        s,
        "satilik",
        marketIndex,
      ),
    [properties, property?.id, s, marketIndex],
  );
  const officeDiscount = useMemo(() => officeAskingDiscount(properties, "satilik"), [properties]);
  const discountDiffers =
    officeDiscount.percent != null &&
    Math.abs(officeDiscount.percent - Number(factors.askingDiscountPercent || 0)) >= 1;
  const age = regionAgeDays(saleRegion);
  const rentAge = regionAgeDays(rentRegion);
  const stale = saleRegion && age > REGION_STALE_DAYS;
  const rentStale = rentRegion && rentAge > REGION_STALE_DAYS;
  const askUpdate = () => {
    setStaleReportPrompt(false);
    setPasteOpen(true);
  };
  const saveValuation = async ({ quiet = false, auto = false } = {}) => {
    if (!onSaveValuation) return null;
    if (inFlightRef.current) await inFlightRef.current;
    const snapshot = s;
    const status = auto ? valuationStatus || "taslak" : "kaydedildi";
    if (!auto) setSavingValuation(true);
    const job = onSaveValuation({
      id: valuationIdRef.current,
      propertyId: property?.id || null,
      title: valuationTitle(snapshot, property),
      subject: snapshot,
      status,
      quiet: auto,
      result: resultSnapshot,
      inputs: {
        saleRegion: saleRegion || null,
        rentRegion: rentRegion || null,
        factors,
        asOf: useSnapshot && frozen?.asOf ? frozen.asOf : istanbulToday(),
      },
    });
    inFlightRef.current = job;
    const saved = await job;
    inFlightRef.current = null;
    if (!auto) setSavingValuation(false);
    if (!saved) return null;
    // Burada hemen silinmeli: Piyasa Analizi sekmesi kayıttan sonra bileşeni
    // kayıtlı analiz olarak yeniden kuruyor, effect'teki silme hiç çalışmıyordu.
    if (openedAsNew) clearDraft();
    valuationIdRef.current = saved.id;
    setValuationId(saved.id);
    setValuationStatus(saved.status);
    setSavedJson(JSON.stringify(snapshot));
    setSavedResultKey(resultKeyOf(resultSnapshot));
    setAutoSavedAt(new Date());
    // Kayıtlı analiz artık veritabanında - yerel taslağa gerek yok (portföy
    // kaydı için baseline korunur ki "portföye kaydet" düğmesi kaybolmasın).
    if (!property) setBaseline(snapshot);
    onValuationSaved?.(saved);
    if (!quiet && !auto) notify("Analiz kaydedildi - Kayıtlı analizlerim listesinde.", "success");
    return saved;
  };
  // Kaydetmeyi unutanlar için: mahalle + m² girilmiş ve açılıştan beri
  // değişmiş bir analiz birkaç saniye sonra kendiliğinden "taslak" olarak yazılır.
  const meaningful = !!(s.neighborhood && (Number(s.grossM2) || Number(s.netM2)));
  const changedSinceOpen = JSON.stringify(s) !== JSON.stringify(initial);
  const sJson = JSON.stringify(s);
  useEffect(() => {
    if (!onSaveValuation || !meaningful || !unsavedAnalysis) return undefined;
    if (!changedSinceOpen && !resultChanged) return undefined;
    const t = setTimeout(() => saveValuation({ auto: true }), 2500);
    return () => clearTimeout(t);
    // sJson s'in içeriğini temsil eder; saveValuation her çizimde yeniden yaratılır
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sJson, meaningful, changedSinceOpen, unsavedAnalysis, resultChanged]);
  // "Güncel verilerle güncelle": değer aynı çıksa bile saklanan veri tarihi
  // yenilenmeli - yoksa bir sonraki açılışta eski verilere dönülürdü.
  const [refreshRequested, setRefreshRequested] = useState(false);
  useEffect(() => {
    if (!refreshRequested || !live) return;
    setRefreshRequested(false);
    saveValuation({ auto: true });
    // saveValuation her çizimde yeniden yaratılır
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshRequested, live]);
  const runReport = async () => {
    setStaleReportPrompt(false);
    // PDF alınan analiz kendiliğinden kaydedilir (sonradan bulunabilsin).
    if (onSaveValuation && unsavedAnalysis) saveValuation({ quiet: true });
    const ok = await printReport(
      {
        subject: s,
        result,
        property,
        companySettings,
        agent,
        marketIndex,
        closed,
        missing: checks.missing,
        fullAddress: fullAddress(s),
      },
      getPhotoUrl,
    );
    if (!ok) notify("Yazdırma penceresi açılamadı - tarayıcının açılır pencere engelini kaldırın.");
  };
  const saleAgeStats = ageStats(saleRegion?.listings);

  // Sahibinden sekmesinde Ctrl+A, Ctrl+C yapıp buraya dönünce: pano izni
  // önceden verildiyse panodaki arama sayfası fark edilir ve tek tıkla eklenir.
  // İzin yoksa hiçbir şey okunmaz (ilk izin "Panodan ekle" düğmesiyle istenir).
  const regionPricesRef = useRef(regionPrices);
  regionPricesRef.current = regionPrices;
  useEffect(() => {
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const perm = await navigator.permissions.query({ name: "clipboard-read" });
        if (perm.state !== "granted") return;
        const raw = await navigator.clipboard.readText();
        if (!looksLikeSahibindenSearch(raw)) return;
        const sig = `${raw.length}:${(raw.match(/#\d{7,}/g) || []).slice(0, 5).join(",")}`;
        if (sessionStorage.getItem("binerly.clip.handled") === sig) return;
        const parsed = parseSearchPages(raw);
        if (!parsed.listings.length) return;
        // Hepsi zaten kayıtlıysa ve yaşları biliniyorsa önermeye gerek yok.
        const known = new Map(
          regionPricesRef.current.flatMap((r) => r.listings || []).map((l) => [l.id, l]),
        );
        const fresh = parsed.listings.filter((l) => {
          const k = known.get(l.id);
          return !k || (parsed.ageBand && k.ageBand !== parsed.ageBand);
        });
        if (!fresh.length) return;
        setClipOffer({
          raw,
          sig,
          neighborhood: parsed.neighborhood,
          band: parsed.pages
            ? parsed.pages.map((pg) => pg.ageBand || "filtresiz").join(" + ")
            : parsed.ageBand || "yaş filtresi yok",
          count: parsed.listings.length,
          fresh: fresh.length,
        });
      } catch {
        // izin API'si desteklenmiyor (ör. Firefox) - düğme yine çalışır
      }
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  const dismissClip = () => {
    try {
      sessionStorage.setItem("binerly.clip.handled", clipOffer.sig);
    } catch {
      // sadece kolaylık
    }
    setClipOffer(null);
  };
  // Yaş en belirleyici etken: daire yaşı ve ona yakın en az
  // MIN_NEAR_AGE_LISTINGS emsal olmadan mal sahibine rapor verilmez.
  const ageBasis = result.ageBasis;
  const reportBlock = result.error
    ? null
    : ageBasis?.subjectAge == null
      ? "Bina yaşını girin - yaş fiyatı en çok belirleyen bilgi."
      : !ageBasis.enough
        ? `Dairenin yaşına (${ageBasis.subjectAge}) yakın en az ${MIN_NEAR_AGE_LISTINGS} emsal ilan gerekli, şu an ${ageBasis.nearCount} var. Sahibinden'de Bina Yaşı ${AGE_BANDS.filter(
            (b) =>
              b.label !== "0 (Yapım Aşamasında)" &&
              ageBasis.subjectAge >= b.lo - NEAR_AGE_YEARS &&
              ageBasis.subjectAge <= b.hi + NEAR_AGE_YEARS,
          )
            .map((b) => `"${b.label}"`)
            .join(" / ")} filtresiyle arayıp yapıştırın.`
        : null;

  return (
    <div data-unsaved-work={dirty ? "" : undefined}>
      <p
        style={{
          fontSize: 12,
          margin: "0 0 12px",
          padding: "8px 10px",
          background: "var(--bg-warning)",
          borderRadius: 6,
          lineHeight: 1.5,
        }}
      >
        <i className="ti ti-info-circle" aria-hidden="true" /> {DISCLAIMER}
      </p>

      {onSaveValuation && (
        <div style={{ marginBottom: 12, maxWidth: 520 }}>
          <label style={labelStyle}>
            Analiz adı (isteğe bağlı)
            <InfoTip text="Kayıtlı analizlerim listesinde bu adla görünür ve aranır - ör. mal sahibinin adı. Boş bırakırsanız adresten oluşturulur." />
          </label>
          <input
            value={s.name || ""}
            onChange={(e) => setS((p) => ({ ...p, name: e.target.value }))}
            placeholder={valuationTitle({ ...s, name: "" }, property)}
            style={{ width: "100%" }}
          />
        </div>
      )}
      <AddressSection
        s={s}
        setS={setS}
        hasPropertyPhoto={hasPropertyPhoto}
        notify={notify}
        focus={mapFocus}
        top={
          <>
            <label style={labelStyle}>
              Adresi arayın
              <InfoTip text="Mahalle, sokak, site, apartman ya da yakındaki okul/cami adını yazıp öneriden seçin: boş olan il, ilçe, mahalle, sokak, site adı ve (varsa) bina no kendiliğinden dolar, harita oraya gider (binaysa iğne de konur). Dolu alanlara dokunulmaz." />
            </label>
            <PlaceSearch
              bias={isValidLocation(s.location) ? s.location : mapFocus}
              district={s.district}
              city={s.city}
              onPick={pickPlace}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <LocationFields
                value={s}
                onChange={(patch) => setS((p) => ({ ...p, ...patch }))}
                suggestions={regionPrices.map((r) => ({
                  name: r.neighborhood,
                  city: r.city,
                  district: r.district,
                  tag: "bölge fiyatı var",
                }))}
                labelStyle={labelStyle}
                fieldStyle={{ flex: "1 1 110px" }}
              />
            </div>
          </>
        }
      />
      <div style={box}>
        <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 8px" }}>Daire</p>
        <SubjectForm
          s={s}
          setS={setS}
          regionPrices={regionPrices}
          missing={missingKeys}
          hideLocation
        />
        <div
          style={{
            marginTop: 10,
            paddingTop: 8,
            borderTop: "0.5px solid var(--border)",
            fontSize: 12.5,
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <b>
              <i
                className={`ti ${checks.missing.length ? "ti-target" : "ti-circle-check"}`}
                aria-hidden="true"
                style={{
                  color: checks.missing.length ? "var(--text-warning)" : "var(--text-success)",
                }}
              />{" "}
              Tahmin isabeti: {checks.filled}/{checks.total} bilgi girildi
            </b>
            {checks.missing.length > 0 && (
              <span style={{ color: "var(--text-muted)" }}>
                eksikler fiyata etkisine göre sıralı
                {checks.extraSpread > 0 &&
                  ` · bu yüzden aralık %${String(Math.round(checks.extraSpread * 1000) / 10).replace(".", ",")} genişletildi`}
              </span>
            )}
            {subjectDirty && (
              <button
                type="button"
                style={{ fontSize: 12, marginLeft: "auto" }}
                disabled={savingSubject}
                onClick={async () => {
                  setSavingSubject(true);
                  const ok = await onSaveSubject(subjectPatch(s));
                  setSavingSubject(false);
                  if (ok) setBaseline(s);
                }}
              >
                <i className="ti ti-device-floppy" aria-hidden="true" />{" "}
                {savingSubject ? "Kaydediliyor…" : "Bu bilgileri portföye kaydet"}
              </button>
            )}
          </div>
          {checks.missing.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {checks.missing
                .slice()
                .sort((a, b) => (b.impact || 0) - (a.impact || 0))
                .map((m) => (
                  <span
                    key={m.key}
                    style={{
                      fontSize: 11.5,
                      padding: "2px 8px",
                      borderRadius: 10,
                      background: "var(--bg-warning)",
                      color: "var(--text-warning)",
                    }}
                  >
                    {m.label}
                    {m.impact ? ` ±%${m.impact}` : ""}
                    {m.note ? ` - ${m.note}` : ""}
                  </span>
                ))}
            </div>
          )}
          <Notices items={checks.warnings} />
        </div>
      </div>

      {clipOffer && (
        <div
          style={{
            ...box,
            background: "var(--bg-accent, var(--surface-1))",
            borderLeft: "3px solid var(--fill-accent)",
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            fontSize: 13,
          }}
        >
          <span style={{ flex: "1 1 260px" }}>
            <i className="ti ti-clipboard-text" aria-hidden="true" /> Panoda Sahibinden araması var:{" "}
            <b>{clipOffer.neighborhood || "mahalle okunamadı"}</b> · {clipOffer.band} ·{" "}
            {clipOffer.count} ilan ({clipOffer.fresh} yeni)
          </span>
          <button
            type="button"
            style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
            onClick={() => {
              setPasteOpen(true);
              setPasteIncoming({ text: clipOffer.raw, auto: true, nonce: Date.now() });
              dismissClip();
            }}
          >
            Ekle
          </button>
          <button type="button" onClick={dismissClip}>
            Yoksay
          </button>
        </div>
      )}

      <div style={box}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Bölge fiyatı</p>
          <button type="button" style={{ fontSize: 12 }} onClick={() => setPasteOpen((v) => !v)}>
            <i className="ti ti-clipboard-text" aria-hidden="true" />{" "}
            {saleRegion ? "Güncelle / sayfa ekle" : "İlan sonuçlarını yapıştır"}
          </button>
        </div>
        {saleRegion ? (
          <div style={{ fontSize: 12.5, marginTop: 6, color: "var(--text-secondary)" }}>
            {saleRegion.aliasFrom && (
              <div style={{ marginBottom: 4 }}>
                <i className="ti ti-link" aria-hidden="true" /> {saleRegion.aliasFrom} (tapudaki ad)
                ilanlarda <b>{saleRegion.neighborhood}</b> olarak geçiyor - o bölgenin fiyatı
                kullanılıyor.{" "}
                {onSaveAliases && (
                  <button type="button" style={{ fontSize: 11.5 }} onClick={() => linkAlias(null)}>
                    Bağlantıyı kaldır
                  </button>
                )}
              </div>
            )}
            <b>{saleRegion.neighborhood}</b> · {saleRegion.propertyType} ·{" "}
            {saleRegion.source === "elle" ? "elle girildi" : `${saleRegion.listingCount} ilan`} ·{" "}
            {fmtDate(saleRegion.asOf)} · ortanca {fmtUnit(saleRegion.medianM2)}
            {result.index?.factor && result.index.factor !== 1 && (
              <> · TCMB endeksiyle bugün {fmtUnit(saleRegion.medianM2 * result.index.factor)}</>
            )}
            {saleAgeStats.typicalAge != null ? (
              <>
                {" · "}tipik bina yaşı {saleAgeStats.typicalAge} ({saleAgeStats.agedCount} ilanın
                yaşından)
                {saleAgeStats.ageSlope != null &&
                  ` · yaş etkisi bölge verisinden: yılda %${saleAgeStats.ageSlope}`}
              </>
            ) : null}
            {(stale || rentStale) && (
              <div
                style={{
                  margin: "8px 0 0",
                  padding: "8px 10px",
                  borderRadius: 6,
                  background:
                    Math.max(age, rentAge) > REGION_OLD_DAYS
                      ? "var(--bg-danger)"
                      : "var(--bg-warning)",
                  color: "var(--text-primary)",
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ flex: "1 1 240px" }}>
                  {stale && `Satılık bölge fiyatı ${age} gün önce alındı. `}
                  {rentStale && `Kiralık bölge fiyatı ${rentAge} gün önce alındı. `}
                  TCMB endeksi yaklaşık 2 ay geriden gelir ve il ortalamasıdır - güncel tahmin için
                  Sahibinden'deki aynı aramayı yeniden yapıştırın.
                </span>
                {!pasteOpen && (
                  <button type="button" style={{ fontSize: 12 }} onClick={askUpdate}>
                    <i className="ti ti-refresh" aria-hidden="true" /> Bölgeyi güncelle
                  </button>
                )}
              </div>
            )}
            {saleRegion.marketMoves && saleRegion.marketMoves.comparedWith > 0 && (
              <div style={{ marginTop: 6 }}>
                <i className="ti ti-activity" aria-hidden="true" /> Piyasa hareketi (
                {fmtDate(saleRegion.marketMoves.date)} güncellemesi):{" "}
                {[
                  `${saleRegion.marketMoves.newCount} yeni ilan`,
                  saleRegion.marketMoves.dropCount
                    ? `${saleRegion.marketMoves.dropCount} ilan fiyat düşürdü (ort. %${String(saleRegion.marketMoves.dropAvgPct).replace(".", ",")})`
                    : "fiyat düşüren yok",
                  saleRegion.marketMoves.removedCount != null &&
                    `${saleRegion.marketMoves.removedCount} ilan yayından kalktı`,
                  saleRegion.marketMoves.medianDaysOnMarket != null &&
                    `ilanlar ortalama ${saleRegion.marketMoves.medianDaysOnMarket} gündür yayında`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            )}
            {saleRegion.source !== "elle" && (
              <div style={{ marginTop: 6 }}>
                Yaş dağılımı ({coverage.agedCount}/{coverage.total} ilanın yaşı biliniyor):{" "}
                {coverage.groups.map((g, i) => (
                  <span
                    key={g.label}
                    style={{
                      fontWeight: g.label === coverage.subjectGroup ? 700 : 400,
                      color: g.count ? undefined : "var(--text-muted)",
                    }}
                  >
                    {i > 0 && " · "}
                    {g.label}: {g.count}
                  </span>
                ))}
                {s.buildingAge !== "" && s.buildingAge != null && (
                  <NeededBands
                    region={saleRegion}
                    subjectAge={s.buildingAge}
                    onSaveRegion={onSaveRegion}
                  />
                )}
                {coverage.agedCount === 0 && !coverage.subjectGroup && (
                  <div style={{ marginTop: 4, color: "var(--text-muted)" }}>
                    İlanların yaşı bilinmiyor. Bina Yaşı filtresiyle yapıştırırsanız yaş etkisi bu
                    mahallenin kendi ilanlarından hesaplanır.
                  </div>
                )}
              </div>
            )}
            {saleRegion.listingCount > 0 && saleRegion.listingCount < 8 && (
              <p style={{ color: "var(--text-warning)", margin: "4px 0 0" }}>
                Az ilan ({saleRegion.listingCount}) - aralık geniş tutuldu. Arama sonucunun diğer
                sayfalarını da ekleyin.
              </p>
            )}
          </div>
        ) : (
          <>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "6px 0 0" }}>
              {s.neighborhood ? `${s.neighborhood} için` : "Bu mahalle için"} kayıtlı bölge fiyatı
              yok. Sahibinden'de mahalleyi ve emlak tipini seçip arama sonuç sayfasını yapıştırın -
              bir kez eklenen bölge sonraki bütün dairelerde kullanılır.
            </p>
            {s.neighborhood && onSaveAliases && aliasCandidates.length > 0 && (
              <div
                style={{
                  marginTop: 8,
                  padding: "8px 10px",
                  borderRadius: 6,
                  background: "var(--surface-1)",
                  border: "0.5px solid var(--border)",
                  fontSize: 12.5,
                }}
              >
                <div style={{ marginBottom: 6 }}>
                  <b>{s.neighborhood} ilanlarda başka adla mı geçiyor?</b> Tapudaki mahalle adı ile
                  Sahibinden'de kullanılan ad farklı olabilir (ör. tapuda Şemikler, ilanlarda
                  Atakent). Bağlarsanız o bölgenin fiyatı kullanılır ve ekipçe hatırlanır.
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <select
                    value={aliasTarget}
                    onChange={(e) => setAliasTarget(e.target.value)}
                    style={{ flex: "1 1 180px" }}
                  >
                    <option value="">Kayıtlı bölge seçin</option>
                    {aliasCandidates.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    style={{ fontSize: 12.5 }}
                    disabled={!aliasTarget}
                    onClick={() => {
                      linkAlias(aliasTarget);
                      setAliasTarget("");
                    }}
                  >
                    <i className="ti ti-link" aria-hidden="true" /> {s.neighborhood} →{" "}
                    {aliasTarget || "..."} bağla
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        {(pasteOpen || !saleRegion) && (
          <RegionPaste
            regionPrices={regionPrices}
            subject={s}
            clipboardInput={pasteIncoming}
            aliasTo={aliasFor(aliases, s)?.to}
            onSaveRegion={onSaveRegion}
            notify={notify}
            onParsedLocation={(r) => {
              setPasteOpen(false);
              if (!s.neighborhood)
                setS((p) => ({
                  ...p,
                  city: p.city || r.city,
                  district: p.district || r.district,
                  neighborhood: r.neighborhood,
                }));
            }}
          />
        )}
        {s.neighborhood && (
          <div style={{ fontSize: 12.5, marginTop: 8, color: "var(--text-secondary)" }}>
            <i className="ti ti-circle-check" aria-hidden="true" />{" "}
            {closed.count > 0 ? (
              <>
                Ofisinizin {s.neighborhood} gerçekleşen satışları: <b>{closed.count} işlem</b>,
                ortanca {fmtUnit(closed.medianUnitToday)} (kapanış ayından bugüne TCMB ile)
                {!result.error && (
                  <>
                    {" · "}bu tahmin {fmtUnit(result.unit)} (
                    {result.unit >= closed.medianUnitToday ? "+" : ""}
                    {Math.round((result.unit / closed.medianUnitToday - 1) * 100)}%)
                  </>
                )}
                <InfoTip
                  text={`Portföyde "Satıldı" işaretli ve gerçekleşen fiyatı girilmiş, son 2 yıldaki ${s.neighborhood} ${s.propertyType || "Daire"} kayıtları. İlan fiyatı değil gerçek bedel olduğu için tahmini bunlarla karşılaştırın; fark büyükse düzeltme oranlarını veya pazarlık payını gözden geçirin.`}
                />
              </>
            ) : (
              <span style={{ color: "var(--text-muted)" }}>
                Bu mahallede gerçekleşen satış kaydınız yok. Portföy "Satıldı" olunca gerçekleşen
                fiyatı girin - burada tahminle karşılaştırılır.
              </span>
            )}
          </div>
        )}
        {discountDiffers && (
          <div
            style={{
              fontSize: 12.5,
              marginTop: 6,
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <span style={{ flex: "1 1 240px" }}>
              Ofisinizin gerçek pazarlık payı <b>%{officeDiscount.percent}</b> (
              {officeDiscount.count} satışta ilan fiyatından gerçekleşene iniş); hesaplamada %
              {factors.askingDiscountPercent} kullanılıyor.
            </span>
            <button
              type="button"
              style={{ fontSize: 12 }}
              onClick={() => {
                const next = { ...factors, askingDiscountPercent: officeDiscount.percent };
                setFactors(next);
                onSaveFactors(next);
              }}
            >
              %{officeDiscount.percent} kullan
            </button>
          </div>
        )}
        {!rentRegion && saleRegion && (
          <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "6px 0 0" }}>
            Kira tahmini ve geri dönüş süresi için aynı mahallenin kiralık arama sonucunu da
            yapıştırabilirsiniz.
          </p>
        )}
      </div>

      {result.error ? (
        <p style={{ fontSize: 13, color: "var(--text-warning)" }}>{result.error}</p>
      ) : (
        <div style={{ ...box, borderWidth: 1 }}>
          {!live && valuation && (useSnapshot || liveDiffers) && (
            <div
              style={{
                fontSize: 12.5,
                marginBottom: 8,
                padding: "8px 10px",
                borderRadius: 6,
                background: "var(--surface-1)",
                border: "0.5px solid var(--border)",
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <span style={{ flex: "1 1 280px" }}>
                <i className="ti ti-lock" aria-hidden="true" />{" "}
                {useSnapshot ? (
                  <>
                    Bu analiz {fmtDate(frozen.asOf)} tarihli bölge verileriyle sabit - raporun
                    değeri sonradan eklenen ilanlarla değişmez.
                  </>
                ) : (
                  <>Kayıtlı değer {formatTL(valuation.result?.mid)}.</>
                )}
                {liveDiffers && (
                  <>
                    {" "}
                    Güncel bölge verileriyle değer <b>{formatTL(liveResult.value.mid)}</b> (
                    {liveResult.value.mid > shownMid ? "+" : ""}
                    {(((liveResult.value.mid - shownMid) / shownMid) * 100)
                      .toFixed(1)
                      .replace(".", ",")}
                    %).
                  </>
                )}
              </span>
              {liveDiffers && (
                <button
                  type="button"
                  style={{ fontSize: 12 }}
                  onClick={() => {
                    setLive(true);
                    setRefreshRequested(true);
                  }}
                >
                  Güncel verilerle güncelle
                </button>
              )}
            </div>
          )}
          {reportBlock ? (
            <div
              style={{
                fontSize: 12.5,
                marginBottom: 8,
                padding: "8px 10px",
                borderRadius: 6,
                background: "var(--bg-warning)",
                borderLeft: "3px solid var(--text-warning)",
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <span style={{ flex: "1 1 260px" }}>
                <b>Ön tahmin - rapor için yetersiz.</b> {reportBlock}
              </span>
              {ageBasis?.subjectAge != null && !pasteOpen && (
                <button type="button" style={{ fontSize: 12 }} onClick={() => setPasteOpen(true)}>
                  Yapıştır
                </button>
              )}
            </div>
          ) : (
            ageBasis?.enough && (
              <p style={{ fontSize: 12, color: "var(--text-success)", margin: "0 0 8px" }}>
                <i className="ti ti-circle-check" aria-hidden="true" /> Baz fiyat dairenin yaşına
                yakın {ageBasis.nearCount} emsal ilandan ({ageBasis.bands.join(", ")}) hesaplandı.
              </p>
            )
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              ["Hızlı satış", result.value.low, "kısa sürede alıcı bulur"],
              ["Piyasa değeri", result.value.mid, fmtUnit(result.unit)],
              ["Üst fiyat", result.value.high, "pazarlama süresi uzar"],
            ].map(([label, v, sub]) => (
              <div
                key={label}
                style={{
                  flex: "1 1 140px",
                  textAlign: "center",
                  padding: 10,
                  borderRadius: 6,
                  border:
                    label === "Piyasa değeri"
                      ? "2px solid var(--fill-accent)"
                      : "0.5px solid var(--border)",
                }}
              >
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{formatTL(v)}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{sub}</div>
              </div>
            ))}
          </div>
          {result.rent && (
            <p style={{ fontSize: 12.5, margin: "8px 0 0" }}>
              Tahmini aylık kira: <b>{formatTL(result.rent.monthly)}</b>
              {result.rent.paybackYears &&
                ` · geri dönüş süresi ~${result.rent.paybackYears.toFixed(1)} yıl`}
            </p>
          )}
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "8px 0 4px" }}>
            Bölge ortanca ilan fiyatı {fmtUnit(result.askingUnit)} - %
            {result.factors.askingDiscountPercent} pazarlık payı = {fmtUnit(result.saleUnit)}
            {result.grossEstimated && " · brüt m² girilmediği için netin 1,2 katı alındı"}
          </p>
          {result.adjustments.length > 0 ? (
            <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
              <tbody>
                {result.adjustments.map((a) => (
                  <tr key={a.label}>
                    <td style={{ padding: "3px 0" }}>{a.label}</td>
                    <td
                      style={{
                        textAlign: "right",
                        color: a.percent > 0 ? "var(--text-success)" : "var(--text-danger)",
                      }}
                    >
                      {a.percent > 0 ? "+" : ""}
                      {a.percent}%
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: "0.5px solid var(--border)", fontWeight: 600 }}>
                  <td style={{ padding: "3px 0" }}>Toplam düzeltme</td>
                  <td style={{ textAlign: "right" }}>
                    {result.totalPercent > 0 ? "+" : ""}
                    {Math.round(result.totalPercent * 10) / 10}%
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
              Daire bölgedeki tipik daireyle aynı kabul edildi - özellik girdikçe düzeltmeler burada
              görünür.
            </p>
          )}
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              style={{ fontSize: 12.5 }}
              disabled={!!reportBlock}
              title={reportBlock || ""}
              onClick={() => (stale || rentStale ? setStaleReportPrompt(true) : runReport())}
            >
              <i className="ti ti-file-type-pdf" aria-hidden="true" /> PDF rapor
            </button>
            {onSaveValuation && (
              <button
                type="button"
                style={{ fontSize: 12.5 }}
                disabled={savingValuation || (!unsavedAnalysis && valuationStatus !== "taslak")}
                onClick={() => saveValuation()}
              >
                <i className="ti ti-device-floppy" aria-hidden="true" />{" "}
                {savingValuation
                  ? "Kaydediliyor…"
                  : valuationStatus === "taslak"
                    ? "Taslaktan çıkar, kaydet"
                    : unsavedAnalysis
                      ? valuationId
                        ? "Değişiklikleri kaydet"
                        : "Analizi kaydet"
                      : "Kaydedildi"}
              </button>
            )}
            {valuationId && (
              <span style={{ fontSize: 11.5, color: "var(--text-muted)", alignSelf: "center" }}>
                {valuationStatus === "taslak" ? "Taslak" : "Kayıtlı analiz"}
                {unsavedAnalysis
                  ? " · değişiklikler birkaç saniye içinde kaydedilecek"
                  : autoSavedAt
                    ? ` · son kayıt ${autoSavedAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`
                    : " · güncel"}
              </span>
            )}
            <span style={{ fontSize: 11.5, color: "var(--text-muted)", alignSelf: "center" }}>
              Açılan pencerede hedef olarak "PDF olarak kaydet"i seçin.
            </span>
            {/* Portföy fiyatının anlamı işlem türüne göre değişir (kiralıkta aylık
                kira) - satış değerini kira alanına yazmasın. */}
            {onApplyPrice && property?.transactionType === "satilik" && (
              <button
                type="button"
                style={{ fontSize: 12.5 }}
                onClick={() => onApplyPrice(result.value.mid)}
              >
                Piyasa değerini portföy fiyatı yap
              </button>
            )}
            {onApplyPrice && property?.transactionType === "kiralik" && result.rent && (
              <button
                type="button"
                style={{ fontSize: 12.5 }}
                onClick={() => onApplyPrice(result.rent.monthly)}
              >
                Tahmini kirayı portföy fiyatı yap
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        <button type="button" style={{ fontSize: 12 }} onClick={() => setShowFactors((v) => !v)}>
          <i className="ti ti-adjustments" aria-hidden="true" /> Düzeltme oranları
        </button>
        <button type="button" style={{ fontSize: 12 }} onClick={() => setShowRegions((v) => !v)}>
          <i className="ti ti-map-pin" aria-hidden="true" /> Kayıtlı bölgeler ({regionPrices.length}
          )
        </button>
        {detailed && (
          <button type="button" style={{ fontSize: 12 }} onClick={() => setShowDetailed((v) => !v)}>
            <i className="ti ti-list-details" aria-hidden="true" /> Detaylı inceleme (emsal)
          </button>
        )}
      </div>

      {showFactors && (
        <div style={box}>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 8px" }}>
            Yüzde olarak, bölgedeki tipik daireye göre. Sektörde yaygın kabul gören başlangıç
            değerleri - bölgenizi tanıyorsanız değiştirin, ofisinizin bütün hesaplarında kullanılır.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
              gap: 8,
            }}
          >
            {Object.keys(AVM_FACTOR_DEFAULTS).map((k) => (
              <div key={k}>
                <label style={labelStyle}>{AVM_FACTOR_LABELS[k]}</label>
                <input
                  type="number"
                  step="0.5"
                  value={factors[k]}
                  onChange={(e) =>
                    setFactors((f) => ({
                      ...f,
                      [k]: e.target.value === "" ? "" : Number(e.target.value),
                    }))
                  }
                  onBlur={() => onSaveFactors(factors)}
                  style={{ width: "100%" }}
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            style={{ fontSize: 12, marginTop: 8 }}
            onClick={() => {
              setFactors({ ...AVM_FACTOR_DEFAULTS });
              onSaveFactors({});
            }}
          >
            Varsayılanlara dön
          </button>
        </div>
      )}

      {showRegions && (
        <div style={box}>
          {regionPrices.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: 0 }}>
              Henüz bölge yok.
            </p>
          ) : (
            regionPrices
              .slice()
              .sort((a, b) => a.neighborhood.localeCompare(b.neighborhood, "tr"))
              .map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    fontSize: 12.5,
                    padding: "4px 0",
                    borderBottom: "0.5px solid var(--border)",
                  }}
                >
                  <span>
                    <b>{r.neighborhood}</b>
                    {r.district ? `, ${r.district}` : ""} ·{" "}
                    {r.transactionType === "kiralik" ? "Kiralık" : "Satılık"} {r.propertyType} ·{" "}
                    {fmtUnit(r.medianM2)} ·{" "}
                    {r.source === "elle" ? "elle" : `${r.listingCount} ilan`} · {fmtDate(r.asOf)}{" "}
                    <RegionAgeTag days={regionAgeDays(r)} />
                  </span>
                  <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button
                      type="button"
                      style={{ fontSize: 12 }}
                      onClick={() => {
                        setS((p) => ({
                          ...p,
                          city: r.city || "",
                          district: r.district || "",
                          neighborhood: r.neighborhood,
                          propertyType: r.propertyType || p.propertyType,
                        }));
                        setShowRegions(false);
                        setPasteOpen(true);
                      }}
                    >
                      Güncelle
                    </button>
                    <button
                      type="button"
                      style={{ fontSize: 12, color: "var(--text-danger)" }}
                      onClick={() => setConfirmDelete(r)}
                    >
                      Sil
                    </button>
                  </span>
                </div>
              ))
          )}
        </div>
      )}

      {showDetailed && detailed}

      {staleReportPrompt && (
        <Modal title="Bölge fiyatı eski" onClose={() => setStaleReportPrompt(false)}>
          <p
            style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5, marginTop: 0 }}
          >
            Bu rapordaki bölge fiyatı {Math.max(stale ? age : 0, rentStale ? rentAge : 0)} gün önce
            alınmış ilanlara dayanıyor. Mal sahibine vermeden önce aynı aramayı yeniden yapıştırıp
            güncellemeniz önerilir. Rapor yine de alınırsa veri tarihi raporda yazar.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button type="button" onClick={runReport}>
              Yine de rapor al
            </button>
            <button
              type="button"
              onClick={askUpdate}
              style={{
                background: "var(--fill-accent)",
                color: "var(--on-accent)",
                border: "none",
              }}
            >
              Önce bölgeyi güncelle
            </button>
          </div>
        </Modal>
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Bölge fiyatı silinsin mi?"
          message={`${confirmDelete.neighborhood} (${confirmDelete.transactionType === "kiralik" ? "kiralık" : "satılık"} ${confirmDelete.propertyType}) bölge fiyatı silinir. İlan sonuçlarını yeniden yapıştırarak tekrar ekleyebilirsiniz.`}
          confirmLabel="Sil"
          onConfirm={() => {
            onDeleteRegion(confirmDelete.id);
            setConfirmDelete(null);
          }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

// Emlakta ayrı sekme: portföydeki bir daireyi ya da portföye girmemiş bir
// daireyi (mal sahibiyle ilk görüşme) fiyatlamak için tek yer. Kayıtlı
// analizler kişiye özeldir (sadece yapan danışman görür).
const SELECTION_KEY = "binerly.valuation.selection";

function readSelection() {
  try {
    const raw = sessionStorage.getItem(SELECTION_KEY);
    if (raw) return JSON.parse(raw);
    // eski sürümden kalan seçim
    const old = sessionStorage.getItem("binerly.valuation.selected");
    return old ? { kind: "property", id: old } : { kind: "new" };
  } catch {
    return { kind: "new" };
  }
}

export function MarketAnalysisTab({
  properties,
  valuations = [],
  valuationsLoaded = true,
  agentFor,
  getPhotoUrlFor,
  hasPhotoFor,
  onApplyPriceFor,
  onSaveSubjectFor,
  onSaveValuation,
  onDeleteValuation,
  onCreatePropertyFrom,
  ...rest
}) {
  const [selection, setSelectionState] = useState(readSelection);
  // Bileşeni yeniden kurmak sadece kullanıcı başka bir analiz seçince - kayıt
  // sonrası seçimin "kayıtlı analiz"e dönmesi açık formu sıfırlamasın.
  const [instance, setInstance] = useState(0);
  const [confirmDeleteV, setConfirmDeleteV] = useState(null);
  // Açık bir analiz varken liste kapalı başlar - yoksa analiz sayısı arttıkça
  // düzenleme ekranı aşağı itiliyordu.
  const [listOpen, setListOpen] = useState(() => readSelection().kind !== "valuation");
  const [listQuery, setListQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const persistSelection = (sel) => {
    setSelectionState(sel);
    try {
      sessionStorage.setItem(SELECTION_KEY, JSON.stringify(sel));
    } catch {
      // sadece kolaylık
    }
  };
  const choose = (sel) => {
    persistSelection(sel);
    setInstance((n) => n + 1);
    if (sel.kind === "valuation") setListOpen(false);
  };
  const valuation =
    selection.kind === "valuation" ? valuations.find((v) => v.id === selection.id) || null : null;
  const lq = listQuery.trim().toLocaleLowerCase("tr");
  const RECENT_LIMIT = 5;
  const sortedValuations = [...valuations].sort(
    (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0),
  );
  const filteredValuations = !lq
    ? sortedValuations
    : sortedValuations.filter((v) => {
        const sub = v.subject || {};
        const a = sub.address || {};
        return [v.title, sub.name, sub.neighborhood, sub.district, sub.city, a.street, a.siteName]
          .filter(Boolean)
          .some((x) => String(x).toLocaleLowerCase("tr").includes(lq));
      });
  const propertyId =
    selection.kind === "property" ? selection.id : valuation ? valuation.propertyId : null;
  const property = properties.find((p) => p.id === propertyId) || null;
  const candidates = properties
    .filter((p) => ["satilik", "kiralik"].includes(p.transactionType))
    .sort((a, b) => (a.title || "").localeCompare(b.title || "", "tr"));
  const missingValuation = selection.kind === "valuation" && !valuation && valuationsLoaded;
  const waitingValuation = selection.kind === "valuation" && !valuation && !valuationsLoaded;

  return (
    <div>
      <h2 style={{ fontSize: 20, margin: "0 0 4px" }}>Piyasa Analizi</h2>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 12px" }}>
        Bölge fiyatı ve dairenin özelliklerinden hızlı satış, piyasa değeri ve üst fiyatı
        hesaplayın; mal sahibine PDF rapor verin.
      </p>

      <div style={{ ...box, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>
            Kayıtlı analizlerim ({valuations.length})
            <InfoTip text="Analizler sadece size görünür. Paylaşmak için PDF'i indirip gönderin." />
          </p>
          <span style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              style={{ fontSize: 12.5 }}
              onClick={() => {
                // Kaydedilmemiş yarım taslak sekme değişiminde korunur, ama "Yeni
                // analiz"e basan boş form ister - yoksa öncekinin bilgileriyle açılıyordu.
                discardFormDraft("valuation:free");
                choose({ kind: "new" });
              }}
            >
              + Yeni analiz
            </button>
            {valuations.length > 0 && (
              <button
                type="button"
                style={{ fontSize: 12.5 }}
                onClick={() => setListOpen((v) => !v)}
              >
                {listOpen ? "Listeyi gizle" : "Listeyi göster"}
              </button>
            )}
          </span>
        </div>
        {listOpen && valuations.length === 0 && (
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "6px 0 0" }}>
            Henüz kayıtlı analiz yok. Aşağıda analizi yapıp "Analizi kaydet"e basın - PDF aldığınız
            analizler de kendiliğinden kaydedilir.
          </p>
        )}
        {listOpen && valuations.length > 0 && (
          <input
            value={listQuery}
            onChange={(e) => setListQuery(e.target.value)}
            placeholder="Analizlerde ara: ad, sokak, mahalle, site"
            style={{ width: "100%", marginTop: 8 }}
          />
        )}
        {listOpen && valuations.length > 0 && (
          <div style={{ marginTop: 8, maxHeight: 300, overflowY: "auto" }}>
            {filteredValuations.length === 0 && (
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: 0 }}>
                Aramaya uyan analiz yok.
              </p>
            )}
            {(lq || showAll ? filteredValuations : filteredValuations.slice(0, RECENT_LIMIT)).map(
              (v) => {
                const active = selection.kind === "valuation" && selection.id === v.id;
                const linked = v.propertyId && properties.find((p) => p.id === v.propertyId);
                return (
                  <div
                    key={v.id}
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                      fontSize: 12.5,
                      padding: "6px 8px",
                      borderRadius: 6,
                      background: active ? "var(--bg-accent, var(--surface-1))" : undefined,
                      borderBottom: "0.5px solid var(--border)",
                    }}
                  >
                    <span style={{ flex: "1 1 260px" }}>
                      <b>{v.title || "Adsız analiz"}</b>
                      {v.status === "taslak" && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 11,
                            padding: "1px 6px",
                            borderRadius: 4,
                            background: "var(--bg-warning)",
                            color: "var(--text-warning)",
                          }}
                        >
                          Taslak
                        </span>
                      )}
                      <span style={{ color: "var(--text-muted)" }}>
                        {" "}
                        · {fmtDate(v.updatedAt)}
                        {v.result?.mid ? ` · piyasa değeri ${formatTL(v.result.mid)}` : ""}
                        {linked ? ` · portföy: ${linked.title}` : ""}
                      </span>
                    </span>
                    <button
                      type="button"
                      style={{ fontSize: 12 }}
                      disabled={active}
                      onClick={() => choose({ kind: "valuation", id: v.id })}
                    >
                      {active ? "Açık" : "Aç / düzenle"}
                    </button>
                    {!v.propertyId && onCreatePropertyFrom && (
                      <button
                        type="button"
                        style={{ fontSize: 12 }}
                        onClick={() => onCreatePropertyFrom(v)}
                      >
                        Portföye ekle
                      </button>
                    )}
                    <button
                      type="button"
                      style={{ fontSize: 12, color: "var(--text-danger)" }}
                      onClick={() => setConfirmDeleteV(v)}
                    >
                      Sil
                    </button>
                  </div>
                );
              },
            )}
            {!lq && filteredValuations.length > RECENT_LIMIT && (
              <button
                type="button"
                style={{ fontSize: 12, marginTop: 6 }}
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll
                  ? "Sadece son 5 analizi göster"
                  : `Tümünü göster (${filteredValuations.length})`}
              </button>
            )}
          </div>
        )}
      </div>

      {selection.kind !== "valuation" && (
        <div style={{ marginBottom: 12, maxWidth: 420 }}>
          <label style={labelStyle}>Hangi daire?</label>
          <select
            value={selection.kind === "property" ? selection.id : ""}
            onChange={(e) =>
              choose(e.target.value ? { kind: "property", id: e.target.value } : { kind: "new" })
            }
            style={{ width: "100%" }}
          >
            <option value="">Portföyde olmayan bir daire (boş form)</option>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
                {p.neighborhood ? ` - ${p.neighborhood}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}
      {valuation && (
        <p style={{ fontSize: 13, margin: "0 0 10px" }}>
          <i className="ti ti-file-analytics" aria-hidden="true" /> Kayıtlı analiz:{" "}
          <b>{valuation.title}</b> ({fmtDate(valuation.createdAt)})
        </p>
      )}

      {waitingValuation ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Analiz yükleniyor…</p>
      ) : missingValuation ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Bu analiz bulunamadı (silinmiş olabilir).{" "}
          <button type="button" onClick={() => choose({ kind: "new" })}>
            Yeni analiz
          </button>
        </p>
      ) : (
        <AutoValuation
          key={instance}
          property={property}
          properties={properties}
          valuation={valuation}
          agent={agentFor(property)}
          getPhotoUrl={property ? () => getPhotoUrlFor(property) : null}
          hasPropertyPhoto={property ? hasPhotoFor?.(property) : false}
          onApplyPrice={property ? (price) => onApplyPriceFor(property, price) : null}
          onSaveSubject={
            property && onSaveSubjectFor ? (patch) => onSaveSubjectFor(property, patch) : null
          }
          onSaveValuation={onSaveValuation}
          onValuationSaved={(saved) => persistSelection({ kind: "valuation", id: saved.id })}
          {...rest}
        />
      )}

      {confirmDeleteV && (
        <ConfirmDialog
          title="Analiz silinsin mi?"
          message={`"${confirmDeleteV.title}" kalıcı olarak silinir. Daha önce indirdiğiniz PDF'ler etkilenmez.`}
          onConfirm={async () => {
            const v = confirmDeleteV;
            setConfirmDeleteV(null);
            const ok = await onDeleteValuation(v.id);
            if (ok && selection.kind === "valuation" && selection.id === v.id)
              choose({ kind: "new" });
          }}
          onClose={() => setConfirmDeleteV(null)}
        />
      )}
    </div>
  );
}
