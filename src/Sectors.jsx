import React, { useState } from "react";
import { Badge, Modal, ConfirmDialog, IconButton, InfoTip } from "./shared";

export const STAGES = [
  { id: "ilk_gorusme", label: "İlk görüşme" },
  { id: "teklif", label: "Teklif verildi" },
  { id: "muzakere", label: "Müzakere" },
  { id: "kazanildi", label: "Kazanıldı" },
  { id: "kaybedildi", label: "Kaybedildi" },
];

export const STAGE_LABELS_BIREYSEL = {
  ilk_gorusme: "İlgileniyor",
  teklif: "Planlandı",
  muzakere: "Onay bekleniyor",
  kazanildi: "Tamamlandı",
  kaybedildi: "İptal",
};

// Şirketin sektörüne göre satış hunisi aşama isimlerini, önerilen etiketleri ve
// sektöre özel alanları hazır getiren şablonlar. "Genel" bilinçli olarak boş
// stageLabels/customFields ile varsayılana düşer (no-op).
export const SECTOR_PRESETS = [
  {
    id: "emlak",
    label: "Emlak",
    icon: "ti-home",
    stageLabels: {
      ilk_gorusme: "İlk görüşme",
      teklif: "Teklif sunuldu",
      muzakere: "Pazarlık",
      kazanildi: "Satış/Kiralama tamamlandı",
      kaybedildi: "Vazgeçildi",
    },
    tags: ["Sıcak lead", "Alıcı adayı", "Kiracı", "Yatırımcı", "Kredi bekliyor"],
    customFields: [
      { entity: "deal", key: "mulk_tipi", label: "Mülk Tipi", type: "select", options: ["Daire", "Villa", "Arsa", "İşyeri"] },
      { entity: "deal", key: "islem_turu", label: "İşlem Türü", type: "select", options: ["Satış", "Kiralama"] },
      { entity: "deal", key: "metrekare", label: "Metrekare (m²)", type: "number" },
      { entity: "customer", key: "butce_araligi", label: "Bütçe / Kira aralığı", type: "text" },
    ],
  },
  {
    id: "dijital_ajans",
    label: "Dijital Ajans",
    icon: "ti-device-desktop-analytics",
    stageLabels: {
      ilk_gorusme: "Keşif görüşmesi",
      teklif: "Teklif/Brief gönderildi",
      muzakere: "Revizyon görüşülüyor",
      kazanildi: "Proje onaylandı",
      kaybedildi: "Kaybedildi",
    },
    tags: ["Aylık abonelik", "Proje bazlı", "Reklam yönetimi", "Web tasarım", "SEO"],
    customFields: [
      { entity: "deal", key: "hizmet_turu", label: "Hizmet Türü", type: "select", options: ["Sosyal medya yönetimi", "Web tasarım", "SEO", "Reklam yönetimi (Ads)", "İçerik üretimi"] },
      { entity: "deal", key: "sozlesme_suresi", label: "Sözleşme Süresi", type: "select", options: ["Tek seferlik", "Aylık", "3 Aylık", "Yıllık"] },
      { entity: "deal", key: "aylik_butce", label: "Aylık Reklam Bütçesi (TL)", type: "number" },
      { entity: "customer", key: "web_sitesi", label: "Web sitesi", type: "text" },
    ],
  },
  {
    id: "saglik_klinik",
    label: "Sağlık / Klinik",
    icon: "ti-stethoscope",
    stageLabels: {
      ilk_gorusme: "İlk muayene / Danışma",
      teklif: "Tedavi planı sunuldu",
      muzakere: "Onay bekleniyor",
      kazanildi: "Tedavi tamamlandı",
      kaybedildi: "Vazgeçti",
    },
    tags: ["Yeni hasta", "Kontrol randevusu", "Takip gerekiyor", "Sigortalı", "Acil"],
    customFields: [
      { entity: "customer", key: "randevu_turu", label: "Randevu Türü", type: "select", options: ["Muayene", "Kontrol", "Tedavi", "Danışmanlık"] },
      { entity: "customer", key: "sigorta_durumu", label: "Sigorta/SGK Durumu", type: "select", options: ["Özel sigorta", "SGK", "Sigortasız"] },
      { entity: "customer", key: "dogum_tarihi", label: "Doğum Tarihi", type: "date" },
      { entity: "deal", key: "tedavi_hizmet", label: "Tedavi / Hizmet", type: "text" },
    ],
  },
  {
    id: "uretim_satis",
    label: "Üretim / Satış",
    icon: "ti-truck-delivery",
    stageLabels: {
      ilk_gorusme: "İlk temas",
      teklif: "Fiyat teklifi verildi",
      muzakere: "Sipariş görüşülüyor",
      kazanildi: "Sipariş alındı",
      kaybedildi: "Sipariş kaybedildi",
    },
    tags: ["Toptan", "Perakende", "Tekrarlayan müşteri", "Yeni bayi", "İhracat"],
    customFields: [
      { entity: "deal", key: "urun_grubu", label: "Ürün / Ürün Grubu", type: "text" },
      { entity: "deal", key: "siparis_miktari", label: "Sipariş Miktarı", type: "number" },
      { entity: "customer", key: "odeme_vadesi", label: "Ödeme Vadesi", type: "select", options: ["Peşin", "30 gün", "60 gün", "90 gün"] },
      { entity: "deal", key: "teslimat_tarihi", label: "Teslimat Tarihi", type: "date" },
    ],
  },
  {
    id: "hizmet_danismanlik",
    label: "Hizmet / Danışmanlık",
    icon: "ti-briefcase",
    stageLabels: {
      ilk_gorusme: "Ön görüşme",
      teklif: "Teklif gönderildi",
      muzakere: "Kapsam görüşülüyor",
      kazanildi: "Anlaşma imzalandı",
      kaybedildi: "Kaybedildi",
    },
    tags: ["Kurumsal danışmanlık", "Bireysel koçluk", "Tek seferlik", "Sürekli hizmet", "Referans"],
    customFields: [
      { entity: "deal", key: "ucretlendirme_modeli", label: "Ücretlendirme Modeli", type: "select", options: ["Saatlik", "Proje bazlı", "Aylık paket"] },
      { entity: "deal", key: "teslimat_tarihi", label: "Rapor/Teslimat Tarihi", type: "date" },
      { entity: "customer", key: "sirket_buyuklugu", label: "Şirket Büyüklüğü", type: "select", options: ["1-10 çalışan", "11-50 çalışan", "51-200 çalışan", "200+ çalışan"] },
    ],
  },
  {
    id: "perakende",
    label: "Perakende",
    icon: "ti-shopping-cart",
    stageLabels: {
      ilk_gorusme: "İlk temas",
      teklif: "Teklif/Kampanya sunuldu",
      muzakere: "Pazarlık",
      kazanildi: "Satış tamamlandı",
      kaybedildi: "Vazgeçti",
    },
    tags: ["Sadık müşteri", "Kampanya", "Online sipariş", "Mağaza içi"],
    customFields: [
      { entity: "deal", key: "satis_kanali", label: "Satış Kanalı", type: "select", options: ["Mağaza", "Online", "Telefon"] },
      { entity: "customer", key: "uyelik_no", label: "Üyelik / Sadakat Kartı No", type: "text" },
      { entity: "customer", key: "dogum_gunu", label: "Doğum Günü", type: "date" },
    ],
  },
  {
    id: "genel",
    label: "Genel",
    icon: "ti-building-store",
    stageLabels: {},
    tags: ["Yeni", "Takipte", "VIP"],
    customFields: [],
  },
];

// Kurumsal/bireysel müşteri tipine göre (mevcut, kanıtlanmış davranış) ve şirketin
// sektörüne göre (yeni) aşama görünen metnini belirler. Aşama id'leri hiç değişmez —
// sadece bu fonksiyonun ürettiği metin değişir, iş mantığı hep id üzerinden çalışır.
// Bireysel müşteri tipi override'ı sektörden önce gelir: bireysel akış zaten kendine
// özel, ayrı ayarlanmış bir dille çalışıyor, sektör sadece kurumsal anlaşmalarda geçerli.
export function stageLabel(stageId, customerType, sector) {
  if (customerType === "bireysel") return STAGE_LABELS_BIREYSEL[stageId] || stageId;
  const preset = SECTOR_PRESETS.find((p) => p.id === sector);
  if (preset?.stageLabels?.[stageId]) return preset.stageLabels[stageId];
  return STAGES.find((s) => s.id === stageId)?.label || stageId;
}

export function rowToCustomFieldDef(r) {
  return {
    id: r.id,
    entity: r.entity,
    key: r.key,
    label: r.label,
    type: r.field_type,
    options: r.options || null,
    sector: r.sector || null,
    audience: r.audience || null,
    sortOrder: r.sort_order || 0,
    active: r.active !== false,
  };
}

const AUDIENCE_LABELS = { kurumsal: "Kurumsal", bireysel: "Bireysel" };

function slugifyKey(label) {
  const map = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", İ: "i", Ç: "c", Ğ: "g", Ö: "o", Ş: "s", Ü: "u" };
  return label
    .trim()
    .toLowerCase()
    .replace(/[çğıöşüİÇĞÖŞÜ]/g, (ch) => map[ch] || ch)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function SectorOnboardingModal({ onPick, onSkip }) {
  return (
    <Modal title="Sektörünüzü seçin" onClose={onSkip}>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px" }}>
        Seçtiğiniz sektöre göre satış aşamalarınız, önerilen etiketler ve size özel alanlar otomatik hazırlanır. İstediğiniz zaman Şirket ayarları'ndan değiştirebilirsiniz.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {SECTOR_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              background: "var(--surface-1)",
              border: "0.5px solid var(--border)",
              borderRadius: "var(--radius)",
              textAlign: "left",
              fontSize: 14,
            }}
          >
            <i className={`ti ${p.icon}`} style={{ fontSize: 18, color: "var(--text-accent)" }} aria-hidden="true"></i>
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ textAlign: "right" }}>
        <button type="button" onClick={onSkip} style={{ background: "none", border: "none", fontSize: 13, color: "var(--text-secondary)" }}>
          Atla, sonra Şirket ayarları'ndan seçerim
        </button>
      </div>
    </Modal>
  );
}

const FIELD_TYPE_LABELS = { text: "Metin", number: "Sayı", select: "Seçenekli", date: "Tarih" };

export function CustomFieldDefsManager({ customFieldDefs, onAdd, onDelete }) {
  const [entity, setEntity] = useState("customer");
  const [label, setLabel] = useState("");
  const [type, setType] = useState("text");
  const [options, setOptions] = useState("");
  const [audience, setAudience] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const activeDefs = customFieldDefs.filter((d) => d.active);
  const customerDefs = activeDefs.filter((d) => d.entity === "customer");
  const dealDefs = activeDefs.filter((d) => d.entity === "deal");

  const submit = (e) => {
    e.preventDefault();
    const trimmedLabel = label.trim();
    if (!trimmedLabel) return;
    const key = slugifyKey(trimmedLabel);
    if (!key || activeDefs.some((d) => d.entity === entity && d.key === key)) return;
    onAdd({
      entity,
      key,
      label: trimmedLabel,
      type,
      options: type === "select" ? options.split(",").map((o) => o.trim()).filter(Boolean) : null,
      audience: audience || null,
    });
    setLabel("");
    setOptions("");
    setAudience("");
  };

  const renderGroup = (title, defs) => (
    <div style={{ marginBottom: 12 }}>
      <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 6px" }}>{title}</p>
      {defs.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>Henüz alan yok.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {defs.map((d) => (
            <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "6px 10px" }}>
              <span style={{ fontSize: 13 }}>
                {d.label} <span style={{ color: "var(--text-muted)" }}>· {FIELD_TYPE_LABELS[d.type] || d.type}{d.audience ? ` · Sadece ${AUDIENCE_LABELS[d.audience]}` : ""}</span>
              </span>
              <IconButton icon="ti-trash" title="Sil" size="sm" onClick={() => setConfirmDelete(d)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ marginTop: 24, paddingTop: 20, borderTop: "0.5px solid var(--border)" }}>
      <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 4px" }}>Özel alanlar</p>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 12px" }}>
        Sektör değiştirdiğinizde başka sektöre ait alanlar burada gizlenir (silinmez) — daha önce kaydedilmiş değerler korunur, aynı sektöre dönerseniz alanlar geri gelir.
      </p>
      {renderGroup("Müşteri alanları", customerDefs)}
      {renderGroup("İş Takibi alanları", dealDefs)}

      <form onSubmit={submit} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}>
        <div>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Nerede</label>
          <select value={entity} onChange={(e) => setEntity(e.target.value)} style={{ fontSize: 13 }}>
            <option value="customer">Müşteriler</option>
            <option value="deal">İş Takibi</option>
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Alan adı</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Örn. Mülk Tipi" style={{ width: "100%", fontSize: 13 }} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Tip</label>
          <select value={type} onChange={(e) => setType(e.target.value)} style={{ fontSize: 13 }}>
            <option value="text">Metin</option>
            <option value="number">Sayı</option>
            <option value="select">Seçenekli</option>
            <option value="date">Tarih</option>
          </select>
        </div>
        {type === "select" && (
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Seçenekler (virgülle)</label>
            <input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Daire, Villa, Arsa" style={{ width: "100%", fontSize: 13 }} />
          </div>
        )}
        <div>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Kime</label>
          <select value={audience} onChange={(e) => setAudience(e.target.value)} style={{ fontSize: 13 }}>
            <option value="">Herkese (Kurumsal + Bireysel)</option>
            <option value="kurumsal">Sadece Kurumsal</option>
            <option value="bireysel">Sadece Bireysel</option>
          </select>
        </div>
        <button type="submit" style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)", fontSize: 13 }}>
          + Alan ekle
        </button>
      </form>

      {confirmDelete && (
        <ConfirmDialog
          title="Özel alanı sil"
          message={`"${confirmDelete.label}" alanı formlardan kaldırılacak. Daha önce kaydedilmiş değerler silinmez, sadece görünmez olur.`}
          onConfirm={() => { onDelete(confirmDelete.id); setConfirmDelete(null); }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

// Bir varlığa (müşteri/teklif) ait aktif özel alan tanımlarını, formda dinamik
// input render etmek için kullanılır — CustomerForm/DealForm bu bileşeni kullanır.
export function CustomFieldsSection({ defs, values, onChange }) {
  const active = defs.filter((d) => d.active);
  if (active.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 6px", display: "flex", alignItems: "center", gap: 4 }}>
        Özel alanlar
        <InfoTip text="Bu alanlar sabit değil — Ayarlar → Sektör & Özel Alanlar'dan kendiniz ekleyip kaldırabilirsiniz. Sektör seçtiğinizde bazı alanlar otomatik hazır gelir." />
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {active.map((d) => (
          <div key={d.key}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>{d.label}</label>
            {d.type === "select" ? (
              <select value={values[d.key] || ""} onChange={(e) => onChange({ ...values, [d.key]: e.target.value })} style={{ width: "100%" }}>
                <option value="">Seçiniz</option>
                {(d.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                type={d.type === "number" ? "number" : d.type === "date" ? "date" : "text"}
                value={values[d.key] || ""}
                onChange={(e) => onChange({ ...values, [d.key]: e.target.value })}
                style={{ width: "100%" }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TagBadges({ tags }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {tags.map((t) => <Badge key={t}>{t}</Badge>)}
    </div>
  );
}
