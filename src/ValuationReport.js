// Piyasa fiyat tahmini raporu - yazdırma penceresinde A4 sayfalar halinde açılır,
// kullanıcı "PDF olarak kaydet" ile PDF alır (ek kütüphane yok, metin seçilebilir
// kalır). Kullanıcı Endeksa raporundaki bilgi zenginliğini istedi; düzen ve metin
// bize ait, yalnızca elimizde gerçekten olan veriler gösterilir (demografi/seçim
// gibi verimiz olmayan bölümler uydurulmaz).
import { formatTL } from "./shared";
import { ageStats, kfeSeriesForCity } from "./priceEstimate";

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const nf = (n) => new Intl.NumberFormat("tr-TR").format(Math.round(n));
const unit = (n) => `${nf(n)} TL/m²`;
const monthLabel = (period) =>
  new Date(`${String(period).slice(0, 7)}-01T00:00:00`).toLocaleDateString("tr-TR", {
    month: "long",
    year: "numeric",
  });
const fmtDate = (d) =>
  d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString("tr-TR") : "";
const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function kfeChart(marketIndex, city) {
  const series = kfeSeriesForCity(city);
  const pts = (marketIndex || [])
    .filter((p) => p.series === series)
    .sort((a, b) => a.period.localeCompare(b.period))
    .slice(-24);
  if (pts.length < 6) return null;
  const W = 640;
  const H = 170;
  const pad = { l: 44, r: 10, t: 10, b: 26 };
  const vals = pts.map((p) => p.value);
  const min = Math.min(...vals) * 0.97;
  const max = Math.max(...vals) * 1.02;
  const x = (i) => pad.l + (i * (W - pad.l - pad.r)) / (pts.length - 1);
  const y = (v) => pad.t + ((max - v) * (H - pad.t - pad.b)) / (max - min);
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${pad.l},${H - pad.b} ${line} ${x(pts.length - 1).toFixed(1)},${H - pad.b}`;
  const grid = [0, 0.5, 1]
    .map((f) => {
      const v = min + (max - min) * f;
      return `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="#e5e7eb"/><text x="${pad.l - 6}" y="${y(v) + 4}" font-size="10" text-anchor="end" fill="#6b7280">${Math.round(v)}</text>`;
    })
    .join("");
  const labels = pts
    .map((p, i) => {
      if (i % 4 !== 0 && i !== pts.length - 1) return "";
      const [yy, mm] = p.period.split("-");
      return `<text x="${x(i)}" y="${H - 8}" font-size="10" text-anchor="${i === pts.length - 1 ? "end" : i === 0 ? "start" : "middle"}" fill="#6b7280">${MONTHS[Number(mm) - 1]} ${yy.slice(2)}</text>`;
    })
    .join("");
  const last = pts[pts.length - 1];
  const change = (months) => {
    const base = pts[pts.length - 1 - months];
    return base ? ((last.value / base.value - 1) * 100).toFixed(1) : null;
  };
  return {
    svg: `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg">${grid}<polygon points="${area}" fill="#dbeafe"/><polyline points="${line}" fill="none" stroke="#1d4ed8" stroke-width="2"/>${labels}</svg>`,
    latest: last.period,
    y1: change(12),
    m6: change(6),
    series,
  };
}

function featureRows(subject, result, property) {
  const d = subject.details || {};
  const rows = [
    ["Emlak tipi", subject.propertyType],
    ["Oda sayısı", subject.roomCount],
    [
      "Brüt alan",
      result.gross
        ? `${Math.round(result.gross)} m²${result.grossEstimated ? " (tahmini)" : ""}`
        : "",
    ],
    ["Net alan", subject.netM2 ? `${subject.netM2} m²` : ""],
    ["Bina yaşı", subject.buildingAge !== "" ? subject.buildingAge : ""],
    ["Bulunduğu kat", subject.floor],
    ["Bina kat sayısı", subject.totalFloors],
    ["Durum", d.condition],
    ["Isıtma", d.heating],
    ["Asansör", d.elevator],
    ["Otopark", d.parking],
    ["Site içinde", d.in_site],
    ["Cephe", (d.facade || []).join(", ")],
    ["Manzara", (d.view || []).join(", ")],
    ["Banyo sayısı", property?.details?.bathrooms],
    ["Kullanım durumu", property?.details?.usage],
    ["Tapu durumu", property?.details?.deed_status],
  ].filter(([, v]) => v !== "" && v != null && v !== undefined);
  return rows;
}

export function buildValuationReportHtml({
  subject,
  result,
  property,
  companySettings,
  agent,
  marketIndex,
  photoUrl,
  closed,
  disclaimer,
}) {
  const r = result.region;
  const office = companySettings?.companyName || "";
  const today = new Date().toLocaleDateString("tr-TR");
  const location = [subject.neighborhood, subject.district, subject.city]
    .filter(Boolean)
    .join(", ");
  const contact = [
    agent?.name,
    agent?.phone || companySettings?.phone,
    agent?.email || companySettings?.email,
  ]
    .filter(Boolean)
    .map(esc)
    .join(" · ");
  const footer = (n) =>
    `<div class="foot"><span>${contact}${office ? ` · ${esc(office)}` : ""}</span><span>Sayfa ${n}/3</span></div>`;
  const features = featureRows(subject, result, property);
  const half = Math.ceil(features.length / 2);
  const featTable = (rows) =>
    `<table class="kv">${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>`;

  // Emsal sıralaması: kayıtlı ilanlar m² fiyatına göre, konu daire tahmini piyasa
  // değeriyle (ilan seviyesine çevrilmiş) araya yerleştirilir.
  const subjectAskingUnit =
    result.unit / (1 - Number(result.factors.askingDiscountPercent || 0) / 100);
  const comps = (r.listings || [])
    .filter((l) => l.m2 && l.price)
    .map((l) => ({ ...l, unit: l.price / l.m2 }))
    .sort((a, b) => a.unit - b.unit);
  // Tek A4 sayfaya sığsın diye konu dairenin çevresindeki 15 ilan gösterilir;
  // sıra numarası tüm listedeki gerçek sırasıdır.
  const ranked = [...comps, { subject: true, unit: subjectAskingUnit }].sort(
    (a, b) => a.unit - b.unit,
  );
  const meIdx = ranked.findIndex((l) => l.subject);
  const from = Math.max(0, Math.min(meIdx - 7, ranked.length - 15));
  const subjectAskingPrice =
    Math.round(
      result.value.mid / (1 - Number(result.factors.askingDiscountPercent || 0) / 100) / 10000,
    ) * 10000;
  const rankRows = ranked
    .slice(from, from + 15)
    .map((l, j) => {
      const i = from + j;
      return l.subject
        ? `<tr class="me"><td>${i + 1}</td><td>${esc(subject.roomCount || "-")}</td><td>${Math.round(result.gross)}</td><td>${esc(formatTL(subjectAskingPrice))}</td><td>${unit(l.unit)}</td><td>${esc(subject.buildingAge !== "" ? subject.buildingAge : "-")}</td><td>Bu daire (ilan seviyesinde)</td></tr>`
        : `<tr><td>${i + 1}</td><td>${esc(l.rooms || "-")}</td><td>${esc(l.m2)}</td><td>${esc(formatTL(l.price))}</td><td>${unit(l.unit)}</td><td>${esc(l.ageBand || "-")}</td><td>${esc(fmtDate(l.date))}</td></tr>`;
    })
    .join("");
  const rankNote =
    ranked.length > 15 ? ` ${ranked.length} kayıttan bu daireye en yakın 15'i gösteriliyor.` : "";
  const ages = comps
    .filter((l) => l.date)
    .map((l) => (Date.now() - new Date(`${l.date}T00:00:00`)) / 86400000);
  const avgListingAge = ages.length
    ? Math.round(ages.reduce((s, a) => s + a, 0) / ages.length)
    : null;
  const chart = kfeChart(marketIndex, r.city || subject.city);

  const ages2 = ageStats(r.listings);
  const metrics = [
    ["Değerlendirilen ilan", r.source === "elle" ? "elle girildi" : `${r.listingCount} ilan`],
    ["Ortanca ilan fiyatı", unit(r.medianM2)],
    r.q1M2 && r.q3M2 ? ["İlanların orta yarısı", `${nf(r.q1M2)} - ${unit(r.q3M2)}`] : null,
    r.medianArea ? ["Bölgede tipik daire", `${r.medianArea} m² brüt`] : null,
    ages2.typicalAge != null
      ? ["Bölgede tipik bina yaşı", `${ages2.typicalAge} (${ages2.agedCount} ilandan)`]
      : r.typicalAge != null
        ? ["Bölgede tipik bina yaşı", `${r.typicalAge} (danışman tahmini)`]
        : null,
    ages2.ageSlope != null ? ["Yaşın m² fiyatına etkisi", `yılda %${ages2.ageSlope}`] : null,
    avgListingAge != null ? ["İlanların ortalama yayın süresi", `${avgListingAge} gün`] : null,
    // Tek tek işlem fiyatı başka müşterilerin bilgisidir - sadece en az 3
    // işlemin ortancası gösterilir.
    closed?.count >= 3
      ? [
          "Ofisin bölgede gerçekleşen satışları",
          `${closed.count} işlem, ortanca ${unit(closed.medianUnitToday)}`,
        ]
      : null,
    ["İlan verisi tarihi", fmtDate(r.asOf)],
    result.index.factor !== 1 && result.index.latest
      ? [
          "TCMB endeksiyle güncelleme",
          `${monthLabel(result.index.latest)} verisine kadar %${((result.index.factor - 1) * 100).toFixed(1).replace(".", ",")}`,
        ]
      : null,
  ].filter(Boolean);

  const adjRows = result.adjustments
    .map(
      (a) =>
        `<tr><td>${esc(a.label)}</td><td class="num ${a.percent > 0 ? "up" : "down"}">${a.percent > 0 ? "+" : ""}${esc(a.percent)}%</td></tr>`,
    )
    .join("");

  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"/>
<title>Piyasa Değer Raporu - ${esc(location)}</title>
<style>
@page{size:A4;margin:0}
*{box-sizing:border-box}
body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#111827;font-size:11.5px;line-height:1.45;background:#e5e7eb}
.page{width:210mm;min-height:297mm;padding:16mm 15mm 22mm;margin:0 auto 8mm;background:#fff;position:relative;page-break-after:always}
.page:last-child{page-break-after:auto}
@media print{body{background:#fff}.page{margin:0;box-shadow:none}}
.band{background:#1e3a8a;color:#fff;padding:5px 10px;border-radius:4px;font-size:12.5px;font-weight:700;margin:14px 0 8px}
h1{font-size:30px;line-height:1.15;margin:0 0 6px;color:#1e3a8a}
.sub{font-size:14px;color:#374151}
.cover-photo{width:100%;height:95mm;object-fit:cover;border-radius:8px;margin:14mm 0 8mm;background:#f3f4f6}
.cover-ph{width:100%;height:60mm;border-radius:8px;margin:14mm 0 8mm;background:#eff6ff;display:flex;align-items:center;justify-content:center;color:#1e3a8a;font-size:15px}
.info{font-size:13px}.info b{display:inline-block;width:34mm;color:#374151}
.info div{margin-bottom:5px}
.logo{position:absolute;top:16mm;right:15mm;max-height:16mm;max-width:50mm}
.cards{display:flex;gap:8px}
.card{flex:1;border:1px solid #d1d5db;border-radius:8px;padding:10px;text-align:center}
.card.mid{border:2px solid #1d4ed8;background:#eff6ff}
.card .l{font-size:11px;color:#4b5563}.card .v{font-size:19px;font-weight:700;margin:4px 0}.card .s{font-size:10px;color:#6b7280}
.cols{display:flex;gap:10px}.cols>*{flex:1}
table{width:100%;border-collapse:collapse}
.kv th{text-align:left;font-weight:600;color:#374151;width:45%;padding:4px 6px;border-bottom:1px solid #f3f4f6}
.kv td{padding:4px 6px;border-bottom:1px solid #f3f4f6}
.list th{background:#f3f4f6;text-align:left;padding:4px 6px;font-size:10.5px}
.list td{padding:3px 6px;border-bottom:1px solid #f3f4f6;font-size:10.5px}
.list tr.me td{background:#1d4ed8;color:#fff;font-weight:700}
.num{text-align:right;white-space:nowrap}.up{color:#15803d}.down{color:#b91c1c}
.metrics{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.metric{border:1px solid #e5e7eb;border-radius:6px;padding:6px 8px;display:flex;justify-content:space-between;gap:6px}
.metric span:first-child{color:#4b5563}.metric span:last-child{font-weight:700;text-align:right}
.note{font-size:10px;color:#6b7280;margin-top:4px}
.disc{margin-top:10px;padding:8px;border:1px solid #fecaca;background:#fef2f2;font-size:10px;border-radius:6px}
.foot{position:absolute;left:15mm;right:15mm;bottom:9mm;display:flex;justify-content:space-between;font-size:10px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:5px}
</style></head><body>

<section class="page">
${companySettings?.logoUrl ? `<img class="logo" src="${esc(companySettings.logoUrl)}" alt=""/>` : ""}
<h1>Piyasa Değer Raporu</h1>
<div class="sub">${esc(r.transactionType === "kiralik" ? "Kiralık" : "Satılık")} ${esc(subject.propertyType || "Konut")}${subject.roomCount ? ` · ${esc(subject.roomCount)}` : ""}${result.gross ? ` · ${Math.round(result.gross)} m²` : ""}</div>
${photoUrl ? `<img class="cover-photo" src="${esc(photoUrl)}" alt=""/>` : `<div class="cover-ph">${esc(location)}</div>`}
<div class="info">
${property?.title ? `<div><b>Portföy</b>${esc(property.title)}</div>` : ""}
<div><b>Konum</b>${esc(location)}</div>
${property?.address ? `<div><b>Adres</b>${esc(property.address)}</div>` : ""}
${property?.parcelBlock || property?.parcelNo ? `<div><b>Ada / Parsel</b>${esc([property.parcelBlock, property.parcelNo].filter(Boolean).join(" / "))}</div>` : ""}
<div><b>Rapor tarihi</b>${esc(today)}</div>
${agent?.name ? `<div><b>Hazırlayan</b>${esc(agent.name)}${office ? `, ${esc(office)}` : ""}</div>` : office ? `<div><b>Hazırlayan</b>${esc(office)}</div>` : ""}
${contact ? `<div><b>İletişim</b>${esc([agent?.phone || companySettings?.phone, agent?.email || companySettings?.email].filter(Boolean).join(" · "))}</div>` : ""}
</div>
<div class="disc">${esc(disclaimer)}</div>
${footer(1)}
</section>

<section class="page">
<div class="band">Tahmini değer</div>
<div class="cards">
<div class="card"><div class="l">Hızlı satış</div><div class="v">${esc(formatTL(result.value.low))}</div><div class="s">kısa sürede alıcı bulma ihtimali yüksek</div></div>
<div class="card mid"><div class="l">Piyasa değeri</div><div class="v">${esc(formatTL(result.value.mid))}</div><div class="s">${unit(result.unit)}</div></div>
<div class="card"><div class="l">Üst fiyat</div><div class="v">${esc(formatTL(result.value.high))}</div><div class="s">pazarlama süresi uzayabilir</div></div>
</div>
${result.rent ? `<div class="cards" style="margin-top:8px"><div class="card"><div class="l">Tahmini aylık kira</div><div class="v">${esc(formatTL(result.rent.monthly))}</div></div>${result.rent.paybackYears ? `<div class="card"><div class="l">Kira ile geri dönüş süresi</div><div class="v">${esc(result.rent.paybackYears.toFixed(1))} yıl</div></div>` : ""}</div>` : ""}
<div class="band">Konut özellikleri</div>
<div class="cols">${featTable(features.slice(0, half))}${featTable(features.slice(half))}</div>
<div class="band">Değere etki eden özellikler</div>
<p class="note" style="margin:0 0 6px">Bölgedeki ortanca ilan fiyatı ${unit(result.askingUnit)}; ilan fiyatlarından %${esc(result.factors.askingDiscountPercent)} pazarlık payı düşülerek ${unit(result.saleUnit)} bulundu. Dairenin bölgedeki tipik daireden farkları aşağıdaki gibi yansıtıldı.</p>
${adjRows ? `<table class="list"><tbody>${adjRows}<tr><td><b>Toplam</b></td><td class="num"><b>${result.totalPercent > 0 ? "+" : ""}${esc(Math.round(result.totalPercent * 10) / 10)}%</b></td></tr></tbody></table>` : `<p class="note">Daire bölgedeki tipik daireyle aynı özellikte kabul edildi.</p>`}
${footer(2)}
</section>

<section class="page">
<div class="band">Bölge piyasa göstergeleri - ${esc(r.neighborhood)}</div>
<div class="metrics">${metrics.map(([k, v]) => `<div class="metric"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join("")}</div>
${
  chart
    ? `<div class="band">${esc(r.city || subject.city || "Türkiye")} konut fiyat endeksi (TCMB)</div>${chart.svg}<p class="note">Son 6 ay: %${esc(chart.m6)}${chart.y1 ? ` · son 12 ay: %${esc(chart.y1)}` : ""} · son veri ${esc(fmtDate(chart.latest))} (${esc(chart.series)}). Endeks bölge geneli için fiyat değişimini gösterir; tek tek dairelerin fiyatı değildir.</p>`
    : ""
}
${
  rankRows
    ? `<div class="band">Dairenin emsal ilanlar arasındaki yeri (m² fiyatına göre)</div><table class="list"><thead><tr><th>#</th><th>Oda</th><th>Brüt m²</th><th>İlan fiyatı</th><th>m² fiyatı</th><th>Bina yaşı</th><th>İlan tarihi</th></tr></thead><tbody>${rankRows}</tbody></table><p class="note">İlanlar istenen fiyattır, gerçekleşen satış fiyatı değildir. Bu dairenin satırı, tahmini piyasa değerinin ilan seviyesine (pazarlık payı eklenerek) çevrilmiş halidir.${rankNote}</p>`
    : ""
}
<div class="disc">${esc(disclaimer)}</div>
${footer(3)}
</section>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`;
}
