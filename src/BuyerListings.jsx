import { useMemo, useState } from "react";
import { Badge, ConfirmDialog, InfoTip, WhatsAppIcon, formatTL, toWhatsAppNumber } from "./shared";
import { matchEmlakListing } from "./Sectors";
import {
  buildShowingDocumentText,
  computeTransactionCosts,
  propertyAsListingDeal,
} from "./realEstate";
import { parseSearchPages } from "./priceEstimate";
import { printShowingDocument } from "./Showings";

// Paylaşımlı işlemde bizim payımız sadece alıcı/kiracı tarafının hizmet bedeli
// (KDV dahil - uygulamada tutar alanı KDV dahil); satıcı tarafı karşı emlakçının.
export function buyerSideFee(listing, realEstateSettings) {
  const r = computeTransactionCosts(
    {
      transactionType: listing.transactionType || "satilik",
      price: listing.price,
      feePayer: "alici",
    },
    realEstateSettings,
  );
  if (r.transactionType === "satilik") return r.buyer.fee.total;
  if (r.transactionType === "kiralik") return r.tenant.fee.total;
  return r.transferee.fee.total;
}

// Alıcı için DIŞARIDA bulunan evler (ofis arkadaşı, Sahibinden'deki emlakçı
// ilanı, çevredeki emlakçı). Danışmanın 10-15 portföyü talebe nadiren uyar;
// alıcı kaçmasın diye dışarıda bulunanlar alıcıya bağlı takip edilir ve
// paylaşımlı işlemde (alıcıdan hizmet bedeli bize, satıcı tarafı karşı
// emlakçıya) işleme dönüşür. Karşı taraf bilgisi müşteriye hiçbir yerde
// gösterilmez/gönderilmez - alıcı danışmanı atlayıp doğrudan gitmesin.

export const BUYER_LISTING_STATUSES = [
  { id: "bulundu", label: "Bulundu", tone: "default" },
  { id: "gonderildi", label: "Müşteriye gönderildi", tone: "accent" },
  { id: "gosterildi", label: "Gösterildi", tone: "accent" },
  { id: "begendi", label: "Beğendi", tone: "success" },
  { id: "elendi", label: "Elendi", tone: "default" },
  { id: "islem", label: "İşlemde", tone: "success" },
];
export const BUYER_LISTING_SOURCES = [
  { id: "emlakci", label: "Çevredeki emlakçı" },
  { id: "sahibinden", label: "Sahibinden (emlakçı ilanı)" },
  { id: "sahibi", label: "Sahibinden (ilan sahibi)" },
  { id: "ofis", label: "Ofis arkadaşı" },
  { id: "diger", label: "Diğer" },
];
// Portalda alıcıya görünen durumlar: danışman "gönderdi" demeden ev görünmez.
export const BUYER_LISTING_PORTAL_STATUSES = ["gonderildi", "gosterildi", "begendi"];

const sourceLabel = (id) => BUYER_LISTING_SOURCES.find((s) => s.id === id)?.label || "";
const sahibindenUrl = (no) =>
  `https://www.sahibinden.com/arama?query_text=${encodeURIComponent(no)}`;
const seekingTx = (customer) =>
  customer?.customFields?.aranan_islem === "Kiralama" ? "kiralik" : "satilik";

function matchScore(listing, customer) {
  const [m] = matchEmlakListing(propertyAsListingDeal(listing, { forMatching: true }), [
    { ...customer, phone: customer.phone || "-" },
  ]);
  return m ? m.score : null;
}

// Müşteriye sunmadan önce karşı tarafa paylaşımlı çalışmaya açık mı diye
// sorulmalı (kullanıcı, 25 Kas). Açık değilse gönderme/belge/işlem kapalı,
// portal da göstermez (RPC share_status='acik' ister).
const shareOpen = (l) => (l.shareStatus || (l.source === "ofis" ? "acik" : "sorulmadi")) === "acik";

// Kullanıcının kendi taslağı (25 Kas): "uygun müşterim var" DEĞİL, müşteriye
// sunup değerlendireceğiz tonu. Değişen yerler: hitap, ilan adı, ilan no.
// Hitap "Danışman" alanından aynen alınır ("Baran Bey") - Bey/Hanım isimden
// tahmin edilmez.
function askShareText(l) {
  const hello = `Merhaba${l.counterpartAgent ? ` ${l.counterpartAgent.trim()}` : ""},`;
  const where = ["sahibinden", "sahibi"].includes(l.source) ? "Sahibinden üzerindeki " : "";
  const ref = l.listingNo ? ` (İlan No: ${l.listingNo})` : "";
  const ask =
    l.source === "sahibi"
      ? "Emlak danışmanlarıyla çalışmaya açık mısınız?"
      : "İlanınız meslektaş/portföy paylaşımına açık mıdır?";
  return `${hello} ${where}'${l.title}' ilanınız için${ref} yazıyorum. ${ask} Müşterim için değerlendirmek isterim. İyi çalışmalar dilerim.`;
}

// Müşteriye giden metin: karşı ofis, telefon, ilan no/bağlantısı YOK.
export function buyerListingShareText(l) {
  const specs = [l.roomCount, l.grossM2 && `${l.grossM2} m²`].filter(Boolean).join(" · ");
  const price = l.price
    ? `${Number(l.price).toLocaleString("tr-TR")} TL${l.transactionType === "kiralik" ? " / ay" : ""}`
    : "";
  return [l.title, [l.neighborhood, l.district].filter(Boolean).join(", "), specs, price]
    .filter(Boolean)
    .join("\n");
}

const box = {
  border: "0.5px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: 10,
  marginBottom: 8,
  background: "var(--surface-1)",
};
const lbl = { fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 3 };

function ManualForm({ customer, initial, onSave, onCancel }) {
  const [f, setF] = useState(
    () =>
      initial || {
        source: "emlakci",
        title: "",
        price: "",
        roomCount: "",
        grossM2: "",
        neighborhood: "",
        district: "",
        listingUrl: "",
        counterpartOffice: "",
        counterpartAgent: "",
        counterpartPhone: "",
        note: "",
      },
  );
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const field = (k, label, flex = "1 1 140px", props = {}) => (
    <div style={{ flex }}>
      <label style={lbl}>{label}</label>
      <input value={f[k] ?? ""} onChange={set(k)} style={{ width: "100%" }} {...props} />
    </div>
  );
  const row = { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 };
  const raw = String(f.listingUrl || "").trim();
  const isNo = /^\d{7,}$/.test(raw);
  return (
    <div style={{ ...box, background: "var(--surface-2, var(--surface-1))" }}>
      <div style={row}>
        {field("title", "Başlık *", "2 1 240px", {
          placeholder: "ör. Bostanlı 3+1 deniz manzaralı",
        })}
        <div style={{ flex: "1 1 160px" }}>
          <label style={lbl}>Nereden buldunuz?</label>
          <select value={f.source} onChange={set("source")} style={{ width: "100%" }}>
            {BUYER_LISTING_SOURCES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={row}>
        {field("price", "Fiyat (TL)", "1 1 120px", { type: "number", min: 0 })}
        {field("roomCount", "Oda", "0 1 90px", { placeholder: "3+1" })}
        {field("grossM2", "Brüt m²", "0 1 90px", { type: "number", min: 0 })}
        {field("neighborhood", "Mahalle")}
        {field("district", "İlçe")}
      </div>
      <div style={row}>
        {field("listingUrl", "İlan bağlantısı ya da ilan no", "2 1 240px")}
        {field("counterpartOffice", "Karşı ofis")}
        {field("counterpartAgent", "Danışman (mesajda hitap)", "1 1 140px", {
          placeholder: "ör. Baran Bey",
        })}
        {field("counterpartPhone", "Telefon", "1 1 130px", { type: "tel" })}
      </div>
      <div style={row}>{field("note", "Not (sadece siz görürsünüz)", "1 1 100%")}</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel}>
          Vazgeç
        </button>
        <button
          type="button"
          disabled={!String(f.title || "").trim()}
          onClick={() =>
            onSave({
              ...f,
              customerId: customer.id,
              transactionType: f.transactionType || seekingTx(customer),
              listingNo: isNo ? raw : f.listingNo || "",
              listingUrl: isNo ? sahibindenUrl(raw) : raw,
            })
          }
          style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
        >
          Kaydet
        </button>
      </div>
    </div>
  );
}

// Sahibinden'de alıcının kriterleriyle arama yapıp sayfayı yapıştırır: mağazalı
// ilanlar karşı ofis adıyla, aracısız ilanlar "ilan sahibi" olarak eklenir.
function PasteForm({ customer, existingNos, onSave, onCancel }) {
  const [raw, setRaw] = useState("");
  const [picked, setPicked] = useState(null);
  const parsed = useMemo(() => (raw.trim() ? parseSearchPages(raw) : null), [raw]);
  const rows = useMemo(() => {
    if (!parsed) return [];
    return parsed.listings
      .filter((l) => !existingNos.has(String(l.id)))
      .map((l) => {
        const item = {
          customerId: customer.id,
          source: l.store ? "sahibinden" : "sahibi",
          title: l.title,
          price: l.price || null,
          roomCount: l.rooms || "",
          grossM2: l.m2 || null,
          neighborhood: l.neighborhood || parsed.neighborhood || "",
          district: parsed.district || "",
          city: parsed.city || "",
          transactionType: parsed.transactionType === "kiralik" ? "kiralik" : seekingTx(customer),
          propertyType: parsed.propertyType || "",
          listingNo: String(l.id),
          listingUrl: sahibindenUrl(l.id),
          counterpartOffice: l.store || "",
        };
        return { item, score: matchScore(item, customer) };
      })
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }, [parsed, customer, existingNos]);
  const selected =
    picked ?? new Set(rows.filter((r) => r.score != null).map((r) => r.item.listingNo));
  const toggle = (no) => {
    const next = new Set(selected);
    if (next.has(no)) next.delete(no);
    else next.add(no);
    setPicked(next);
  };
  return (
    <div style={{ ...box, background: "var(--surface-2, var(--surface-1))" }}>
      <p style={{ margin: "0 0 6px", fontSize: 12.5, color: "var(--text-secondary)" }}>
        Sahibinden'de alıcının kriterleriyle (bölge, oda, fiyat) arama yapın, sonuç sayfasında
        Ctrl+A, Ctrl+C yapıp buraya yapıştırın. Talebe uyanlar işaretli gelir.
      </p>
      <textarea
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          setPicked(null);
        }}
        placeholder="Sahibinden arama sonuç sayfasını buraya yapıştırın"
        style={{ width: "100%", minHeight: 70, fontSize: 12.5 }}
      />
      {parsed && rows.length === 0 && (
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "6px 0 0" }}>
          {parsed.listings.length
            ? "Bu ilanların hepsi zaten listede."
            : "İlan okunamadı - arama SONUÇ sayfasını (liste görünümü) yapıştırdığınızdan emin olun."}
        </p>
      )}
      {rows.length > 0 && (
        <div style={{ maxHeight: 260, overflowY: "auto", margin: "8px 0" }}>
          {rows.map(({ item, score }) => (
            <label
              key={item.listingNo}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
                fontSize: 12.5,
                padding: "5px 0",
                borderBottom: "0.5px solid var(--border)",
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(item.listingNo)}
                onChange={() => toggle(item.listingNo)}
                style={{ marginTop: 2 }}
              />
              <span style={{ flex: 1 }}>
                <b>{item.title}</b>
                <span style={{ color: "var(--text-muted)" }}>
                  {" "}
                  ·{" "}
                  {[item.roomCount, item.grossM2 && `${item.grossM2} m²`, item.neighborhood]
                    .filter(Boolean)
                    .join(" · ")}
                  {item.price ? ` · ${formatTL(item.price)}` : ""} ·{" "}
                  {item.counterpartOffice || "ilan sahibi"}
                </span>
              </span>
              {score != null && <Badge tone={score >= 80 ? "success" : "accent"}>%{score}</Badge>}
            </label>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel}>
          Vazgeç
        </button>
        <button
          type="button"
          disabled={selected.size === 0}
          onClick={() =>
            onSave(rows.filter((r) => selected.has(r.item.listingNo)).map((r) => r.item))
          }
          style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
        >
          Seçilenleri ekle ({selected.size})
        </button>
      </div>
    </div>
  );
}

export function BuyerListings({
  customer,
  listings = [],
  officeProperties = [],
  officeMembers = [],
  hasOwnMatches = false,
  companySettings = null,
  agentName = "",
  onSave,
  onDelete,
  onStartSharedDeal,
}) {
  const [mode, setMode] = useState(null);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showClosed, setShowClosed] = useState(false);
  const cf = customer.customFields || {};
  const hasDemand = !!(
    cf.aranan_bolge ||
    cf.min_butce ||
    cf.max_butce ||
    (cf.aranan_oda_sayisi && cf.aranan_oda_sayisi !== "Farketmez")
  );
  const existingNos = useMemo(
    () => new Set(listings.map((l) => l.listingNo).filter(Boolean)),
    [listings],
  );
  const addedOfficeIds = new Set(listings.map((l) => l.officePropertyId).filter(Boolean));
  const memberName = (userId) => officeMembers.find((m) => m.userId === userId);
  const officeMatches = officeProperties
    .filter((p) => !addedOfficeIds.has(p.id) && p.ownerCustomerId !== customer.id)
    .map((p) => ({ p, score: matchScore(p, customer) }))
    .filter((x) => x.score != null)
    .sort((a, b) => b.score - a.score);
  const open = listings.filter((l) => l.status !== "elendi");
  const closed = listings.filter((l) => l.status === "elendi");
  const visible = showClosed ? listings : open;
  const wa = toWhatsAppNumber(customer.phone);

  if (!hasDemand && listings.length === 0) return null;

  const save = async (items) => {
    const ok = await onSave(items);
    if (ok) {
      setMode(null);
      setEditing(null);
    }
  };
  const setStatus = (l, status) =>
    onSave({
      ...l,
      status,
      shownAt: status === "gosterildi" && !l.shownAt ? new Date().toISOString() : l.shownAt,
    });

  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 6px" }}>
        Dışarıda bulunan evler ({open.length})
        <InfoTip text="Portföyünüzde uyan ev yoksa alıcıyı kaçırmayın: ofis arkadaşınızın, Sahibinden'deki ya da çevredeki emlakçıların evlerini buraya ekleyin. Paylaşımlı işlemde alıcı tarafının hizmet bedelini siz, satıcı tarafınınkini karşı emlakçı alır. Müşteriye sunmadan önce karşı tarafa paylaşıma açık mı diye sorun - 'Açık' işaretlenmeden ev müşteriye gönderilemez ve portalda görünmez. Karşı ofis, telefon ve ilan numarası müşteriye hiçbir yerde gösterilmez - WhatsApp mesajında da yer almaz." />
      </p>
      {!hasOwnMatches && hasDemand && open.length === 0 && (
        <p
          style={{
            margin: "0 0 8px",
            padding: "6px 10px",
            background: "var(--bg-warning)",
            borderRadius: 6,
            fontSize: 12.5,
          }}
        >
          Portföyünüzde bu talebe uyan ev yok. Alıcı kaçmasın: ofisten, Sahibinden'den ya da
          çevredeki emlakçılardan uygun evleri bulup ekleyin.
        </p>
      )}

      {visible.map((l) => {
        const link = l.listingUrl || (l.listingNo ? sahibindenUrl(l.listingNo) : "");
        if (editing === l.id)
          return (
            <ManualForm
              key={l.id}
              customer={customer}
              initial={{ ...l, price: l.price ?? "", grossM2: l.grossM2 ?? "" }}
              onSave={(item) => save({ ...l, ...item })}
              onCancel={() => setEditing(null)}
            />
          );
        return (
          <div
            key={l.id}
            style={{
              ...box,
              opacity: l.status === "elendi" || l.shareStatus === "kapali" ? 0.6 : 1,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{l.title}</span>
              <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {shareOpen(l) && <Badge tone="success">Paylaşıma açık</Badge>}
                {matchScore(l, customer) != null && (
                  <Badge tone="accent">%{matchScore(l, customer)} uyum</Badge>
                )}
              </span>
            </div>
            <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--text-secondary)" }}>
              {[
                l.price ? formatTL(l.price) : null,
                l.roomCount,
                l.grossM2 && `${l.grossM2} m²`,
                [l.neighborhood, l.district].filter(Boolean).join(", "),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
              {sourceLabel(l.source)}
              {(l.counterpartOffice || l.counterpartAgent) &&
                ` · ${[l.counterpartOffice, l.counterpartAgent].filter(Boolean).join(" - ")}`}
              {l.counterpartPhone && (
                <>
                  {" · "}
                  <a href={`tel:${l.counterpartPhone}`}>{l.counterpartPhone}</a>
                </>
              )}
              {link && (
                <>
                  {" · "}
                  <a href={link} target="_blank" rel="noopener noreferrer">
                    İlanı aç
                  </a>
                </>
              )}
            </p>
            {l.note && (
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
                Not: {l.note}
              </p>
            )}
            {!shareOpen(l) && l.status !== "elendi" && (
              <div
                style={{
                  marginTop: 6,
                  padding: "6px 8px",
                  borderRadius: 6,
                  fontSize: 12.5,
                  background: l.shareStatus === "kapali" ? "var(--bg-danger)" : "var(--bg-warning)",
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ flex: "1 1 220px" }}>
                  {l.shareStatus === "kapali"
                    ? "Paylaşıma kapalı - bu ev müşteriye sunulamaz."
                    : l.source === "sahibi"
                      ? "Müşteriye sunmadan önce sorun: ilan sahibi emlakçıyla (alıcı getirmenizle) çalışıyor mu?"
                      : `Müşteriye sunmadan önce sorun: ${l.counterpartOffice || l.counterpartAgent || "karşı emlakçı"} paylaşımlı çalışmaya açık mı?`}
                </span>
                {l.shareStatus !== "kapali" && toWhatsAppNumber(l.counterpartPhone) && (
                  <a
                    href={`https://wa.me/${toWhatsAppNumber(l.counterpartPhone)}?text=${encodeURIComponent(askShareText(l))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "flex", alignItems: "center", gap: 4, color: "#128c4a" }}
                  >
                    <WhatsAppIcon /> Sor
                  </a>
                )}
                {l.shareStatus !== "kapali" && !l.counterpartPhone && (
                  <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                    (telefonu ilandan alıp "Düzenle"den ekleyin)
                  </span>
                )}
                <button
                  type="button"
                  style={{ fontSize: 12 }}
                  onClick={() => onSave({ ...l, shareStatus: "acik" })}
                >
                  ✓ Açık
                </button>
                {l.shareStatus !== "kapali" && (
                  <button
                    type="button"
                    style={{ fontSize: 12 }}
                    onClick={() => onSave({ ...l, shareStatus: "kapali" })}
                  >
                    Kapalı
                  </button>
                )}
              </div>
            )}
            <div
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                flexWrap: "wrap",
                marginTop: 6,
              }}
            >
              <select
                value={l.status}
                onChange={(e) => setStatus(l, e.target.value)}
                aria-label="Durum"
                style={{ fontSize: 12 }}
              >
                {BUYER_LISTING_STATUSES.map((s) => (
                  <option
                    key={s.id}
                    value={s.id}
                    disabled={!shareOpen(l) && !["bulundu", "elendi"].includes(s.id)}
                  >
                    {s.label}
                  </option>
                ))}
              </select>
              {shareOpen(l) && wa && (
                <a
                  href={`https://wa.me/${wa}?text=${encodeURIComponent(
                    `Merhaba ${customer.name?.split(" ")[0] || ""}, aradığınız kriterlere uyan bir ev buldum:\n\n${buyerListingShareText(l)}\n\nGörmek isterseniz gösterim için gün ayarlayalım.`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => l.status === "bulundu" && setStatus(l, "gonderildi")}
                  title="Müşteriye WhatsApp'tan gönder (karşı ofis ve ilan no gönderilmez)"
                  aria-label="Müşteriye WhatsApp'tan gönder"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "2px 8px",
                    color: "#25d366",
                  }}
                >
                  <WhatsAppIcon />
                </a>
              )}
              {/* Dış evi gösterirken de alıcı tarafının hizmet bedelini korur:
                  "aracılığımız olmadan satın alırsa" - karşı emlakçı üzerinden de olsa. */}
              {shareOpen(l) && (
                <button
                  type="button"
                  style={{ fontSize: 12 }}
                  onClick={() => {
                    const ok = printShowingDocument({
                      text: buildShowingDocumentText({
                        company: companySettings,
                        realEstateSettings: companySettings?.realEstateSettings,
                        property: { ...l, transactionType: l.transactionType || "satilik" },
                        customer,
                        showing: {
                          shownAt: l.shownAt || new Date().toISOString(),
                          method: "yerinde",
                        },
                        agentName,
                      }),
                      logoUrl: companySettings?.logoUrl,
                    });
                    if (ok && ["bulundu", "gonderildi"].includes(l.status))
                      setStatus(l, "gosterildi");
                  }}
                  title="Gösterimden önce alıcıya imzalatın - ev başka emlakçının olsa da alıcı tarafının hizmet bedelini korur"
                >
                  Yer gösterme belgesi
                </button>
              )}
              {onStartSharedDeal && shareOpen(l) && l.status !== "elendi" && (
                <button
                  type="button"
                  style={{ fontSize: 12 }}
                  onClick={() => {
                    if (l.status !== "islem") setStatus(l, "islem");
                    onStartSharedDeal(l, buyerSideFee(l, companySettings?.realEstateSettings));
                  }}
                  title="Sadece alıcı tarafının hizmet bedeliyle işlem açar - satıcı tarafının bedeli karşı emlakçının"
                >
                  Paylaşımlı işlem başlat
                </button>
              )}
              <button type="button" style={{ fontSize: 12 }} onClick={() => setEditing(l.id)}>
                Düzenle
              </button>
              <button
                type="button"
                style={{ fontSize: 12, color: "var(--text-danger)" }}
                onClick={() => setConfirmDelete(l)}
              >
                Sil
              </button>
            </div>
          </div>
        );
      })}
      {closed.length > 0 && (
        <button
          type="button"
          style={{ fontSize: 12, marginBottom: 8 }}
          onClick={() => setShowClosed((v) => !v)}
        >
          {showClosed ? "Elenenleri gizle" : `Elenenleri göster (${closed.length})`}
        </button>
      )}

      {mode === "manual" && (
        <ManualForm customer={customer} onSave={save} onCancel={() => setMode(null)} />
      )}
      {mode === "paste" && (
        <PasteForm
          customer={customer}
          existingNos={existingNos}
          onSave={save}
          onCancel={() => setMode(null)}
        />
      )}
      {mode === "office" && (
        <div style={{ ...box, background: "var(--surface-2, var(--surface-1))" }}>
          {officeMatches.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-muted)" }}>
              Ofis arkadaşlarınızın paylaştığı portföylerde bu talebe uyan ev yok.
            </p>
          ) : (
            officeMatches.map(({ p, score }) => {
              const m = memberName(p.userId);
              return (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    fontSize: 12.5,
                    padding: "5px 0",
                    borderBottom: "0.5px solid var(--border)",
                  }}
                >
                  <span style={{ flex: 1 }}>
                    <b>{p.title}</b>
                    <span style={{ color: "var(--text-muted)" }}>
                      {p.price ? ` · ${formatTL(p.price)}` : ""}
                      {m ? ` · ${m.displayName || m.email}` : ""}
                    </span>
                  </span>
                  <Badge tone={score >= 80 ? "success" : "accent"}>%{score}</Badge>
                  <button
                    type="button"
                    style={{ fontSize: 12 }}
                    onClick={() =>
                      save({
                        customerId: customer.id,
                        source: "ofis",
                        title: p.title,
                        price: p.price,
                        roomCount: p.roomCount,
                        grossM2: p.grossM2,
                        neighborhood: p.neighborhood,
                        district: p.district,
                        city: p.city,
                        transactionType: p.transactionType,
                        propertyType: p.propertyType,
                        counterpartAgent: m?.displayName || m?.email || "",
                        counterpartPhone: m?.phone || "",
                        officePropertyId: p.id,
                      })
                    }
                  >
                    Ekle
                  </button>
                </div>
              );
            })
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
            <button type="button" style={{ fontSize: 12 }} onClick={() => setMode(null)}>
              Kapat
            </button>
          </div>
        </div>
      )}

      {!mode && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" style={{ fontSize: 12.5 }} onClick={() => setMode("manual")}>
            + Ev ekle
          </button>
          <button type="button" style={{ fontSize: 12.5 }} onClick={() => setMode("paste")}>
            Sahibinden'den yapıştır
          </button>
          {officeProperties.length > 0 && (
            <button type="button" style={{ fontSize: 12.5 }} onClick={() => setMode("office")}>
              Ofisten ekle
              {officeMatches.length > 0 ? ` (${officeMatches.length} uyan)` : ""}
            </button>
          )}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Ev listeden silinsin mi?"
          message={`"${confirmDelete.title}" bu alıcının listesinden kaldırılır. Sadece elemek istiyorsanız durumunu "Elendi" yapın - geçmişte kalır.`}
          confirmLabel="Sil"
          onConfirm={() => {
            onDelete(confirmDelete.id);
            setConfirmDelete(null);
          }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
