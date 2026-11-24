import React, { useMemo, useState } from "react";
import { ConfirmDialog, InfoTip, formatTL } from "./shared";
import {
  AGE_BANDS,
  REGION_STALE_DAYS,
  estimateValue,
  findRegion,
  istanbulToday,
  parseSearchPages,
  regionAgeDays,
} from "./priceEstimate";

// Portföy adayları: Sahibinden'de SAHİBİNDEN (aracısız) satılan ilanlar.
// Danışman arama sayfasını kendisi yapıştırır; ofis adı olmayan ilanlar
// ayıklanır. Uzun süredir satılamayan, fiyatını düşüren ve piyasa değerinin
// üstünde fiyatlanmış ilanların sahibi bir danışmana en açık olanlardır.
// Telefon/kişisel iletişim saklanmaz.

export const PROSPECT_STATUSES = [
  { id: "yeni", label: "Yeni", tone: "#185fa5" },
  { id: "aranacak", label: "Aranacak", tone: "#b45309" },
  { id: "arandi", label: "Arandı", tone: "#6b7280" },
  { id: "gorusuldu", label: "Görüşüldü", tone: "#7c3aed" },
  { id: "yetki_alindi", label: "Yetki alındı", tone: "#15803d" },
  { id: "istemiyor", label: "İstemiyor", tone: "#9ca3af" },
  { id: "yayindan_kalkti", label: "Yayından kalktı", tone: "#9ca3af" },
];
const CLOSED = ["yetki_alindi", "istemiyor", "yayindan_kalkti"];

const box = {
  border: "0.5px solid var(--border)",
  borderRadius: 8,
  padding: 12,
  marginBottom: 12,
};
const todayIso = istanbulToday;
const daysBetween = (a, b = new Date()) =>
  a ? Math.floor((b - new Date(`${String(a).slice(0, 10)}T00:00:00`)) / 86400000) : null;
const shortTL = (n) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}M`
    : formatTL(n);

// Sahibinden'de ilan no ile arama (ilan sayfasının adresi başlıktan türetildiği
// için doğrudan kurulamıyor).
const listingSearchUrl = (no) =>
  `https://www.sahibinden.com/arama?query_text=${encodeURIComponent(no)}`;

function looksLikeSearch(raw) {
  const t = String(raw || "");
  return /aramanızda/.test(t) && /#\d{7,}/.test(t);
}

// Yapıştırılan sayfadan sahibinden ilanları - mevcut adaylarla birleştirmek için.
export function prospectsFromPaste(raw) {
  const parsed = parseSearchPages(raw);
  const pageBand = parsed.ageBand || null;
  const tx = parsed.transactionType === "kiralik" ? "kiralik" : "satilik";
  const all = parsed.listings;
  const fsbo = all.filter((l) => l.store === "");
  return {
    total: all.length,
    officeCount: all.filter((l) => l.store).length,
    // Yaş/oda/fiyat gibi ek filtreli aramada listede olmamak "kalktı" demek
    // değildir - eksiksizlik sadece filtresiz (adres + kimden) aramada aranır.
    complete:
      !pageBand &&
      !/(Bina Yaşı|Oda Sayısı|Fiyat|m² \(|Bulunduğu Kat|Kat Sayısı|Isıtma|Site İçerisinde)/.test(
        (String(raw).match(/Seçtiklerimi Gizle([\s\S]*?)Tümünü Temizle/) || [])[1] || "",
      ) &&
      !parsed.pages &&
      (!parsed.page || parsed.page.total === 1) &&
      parsed.totalCount != null &&
      parsed.totalCount <= all.length,
    scope: {
      neighborhood: parsed.neighborhood || "",
      transactionType: tx,
      propertyType: parsed.propertyType || "Daire",
    },
    rows: fsbo.map((l) => ({
      listingNo: l.id,
      title: l.title,
      city: parsed.city || "",
      district: parsed.district || "",
      neighborhood: l.neighborhood || parsed.neighborhood || "",
      propertyType: parsed.propertyType || "Daire",
      transactionType: tx,
      m2: l.m2,
      rooms: l.rooms || "",
      ageBand: l.ageBand || pageBand,
      price: l.price ?? null,
      listingDate: l.date || null,
    })),
  };
}

function prospectInsight(p, regionPrices, marketIndex, companySettings) {
  const days = daysBetween(p.listingDate);
  const hist = p.priceHistory || [];
  const firstPrice = p.firstPrice || hist[0]?.price || p.price;
  const drop = firstPrice && p.price && p.price < firstPrice ? 1 - p.price / firstPrice : 0;
  let market = null;
  if (p.transactionType === "satilik" && p.m2 && p.price) {
    const band = AGE_BANDS.find((b) => b.label === p.ageBand);
    const subject = {
      city: p.city,
      district: p.district,
      neighborhood: p.neighborhood,
      propertyType: p.propertyType,
      grossM2: p.m2,
      roomCount: p.rooms,
      buildingAge: band ? band.age : "",
      details: {},
    };
    const aliases = companySettings?.realEstateSettings?.neighborhoodAliases || [];
    const region = findRegion(regionPrices, subject, "satilik", aliases);
    if (region && regionAgeDays(region) <= REGION_STALE_DAYS) {
      const r = estimateValue({
        subject,
        saleRegion: region,
        marketIndex,
        factors: companySettings?.realEstateSettings?.avmFactors || {},
      });
      // İlan fiyatı, tahmini ilan seviyesiyle (piyasa değeri + pazarlık payı)
      // karşılaştırılır - yoksa her ilan "yüksek" görünür.
      if (!r.error) {
        const askingLevel = r.value.mid / (1 - Number(r.factors.askingDiscountPercent || 0) / 100);
        market = { diff: p.price / askingLevel - 1, mid: r.value.mid };
      }
    }
  }
  // Öncelik: uzun süredir yayında + fiyat düşürmüş + piyasanın üstünde.
  const score =
    Math.min(days ?? 0, 180) / 30 + drop * 30 + (market && market.diff > 0 ? market.diff * 20 : 0);
  return { days, drop, firstPrice, market, score };
}

export function ProspectsTab({
  prospects,
  regionPrices,
  marketIndex,
  companySettings,
  onMerge,
  onUpdate,
  onDelete,
  onCreateTask,
  onCreateProperty,
  notify,
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState("acik");
  const [query, setQuery] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);

  const run = async (raw) => {
    if (!looksLikeSearch(raw)) {
      notify("Sahibinden arama sonuç sayfası okunamadı - sayfada Ctrl+A, Ctrl+C yapın.");
      return;
    }
    const res = prospectsFromPaste(raw);
    if (!res.rows.length) {
      notify(
        res.total
          ? `Bu sayfadaki ${res.total} ilanın hepsi emlak ofislerinden - Sahibinden'de "Kimden: Sahibinden" seçip arayın.`
          : "İlan bulunamadı - liste görünümünde Ctrl+A, Ctrl+C yapın.",
      );
      return;
    }
    setBusy(true);
    const summary = await onMerge(res);
    setBusy(false);
    if (summary) {
      setText("");
      notify(
        `${summary.added} yeni aday, ${summary.updated} güncellendi${summary.priceChanged ? `, ${summary.priceChanged} ilanın fiyatı değişti` : ""}${summary.gone ? `, ${summary.gone} ilan yayından kalkmış` : ""}.`,
        "success",
      );
    }
  };

  const enriched = useMemo(
    () =>
      prospects.map((p) => ({
        ...p,
        insight: prospectInsight(p, regionPrices, marketIndex, companySettings),
      })),
    [prospects, regionPrices, marketIndex, companySettings],
  );
  const q = query.trim().toLocaleLowerCase("tr");
  const list = enriched
    .filter((p) =>
      statusFilter === "acik"
        ? !CLOSED.includes(p.status)
        : statusFilter === "all"
          ? true
          : p.status === statusFilter,
    )
    .filter(
      (p) =>
        !q ||
        [p.title, p.neighborhood, p.district, p.listingNo, p.note]
          .filter(Boolean)
          .some((x) => String(x).toLocaleLowerCase("tr").includes(q)),
    )
    .sort((a, b) => b.insight.score - a.insight.score);

  return (
    <div>
      <h2 style={{ fontSize: 20, margin: "0 0 4px" }}>Portföy Adayları</h2>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 12px" }}>
        Sahibinden'de evini aracısız satan/kiralayanlar. Uzun süredir satılamayan, fiyatını düşüren
        ve piyasanın üstünde fiyatlanan ilanlar en üstte - bu sahipler bir danışmana en açık
        olanlardır. Liste sadece size görünür.
      </p>

      <div style={box}>
        <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 6px" }}>
          Sahibinden ilanlarını ekle
          <InfoTip text="Sahibinden'de mahallenizi seçip 'Kimden: Sahibinden' filtresiyle arayın (filtresiz sayfa da olur - emlak ofisi ilanları ayıklanır), liste görünümünde Ctrl+A, Ctrl+C yapın. Aynı aramayı birkaç günde bir tekrar yapıştırın: fiyatı düşenler ve yayından kalkanlar kendiliğinden işaretlenir." />
        </p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              try {
                await run(await navigator.clipboard.readText());
              } catch {
                notify("Panoya erişilemedi - kutuya Ctrl+V ile yapıştırın.");
              }
            }}
            style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
          >
            <i className="ti ti-clipboard-check" aria-hidden="true" /> Panodan ekle
          </button>
          <button type="button" disabled={busy || !text.trim()} onClick={() => run(text)}>
            {busy ? "Okunuyor…" : "İlanları oku"}
          </button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="ya da sayfayı buraya yapıştırın"
          style={{ width: "100%", resize: "vertical" }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Başlık, mahalle, ilan no veya not ara"
          style={{ flex: "1 1 220px" }}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="acik">Açık adaylar</option>
          <option value="all">Tümü</option>
          {PROSPECT_STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {list.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {prospects.length === 0
            ? "Henüz aday yok. Yukarıdan Sahibinden arama sayfasını ekleyin."
            : "Bu filtreye uyan aday yok."}
        </p>
      ) : (
        list.map((p) => (
          <ProspectRow
            key={p.id}
            p={p}
            onUpdate={onUpdate}
            onCreateTask={onCreateTask}
            onCreateProperty={onCreateProperty}
            onDelete={() => setConfirmDel(p)}
          />
        ))
      )}

      {confirmDel && (
        <ConfirmDialog
          title="Aday silinsin mi?"
          message={`"${confirmDel.title}" aday listesinden kalıcı olarak silinir. Aynı ilanı tekrar yapıştırırsanız yeni aday olarak gelir.`}
          onConfirm={async () => {
            const p = confirmDel;
            setConfirmDel(null);
            await onDelete(p.id);
          }}
          onClose={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}

function ProspectRow({ p, onUpdate, onCreateTask, onCreateProperty, onDelete }) {
  const [note, setNote] = useState(p.note || "");
  const { days, drop, firstPrice, market } = p.insight;
  const status = PROSPECT_STATUSES.find((s) => s.id === p.status) || PROSPECT_STATUSES[0];
  const lastSeenDays = daysBetween(p.lastSeen);
  const tags = [];
  if (days != null && days >= 60) tags.push({ text: `${days} gündür yayında`, tone: "warning" });
  else if (days != null) tags.push({ text: `${days} gündür yayında`, tone: "muted" });
  if (drop > 0.005)
    tags.push({
      text: `Fiyat düştü ${shortTL(firstPrice)} → ${shortTL(p.price)} (%${Math.round(drop * 100)})`,
      tone: "accent",
    });
  if (market) {
    const pct = Math.round(market.diff * 100);
    if (pct >= 5) tags.push({ text: `Piyasanın %${pct} üstünde`, tone: "warning" });
    else if (pct <= -5) tags.push({ text: `Piyasanın %${-pct} altında`, tone: "muted" });
    else tags.push({ text: "Piyasa fiyatında", tone: "muted" });
  }
  if (lastSeenDays != null && lastSeenDays > 14 && !CLOSED.includes(p.status))
    tags.push({ text: `${lastSeenDays} gündür yapıştırılmadı`, tone: "muted" });
  const toneStyle = {
    warning: { background: "var(--bg-warning)", color: "var(--text-warning)" },
    accent: { background: "var(--bg-accent, var(--surface-1))", color: "var(--text-accent)" },
    muted: { background: "var(--surface-1)", color: "var(--text-muted)" },
  };
  return (
    <div style={{ ...box, opacity: CLOSED.includes(p.status) ? 0.7 : 1 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
        <span style={{ flex: "1 1 260px", fontSize: 13.5 }}>
          <b>{p.title}</b>
          <span style={{ color: "var(--text-muted)" }}>
            {" "}
            · {[p.neighborhood, p.district].filter(Boolean).join(", ")} ·{" "}
            {[p.rooms, p.m2 && `${p.m2} m²`, p.ageBand && `${p.ageBand} yaş`]
              .filter(Boolean)
              .join(" · ")}
            {p.transactionType === "kiralik" && " · kiralık"}
          </span>
        </span>
        <span style={{ fontWeight: 700, fontSize: 14 }}>
          {p.price ? formatTL(p.price) : "-"}
          {p.transactionType === "kiralik" && " / ay"}
        </span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0" }}>
        {tags.map((t) => (
          <span
            key={t.text}
            style={{ fontSize: 11.5, padding: "2px 8px", borderRadius: 10, ...toneStyle[t.tone] }}
          >
            {t.text}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={p.status}
          onChange={(e) => onUpdate(p.id, { status: e.target.value })}
          style={{ fontSize: 12.5, color: status.tone, fontWeight: 600 }}
        >
          {PROSPECT_STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (p.note || "") && onUpdate(p.id, { note })}
          placeholder="Not (ör. 'Cumartesi ara, eşi karar veriyor')"
          style={{ flex: "1 1 220px", fontSize: 12.5 }}
        />
        <a
          href={listingSearchUrl(p.listingNo)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 12.5 }}
        >
          İlanı aç ({p.listingNo})
        </a>
        <button type="button" style={{ fontSize: 12 }} onClick={() => onCreateTask(p)}>
          <i className="ti ti-phone" aria-hidden="true" /> Arama görevi
        </button>
        {!p.propertyId && (
          <button type="button" style={{ fontSize: 12 }} onClick={() => onCreateProperty(p)}>
            Portföye ekle
          </button>
        )}
        <button
          type="button"
          style={{ fontSize: 12, color: "var(--text-danger)" }}
          onClick={onDelete}
        >
          Sil
        </button>
      </div>
    </div>
  );
}

// Yapıştırmayı mevcut adaylarla birleştirir: yeni ilanlar eklenir, fiyatı
// değişenin geçmişi tutulur; arama eksiksizse (tek sayfa, toplam = okunan)
// aynı mahallede listede olmayan açık adaylar "yayından kalktı" olur.
export function mergeProspects(existing, paste) {
  const today = todayIso();
  const byNo = new Map(existing.map((p) => [p.listingNo, p]));
  const inserts = [];
  const updates = [];
  let priceChanged = 0;
  for (const r of paste.rows) {
    const old = byNo.get(r.listingNo);
    if (!old) {
      inserts.push({
        ...r,
        firstPrice: r.price,
        priceHistory: r.price ? [{ date: today, price: r.price }] : [],
        firstSeen: today,
        lastSeen: today,
        status: "yeni",
      });
      continue;
    }
    const patch = { lastSeen: today };
    if (r.price && old.price && r.price !== old.price) {
      priceChanged += 1;
      patch.price = r.price;
      patch.priceHistory = [...(old.priceHistory || []), { date: today, price: r.price }];
    }
    if (r.ageBand && !old.ageBand) patch.ageBand = r.ageBand;
    if (old.status === "yayindan_kalkti") patch.status = "yeni";
    updates.push({ id: old.id, patch });
  }
  let gone = 0;
  if (paste.complete && paste.scope.neighborhood) {
    const seen = new Set(paste.rows.map((r) => r.listingNo));
    const n = paste.scope.neighborhood.toLocaleLowerCase("tr");
    for (const p of existing) {
      if (
        !seen.has(p.listingNo) &&
        !CLOSED.includes(p.status) &&
        p.transactionType === paste.scope.transactionType &&
        (p.neighborhood || "").toLocaleLowerCase("tr") === n
      ) {
        gone += 1;
        updates.push({ id: p.id, patch: { status: "yayindan_kalkti" } });
      }
    }
  }
  return { inserts, updates, priceChanged, gone };
}
