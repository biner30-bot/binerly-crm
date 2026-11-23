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

// Portföy alım kontrol listesi. auto: işaret elle değil portföyün kendi
// verisinden gelir (çift kayıt tutulup birbirinden kopmasın diye).
const COMMON_CHECKLIST = [
  { key: "deed_copy", label: "Tapu fotokopisi alındı" },
  { key: "encumbrance", label: "Tapu takyidatı kontrol edildi (ipotek, haciz, şerh)" },
  { key: "occupancy_doc", label: "Yapı kullanma izin belgesi (iskan) alındı" },
  { key: "parcel_verified", label: "Ada/parsel ve adres TKGM Parsel Sorgu'da doğrulandı" },
  { key: "measured", label: "Ölçüm yapıldı, iskandaki net m² ile karşılaştırıldı" },
  { key: "valuation", label: "Emsal araştırması yapıldı, fiyat mal sahibiyle netleşti" },
];

const TRANSACTION_CHECKLIST = {
  satilik: [
    { key: "deed_age", label: "Tapu tarihi kontrol edildi (5 yıl - değer artış kazancı vergisi)" },
    { key: "credit_check", label: "Alıcıların kullanabileceği kredi tutarı araştırıldı" },
  ],
  kiralik: [
    { key: "rent_terms", label: "Depozito, kefil ve kira ödeme günü mal sahibiyle netleşti" },
    { key: "handover", label: "Teslim tarihi ve teslim durumu (boya, tadilat) netleşti" },
  ],
  devren_kiralik: [
    { key: "owner_consent", label: "Mal sahibinin devre onayı alındı" },
    { key: "transfer_right", label: "Mevcut kira sözleşmesinde devir yetkisi kontrol edildi" },
    { key: "fixtures_list", label: "Devredilecek demirbaşların listesi çıkarıldı" },
    { key: "turnover", label: "Gelir-gider bilgileri istendi" },
  ],
};

const CLOSING_CHECKLIST = [
  { key: "authorization", label: "Yetki sözleşmesi imzalandı", auto: "authorization" },
  { key: "eids", label: "EİDS yetkisi alındı", auto: "eids" },
  { key: "photos", label: "Fotoğraflar çekildi", auto: "photos" },
  { key: "listed", label: "İlanlar yayında (portal, afiş)" },
];

export function checklistFor(transactionType) {
  return [
    ...COMMON_CHECKLIST,
    ...(TRANSACTION_CHECKLIST[transactionType] || []),
    ...CLOSING_CHECKLIST,
  ];
}

export function isChecklistItemDone(item, property, photoCount) {
  if (item.auto === "authorization")
    return !!(property.authorizationStart && property.authorizationMonths);
  if (item.auto === "eids") return property.eidsStatus === "onaylandi";
  if (item.auto === "photos") return photoCount > 0;
  return !!property.checklist?.[item.key];
}

export function checklistProgress(property, photoCount) {
  const items = checklistFor(property.transactionType);
  const done = items.filter((i) => isChecklistItemDone(i, property, photoCount)).length;
  return { done, total: items.length };
}

// "İlandan aktar": danışmanın kendi tarayıcısında açtığı ilan sayfasını
// kopyalayıp (Ctrl+A, Ctrl+C) yapıştırdığı düz metinden portföy alanlarını
// ayıklar. Portala sunucudan hiç bağlanılmaz - otomatik veri çekme portal
// kullanım şartlarına aykırı. Sahibinden kopyasında etiket ve değer aynı
// satırda boşluksuz bitişik gelir ("Oda Sayısı1+1"), bu yüzden satır başı
// bilinen etiketlerle eşleştirilir. "Özellikler" bölümü (cephe, iç/dış
// özellikler) kopyada seçili/seçisiz ayrımını kaybettiği için ayıklanmaz.
const LISTING_LABELS = [
  ["İlan No", "listingNo"],
  ["Emlak Tipi", "listingType"],
  ["m² (Brüt)", "grossM2"],
  ["m² (Net)", "netM2"],
  ["Oda Sayısı", "roomCount"],
  ["Bina Yaşı", "buildingAge"],
  ["Kat Sayısı", "totalFloors"],
  ["Bulunduğu Kat", "floor"],
  ["Isıtma", "heating"],
  ["Banyo Sayısı", "bathrooms"],
  ["Mutfak", "kitchen"],
  ["Balkon", "balcony"],
  ["Asansör", "elevator"],
  ["Otopark", "parking"],
  ["Eşyalı", "furnished"],
  ["Kullanım Durumu", "usage"],
  ["Site İçerisinde", "in_site"],
  ["Site Adı", "site_name"],
  ["Aidat (TL)", "dues"],
  ["Depozito (TL)", "deposit"],
  ["Krediye Uygun", "credit_eligible"],
  ["Enerji Kimlik Belgesi", "energy_class"],
  ["Tapu Durumu", "deed_status"],
];

const EMPTY_VALUES = new Set(["", "Belirtilmemiş", "-"]);

const LISTING_PROPERTY_TYPES = [
  ["Daire", "Daire"],
  ["Rezidans", "Rezidans"],
  ["Müstakil", "Müstakil Ev"],
  ["Villa", "Villa"],
  ["Yazlık", "Yazlık"],
  ["Arsa", "Arsa"],
  ["Dükkan", "Dükkan / Mağaza"],
  ["Mağaza", "Dükkan / Mağaza"],
  ["Ofis", "Ofis"],
  ["Büro", "Ofis"],
  ["Depo", "Depo"],
  ["Bina", "Bina"],
];

const parseNumber = (v) => {
  const m = String(v)
    .replace(/\./g, "")
    .replace(",", ".")
    .match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

function transactionFromText(text) {
  const t = text.toLocaleLowerCase("tr");
  if (t.includes("devren")) return "devren_kiralik";
  if (t.includes("kiralık")) return "kiralik";
  if (t.includes("satılık")) return "satilik";
  return null;
}

export function parseListingText(raw) {
  const lines = String(raw || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim());
  const values = {};
  const firstLabelLine = lines.findIndex((l) => l.startsWith("İlan No"));
  const descStart = lines.findIndex((l, i) => i > firstLabelLine && l === "Açıklama");
  const scanEnd = descStart > 0 ? descStart : lines.length;
  if (firstLabelLine >= 0) {
    for (let i = firstLabelLine; i < scanEnd; i++) {
      const line = lines[i];
      const match = LISTING_LABELS.find(([label]) => line.startsWith(label));
      if (!match || values[match[1]] !== undefined) continue;
      const value = line.slice(match[0].length).trim();
      if (!EMPTY_VALUES.has(value)) values[match[1]] = value;
    }
  }

  const result = { details: {}, listingRefs: {} };
  const favLine = lines.find((l) => l.includes("Favorilerime Ekle"));
  if (favLine) result.title = favLine.split("Favorilerime Ekle")[0].trim();

  const priceLine = lines.find((l) => /^[\d.]+(,\d+)?\s*TL$/.test(l));
  if (priceLine) result.price = parseNumber(priceLine);

  const locationLine = lines.find(
    (l) => l.split(" / ").length === 3 && !l.startsWith("Emlak") && !/\d/.test(l),
  );
  if (locationLine) {
    const [city, district, neighborhood] = locationLine.split(" / ").map((s) => s.trim());
    Object.assign(result, { city, district, neighborhood });
  }

  const typeSource = values.listingType || lines.find((l) => l.startsWith("Emlak / ")) || "";
  const tx = transactionFromText(typeSource);
  if (tx) result.transactionType = tx;
  const pt = LISTING_PROPERTY_TYPES.find(([needle]) => typeSource.includes(needle));
  if (pt) result.propertyType = pt[1];

  if (values.listingNo) result.listingRefs.sahibinden = values.listingNo.replace(/\D/g, "");
  if (values.grossM2) result.grossM2 = parseNumber(values.grossM2);
  if (values.netM2) result.netM2 = parseNumber(values.netM2);
  if (values.roomCount) {
    const studio = values.roomCount.match(/\((\d\+\d)\)/);
    result.roomCount = studio ? studio[1] : values.roomCount;
  }
  if (values.buildingAge) result.buildingAge = parseNumber(values.buildingAge);
  if (values.totalFloors) result.totalFloors = parseNumber(values.totalFloors);
  if (values.floor) result.floor = values.floor;

  const detailKeys = [
    "heating",
    "kitchen",
    "balcony",
    "elevator",
    "parking",
    "furnished",
    "usage",
    "in_site",
    "site_name",
    "credit_eligible",
    "energy_class",
    "deed_status",
  ];
  for (const k of detailKeys) if (values[k]) result.details[k] = values[k];
  if (values.bathrooms) result.details.bathrooms = parseNumber(values.bathrooms);
  if (values.dues) result.details.dues = parseNumber(values.dues);
  if (values.deposit) result.details.deposit = parseNumber(values.deposit);

  if (descStart > 0) {
    const descEnd = lines.findIndex((l, i) => i > descStart && l === "Özellikler");
    const desc = lines
      .slice(descStart + 1, descEnd > 0 ? descEnd : undefined)
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (desc) result.description = desc;
  }

  if (/EİDS sisteminde ilan verme iznine sahiptir/.test(raw)) result.eidsStatus = "onaylandi";

  return result;
}
