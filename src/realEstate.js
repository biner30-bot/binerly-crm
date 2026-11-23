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
