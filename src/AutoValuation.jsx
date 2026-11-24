import React, { useMemo, useState } from "react";
import { ConfirmDialog, InfoTip, Modal, formatTL } from "./shared";
import { buildValuationReportHtml } from "./ValuationReport";
import { LocationFields } from "./LocationFields";
import { PROPERTY_DETAIL_FIELDS, PROPERTY_TYPE_OPTIONS, ROOM_COUNT_OPTIONS } from "./realEstate";
import {
  AGE_BANDS,
  AVM_FACTOR_DEFAULTS,
  ageStats,
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
  parseSearchResults,
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
  };
}

function SubjectForm({ s, setS, regionPrices = [] }) {
  const set = (k) => (e) => setS((p) => ({ ...p, [k]: e.target.value }));
  const setD = (k, v) => setS((p) => ({ ...p, details: { ...p.details, [k]: v } }));
  const toggle = (k, opt) =>
    setD(
      k,
      s.details[k].includes(opt) ? s.details[k].filter((x) => x !== opt) : [...s.details[k], opt],
    );
  const input = (k, label, type = "text", flex = "1 1 110px") => (
    <div style={{ flex }}>
      <label style={labelStyle}>{label}</label>
      <input type={type} value={s[k] ?? ""} onChange={set(k)} style={{ width: "100%" }} />
    </div>
  );
  const select = (k, label, options, flex = "1 1 130px") => (
    <div style={{ flex }}>
      <label style={labelStyle}>{label}</label>
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
      <label style={labelStyle}>{label}</label>
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
        <div style={{ flex: "1 1 120px" }}>
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

function RegionPaste({ regionPrices, subject, onSaveRegion, onParsedLocation, notify }) {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState(null);
  const [manual, setManual] = useState(false);
  const [manualM2, setManualM2] = useState("");
  const [typicalAge, setTypicalAge] = useState("");
  const [ageBandLabel, setAgeBandLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const read = () => {
    const parsed = parseSearchResults(text);
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
    if (!base.neighborhood) {
      notify("Mahalle okunamadı - aramada tek bir mahalle seçip tekrar kopyalayın.");
      return;
    }
    // Aynı aramanın diğer sayfaları (ya da diğer yaş aralıkları) 14 gün içinde
    // yapıştırılırsa birleştirilir.
    const existing = regionPrices.find((r) => regionKey(r) === regionKey(base));
    const mergeable =
      existing && existing.source === "ilan_yapistirma" && daysSince(existing.asOf) <= 14;
    setDraft({ ...base, parsed, existing, merged: mergeable });
    setAgeBandLabel(parsed.ageBand || "");
    setTypicalAge(existing?.typicalAge ?? "");
  };

  // Yaş aralığı menüden değiştirilebildiği için birleştirme/özet her çizimde.
  const band = AGE_BANDS.find((b) => b.label === ageBandLabel) || null;
  const incoming = draft
    ? draft.parsed.listings.map((l) => ({
        ...l,
        age: band ? band.age : null,
        ageBand: band ? band.label : null,
      }))
    : [];
  const draftListings = draft
    ? draft.merged
      ? mergeListings(draft.existing.listings, incoming)
      : incoming
    : [];
  const summary = draft ? summarizeListings(draftListings) : null;

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
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" style={{ fontSize: 12.5 }} disabled={!text.trim()} onClick={read}>
          İlanları oku
        </button>
        <button type="button" style={{ fontSize: 12.5 }} onClick={() => setManual((v) => !v)}>
          Elle m² fiyatı gir
        </button>
      </div>

      {draft && summary && (
        <div style={{ ...box, marginTop: 8, background: "var(--surface-1)" }}>
          <p style={{ fontSize: 13, margin: "0 0 6px" }}>
            <b>
              {draft.neighborhood}
              {draft.district ? `, ${draft.district}` : ""}
              {draft.city ? `, ${draft.city}` : ""}
            </b>{" "}
            · {draft.transactionType === "kiralik" ? "Kiralık" : "Satılık"} {draft.propertyType}
          </p>
          <p style={{ fontSize: 12.5, margin: "0 0 6px", color: "var(--text-secondary)" }}>
            Bu sayfadan {draft.parsed.listings.length} ilan okundu
            {draft.merged ? `, önceki yapıştırmalarla birlikte ${draftListings.length} ilan` : ""}
            {draft.parsed.totalCount ? ` (bu aramada toplam ${draft.parsed.totalCount} ilan)` : ""}.
            {summary.outliers > 0 && ` ${summary.outliers} uç değer hesaba katılmadı.`} Ortanca ilan
            fiyatı <b>{fmtUnit(summary.medianM2)}</b>, tipik daire {summary.medianArea} m².
          </p>
          {draft.parsed.page && draft.parsed.page.current < draft.parsed.page.total && (
            <p style={{ fontSize: 12, margin: "0 0 6px", color: "var(--text-warning)" }}>
              Aramada {draft.parsed.page.total} sayfa var. Kaydettikten sonra diğer sayfaları da
              yapıştırırsanız ilanlar birleştirilir (ya da sayfa başına 50 sonuç seçin).
            </p>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 220px" }}>
              <label style={labelStyle}>
                Bu sayfadaki ilanların bina yaşı
                <InfoTip text="Sahibinden'de soldaki Bina Yaşı filtresinden tek bir aralık seçip arama yaptıysanız burada o aralığı seçin (sayfadan okunabildiyse kendiliğinden seçilir). Her yaş aralığını ayrı yapıştırırsanız tipik bina yaşı ve yaşın fiyata etkisi bölgenin kendi ilanlarından hesaplanır. Filtre kullanmadıysanız boş bırakın." />
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
            {summary.typicalAge == null && (
              <div style={{ flex: "0 1 200px" }}>
                <label style={labelStyle}>
                  Bölgedeki tipik bina yaşı
                  <InfoTip text="Yaşı bilinen ilan azken (5'ten az) bu bölgedeki dairelerin çoğu kaç yaşındaysa onu yazın - yaş düzeltmesi bu tipik yaşa göre yapılır." />
                </label>
                <input
                  type="number"
                  value={typicalAge}
                  onChange={(e) => setTypicalAge(e.target.value)}
                  placeholder="ör. 25"
                  style={{ width: "100%" }}
                />
              </div>
            )}
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
              save({
                id: draft.existing?.id,
                city: draft.city,
                district: draft.district,
                neighborhood: draft.neighborhood,
                propertyType: draft.propertyType,
                transactionType: draft.transactionType,
                medianM2: summary.medianM2,
                q1M2: summary.q1M2,
                q3M2: summary.q3M2,
                medianArea: summary.medianArea,
                listingCount: summary.listingCount,
                typicalAge: summary.typicalAge ?? (typicalAge === "" ? null : Number(typicalAge)),
                asOf: new Date().toISOString().slice(0, 10),
                source: "ilan_yapistirma",
                listings: draftListings.map(({ id, m2, rooms, price, date, age, ageBand }) => ({
                  id,
                  m2,
                  rooms,
                  price,
                  date,
                  age: age ?? null,
                  ageBand: ageBand ?? null,
                })),
              })
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
              const existing = regionPrices.find((r) => regionKey(r) === regionKey(base));
              save({
                ...base,
                id: existing?.id,
                medianM2: Number(manualM2),
                q1M2: null,
                q3M2: null,
                medianArea: null,
                listingCount: 0,
                typicalAge: typicalAge === "" ? null : Number(typicalAge),
                asOf: new Date().toISOString().slice(0, 10),
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
    photoUrl = getPhotoUrl ? await getPhotoUrl() : null;
  } catch {
    photoUrl = null;
  }
  win.document.open();
  win.document.write(buildValuationReportHtml({ ...args, photoUrl, disclaimer: DISCLAIMER }));
  win.document.close();
  return true;
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
  marketIndex,
  companySettings,
  agent,
  getPhotoUrl,
  onSaveRegion,
  onDeleteRegion,
  onSaveFactors,
  onApplyPrice,
  notify,
  detailed,
}) {
  const [s, setS] = useState(() => subjectFrom(property));
  const [pasteOpen, setPasteOpen] = useState(false);
  const [showFactors, setShowFactors] = useState(false);
  const [showRegions, setShowRegions] = useState(false);
  const [showDetailed, setShowDetailed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [staleReportPrompt, setStaleReportPrompt] = useState(false);
  const savedFactors = companySettings?.realEstateSettings?.avmFactors || {};
  const [factors, setFactors] = useState(() => ({ ...AVM_FACTOR_DEFAULTS, ...savedFactors }));

  const saleRegion = findRegion(regionPrices, s, "satilik");
  const rentRegion = findRegion(regionPrices, s, "kiralik");
  const result = useMemo(
    () => estimateValue({ subject: s, saleRegion, rentRegion, marketIndex, factors }),
    [s, saleRegion, rentRegion, marketIndex, factors],
  );
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
  const runReport = async () => {
    setStaleReportPrompt(false);
    const ok = await printReport(
      { subject: s, result, property, companySettings, agent, marketIndex, closed },
      getPhotoUrl,
    );
    if (!ok) notify("Yazdırma penceresi açılamadı - tarayıcının açılır pencere engelini kaldırın.");
  };
  const saleAgeStats = ageStats(saleRegion?.listings);

  return (
    <div>
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

      <div style={box}>
        <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 8px" }}>Daire</p>
        <SubjectForm s={s} setS={setS} regionPrices={regionPrices} />
      </div>

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
            ) : (
              <>
                {" · "}tipik bina yaşı{" "}
                <input
                  type="number"
                  defaultValue={saleRegion.typicalAge ?? ""}
                  key={saleRegion.id}
                  placeholder="20"
                  onBlur={(e) => {
                    const v = e.target.value === "" ? null : Number(e.target.value);
                    if (v !== saleRegion.typicalAge) onSaveRegion({ ...saleRegion, typicalAge: v });
                  }}
                  style={{ width: 60, fontSize: 12 }}
                />
              </>
            )}
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
            {saleRegion.listingCount > 0 && saleRegion.listingCount < 8 && (
              <p style={{ color: "var(--text-warning)", margin: "4px 0 0" }}>
                Az ilan ({saleRegion.listingCount}) - aralık geniş tutuldu. Arama sonucunun diğer
                sayfalarını da ekleyin.
              </p>
            )}
          </div>
        ) : (
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "6px 0 0" }}>
            {s.neighborhood ? `${s.neighborhood} için` : "Bu mahalle için"} kayıtlı bölge fiyatı
            yok. Sahibinden'de mahalleyi ve emlak tipini seçip arama sonuç sayfasını yapıştırın -
            bir kez eklenen bölge sonraki bütün dairelerde kullanılır.
          </p>
        )}
        {(pasteOpen || !saleRegion) && (
          <RegionPaste
            regionPrices={regionPrices}
            subject={s}
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
              onClick={() => (stale || rentStale ? setStaleReportPrompt(true) : runReport())}
            >
              <i className="ti ti-file-type-pdf" aria-hidden="true" /> PDF rapor
            </button>
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
// daireyi (mal sahibiyle ilk görüşme) fiyatlamak için tek yer.
export function MarketAnalysisTab({
  properties,
  agentFor,
  getPhotoUrlFor,
  onApplyPriceFor,
  ...rest
}) {
  const [selectedId, setSelectedId] = useState("");
  const property = properties.find((p) => p.id === selectedId) || null;
  const candidates = properties
    .filter((p) => ["satilik", "kiralik"].includes(p.transactionType))
    .sort((a, b) => (a.title || "").localeCompare(b.title || "", "tr"));
  return (
    <div>
      <h2 style={{ fontSize: 20, margin: "0 0 4px" }}>Piyasa Analizi</h2>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 12px" }}>
        Bölge fiyatı ve dairenin özelliklerinden hızlı satış, piyasa değeri ve üst fiyatı
        hesaplayın; mal sahibine PDF rapor verin.
      </p>
      <div style={{ marginBottom: 12, maxWidth: 420 }}>
        <label style={labelStyle}>Hangi daire?</label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
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
      <AutoValuation
        key={selectedId || "new"}
        property={property}
        properties={properties}
        agent={agentFor(property)}
        getPhotoUrl={property ? () => getPhotoUrlFor(property) : null}
        onApplyPrice={property ? (price) => onApplyPriceFor(property, price) : null}
        {...rest}
      />
    </div>
  );
}
