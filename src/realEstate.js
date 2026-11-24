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
  // Aracılık hizmetinin KDV'si işletmenin genel varsayılan KDV oranından ayrı:
  // o oran ofisin başka satışları için %10/%1 olabilir, hizmet bedeli %20'dir.
  serviceFeeKdvPercent: 20,
  licenseNo: "",
  titleDeedServiceFee: null,
  // Tapu harcı (492 sayılı Harçlar Kanunu) alıcı ve satıcı için ayrı ayrı alınır;
  // oran mevzuatla değişebildiği için sabit değil ayar.
  titleDeedTaxPercent: 2,
};

// Hizmet bedeli = taban x oran, KDV üstüne eklenir (yetki sözleşmelerinde
// "%2 + KDV" kalıbı). Kuruş yuvarlaması toplamda değil her kalemde yapılır ki
// faturadaki satırlar toplamla birebir tutsun.
export function serviceFee(base, percent, kdvPercent) {
  const net = Math.round((((Number(base) || 0) * (Number(percent) || 0)) / 100) * 100) / 100;
  const kdv = Math.round(net * (Number(kdvPercent) || 0)) / 100;
  return { net, kdv, total: Math.round((net + kdv) * 100) / 100 };
}

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

const TRANSACTION_TO_SEEKING = Object.fromEntries(
  Object.entries(SEEKING_TO_TRANSACTION).map(([label, id]) => [id, label]),
);

// Gölge Avcı (matchEmlakListing) ve İlan Metni Sihirbazı (buildEmlakListingTexts)
// teklifin customFields biçimiyle yazıldı - portföyü o biçime çevirip ikisini de
// değiştirmeden kullanıyoruz. Bölge mahalle+ilçe+il birleşimi: müşteri talebinde
// hangisini yazdıysa "içerir" karşılaştırmasıyla yakalanır; ilan metninde ise
// (başlık/hashtag) tek bir bölge adı okunur.
export function propertyAsListingDeal(p, { forMatching = false } = {}) {
  return {
    id: p.id,
    title: p.title,
    value: p.price || 0,
    customFields: {
      mulk_tipi: p.propertyType || undefined,
      islem_turu: TRANSACTION_TO_SEEKING[p.transactionType],
      bolge:
        (forMatching
          ? [p.neighborhood, p.district, p.city].filter(Boolean).join(" ")
          : p.district || p.neighborhood || p.city) || undefined,
      oda_sayisi: p.roomCount || undefined,
      metrekare: p.netM2 || p.grossM2 || undefined,
      ilan_no: p.listingRefs?.sahibinden || undefined,
    },
  };
}

export const SHOWING_INTEREST = [
  { id: "yuksek", label: "Çok ilgilendi", tone: "success" },
  { id: "orta", label: "İlgilendi", tone: "accent" },
  { id: "dusuk", label: "Az ilgilendi", tone: "warning" },
  { id: "yok", label: "İlgilenmedi", tone: "danger" },
];

// Yer gösterme belgesinin koruma süresi - gösterimden itibaren bu süre içinde
// müşteri mülkü aracısız alır/kiralarsa hizmet bedeli doğar.
export const SHOWING_PROTECTION_MONTHS = 12;

export function showingProtectionEnd(shownAt) {
  return addMonths(new Date(shownAt), SHOWING_PROTECTION_MONTHS);
}

function showingFeeClause(transactionType, s) {
  const kdv = `%${s.serviceFeeKdvPercent} KDV`;
  if (transactionType === "satilik")
    return `satış bedeli üzerinden %${s.saleBuyerPercent} + ${kdv}`;
  return `${s.rentMonths} aylık kira bedeli + ${kdv}`;
}

// Belge metni Binerly'nin kendi ifadesiyle yazıldı (herhangi bir franchise/ofis
// formundan alınmadı). Metin dijital onay linki oluşturulurken bu fonksiyonla
// üretilip property_showings.consent_text'e dondurulur - onaylanan metin sonradan
// değişmesin diye API tarafı metni yeniden üretmez, sadece saklananı gösterir.
export function buildShowingDocumentText({
  company,
  realEstateSettings,
  property,
  customer,
  showing,
  agentName,
}) {
  const s = resolveRealEstateSettings(realEstateSettings);
  const companyName = company?.companyName || "İşletme";
  const date = new Date(showing.shownAt).toLocaleDateString("tr-TR");
  const purpose = {
    satilik: "satın alma",
    kiralik: "kiralama",
    devren_kiralik: "devir alma ve kiralama",
  }[property.transactionType];
  const location = [property.neighborhood, property.district, property.city]
    .filter(Boolean)
    .join(", ");
  const parcel = [
    property.parcelBlock && `Ada ${property.parcelBlock}`,
    property.parcelNo && `Parsel ${property.parcelNo}`,
    property.unitNo && `B.B. ${property.unitNo}`,
  ]
    .filter(Boolean)
    .join(" / ");
  const lines = [
    "TAŞINMAZ YER GÖSTERME BELGESİ",
    "",
    "Aracı işletme",
    companyName,
    // Yetki belgesi no belgede her zaman yer alır; ayarlarda yoksa yazdırılan
    // çıktıda elle doldurulacak boş alan kalır (ön onay linki numarasız açılmaz).
    `Yetki belgesi no: ${s.licenseNo || "...................."}`,
    [company?.address, company?.phone].filter(Boolean).join(" - "),
    agentName ? `Gösteren danışman: ${agentName}` : "",
    "",
    "Taşınmazı gören kişi",
    `${customer.name}${customer.phone ? ` - ${customer.phone}` : ""}`,
    "",
    "Gösterilen taşınmaz",
    `${property.title} (${transactionLabel(property.transactionType)})`,
    location,
    property.address || "",
    parcel,
    property.price
      ? `İlan bedeli: ${new Intl.NumberFormat("tr-TR").format(property.price)} TL${property.transactionType === "kiralik" ? " / ay" : ""}`
      : "",
    "",
    `Gösterim tarihi: ${date} - ${showing.method === "elektronik" ? "elektronik ortamda (fotoğraf/video/görüntülü görüşme)" : "yerinde (fiziki)"}`,
    "",
    "Beyan",
    // Şirket adına iyelik/yönelme eki EKLENMİYOR ("X'nin", "X'ye"): ad her
    // işletmede farklı, ses uyumu tahmini güvenilir değil - "aracı işletme"
    // ifadesiyle ekten kaçınılıyor.
    `Yukarıda bilgileri yazılı taşınmaz, ${purpose} amacıyla yukarıda adı geçen aracı işletme tarafından bana gösterilmiş ve tanıtılmıştır. ` +
      `Bu taşınmazı gösterim tarihinden itibaren ${SHOWING_PROTECTION_MONTHS} ay içinde kendim, eşim, birinci derece yakınlarım ya da ortağı olduğum bir şirket aracılığıyla, ` +
      `aracı işletmenin aracılığı olmaksızın ${purpose === "satın alma" ? "satın almam" : "kiralamam ya da devir almam"} halinde, ${showingFeeClause(property.transactionType, s)} tutarındaki hizmet bedelini aracı işletmeye ödemeyi kabul ederim.`,
    "",
    "Yukarıdaki kişisel bilgilerimin doğru olduğunu beyan ederim.",
  ];
  return lines.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n");
}

// Tapu harcının kimde kalacağı taraflar arasında pazarlıkla değişebilir; yasal
// varsayılan her tarafın kendi payını ödemesidir.
export const DEED_TAX_SPLITS = [
  { id: "yasal", label: "Her taraf kendi payını öder" },
  { id: "alici", label: "Tamamını alıcı öder" },
  { id: "satici", label: "Tamamını satıcı öder" },
];

export const SERVICE_FEE_PAYERS = [
  { id: "her_iki", label: "Alıcı ve satıcıdan" },
  { id: "alici", label: "Sadece alıcıdan" },
  { id: "satici", label: "Sadece satıcıdan" },
];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Satış/kiralama/devir masraf dökümü. Saf fonksiyon - Portföy'deki hesaplayıcı,
// teklif tutarı önerisi ve müşteriye verilen çıktı aynı sonucu göstersin diye.
// Tapuda gösterilecek bedel satış bedelinden farklı girilebilir (rayiç bedelin
// altında olamaz) - harç onun üzerinden, hizmet bedeli gerçek satış bedeli
// üzerinden hesaplanır.
export function computeTransactionCosts(input, rawSettings) {
  const s = resolveRealEstateSettings(rawSettings);
  const kdvPercent = s.serviceFeeKdvPercent;
  const partnerShare = Math.min(100, Math.max(0, Number(input.partnerSharePercent) || 0));

  const withPartner = (fees) => {
    const totalNet = fees.reduce((sum, f) => sum + f.net, 0);
    const partnerNet = round2((totalNet * partnerShare) / 100);
    return { totalNet: round2(totalNet), partnerNet, ourNet: round2(totalNet - partnerNet) };
  };

  if (input.transactionType === "satilik") {
    const price = Number(input.price) || 0;
    const deedValue = Number(input.deedValue) || price;
    const taxEach = round2((deedValue * s.titleDeedTaxPercent) / 100);
    const split = input.deedTaxSplit || "yasal";
    const buyerTax = split === "alici" ? taxEach * 2 : split === "satici" ? 0 : taxEach;
    const sellerTax = split === "satici" ? taxEach * 2 : split === "alici" ? 0 : taxEach;
    const revolvingCount = input.withCredit ? 2 : 1;
    const revolvingTotal = round2((Number(s.titleDeedServiceFee) || 0) * revolvingCount);
    const payer = input.feePayer || "her_iki";
    const buyerFee =
      payer === "satici"
        ? serviceFee(0, 0, kdvPercent)
        : serviceFee(price, s.saleBuyerPercent, kdvPercent);
    const sellerFee =
      payer === "alici"
        ? serviceFee(0, 0, kdvPercent)
        : serviceFee(price, s.saleSellerPercent, kdvPercent);
    const mortgagePayoff = Number(input.mortgagePayoff) || 0;
    return {
      transactionType: "satilik",
      price,
      deedValue,
      deedTaxSplit: split,
      revolvingCount,
      revolvingMissing: !s.titleDeedServiceFee,
      buyer: {
        deedTax: buyerTax,
        revolving: revolvingTotal,
        fee: buyerFee,
        total: round2(price + buyerTax + revolvingTotal + buyerFee.total),
      },
      seller: {
        deedTax: sellerTax,
        fee: sellerFee,
        mortgagePayoff,
        net: round2(price - sellerTax - sellerFee.total - mortgagePayoff),
      },
      commission: withPartner([buyerFee, sellerFee]),
      kdvPercent,
      settings: s,
    };
  }

  const rent = Number(input.transactionType === "kiralik" ? input.price : input.monthlyRent) || 0;
  const deposit = Number(input.deposit) || 0;
  const tenantFee = serviceFee(rent * (Number(s.rentMonths) || 0), 100, kdvPercent);

  if (input.transactionType === "kiralik") {
    return {
      transactionType: "kiralik",
      rent,
      deposit,
      tenant: { fee: tenantFee, firstPayment: round2(rent + deposit + tenantFee.total) },
      owner: { firstRentNet: rent },
      commission: withPartner([tenantFee]),
      kdvPercent,
      settings: s,
    };
  }

  const transferPrice = Number(input.price) || 0;
  const transferorFee = serviceFee(transferPrice, s.transferPercent, kdvPercent);
  return {
    transactionType: "devren_kiralik",
    transferPrice,
    rent,
    deposit,
    transferee: {
      fee: tenantFee,
      total: round2(transferPrice + rent + deposit + tenantFee.total),
    },
    transferor: { fee: transferorFee, net: round2(transferPrice - transferorFee.total) },
    commission: withPartner([tenantFee, transferorFee]),
    kdvPercent,
    settings: s,
  };
}

// Kapanış kontrol listesi - portföy alım listesiyle aynı checklist jsonb'de,
// "close_" önekiyle (iki liste birbirinin ilerlemesini bozmasın).
const CLOSING_STEPS = {
  satilik: [
    {
      key: "close_title_deed_appointment",
      label: "Tapu randevusu alındı, taraflara ve bankaya bildirildi",
    },
    { key: "close_mortgage", label: "İpotek varsa bankadan kapama ve fek yazısı alındı" },
    { key: "close_documents", label: "Kimlikler, DASK ve belediye rayiç bedel belgesi hazır" },
    { key: "close_fee_collected", label: "Hizmet bedeli tapudan önce tahsil edildi" },
    { key: "close_deed_transfer", label: "Tapu devri tamamlandı, yeni tapunun kopyası alındı" },
    {
      key: "close_handover",
      label: "Anahtar, abonelik numaraları ve borcu yoktur yazıları teslim edildi",
    },
    { key: "close_invoice", label: "Hizmet bedeli faturası kesildi" },
    { key: "close_listings", label: "İlanlar kapatıldı, afiş toplandı" },
    { key: "close_archive", label: "Arşiv dosyası tamamlandı" },
  ],
  kiralik: [
    { key: "close_contract", label: "Kira sözleşmesi imzalandı (kiracı, mal sahibi, varsa kefil)" },
    { key: "close_spouse_consent", label: "Evliyse kiracı/kefil için eş muvafakati alındı" },
    { key: "close_ids", label: "Kiracı ve kefilin kimlik fotokopileri alındı" },
    { key: "close_deposit", label: "Depozito mal sahibine teslim edildi" },
    { key: "close_fee_collected", label: "Hizmet bedeli tahsil edildi" },
    { key: "close_handover", label: "Anahtar teslim edildi, teslim öncesi fotoğraf/video çekildi" },
    { key: "close_invoice", label: "Hizmet bedeli faturası kesildi" },
    { key: "close_listings", label: "İlanlar kapatıldı, afiş toplandı" },
  ],
  devren_kiralik: [
    { key: "close_transfer_contract", label: "Devir sözleşmesi imzalandı" },
    { key: "close_contract", label: "Yeni kira sözleşmesi mal sahibiyle imzalandı" },
    { key: "close_fixtures", label: "Demirbaşlar listeye göre teslim edildi" },
    { key: "close_fee_collected", label: "Her iki taraftan hizmet bedeli tahsil edildi" },
    { key: "close_invoice", label: "Hizmet bedeli faturaları kesildi" },
    { key: "close_listings", label: "İlanlar kapatıldı, afiş toplandı" },
  ],
};

export function closingStepsFor(transactionType) {
  return CLOSING_STEPS[transactionType] || [];
}

export const CLOSING_STATUSES = ["opsiyonlu", "satildi", "kiralandi"];
export const CLOSED_STATUSES = ["satildi", "kiralandi"];

// Kira artış dönemi: sözleşme yıl dönümünden ~25 gün önce mal sahibi ve
// kiracıyla TÜFE (12 aylık ortalama) artışının konuşulması için.
export const RENT_REVIEW_LEAD_DAYS = 25;

export function nextRentReviewDate(leaseStart, today = new Date()) {
  if (!leaseStart) return null;
  const start = new Date(`${leaseStart}T00:00:00`);
  let years = 1;
  let anniversary = addMonths(start, 12);
  const now = new Date(today);
  now.setHours(0, 0, 0, 0);
  while (anniversary - RENT_REVIEW_LEAD_DAYS * 86400000 < now) {
    years += 1;
    anniversary = addMonths(start, 12 * years);
  }
  return new Date(anniversary.getTime() - RENT_REVIEW_LEAD_DAYS * 86400000);
}

// ---- Piyasa Fiyat Analizi (emsal karşılaştırma) ----
// SPK lisanslı değerleme DEĞİLDİR: danışmanın mal sahibiyle fiyat konuşması için
// şeffaf bir karşılaştırma. Her düzeltme kalemi ayrı tutulur ki raporda "bu sayı
// nereden çıktı" görülebilsin; gizli ağırlık/kara kutu yok.
export const VALUATION_DEFAULTS = {
  askingDiscountPercent: 5,
  annualIncreasePercent: 0,
  agePercentPerYear: 0.5,
  lowFloorPercent: 5,
};

const LOW_FLOOR_PATTERN = /bodrum|bahçe|giriş|zemin|kot/i;

function floorIsLow(floor) {
  return !!floor && LOW_FLOOR_PATTERN.test(String(floor));
}

function monthsBetween(fromDate, to = new Date()) {
  if (!fromDate) return 0;
  const from = new Date(`${String(fromDate).slice(0, 10)}T00:00:00`);
  return Math.max(0, (to - from) / (30.44 * 86400000));
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

const roundTo = (n, step) => Math.round(n / step) * step;

export function analyzeComparables(subject, comparables, rawOptions = {}, today = new Date()) {
  const o = { ...VALUATION_DEFAULTS, ...rawOptions };
  const num = (v) => (v === "" || v == null ? null : Number(v));
  // Net m² tercih edilir (ilanlarda brüt şişirilebiliyor); konu mülkte net yoksa
  // herkes brüt üzerinden karşılaştırılır - iki farklı taban karıştırılmaz.
  const basis = num(subject.netM2) ? "net" : num(subject.grossM2) ? "gross" : null;
  const subjectArea = basis === "net" ? num(subject.netM2) : num(subject.grossM2);
  if (!basis)
    return { error: "Konu mülkün m² bilgisi yok - portföy kartına brüt veya net m² girin." };

  const rows = comparables.map((c) => {
    const area = basis === "net" ? num(c.netM2) || num(c.grossM2) : num(c.grossM2) || num(c.netM2);
    if (!area || !num(c.price)) return { comp: c, skipped: "m² veya fiyat eksik" };
    const unit = num(c.price) / area;
    const adj = [];
    if (c.kind === "ilan" && o.askingDiscountPercent) {
      adj.push({ label: "Pazarlık payı (ilan fiyatı)", percent: -o.askingDiscountPercent });
    }
    const months = monthsBetween(c.observedOn, today);
    if (o.annualIncreasePercent && months >= 1) {
      adj.push({
        label: `Zaman (${Math.round(months)} ay önce)`,
        percent: Math.round(((o.annualIncreasePercent * months) / 12) * 10) / 10,
      });
    }
    const subjAge = num(subject.buildingAge);
    const compAge = num(c.buildingAge);
    if (subjAge != null && compAge != null && subjAge !== compAge) {
      const p = Math.max(-15, Math.min(15, (compAge - subjAge) * o.agePercentPerYear));
      adj.push({ label: `Bina yaşı (${compAge} - ${subjAge})`, percent: Math.round(p * 10) / 10 });
    }
    if (subject.floor && c.floor && floorIsLow(subject.floor) !== floorIsLow(c.floor)) {
      adj.push({
        label: "Kat (giriş/bodrum farkı)",
        percent: floorIsLow(c.floor) ? o.lowFloorPercent : -o.lowFloorPercent,
      });
    }
    if (Number(c.manualAdjustPercent)) {
      adj.push({ label: "Danışman düzeltmesi", percent: Number(c.manualAdjustPercent) });
    }
    const totalPercent = adj.reduce((s, a) => s + a.percent, 0);
    const adjustedUnit = unit * (1 + totalPercent / 100);

    // Benzerlik ağırlığı: alan yakınlığı, aynı ilçe, gerçekleşmiş satış, tazelik.
    const areaGap = Math.abs(area - subjectArea) / subjectArea;
    const sameDistrict =
      !subject.district ||
      !c.district ||
      subject.district.toLocaleLowerCase("tr") === c.district.toLocaleLowerCase("tr");
    const weight =
      (1 / (1 + areaGap * 2)) *
      (sameDistrict ? 1 : 0.6) *
      (c.kind === "satis" ? 1.2 : 1) *
      (months > 6 ? 0.75 : 1) *
      (subject.roomCount && c.roomCount && subject.roomCount === c.roomCount ? 1.1 : 1);
    return { comp: c, area, unit, adj, totalPercent, adjustedUnit, weight };
  });

  const used = rows.filter((r) => !r.skipped);
  if (used.length === 0)
    return { basis, subjectArea, rows, error: "Hesaba katılabilecek emsal yok." };
  const weightSum = used.reduce((s, r) => s + r.weight, 0);
  const midUnit = used.reduce((s, r) => s + r.adjustedUnit * r.weight, 0) / weightSum;
  const sorted = used.map((r) => r.adjustedUnit).sort((a, b) => a - b);
  // 3'ten az emsalle çeyreklik anlamsız - sabit ±%7 bant, raporda "az emsal" uyarısı.
  const lowUnit = used.length >= 3 ? Math.min(percentile(sorted, 0.25), midUnit) : midUnit * 0.93;
  const highUnit = used.length >= 3 ? Math.max(percentile(sorted, 0.75), midUnit) : midUnit * 1.07;
  const step = subject.transactionType === "satilik" ? 10000 : 500;
  return {
    basis,
    subjectArea,
    rows,
    count: used.length,
    lowConfidence: used.length < 3,
    unit: { low: lowUnit, mid: midUnit, high: highUnit },
    value: {
      low: roundTo(lowUnit * subjectArea, step),
      mid: roundTo(midUnit * subjectArea, step),
      high: roundTo(highUnit * subjectArea, step),
    },
    options: o,
  };
}
