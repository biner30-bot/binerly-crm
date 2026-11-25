import React, { useMemo, useState } from "react";
import { InfoTip, toWhatsAppNumber, WhatsAppIcon } from "./shared";
import { SHOWING_INTEREST } from "./realEstate";
import { findRegion } from "./priceEstimate";

// Mal sahibine dönemsel durum raporu. Yetkiyi elde tutmanın asıl yolu mal
// sahibini düzenli bilgilendirmek: "kaç kişi gördü, ne dediler, piyasa ne
// yapıyor". Metin düzenlenebilir - alıcı geri bildirim notlarında alıcının adı
// geçebilir, danışman göndermeden önce görüp silebilsin diye.

const PERIODS = [
  { id: "7", label: "Son 7 gün", days: 7 },
  { id: "30", label: "Son 30 gün", days: 30 },
  { id: "all", label: "İlandan bu yana", days: null },
];

const dayDiff = (iso) =>
  iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : null;
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("tr-TR") : "");
const firstName = (name) => (name || "").trim().split(/\s+/)[0] || "";

export function buildOwnerReportText({
  property: p,
  showings,
  owner,
  region,
  agentName,
  agentPhone,
  companyName,
  periodDays,
}) {
  const listedFrom = p.authorizationStart || p.createdAt;
  const listedDays = dayDiff(listedFrom);
  const since = periodDays ? Date.now() - periodDays * 86400000 : 0;
  const mine = showings
    .filter((s) => s.propertyId === p.id)
    .sort((a, b) => new Date(b.shownAt) - new Date(a.shownAt));
  const inPeriod = mine.filter((s) => new Date(s.shownAt).getTime() >= since);
  const periodLabel = periodDays ? `son ${periodDays} gün` : "ilandan bu yana";
  const lines = [];
  lines.push(`Merhaba${owner?.name ? ` ${firstName(owner.name)}` : ""},`);
  lines.push("");
  lines.push(`${p.title} için ${periodLabel} durum özeti:`);
  lines.push("");
  if (listedDays != null) lines.push(`- İlan ${listedDays} gündür yayında.`);
  lines.push(
    `- Gösterim: ${periodLabel} ${inPeriod.length}${periodDays ? `, toplam ${mine.length}` : ""}.`,
  );
  const counts = SHOWING_INTEREST.map((i) => [
    i.label,
    inPeriod.filter((s) => s.interest === i.id).length,
  ]).filter(([, n]) => n > 0);
  if (counts.length) lines.push(`- İlgi: ${counts.map(([l, n]) => `${l} ${n}`).join(", ")}.`);
  const feedback = inPeriod.filter((s) => s.feedback?.trim()).slice(0, 6);
  if (feedback.length) {
    lines.push("- Alıcı geri bildirimleri:");
    for (const s of feedback) lines.push(`  • ${fmtDate(s.shownAt)}: ${s.feedback.trim()}`);
  }
  const mv = region?.marketMoves;
  if (mv && mv.comparedWith > 0) {
    const parts = [
      `${mv.newCount} yeni ilan`,
      mv.dropCount
        ? `${mv.dropCount} ilan fiyat düşürdü (ort. %${String(mv.dropAvgPct).replace(".", ",")})`
        : null,
      mv.removedCount ? `${mv.removedCount} ilan yayından kalktı` : null,
    ].filter(Boolean);
    lines.push(
      `- ${region.neighborhood || "Bölge"} piyasası (${fmtDate(mv.date)}): ${parts.join(", ")}.`,
    );
  }
  if (periodDays && periodDays >= 30 && inPeriod.length === 0 && (listedDays ?? 0) >= 30) {
    lines.push("");
    lines.push(
      "Son 30 günde gösterim olmadı. Fiyatı bölgedeki rakip ilanlarla birlikte bir gözden geçirelim - uygun olduğunuz bir zaman konuşabilir miyiz?",
    );
  } else if (
    inPeriod.length >= 3 &&
    !inPeriod.some((s) => ["yuksek", "orta"].includes(s.interest))
  ) {
    lines.push("");
    lines.push(
      "Gösterimler oluyor ama ilgi düşük kalıyor. Alıcıların yorumlarına göre fiyat veya sunum tarafında küçük bir düzenlemeyi konuşmak isterim.",
    );
  }
  lines.push("");
  lines.push([agentName, companyName].filter(Boolean).join(" - "));
  if (agentPhone) lines.push(agentPhone);
  return lines.join("\n");
}

export function OwnerReport({
  property,
  showings,
  owner,
  regionPrices,
  aliases,
  agentName,
  agentPhone = "",
  companyName,
  notify,
}) {
  const [periodId, setPeriodId] = useState("30");
  const period = PERIODS.find((x) => x.id === periodId);
  const region = useMemo(
    () =>
      findRegion(
        regionPrices || [],
        property,
        property.transactionType === "satilik" ? "satilik" : "kiralik",
        aliases,
      ),
    [regionPrices, property, aliases],
  );
  const generated = buildOwnerReportText({
    property,
    showings,
    owner,
    region,
    agentName,
    agentPhone,
    companyName,
    periodDays: period.days,
  });
  // Elle düzenlenen metin, dönem değişince yeniden üretilir.
  const [edited, setEdited] = useState(null);
  const text = edited ?? generated;
  const wa = toWhatsAppNumber(owner?.phone);

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 10px" }}>
        Mal sahibini düzenli bilgilendirmek yetkinin yenilenmesini kolaylaştırır. Metin gösterim
        kayıtlarından ve bölge piyasa hareketinden hazırlanır; göndermeden önce düzenleyebilirsiniz.
        <InfoTip text="Geri bildirim notlarınızda alıcının adı veya kişisel bilgisi geçiyorsa göndermeden önce silin - mal sahibine sadece alıcının yorumu gitmeli." />
      </p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {PERIODS.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => {
              setPeriodId(x.id);
              setEdited(null);
            }}
            style={
              x.id === periodId
                ? { background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }
                : undefined
            }
          >
            {x.label}
          </button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => setEdited(e.target.value)}
        rows={14}
        style={{ width: "100%", resize: "vertical", fontSize: 13, lineHeight: 1.5 }}
      />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        {wa ? (
          <a
            href={`https://wa.me/${wa}?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: "var(--radius)",
              background: "#25d366",
              color: "#fff",
              textDecoration: "none",
              fontSize: 13,
            }}
          >
            <WhatsAppIcon /> Mal sahibine WhatsApp'tan gönder
          </a>
        ) : (
          <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
            {owner
              ? "Mal sahibinin telefonu kayıtlı değil - metni kopyalayıp gönderebilirsiniz."
              : "Portföye mal sahibi seçilmemiş - metni kopyalayıp gönderebilirsiniz."}
          </span>
        )}
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              notify?.("Rapor metni kopyalandı.", "success");
            } catch {
              notify?.("Kopyalanamadı - metni seçip Ctrl+C yapın.");
            }
          }}
        >
          <i className="ti ti-copy" aria-hidden="true" /> Kopyala
        </button>
      </div>
    </div>
  );
}
