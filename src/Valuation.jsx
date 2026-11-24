import React, { useMemo, useState } from "react";
import { Badge, ConfirmDialog, InfoTip, formatTL, uid } from "./shared";
import { istanbulToday } from "./priceEstimate";
import {
  VALUATION_DEFAULTS,
  analyzeComparables,
  parseListingText,
  transactionLabel,
} from "./realEstate";

const labelStyle = {
  fontSize: 12,
  color: "var(--text-secondary)",
  display: "flex",
  alignItems: "center",
  gap: 4,
  marginBottom: 4,
};

const DISCLAIMER =
  "Bu çalışma, emsal karşılaştırmasına dayanan bir piyasa fiyat analizidir; Sermaye Piyasası Kurulu (SPK) mevzuatı kapsamında lisanslı değerleme uzmanınca hazırlanan bir gayrimenkul değerleme raporu DEĞİLDİR. Kredi, mahkeme, kamulaştırma veya resmi işlemlerde kullanılamaz. Sonuçlar seçilen emsallere ve varsayımlara göre değişir.";

const fmtUnit = (n) => `${new Intl.NumberFormat("tr-TR").format(Math.round(n))} TL/m²`;

const emptyComp = () => ({
  kind: "ilan",
  title: "",
  price: "",
  grossM2: "",
  netM2: "",
  roomCount: "",
  buildingAge: "",
  floor: "",
  district: "",
  observedOn: istanbulToday(),
  manualAdjustPercent: "",
  note: "",
});

const numOrNull = (v) => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v));

function CompForm({ initial, onSave, onCancel }) {
  const [c, setC] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setC((p) => ({ ...p, [k]: e.target.value }));
  const field = (k, label, type = "text", flex = "1 1 110px") => (
    <div style={{ flex }}>
      <label style={labelStyle}>{label}</label>
      <input type={type} value={c[k] ?? ""} onChange={set(k)} style={{ width: "100%" }} />
    </div>
  );
  return (
    <div
      style={{
        border: "0.5px solid var(--border)",
        borderRadius: 8,
        padding: 10,
        marginBottom: 8,
        background: "var(--surface-1)",
      }}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ flex: "1 1 130px" }}>
          <label style={labelStyle}>Tür</label>
          <select value={c.kind} onChange={set("kind")} style={{ width: "100%" }}>
            <option value="ilan">İlan (istenen fiyat)</option>
            <option value="satis">Gerçekleşmiş satış/kira</option>
          </select>
        </div>
        {field("title", "Başlık / adres", "text", "2 1 200px")}
        {field("price", "Fiyat (TL)", "number")}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {field("netM2", "Net m²", "number")}
        {field("grossM2", "Brüt m²", "number")}
        {field("roomCount", "Oda")}
        {field("buildingAge", "Bina yaşı", "number")}
        {field("floor", "Kat")}
        {field("district", "İlçe")}
        {field("observedOn", "Tarih", "date")}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "0 1 170px" }}>
          <label style={labelStyle}>
            Danışman düzeltmesi (%)
            <InfoTip text="Formülün ölçemediği farklar için: manzara, bakım, cephe, site olanakları gibi. Emsal bizim mülkten kötüyse artı (ör. +5), iyiyse eksi yazın." />
          </label>
          <input
            type="number"
            value={c.manualAdjustPercent ?? ""}
            onChange={set("manualAdjustPercent")}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ flex: "2 1 200px" }}>
          <label style={labelStyle}>Not</label>
          <input value={c.note ?? ""} onChange={set("note")} style={{ width: "100%" }} />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" onClick={onCancel}>
            Vazgeç
          </button>
          <button
            type="button"
            disabled={!numOrNull(c.price) || saving}
            onClick={async () => {
              setSaving(true);
              const ok = await onSave({
                ...c,
                price: numOrNull(c.price),
                grossM2: numOrNull(c.grossM2),
                netM2: numOrNull(c.netM2),
                buildingAge: numOrNull(c.buildingAge),
                manualAdjustPercent: numOrNull(c.manualAdjustPercent) || 0,
              });
              setSaving(false);
              if (ok) onCancel();
            }}
            style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
          >
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}

function printReport({ property, result, companySettings, agentName }) {
  const win = window.open("", "_blank");
  if (!win) return false;
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const basisLabel = result.basis === "net" ? "net" : "brüt";
  const rows = result.rows
    .filter((r) => !r.skipped)
    .map(
      (r) => `<tr>
        <td>${esc(r.comp.title || "-")}<div class="sub">${esc(
          [
            r.comp.kind === "satis" ? "Gerçekleşmiş" : "İlan",
            r.comp.roomCount,
            r.comp.district,
            r.comp.observedOn &&
              new Date(`${r.comp.observedOn}T00:00:00`).toLocaleDateString("tr-TR"),
          ]
            .filter(Boolean)
            .join(" · "),
        )}</div></td>
        <td>${esc(Math.round(r.area))} m²</td>
        <td>${esc(formatTL(r.comp.price))}</td>
        <td>${esc(fmtUnit(r.unit))}</td>
        <td>${esc(r.adj.map((a) => `${a.label} ${a.percent > 0 ? "+" : ""}${a.percent}%`).join(", ") || "-")}</td>
        <td><b>${esc(fmtUnit(r.adjustedUnit))}</b></td>
      </tr>`,
    )
    .join("");
  const subjectLine = [
    transactionLabel(property.transactionType),
    property.propertyType,
    property.roomCount,
    `${Math.round(result.subjectArea)} m² ${basisLabel}`,
    property.buildingAge != null && `${property.buildingAge} yaşında`,
    [property.neighborhood, property.district, property.city].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");
  win.document
    .write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"/><title>Piyasa Fiyat Analizi</title>
<style>
body{font-family:Arial,sans-serif;color:#111;max-width:860px;margin:28px auto;padding:0 24px;font-size:12px;line-height:1.45}
h1{font-size:18px;margin:0}h2{font-size:13px;margin:20px 0 6px}
.head{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.head img{max-height:44px}
.range{display:flex;gap:12px;margin:8px 0}.range div{flex:1;border:1px solid #ccc;border-radius:6px;padding:10px;text-align:center}
.range div.mid{border:2px solid #185fa5}.range b{display:block;font-size:16px;margin-top:4px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:5px 4px;border-bottom:1px solid #e5e5e5;vertical-align:top}
th{font-size:11px;color:#555}.sub{font-size:10px;color:#777}
.disc{margin-top:18px;padding:10px;border:1px solid #c99;background:#fff7f7;font-size:11px}
.meta{color:#555;font-size:11px}
</style></head><body>
<div class="head"><div><h1>Piyasa Fiyat Analizi</h1><div class="meta">${esc(companySettings?.companyName || "")}${agentName ? ` - ${esc(agentName)}` : ""} - ${esc(new Date().toLocaleDateString("tr-TR"))}</div></div>
${companySettings?.logoUrl ? `<img src="${esc(companySettings.logoUrl)}" alt=""/>` : ""}</div>
<h2>${esc(property.title)}</h2><div>${esc(subjectLine)}</div>
<h2>Önerilen fiyat aralığı</h2>
<div class="range"><div>Alt<b>${esc(formatTL(result.value.low))}</b></div><div class="mid">Makul<b>${esc(formatTL(result.value.mid))}</b></div><div>Üst<b>${esc(formatTL(result.value.high))}</b></div></div>
<div class="meta">Birim değer: ${esc(fmtUnit(result.unit.mid))} (${esc(basisLabel)} m²), ${result.count} emsal${result.lowConfidence ? " - az emsal, aralık sabit ±%7 olarak gösterildi" : ""}.</div>
<h2>Emsaller ve düzeltmeler</h2>
<table><thead><tr><th>Emsal</th><th>Alan</th><th>Fiyat</th><th>m² fiyatı</th><th>Düzeltmeler</th><th>Düzeltilmiş</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Yöntem</h2>
<div class="meta">Emsallerin m² fiyatları, konu mülkle aralarındaki farklara göre düzeltildi: ilan fiyatlarına %${esc(result.options.askingDiscountPercent)} pazarlık payı${result.options.annualIncreasePercent ? `, yıllık %${esc(result.options.annualIncreasePercent)} değer artışıyla zaman düzeltmesi` : ""}, yaş farkı başına %${esc(result.options.agePercentPerYear)}, giriş/bodrum kat farkı %${esc(result.options.lowFloorPercent)} ve danışmanın gerekçeli düzeltmeleri. Makul değer, konu mülke benzerliğe (alan, ilçe, oda sayısı, tazelik, gerçekleşmiş işlem) göre ağırlıklandırılmış ortalamadır; alt ve üst değerler düzeltilmiş m² fiyatlarının çeyrekliklerinden hesaplanır.</div>
<div class="disc">${esc(DISCLAIMER)}</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`);
  win.document.close();
  return true;
}

export function Valuation({
  property,
  comparables,
  properties,
  companySettings,
  agentName,
  onSaveComparable,
  onDeleteComparable,
  onSaveOptions,
  onApplyPrice,
  notify,
}) {
  const [editing, setEditing] = useState(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [opts, setOpts] = useState(() => ({
    ...VALUATION_DEFAULTS,
    ...(property.details?.valuation || {}),
  }));

  const mine = comparables.filter((c) => c.propertyId === property.id);
  const result = useMemo(
    () =>
      analyzeComparables(property, mine, {
        askingDiscountPercent: Number(opts.askingDiscountPercent) || 0,
        annualIncreasePercent: Number(opts.annualIncreasePercent) || 0,
        agePercentPerYear: Number(opts.agePercentPerYear) || 0,
        lowFloorPercent: Number(opts.lowFloorPercent) || 0,
      }),
    [property, mine, opts],
  );

  // Ofisin kendi portföyünden emsal: kapanmışlar gerçekleşmiş işlem sayılır.
  const portfolioCandidates = properties.filter(
    (p) =>
      p.id !== property.id &&
      p.transactionType === property.transactionType &&
      p.price &&
      (p.netM2 || p.grossM2) &&
      !mine.some((c) => c.sourcePropertyId === p.id),
  );

  const save = (c) => onSaveComparable({ id: c.id || uid(), propertyId: property.id, ...c });

  const addFromPaste = async () => {
    const p = parseListingText(pasteText);
    if (!p.price || !(p.netM2 || p.grossM2)) {
      notify("İlan metninde fiyat veya m² bulunamadı - ilan detay sayfasının tamamını kopyalayın.");
      return;
    }
    const ok = await save({
      kind: "ilan",
      title: p.title || "",
      price: p.price,
      grossM2: p.grossM2 ?? null,
      netM2: p.netM2 ?? null,
      roomCount: p.roomCount || "",
      buildingAge: p.buildingAge ?? null,
      floor: p.floor || "",
      district: p.district || "",
      neighborhood: p.neighborhood || "",
      observedOn: istanbulToday(),
      note: p.listingRefs?.sahibinden ? `İlan no ${p.listingRefs.sahibinden}` : "",
    });
    if (ok) {
      setPasteText("");
      setPasteOpen(false);
    }
  };

  const optField = (k, label, tip) => (
    <div style={{ flex: "1 1 140px" }}>
      <label style={labelStyle}>
        {label}
        {tip && <InfoTip text={tip} />}
      </label>
      <input
        type="number"
        value={opts[k] ?? ""}
        onChange={(e) => setOpts((o) => ({ ...o, [k]: e.target.value }))}
        onBlur={() => onSaveOptions(opts)}
        style={{ width: "100%" }}
      />
    </div>
  );

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

      <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 6px" }}>Emsaller ({mine.length})</p>
      {mine.length === 0 && !editing && (
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 8px" }}>
          Benzer ilanları yapıştırarak, ofisinizin kendi portföyünden ya da elle emsal ekleyin. En
          az 3 emsal önerilir.
        </p>
      )}
      {mine.map((c) => {
        const row = result.rows?.find((r) => r.comp.id === c.id);
        return editing?.id === c.id ? (
          <CompForm key={c.id} initial={editing} onSave={save} onCancel={() => setEditing(null)} />
        ) : (
          <div
            key={c.id}
            style={{
              fontSize: 12.5,
              padding: "8px 10px",
              background: "var(--surface-1)",
              border: "0.5px solid var(--border)",
              borderRadius: "var(--radius)",
              marginBottom: 6,
            }}
          >
            <div
              style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}
            >
              <span style={{ fontWeight: 500 }}>
                {c.title || "Başlıksız emsal"}{" "}
                <Badge tone={c.kind === "satis" ? "success" : "default"}>
                  {c.kind === "satis" ? "Gerçekleşmiş" : "İlan"}
                </Badge>
              </span>
              <span>
                {formatTL(c.price)}
                {row && !row.skipped && (
                  <span style={{ color: "var(--text-muted)" }}>
                    {" "}
                    · {fmtUnit(row.unit)} → <b>{fmtUnit(row.adjustedUnit)}</b>
                  </span>
                )}
              </span>
            </div>
            <div style={{ color: "var(--text-muted)", marginTop: 2 }}>
              {[
                c.netM2 && `${c.netM2} m² net`,
                c.grossM2 && `${c.grossM2} m² brüt`,
                c.roomCount,
                c.buildingAge != null && `${c.buildingAge} yaş`,
                c.floor && `kat: ${c.floor}`,
                c.district,
              ]
                .filter(Boolean)
                .join(" · ")}
              {row?.skipped && (
                <span style={{ color: "var(--text-danger)" }}> · {row.skipped}</span>
              )}
              {row?.adj?.length > 0 && (
                <>
                  {" "}
                  ·{" "}
                  {row.adj
                    .map((a) => `${a.label} ${a.percent > 0 ? "+" : ""}${a.percent}%`)
                    .join(", ")}
                </>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <button type="button" style={{ fontSize: 12 }} onClick={() => setEditing({ ...c })}>
                Düzenle
              </button>
              <button
                type="button"
                style={{ fontSize: 12, color: "var(--text-danger)" }}
                onClick={() => setConfirmDelete(c)}
              >
                Sil
              </button>
            </div>
          </div>
        );
      })}
      {editing && !editing.id && (
        <CompForm initial={editing} onSave={save} onCancel={() => setEditing(null)} />
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0 12px" }}>
        <button type="button" style={{ fontSize: 12.5 }} onClick={() => setPasteOpen((v) => !v)}>
          <i className="ti ti-clipboard-text" aria-hidden="true" /> İlandan emsal ekle
        </button>
        <button type="button" style={{ fontSize: 12.5 }} onClick={() => setEditing(emptyComp())}>
          + Elle emsal ekle
        </button>
        {portfolioCandidates.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              const p = properties.find((x) => x.id === e.target.value);
              if (!p) return;
              save({
                kind: ["satildi", "kiralandi"].includes(p.status) ? "satis" : "ilan",
                title: p.title,
                price: p.price,
                grossM2: p.grossM2,
                netM2: p.netM2,
                roomCount: p.roomCount,
                buildingAge: p.buildingAge,
                floor: p.floor,
                district: p.district,
                neighborhood: p.neighborhood,
                observedOn: (p.createdAt || "").slice(0, 10),
                sourcePropertyId: p.id,
                note: "Ofis portföyü",
              });
            }}
            style={{ fontSize: 12.5 }}
          >
            <option value="">Portföyden emsal ekle…</option>
            {portfolioCandidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
                {["satildi", "kiralandi"].includes(p.status) ? " (kapanmış)" : ""}
              </option>
            ))}
          </select>
        )}
      </div>
      {pasteOpen && (
        <div style={{ marginBottom: 12 }}>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={4}
            placeholder="Benzer bir ilanın sayfasını Ctrl+A, Ctrl+C ile kopyalayıp buraya yapıştırın"
            style={{ width: "100%", resize: "vertical", marginBottom: 6 }}
          />
          <button
            type="button"
            style={{ fontSize: 12.5 }}
            disabled={!pasteText.trim()}
            onClick={addFromPaste}
          >
            Emsal olarak ekle
          </button>
        </div>
      )}

      <p style={{ fontSize: 13, fontWeight: 600, margin: "12px 0 6px" }}>Varsayımlar</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {optField(
          "askingDiscountPercent",
          "İlan pazarlık payı (%)",
          "İlan fiyatları genelde satış fiyatından yüksektir. İlan türündeki emsallerin m² fiyatından bu kadar düşülür.",
        )}
        {optField(
          "annualIncreasePercent",
          "Yıllık değer artışı (%)",
          "Eski tarihli emsalleri bugüne taşımak için. Bölgenizdeki yıllık fiyat artışını yazın (ör. TCMB Konut Fiyat Endeksi'nden). 0 bırakılırsa zaman düzeltmesi yapılmaz.",
        )}
        {optField("agePercentPerYear", "Yaş farkı (yıl başına %)")}
        {optField("lowFloorPercent", "Giriş/bodrum kat farkı (%)")}
      </div>

      {result.error ? (
        <p style={{ fontSize: 13, color: "var(--text-warning)" }}>{result.error}</p>
      ) : (
        <div
          style={{
            border: "0.5px solid var(--border)",
            borderRadius: 8,
            padding: 12,
            marginBottom: 8,
          }}
        >
          <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 8px" }}>Önerilen fiyat aralığı</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              ["Alt", result.value.low],
              ["Makul", result.value.mid],
              ["Üst", result.value.high],
            ].map(([label, v]) => (
              <div
                key={label}
                style={{
                  flex: "1 1 120px",
                  textAlign: "center",
                  padding: 8,
                  borderRadius: 6,
                  border:
                    label === "Makul"
                      ? "2px solid var(--fill-accent)"
                      : "0.5px solid var(--border)",
                }}
              >
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{formatTL(v)}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "8px 0 0" }}>
            {fmtUnit(result.unit.mid)} × {Math.round(result.subjectArea)} m²{" "}
            {result.basis === "net" ? "net" : "brüt"} · {result.count} emsal
            {result.lowConfidence &&
              " · az emsal: aralık ±%7 olarak gösteriliyor, en az 3 emsal ekleyin"}
            {property.price ? ` · Portföydeki fiyat: ${formatTL(property.price)}` : ""}
          </p>
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              style={{ fontSize: 12.5 }}
              onClick={() => {
                const ok = printReport({ property, result, companySettings, agentName });
                if (!ok)
                  notify(
                    "Yazdırma penceresi açılamadı - tarayıcının açılır pencere engelini kaldırın.",
                  );
              }}
            >
              <i className="ti ti-printer" aria-hidden="true" /> Mal sahibine rapor
            </button>
            <button
              type="button"
              style={{ fontSize: 12.5 }}
              onClick={() => onApplyPrice(result.value.mid)}
            >
              Makul değeri portföy fiyatı yap
            </button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Emsal silinsin mi?"
          message={`"${confirmDelete.title || "Başlıksız emsal"}" analizden kaldırılır.`}
          confirmLabel="Kaldır"
          onConfirm={() => {
            onDeleteComparable(confirmDelete.id);
            setConfirmDelete(null);
          }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
