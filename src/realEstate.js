// Emlak sektörüne özel sabitler ve saf yardımcılar - Portföy ekranı, Ayarlar,
// Gölge Avcı eşleştirmesi ve ilan metni ayıklayıcısı aynı listeleri kullanmalı:
// eşleştirme birebir string karşılaştırması yapıyor, listeler ayrışırsa
// (örn. biri "2+1" diğeri "2 + 1") hiç eşleşme bulunmaz.

// Sahibinden'in oda sayısı yazımıyla birebir aynı tutuluyor - ilan metninden
// aktarılan değer bu listede yoksa form select'i boş görünür.
export const ROOM_COUNT_OPTIONS = [
  "1+0",
  "1+1",
  "1.5+1",
  "2+0",
  "2+1",
  "2.5+1",
  "2+2",
  "3+1",
  "3.5+1",
  "3+2",
  "4+1",
  "4.5+1",
  "4+2",
  "5+1",
  "5+2",
  "6+1",
  "6+ üzeri",
];

export const PROPERTY_TYPE_OPTIONS = [
  "Daire",
  "Rezidans",
  "Müstakil Ev",
  "Villa",
  "Yazlık",
  "Arsa",
  "Dükkan / Mağaza",
  "Ofis",
  "Depo",
  "Bina",
];

export const TRANSACTION_TYPES = [
  { id: "satilik", label: "Satılık" },
  { id: "kiralik", label: "Kiralık" },
  { id: "devren_kiralik", label: "Devren Kiralık" },
];

// Müşteri tarafındaki "Aranan İşlem" seçenekleri özel alan (custom field) olarak
// metin tutuyor; portföyün transaction_type kodlarıyla bu tablo üzerinden eşlenir.
export const SEEKING_TRANSACTION_OPTIONS = ["Satış", "Kiralama", "Devren Kiralama"];
export const SEEKING_TO_TRANSACTION = {
  Satış: "satilik",
  Kiralama: "kiralik",
  "Devren Kiralama": "devren_kiralik",
};

export const PROPERTY_STATUSES = [
  { id: "taslak", label: "Taslak", tone: "default" },
  { id: "aktif", label: "Aktif", tone: "accent" },
  { id: "opsiyonlu", label: "Opsiyonlu", tone: "warning" },
  { id: "satildi", label: "Satıldı", tone: "success" },
  { id: "kiralandi", label: "Kiralandı", tone: "success" },
  { id: "pasif", label: "Pasif", tone: "danger" },
];

// Varsayılanlar Taşınmaz Ticareti Hakkında Yönetmelik'teki üst sınırlar:
// satışta taraf başı %2, kiralamada 1 aylık kira. Devir bedeli yönetmelikte
// sabitlenmediği için piyasada yaygın oran varsayılan - ofis değiştirebilir.
export const REAL_ESTATE_SETTING_DEFAULTS = {
  saleBuyerPercent: 2,
  saleSellerPercent: 2,
  rentMonths: 1,
  transferPercent: 10,
  licenseNo: "",
  titleDeedServiceFee: null,
};

export function resolveRealEstateSettings(raw) {
  return { ...REAL_ESTATE_SETTING_DEFAULTS, ...(raw || {}) };
}

// Fiyat alanının anlamı işlem türüne göre değişir - devren kiralıkta asıl
// pazarlanan tutar devir bedelidir, aylık kira ayrıca details.monthly_rent'te.
export const PRICE_LABELS = {
  satilik: "Satış fiyatı (TL)",
  kiralik: "Aylık kira (TL)",
  devren_kiralik: "Devir bedeli (TL)",
};

export const FLOOR_SUGGESTIONS = [
  "Bodrum Kat",
  "Bahçe Katı",
  "Giriş Katı",
  "Yüksek Giriş",
  "Zemin Kat",
  ...Array.from({ length: 20 }, (_, i) => String(i + 1)),
  "Çatı Katı",
  "Villa Tipi",
];

// details jsonb'deki alanlar - arama/eşleştirmede kullanılmayan uzun liste.
// only: alan sadece bu işlem türlerinde gösterilir (boşsa hepsinde).
export const PROPERTY_DETAIL_FIELDS = [
  {
    group: "bina",
    key: "heating",
    label: "Isıtma",
    type: "select",
    options: [
      "Kombi (Doğalgaz)",
      "Yerden Isıtma",
      "Merkezi",
      "Merkezi (Pay Ölçer)",
      "Klima",
      "Soba",
      "Yok",
    ],
  },
  { group: "bina", key: "elevator", label: "Asansör", type: "select", options: ["Var", "Yok"] },
  {
    group: "bina",
    key: "parking",
    label: "Otopark",
    type: "select",
    options: ["Yok", "Açık Otopark", "Kapalı Otopark", "Açık & Kapalı Otopark"],
  },
  {
    group: "bina",
    key: "in_site",
    label: "Site içerisinde",
    type: "select",
    options: ["Evet", "Hayır"],
  },
  { group: "bina", key: "site_name", label: "Site adı", type: "text" },
  { group: "bina", key: "dues", label: "Aidat (TL)", type: "number" },
  {
    group: "bina",
    key: "facade",
    label: "Cephe",
    type: "multi",
    options: ["Kuzey", "Güney", "Doğu", "Batı"],
  },
  { group: "ic", key: "bathrooms", label: "Banyo sayısı", type: "number" },
  {
    group: "ic",
    key: "kitchen",
    label: "Mutfak",
    type: "select",
    options: ["Kapalı", "Açık (Amerikan)"],
  },
  { group: "ic", key: "balcony", label: "Balkon", type: "select", options: ["Var", "Yok"] },
  { group: "ic", key: "furnished", label: "Eşyalı", type: "select", options: ["Evet", "Hayır"] },
  {
    group: "ic",
    key: "usage",
    label: "Kullanım durumu",
    type: "select",
    options: ["Boş", "Kiracılı", "Mülk Sahibi"],
  },
  {
    group: "tapu",
    key: "deed_status",
    label: "Tapu durumu",
    type: "select",
    options: [
      "Kat Mülkiyetli",
      "Kat İrtifaklı",
      "Hisseli Tapu",
      "Müstakil Tapulu",
      "Arsa Tapulu",
      "Kooperatif Hisseli Tapu",
      "Tapu Kaydı Yok",
    ],
  },
  {
    group: "tapu",
    key: "occupancy_permit",
    label: "İskan (yapı kullanma izni)",
    type: "select",
    options: ["Var", "Yok"],
  },
  {
    group: "tapu",
    key: "credit_eligible",
    label: "Krediye uygun",
    type: "select",
    options: ["Evet", "Hayır", "Bilinmiyor"],
  },
  {
    group: "tapu",
    key: "energy_class",
    label: "Enerji kimlik belgesi",
    type: "select",
    options: ["A", "B", "C", "D", "E", "F", "G", "Yok"],
  },
  // Satışta tapu 5 yılı doldurmadıysa değer artış kazancı vergisi doğabilir -
  // satıcıyı bilgilendirmek için tarih tutuluyor.
  { group: "tapu", key: "deed_date", label: "Tapu tarihi", type: "date", only: ["satilik"] },
  {
    group: "kira",
    key: "monthly_rent",
    label: "Aylık kira (TL)",
    type: "number",
    only: ["devren_kiralik"],
  },
  {
    group: "kira",
    key: "deposit",
    label: "Depozito (TL)",
    type: "number",
    only: ["kiralik", "devren_kiralik"],
  },
  {
    group: "kira",
    key: "guarantor_required",
    label: "Kefil isteniyor",
    type: "select",
    options: ["Evet", "Hayır"],
    only: ["kiralik", "devren_kiralik"],
  },
  {
    group: "kira",
    key: "available_from",
    label: "Teslim tarihi",
    type: "date",
    only: ["kiralik", "devren_kiralik"],
  },
  {
    group: "kira",
    key: "fixtures",
    label: "Devredilecek demirbaşlar",
    type: "textarea",
    only: ["devren_kiralik"],
  },
];

export const DETAIL_GROUP_LABELS = {
  bina: "Bina",
  ic: "İç mekân",
  tapu: "Tapu ve yasal durum",
  kira: "Kiralama / devir koşulları",
};

function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // 31 Ocak + 1 ay -> 3 Mart taşmasını ayın son gününe sabitle
  if (d.getDate() < day) d.setDate(0);
  return d;
}

// Yetki sözleşmeleri genelde "bitişten 15 gün önce yazılı fesih bildirilmezse
// aynı süreyle uzar" kaydı taşır. Otomatik uzayan sözleşmede bitiş tarihi
// geçmişte kalmaz, bugünden sonraki ilk dönem sonuna kayar.
export const AUTHORIZATION_NOTICE_DAYS = 15;

export function authorizationStatus(property, today = new Date()) {
  const { authorizationStart, authorizationMonths, authorizationAutoRenew } = property || {};
  if (!authorizationStart || !authorizationMonths) return null;
  const start = new Date(`${authorizationStart}T00:00:00`);
  const now = new Date(today);
  now.setHours(0, 0, 0, 0);
  let end = addMonths(start, authorizationMonths);
  if (authorizationAutoRenew) {
    let periods = 1;
    while (end < now) {
      periods += 1;
      end = addMonths(start, authorizationMonths * periods);
    }
  }
  const daysLeft = Math.round((end - now) / 86400000);
  return { end, daysLeft, expired: daysLeft < 0, autoRenew: !!authorizationAutoRenew };
}

export function transactionLabel(id) {
  return TRANSACTION_TYPES.find((t) => t.id === id)?.label || id;
}

export function propertyStatusMeta(id) {
  return PROPERTY_STATUSES.find((s) => s.id === id) || PROPERTY_STATUSES[0];
}
