import React, { useMemo, useState } from "react";
import { ConfirmDialog, InfoTip, formatTL } from "./shared";
import { PROPERTY_DETAIL_FIELDS, PROPERTY_TYPE_OPTIONS, ROOM_COUNT_OPTIONS } from "./realEstate";
import {
  AVM_FACTOR_DEFAULTS,
  AVM_FACTOR_LABELS,
  CONDITION_OPTIONS,
  VIEW_OPTIONS,
  estimateValue,
  findRegion,
  mergeListings,
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

function SubjectForm({ s, setS }) {
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
        {input("city", "İl")}
        {input("district", "İlçe")}
        {input("neighborhood", "Mahalle")}
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
    // Aynı aramanın diğer sayfaları 14 gün içinde yapıştırılırsa birleştirilir.
    const existing = regionPrices.find((r) => regionKey(r) === regionKey(base));
    const mergeable =
      existing && existing.source === "ilan_yapistirma" && daysSince(existing.asOf) <= 14;
    const listings = mergeable
      ? mergeListings(existing.listings, parsed.listings)
      : parsed.listings;
    setDraft({
      ...base,
      parsed,
      existing,
      merged: mergeable,
      listings,
      summary: summarizeListings(listings),
    });
    setTypicalAge(existing?.typicalAge ?? "");
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

      {draft && draft.summary && (
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
            {draft.merged ? `, önceki sayfalarla birlikte ${draft.listings.length} ilan` : ""}
            {draft.parsed.totalCount ? ` (aramada toplam ${draft.parsed.totalCount} ilan)` : ""}.
            {draft.summary.outliers > 0 && ` ${draft.summary.outliers} uç değer hesaba katılmadı.`}{" "}
            Ortanca ilan fiyatı <b>{fmtUnit(draft.summary.medianM2)}</b>, tipik daire{" "}
            {draft.summary.medianArea} m².
          </p>
          {draft.parsed.page && draft.parsed.page.current < draft.parsed.page.total && (
            <p style={{ fontSize: 12, margin: "0 0 6px", color: "var(--text-warning)" }}>
              Aramada {draft.parsed.page.total} sayfa var. Kaydettikten sonra diğer sayfaları da
              yapıştırırsanız ilanlar birleştirilir (ya da sayfa başına 50 sonuç seçin).
            </p>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: "0 1 200px" }}>
              <label style={labelStyle}>
                Bölgedeki tipik bina yaşı
                <InfoTip text="Arama sonuç sayfası ilanların bina yaşını göstermiyor. Bu bölgedeki dairelerin çoğu kaç yaşındaysa onu yazın - yaş düzeltmesi bu tipik yaşa göre yapılır." />
              </label>
              <input
                type="number"
                value={typicalAge}
                onChange={(e) => setTypicalAge(e.target.value)}
                placeholder="ör. 25"
                style={{ width: "100%" }}
              />
            </div>
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
                  medianM2: draft.summary.medianM2,
                  q1M2: draft.summary.q1M2,
                  q3M2: draft.summary.q3M2,
                  medianArea: draft.summary.medianArea,
                  listingCount: draft.summary.listingCount,
                  typicalAge: typicalAge === "" ? null : Number(typicalAge),
                  asOf: new Date().toISOString().slice(0, 10),
                  source: "ilan_yapistirma",
                  listings: draft.listings.map(({ id, m2, rooms, price, date }) => ({
                    id,
                    m2,
                    rooms,
                    price,
                    date,
                  })),
                })
              }
              style={{
                background: "var(--fill-accent)",
                color: "var(--on-accent)",
                border: "none",
              }}
            >
              {saving ? "Kaydediliyor…" : "Bölge fiyatı olarak kaydet"}
            </button>
          </div>
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

function printReport({ subject, result, companySettings, agentName, title }) {
  const win = window.open("", "_blank");
  if (!win) return false;
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const d = subject.details;
  const features = [
    subject.roomCount,
    `${Math.round(result.gross)} m² brüt${result.grossEstimated ? " (netten tahmini)" : ""}`,
    subject.buildingAge !== "" && `${subject.buildingAge} yaşında bina`,
    subject.floor &&
      `${subject.floor}. kat${subject.totalFloors ? ` / ${subject.totalFloors}` : ""}`,
    d.condition,
    d.elevator === "Var" && "asansörlü",
    d.parking && d.parking !== "Yok" && d.parking.toLocaleLowerCase("tr"),
    d.in_site === "Evet" && "site içinde",
    d.facade.length && `${d.facade.join("-")} cephe`,
    d.view.length && `${d.view.join(", ")} manzarası`,
  ].filter(Boolean);
  const r = result.region;
  const adjRows = result.adjustments
    .map(
      (a) =>
        `<tr><td>${esc(a.label)}</td><td>${a.percent > 0 ? "+" : ""}${esc(a.percent)}%</td></tr>`,
    )
    .join("");
  win.document
    .write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"/><title>Piyasa Fiyat Tahmini</title>
<style>
body{font-family:Arial,sans-serif;color:#111;max-width:820px;margin:28px auto;padding:0 24px;font-size:12px;line-height:1.45}
h1{font-size:18px;margin:0}h2{font-size:13px;margin:20px 0 6px}
.head{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.head img{max-height:44px}
.range{display:flex;gap:12px;margin:8px 0}.range div{flex:1;border:1px solid #ccc;border-radius:6px;padding:10px;text-align:center}
.range div.mid{border:2px solid #185fa5}.range b{display:block;font-size:17px;margin-top:4px}.range span{font-size:10px;color:#666}
table{width:100%;border-collapse:collapse}td{padding:4px;border-bottom:1px solid #eee}
.disc{margin-top:18px;padding:10px;border:1px solid #c99;background:#fff7f7;font-size:11px}.meta{color:#555;font-size:11px}
</style></head><body>
<div class="head"><div><h1>Piyasa Fiyat Tahmini</h1><div class="meta">${esc(companySettings?.companyName || "")}${agentName ? ` - ${esc(agentName)}` : ""} - ${esc(new Date().toLocaleDateString("tr-TR"))}</div></div>
${companySettings?.logoUrl ? `<img src="${esc(companySettings.logoUrl)}" alt=""/>` : ""}</div>
${title ? `<h2>${esc(title)}</h2>` : ""}
<div><b>${esc([subject.neighborhood, subject.district, subject.city].filter(Boolean).join(", "))}</b> · ${esc(subject.propertyType)}</div>
<div>${esc(features.join(" · "))}</div>
<h2>Tahmini değer</h2>
<div class="range"><div>Hızlı satış<b>${esc(formatTL(result.value.low))}</b><span>kısa sürede alıcı bulur</span></div><div class="mid">Piyasa değeri<b>${esc(formatTL(result.value.mid))}</b><span>${esc(fmtUnit(result.unit))}</span></div><div>Üst fiyat<b>${esc(formatTL(result.value.high))}</b><span>pazarlama süresi uzar</span></div></div>
${result.rent ? `<div class="meta">Tahmini aylık kira: <b>${esc(formatTL(result.rent.monthly))}</b>${result.rent.paybackYears ? ` · kira ile geri dönüş süresi yaklaşık ${esc(result.rent.paybackYears.toFixed(1))} yıl` : ""}</div>` : ""}
<h2>Dayanak</h2>
<div class="meta">${r.source === "elle" ? "Bölge m² fiyatı danışman tarafından girildi" : `${esc(r.neighborhood)} bölgesinde ${esc(r.listingCount)} güncel satılık ilan (${esc(fmtDate(r.asOf))})`}: ortanca ilan fiyatı ${esc(fmtUnit(r.medianM2))}${result.index.factor !== 1 ? `, TCMB Konut Fiyat Endeksi ile bugüne güncellendi (×${esc(result.index.factor.toFixed(3))})` : ""}. İlan fiyatlarından %${esc(result.factors.askingDiscountPercent)} pazarlık payı düşüldü: ${esc(fmtUnit(result.saleUnit))}.</div>
${adjRows ? `<h2>Dairenin özelliklerine göre düzeltmeler</h2><table>${adjRows}<tr><td><b>Toplam</b></td><td><b>${result.totalPercent > 0 ? "+" : ""}${esc(Math.round(result.totalPercent * 10) / 10)}%</b></td></tr></table>` : ""}
<div class="disc">${esc(DISCLAIMER)}</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`);
  win.document.close();
  return true;
}

export function AutoValuation({
  property,
  regionPrices,
  marketIndex,
  companySettings,
  agentName,
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
  const savedFactors = companySettings?.realEstateSettings?.avmFactors || {};
  const [factors, setFactors] = useState(() => ({ ...AVM_FACTOR_DEFAULTS, ...savedFactors }));

  const saleRegion = findRegion(regionPrices, s, "satilik");
  const rentRegion = findRegion(regionPrices, s, "kiralik");
  const result = useMemo(
    () => estimateValue({ subject: s, saleRegion, rentRegion, marketIndex, factors }),
    [s, saleRegion, rentRegion, marketIndex, factors],
  );
  const age = saleRegion ? daysSince(saleRegion.asOf) : 0;

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
        <SubjectForm s={s} setS={setS} />
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
            {age > 90 && (
              <p style={{ color: "var(--text-warning)", margin: "4px 0 0" }}>
                Bölge fiyatı {age} gün önce alındı. TCMB endeksiyle güncelleniyor ama yeni ilan
                sonuçlarını yapıştırmanız önerilir.
              </p>
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
              onClick={() => {
                const ok = printReport({
                  subject: s,
                  result,
                  companySettings,
                  agentName,
                  title: property?.title,
                });
                if (!ok)
                  notify(
                    "Yazdırma penceresi açılamadı - tarayıcının açılır pencere engelini kaldırın.",
                  );
              }}
            >
              <i className="ti ti-printer" aria-hidden="true" /> Mal sahibine rapor
            </button>
            {onApplyPrice && (
              <button
                type="button"
                style={{ fontSize: 12.5 }}
                onClick={() => onApplyPrice(result.value.mid)}
              >
                Piyasa değerini portföy fiyatı yap
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
                    {r.source === "elle" ? "elle" : `${r.listingCount} ilan`} · {fmtDate(r.asOf)}
                  </span>
                  <button
                    type="button"
                    style={{ fontSize: 12, color: "var(--text-danger)" }}
                    onClick={() => setConfirmDelete(r)}
                  >
                    Sil
                  </button>
                </div>
              ))
          )}
        </div>
      )}

      {showDetailed && detailed}

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
