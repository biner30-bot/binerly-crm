// Otomatik fiyat tahmini: bölge m² fiyatı + dairenin özellikleri -> fiyat.
// Kullanıcı emsal-tek-tek ekleme ekranını istemedi ("Endeksa gibi, bölge ve
// daire özellikleri girilince fiyat versin"). Bölge fiyatı danışmanın KENDİ
// ekranından kopyaladığı portal arama sonuç sayfasından hesaplanır (robot/kazıma
// yok). Sonuç sayfası ilanların yaş/kat/asansör gibi özelliklerini göstermediği
// için mahalle fiyatı "tipik daire" sayılır; konu daire ona göre düzeltilir.
// Oranlar veriden ÖĞRENİLMİŞ değil, sektörde yaygın kabul görmüş varsayımlar -
// her biri ayarlanabilir ve raporda tek tek yazılır.

const MONTHS_TR = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

const ROOM_PATTERN = /^(Stüdyo(?: \(1\+0\))?|\d+(?:\.5)?\+\d+|10 Üzeri)$/;

const toNumber = (s) => Number(String(s).replace(/\./g, "").replace(",", "."));

export function normalizePlace(s) {
  return String(s || "")
    .replace(/\s+(Mah\.?|Mahallesi|Mh\.?)$/i, "")
    .trim()
    .toLocaleLowerCase("tr");
}

function displayPlace(s) {
  return String(s || "")
    .replace(/\s+(Mah\.?|Mahallesi|Mh\.?)$/i, "")
    .trim();
}

// Sahibinden arama sonuç sayfası (liste görünümü) Ctrl+A/Ctrl+C metni. Her ilan
// "... #<ilanNo>" satırıyla başlar, ardından "m²<tab>oda" ve "<fiyat> TL"
// satırları gelir. Kopyalama tarayıcıya göre sekmeleri boşluğa çevirebildiği
// için ayraç olarak her türlü boşluk kabul edilir.
export function parseSearchResults(raw) {
  const text = String(raw || "").replace(/\r/g, "");
  const lines = text.split("\n").map((l) => l.trim());
  const out = { listings: [], skipped: 0 };

  const quote = text.match(/"([^"\n]+?)\s+(Satılık|Kiralık)\s+([^"\n]+)"\s*\n?\s*aramanızda/);
  if (quote) {
    out.neighborhood = displayPlace(quote[1]);
    out.transactionType = quote[2] === "Kiralık" ? "kiralik" : "satilik";
    out.propertyType = quote[3].trim();
  }
  const address = text.match(/Adres\s*([^\n]+?)\s*Tümünü Temizle/);
  if (address) {
    const parts = address[1].split(",").map((s) => s.trim());
    out.city = parts[0] || "";
    out.district = parts[1] || "";
    // Seçili filtreler adresin arkasına bitişik yazılıyor ("Atakent Mah.Bina
    // Yaşı31 ve üzeri") - mahalle arama başlığından alınır, yoksa "Mah."ta kesilir.
    if (parts.length >= 3 && !out.neighborhood)
      out.neighborhood = displayPlace(
        parts[parts.length - 1].replace(/(Mah\.|Mahallesi|Mh\.).*$/, "$1"),
      );
  }
  out.ageBand = detectAgeBand(text);
  const total = text.match(/(\d[\d.]*)\s*ilan\s*bulundu/);
  if (total) out.totalCount = toNumber(total[1]);
  const pages = text.match(/Toplam (\d+) sayfa içerisinde (\d+)\. sayfa/);
  if (pages) out.page = { total: Number(pages[1]), current: Number(pages[2]) };

  let cur = null;
  const flush = () => {
    if (!cur) return;
    if (cur.m2 && cur.price) out.listings.push(cur);
    else out.skipped += 1;
    cur = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const id = line.match(/#(\d{7,})$/);
    if (id) {
      flush();
      cur = { id: id[1], title: line.replace(/#\d+$/, "").trim() };
      continue;
    }
    if (!cur) continue;
    if (!cur.m2) {
      const cols = line.split(/\s+/);
      if (
        cols.length >= 2 &&
        /^\d{2,5}$/.test(cols[0]) &&
        ROOM_PATTERN.test(cols.slice(1).join(" "))
      ) {
        cur.m2 = Number(cols[0]);
        cur.rooms = cols.slice(1).join(" ");
        continue;
      }
      if (/^\d{2,5}$/.test(line) && ROOM_PATTERN.test(lines[i + 1] || "")) {
        cur.m2 = Number(line);
        cur.rooms = lines[i + 1];
        i += 1;
        continue;
      }
    }
    if (cur.m2 && !cur.price) {
      const price = line.match(/^([\d.]+(?:,\d+)?)\s*(TL|USD|EUR|GBP)$/);
      if (price) {
        // Döviz ilanı TL'ye çevirmek için kur gerekir; ortalamayı bozmasın diye alınmaz.
        if (price[2] === "TL") cur.price = toNumber(price[1]);
        else cur.currency = price[2];
        continue;
      }
    }
    if (cur.price && !cur.date) {
      const d = line.match(/^(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)$/);
      const y = (lines[i + 1] || "").match(/^(\d{4})/);
      const month = d ? MONTHS_TR.indexOf(d[2]) : -1;
      if (d && y && month >= 0) {
        cur.date = `${y[1]}-${String(month + 1).padStart(2, "0")}-${d[1].padStart(2, "0")}`;
        // Listede her ilanın kendi mahallesi yazar ("2026<tab>Atakent Mah.") -
        // semt ya da çoklu mahalle aramasında ilanları mahallesine ayırmak için.
        const sameLine = (lines[i + 1] || "").match(/^\d{4}\s+(.+?(?:Mah\.?|Mahallesi|Mh\.?))$/i);
        const nextLine = (lines[i + 2] || "").match(/^(.+?(?:Mah\.?|Mahallesi|Mh\.?))$/i);
        const nb = sameLine?.[1] || nextLine?.[1];
        if (nb) cur.neighborhood = displayPlace(nb);
        i += 1;
      }
    }
  }
  flush();
  return out;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// Uç değerler (Tukey 1.5×IQR) atılır: "18.000.000 TL'lik sıfır bina" ya da
// yanlış girilmiş m² ortalamayı tek başına kaydırmasın.
export function summarizeListings(listings) {
  const valid = listings.filter((l) => l.m2 >= 20 && l.price > 0);
  const units = valid.map((l) => l.price / l.m2).sort((a, b) => a - b);
  if (units.length === 0) return null;
  const q1 = percentile(units, 0.25);
  const q3 = percentile(units, 0.75);
  const iqr = q3 - q1;
  const kept = valid.filter((l) => {
    const u = l.price / l.m2;
    return units.length < 5 || (u >= q1 - 1.5 * iqr && u <= q3 + 1.5 * iqr);
  });
  const keptUnits = kept.map((l) => l.price / l.m2).sort((a, b) => a - b);
  const areas = kept.map((l) => l.m2).sort((a, b) => a - b);
  return {
    medianM2: Math.round(percentile(keptUnits, 0.5)),
    q1M2: Math.round(percentile(keptUnits, 0.25)),
    q3M2: Math.round(percentile(keptUnits, 0.75)),
    medianArea: Math.round(percentile(areas, 0.5)),
    listingCount: kept.length,
    outliers: valid.length - kept.length,
    ...ageStats(kept),
  };
}

// Aynı aramanın 2. sayfası ayrıca yapıştırılınca ilan numarasıyla birleştirilir.
// Aynı ilan önce filtresiz, sonra bina yaşı filtresiyle yapıştırılabilir -
// yaş bilgisi bir kez öğrenildiyse kaybolmaz.
// Arama sonucundaki ilanları mahallelerine göre gruplar. Tek mahalleyse null.
export function groupByNeighborhood(listings) {
  const groups = new Map();
  for (const l of listings) {
    if (!l.neighborhood) continue;
    const key = normalizePlace(l.neighborhood);
    const g = groups.get(key) || { neighborhood: l.neighborhood, listings: [] };
    g.listings.push(l);
    groups.set(key, g);
  }
  if (groups.size < 2) return null;
  return [...groups.values()].sort((a, b) => b.listings.length - a.listings.length);
}

export function mergeListings(existing, incoming) {
  const byId = new Map((existing || []).map((l) => [l.id, l]));
  for (const l of incoming) {
    const old = byId.get(l.id);
    byId.set(l.id, {
      ...old,
      ...l,
      age: l.age ?? old?.age ?? null,
      ageBand: l.ageBand ?? old?.ageBand ?? null,
    });
  }
  return [...byId.values()];
}

// Sahibinden "Bina Yaşı" filtresinin seçenekleri; aralıklar orta noktayla
// temsil edilir ("31 ve üzeri" için 35 - üst sınır yok, temkinli bir değer).
export const AGE_BANDS = [
  { label: "0 (Oturuma Hazır)", age: 0, lo: 0, hi: 0 },
  { label: "0 (Yapım Aşamasında)", age: 0, lo: 0, hi: 0 },
  { label: "1", age: 1, lo: 1, hi: 1 },
  { label: "2", age: 2, lo: 2, hi: 2 },
  { label: "3", age: 3, lo: 3, hi: 3 },
  { label: "4", age: 4, lo: 4, hi: 4 },
  { label: "5", age: 5, lo: 5, hi: 5 },
  { label: "6-10 arası", age: 8, lo: 6, hi: 10 },
  { label: "11-15 arası", age: 13, lo: 11, hi: 15 },
  { label: "16-20 arası", age: 18, lo: 16, hi: 20 },
  { label: "21-25 arası", age: 23, lo: 21, hi: 25 },
  { label: "26-30 arası", age: 28, lo: 26, hi: 30 },
  { label: "31 ve üzeri", age: 35, lo: 31, hi: 200 },
];

// Yaş en belirleyici etken - rapor, dairenin yaşına yakın emsal ilanlara
// dayanmalı. İlan yaşı Sahibinden'de aralık olarak bilinir; daire yaşı
// aralığın ±NEAR_AGE_YEARS yakınındaysa "yakın" sayılır.
export const NEAR_AGE_YEARS = 3;
export const MIN_NEAR_AGE_LISTINGS = 5;

export function nearAgeListings(listings, subjectAge) {
  const a = subjectAge === "" || subjectAge == null ? null : Number(subjectAge);
  if (a == null || Number.isNaN(a)) return [];
  return (listings || []).filter((l) => {
    if (l.age == null) return false;
    const band = AGE_BANDS.find((b) => b.label === l.ageBand);
    const lo = band ? band.lo : l.age;
    const hi = band ? band.hi : l.age;
    return a >= lo - NEAR_AGE_YEARS && a <= hi + NEAR_AGE_YEARS;
  });
}

// Seçili filtreler sayfada "Seçtiklerimi Gizle ... Tümünü Temizle" arasında
// bitişik metin olarak duruyor. Birden fazla yaş seçiliyse aralık belirsiz -
// null döner, kullanıcı menüden seçer.
export function detectAgeBand(raw) {
  const seg = String(raw || "").match(/Seçtiklerimi Gizle([\s\S]*?)Tümünü Temizle/);
  if (!seg || !seg[1].includes("Bina Yaşı")) return null;
  const after = seg[1].split("Bina Yaşı")[1].slice(0, 80);
  const longFirst = [...AGE_BANDS].sort((a, b) => b.label.length - a.label.length);
  const found = [];
  let rest = after.replace(/^[\s:]+/, "");
  for (;;) {
    const band = longFirst.find((b) => rest.startsWith(b.label));
    if (!band) break;
    found.push(band);
    rest = rest.slice(band.label.length).replace(/^[\s,]+/, "");
  }
  return found.length === 1 ? found[0].label : null;
}

function solve3(A, b) {
  const m = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
    if (Math.abs(m[piv][c]) < 1e-12) return null;
    [m[c], m[piv]] = [m[piv], m[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((row, i) => row[3] / m[i][i]);
}

// Yaşı bilinen ilanlardan: tipik yaş (ortanca) ve yaşın m² fiyatına etkisi.
// Etki, ln(m² fiyatı) ~ yaş + ln(alan) regresyonuyla ölçülür (büyük dairelerin
// m² fiyatı düşük olduğu için alan da modelde - yoksa yaş etkisine karışırdı).
// En az 12 ilan ve 2 farklı yaş aralığı yoksa ölçülmez, varsayılan eğri kullanılır.
export function ageStats(listings) {
  const aged = (listings || []).filter((l) => l.age != null && l.m2 >= 20 && l.price > 0);
  const ages = aged.map((l) => l.age).sort((a, b) => a - b);
  const out = { agedCount: aged.length, typicalAge: null, ageSlope: null };
  if (aged.length >= 5) out.typicalAge = Math.round(percentile(ages, 0.5));
  if (aged.length >= 12 && new Set(ages).size >= 2) {
    const X = aged.map((l) => [1, l.age, Math.log(l.m2)]);
    const y = aged.map((l) => Math.log(l.price / l.m2));
    const XtX = [0, 1, 2].map((i) => [0, 1, 2].map((j) => X.reduce((s, r) => s + r[i] * r[j], 0)));
    const Xty = [0, 1, 2].map((i) => X.reduce((s, r, k) => s + r[i] * y[k], 0));
    const beta = solve3(XtX, Xty);
    if (beta) {
      const pct = (Math.exp(beta[1]) - 1) * 100;
      out.ageSlope = Math.round(Math.max(-2, Math.min(0.5, pct)) * 100) / 100;
    }
  }
  return out;
}

export function regionKey(r) {
  return [
    normalizePlace(r.city),
    normalizePlace(r.district),
    normalizePlace(r.neighborhood),
    String(r.propertyType || "Daire").toLocaleLowerCase("tr"),
    r.transactionType || "satilik",
  ].join("|");
}

// Tapudaki resmi mahalle adı ile ilanlarda kullanılan ad farklı olabilir
// (ör. tapuda Şemikler, Sahibinden'de Atakent). Ekip bir kez bağlar.
export function aliasFor(aliases, subject) {
  const n = normalizePlace(subject?.neighborhood);
  if (!n) return null;
  const d = normalizePlace(subject.district);
  return (
    (aliases || []).find(
      (a) =>
        normalizePlace(a.from) === n && (!a.district || !d || normalizePlace(a.district) === d),
    ) || null
  );
}

export function findRegion(regions, subject, transactionType = "satilik", aliases = null) {
  const direct = findRegionExact(regions, subject, transactionType);
  if (direct || !aliases?.length) return direct;
  const alias = aliasFor(aliases, subject);
  if (!alias) return null;
  const viaAlias = findRegionExact(
    regions,
    { ...subject, neighborhood: alias.to },
    transactionType,
  );
  return viaAlias ? { ...viaAlias, aliasFrom: subject.neighborhood } : null;
}

function findRegionExact(regions, subject, transactionType) {
  const n = normalizePlace(subject.neighborhood);
  if (!n) return null;
  const type = String(subject.propertyType || "Daire").toLocaleLowerCase("tr");
  const candidates = regions.filter(
    (r) =>
      normalizePlace(r.neighborhood) === n &&
      r.transactionType === transactionType &&
      String(r.propertyType).toLocaleLowerCase("tr") === type,
  );
  if (candidates.length <= 1) return candidates[0] || null;
  const d = normalizePlace(subject.district);
  return candidates.find((r) => normalizePlace(r.district) === d) || candidates[0];
}

// TCMB endeksi ~2 ay geriden gelir ve il/bölge ortalamasıdır; yüksek
// enflasyonda mahalle fiyatı ondan hızlı kayabilir. Bu yüzden ilan verisi
// 30 günden eskiyse yenisi istenir.
export const REGION_STALE_DAYS = 30;
export const REGION_OLD_DAYS = 60;

export function regionAgeDays(region) {
  if (!region?.asOf) return 0;
  return Math.floor(
    (Date.now() - new Date(`${String(region.asOf).slice(0, 10)}T00:00:00`)) / 86400000,
  );
}

// Sadece portföyde aktif ilanı olan bölgeler - takip edilmeyen mahalle için
// uyarı gürültü olur.
export function staleRegionAlerts(regions, properties, aliases = null) {
  const byRegion = new Map();
  for (const p of properties) {
    if (!["aktif", "opsiyonlu"].includes(p.status)) continue;
    if (!["satilik", "kiralik"].includes(p.transactionType)) continue;
    const r = findRegion(regions, p, p.transactionType, aliases);
    if (!r) continue;
    const days = regionAgeDays(r);
    if (days <= REGION_STALE_DAYS) continue;
    const entry = byRegion.get(r.id) || { region: r, days, properties: [] };
    entry.properties.push(p);
    byRegion.set(r.id, entry);
  }
  return [...byRegion.values()].sort((a, b) => b.days - a.days);
}

// TCMB Konut Fiyat Endeksi bölge serileri (İBBS Düzey 2). Sadece değişim oranı
// için kullanılır - endeks resmi değerleme ortalamalarından gelir, seviyesi
// piyasa ilan fiyatının altındadır ama aylık değişimi güvenilirdir.
const KFE_REGIONS = {
  TR10: ["İstanbul"],
  TR21: ["Tekirdağ", "Edirne", "Kırklareli"],
  TR22: ["Balıkesir", "Çanakkale"],
  TR31: ["İzmir"],
  TR32: ["Aydın", "Denizli", "Muğla"],
  TR33: ["Manisa", "Afyonkarahisar", "Kütahya", "Uşak"],
  TR41: ["Bursa", "Eskişehir", "Bilecik"],
  TR42: ["Kocaeli", "Sakarya", "Düzce", "Bolu", "Yalova"],
  TR51: ["Ankara"],
  TR52: ["Konya", "Karaman"],
  TR61: ["Antalya", "Isparta", "Burdur"],
  TR62: ["Adana", "Mersin"],
  TR63: ["Hatay", "Kahramanmaraş", "Osmaniye"],
  // TCMB küçük bölgeleri Düzey 1'de birleştirip yayımlıyor (TR71/TR72 yok, TR7 var).
  TR7: ["Kırıkkale", "Aksaray", "Niğde", "Nevşehir", "Kırşehir", "Kayseri", "Sivas", "Yozgat"],
  TR8: [
    "Zonguldak",
    "Karabük",
    "Bartın",
    "Kastamonu",
    "Çankırı",
    "Sinop",
    "Samsun",
    "Tokat",
    "Çorum",
    "Amasya",
  ],
  TR9: ["Trabzon", "Ordu", "Giresun", "Rize", "Artvin", "Gümüşhane"],
  TRA: ["Erzurum", "Erzincan", "Bayburt", "Ağrı", "Kars", "Iğdır", "Ardahan"],
  TRB: ["Malatya", "Elazığ", "Bingöl", "Tunceli", "Van", "Muş", "Bitlis", "Hakkari"],
  TRC: [
    "Gaziantep",
    "Adıyaman",
    "Kilis",
    "Şanlıurfa",
    "Diyarbakır",
    "Mardin",
    "Batman",
    "Şırnak",
    "Siirt",
  ],
};
export const KFE_SERIES = ["TP.KFE.TR", ...Object.keys(KFE_REGIONS).map((r) => `TP.KFE.${r}`)];

export function kfeSeriesForCity(city) {
  const c = normalizePlace(city);
  const region = Object.entries(KFE_REGIONS).find(([, cities]) =>
    cities.some((x) => x.toLocaleLowerCase("tr") === c),
  );
  return region ? `TP.KFE.${region[0]}` : "TP.KFE.TR";
}

// Bölge fiyatının alındığı aydan bu yana endeks değişimi. Endeks ~2 ay gecikmeli
// yayımlandığı için yakın tarihli kayıtta oran 1 çıkar (güncellenecek bir şey yok).
export function indexFactor(marketIndex, city, asOf) {
  const series = kfeSeriesForCity(city);
  const points = marketIndex
    .filter((p) => p.series === series)
    .sort((a, b) => a.period.localeCompare(b.period));
  if (points.length === 0 || !asOf) return { factor: 1, series };
  const latest = points[points.length - 1];
  const asOfMonth = `${String(asOf).slice(0, 7)}-01`;
  const base = points.filter((p) => p.period <= asOfMonth).pop();
  if (!base || base.period >= latest.period) return { factor: 1, series, latest: latest.period };
  return {
    factor: latest.value / base.value,
    series,
    from: base.period,
    latest: latest.period,
  };
}

export const AVM_FACTOR_DEFAULTS = {
  askingDiscountPercent: 8,
  areaElasticity: 0.15,
  age0to2: 12,
  age3to5: 8,
  age6to10: 4,
  age11to20: 0,
  age21to30: -4,
  age31plus: -7,
  floorBasement: -15,
  floorGround: -7,
  floorHighEntrance: -4,
  floorGarden: -3,
  floorTop: -2,
  noElevatorHigh: -7,
  parkingClosed: 4,
  parkingOpen: 1,
  inSite: 5,
  facadeSouth: 2,
  facadeNorthOnly: -3,
  viewSea: 10,
  viewNature: 3,
  conditionNew: 4,
  conditionRenovated: 6,
  conditionWellKept: 2,
  conditionNeedsWork: -10,
  heatingWeak: -6,
  heatingFloor: 2,
  rentDiscountPercent: 3,
};

export const AVM_FACTOR_LABELS = {
  askingDiscountPercent: "İlan pazarlık payı (%)",
  areaElasticity: "Büyüklük etkisi (0-0,3)",
  age0to2: "Bina 0-2 yaş",
  age3to5: "Bina 3-5 yaş",
  age6to10: "Bina 6-10 yaş",
  age11to20: "Bina 11-20 yaş",
  age21to30: "Bina 21-30 yaş",
  age31plus: "Bina 31+ yaş",
  floorBasement: "Bodrum / kot",
  floorGround: "Giriş / zemin kat",
  floorHighEntrance: "Yüksek giriş",
  floorGarden: "Bahçe katı",
  floorTop: "En üst kat",
  noElevatorHigh: "Asansörsüz 3. kat ve üstü",
  parkingClosed: "Kapalı otopark",
  parkingOpen: "Açık otopark",
  inSite: "Site içinde",
  facadeSouth: "Güney cephe",
  facadeNorthOnly: "Sadece kuzey cephe",
  viewSea: "Deniz manzarası",
  viewNature: "Doğa / park manzarası",
  conditionNew: "Durum: yeni / sıfır",
  conditionRenovated: "Durum: yeni tadilatlı",
  conditionWellKept: "Durum: bakımlı",
  conditionNeedsWork: "Durum: tadilat gerekli",
  heatingWeak: "Isıtma: soba / yok",
  heatingFloor: "Isıtma: yerden",
  rentDiscountPercent: "Kira ilanı pazarlık payı (%)",
};

export const CONDITION_OPTIONS = [
  "Yeni / sıfır",
  "Yeni tadilatlı",
  "Bakımlı",
  "Standart",
  "Tadilat gerekli",
];
export const VIEW_OPTIONS = ["Deniz", "Doğa / Park", "Şehir"];

// Bant değerleri bant ortalarına konup aradaki yaşlar doğrusal ara değerlenir:
// basamaklı tabloda 30 yaşla 31 yaş arasında %3 sıçrama oluyordu.
function ageBand(age, f) {
  if (age == null || Number.isNaN(age)) return null;
  const pts = [
    [1, f.age0to2],
    [4, f.age3to5],
    [8, f.age6to10],
    [15, f.age11to20],
    [25, f.age21to30],
    [35, f.age31plus],
  ].map(([x, y]) => [x, Number(y) || 0]);
  if (age <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (age <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return Math.round((y0 + ((y1 - y0) * (age - x0)) / (x1 - x0)) * 10) / 10;
    }
  }
  return pts[pts.length - 1][1];
}

function floorAdjustment(floor, totalFloors, f) {
  const s = String(floor || "").toLocaleLowerCase("tr");
  if (!s) return null;
  if (/bodrum|kot/.test(s)) return { label: "Kat: bodrum / kot", percent: f.floorBasement };
  if (/bahçe/.test(s)) return { label: "Kat: bahçe katı", percent: f.floorGarden };
  if (/yüksek giriş/.test(s)) return { label: "Kat: yüksek giriş", percent: f.floorHighEntrance };
  if (/giriş|zemin/.test(s)) return { label: "Kat: giriş / zemin", percent: f.floorGround };
  if (/çatı/.test(s)) return { label: "Kat: çatı katı", percent: f.floorTop };
  const n = Number(s);
  if (n && totalFloors && n >= Number(totalFloors) && Number(totalFloors) > 1)
    return { label: "Kat: en üst kat", percent: f.floorTop };
  return null;
}

const asList = (v) => (Array.isArray(v) ? v : v ? String(v).split(/,\s*/) : []);

// Konu dairenin tipik daireden farkları - her kalem ayrı, raporda gösterilir.
export function featureAdjustments(subject, region, rawFactors) {
  const f = { ...AVM_FACTOR_DEFAULTS, ...(rawFactors || {}) };
  const d = subject.details || {};
  const adj = [];
  const area = Number(subject.grossM2) || null;
  if (area && region?.medianArea && f.areaElasticity) {
    const p = (Math.pow(area / region.medianArea, -Number(f.areaElasticity)) - 1) * 100;
    const clamped = Math.max(-12, Math.min(12, p));
    if (Math.abs(clamped) >= 0.5)
      adj.push({
        label: `Büyüklük (${area} m², bölgede tipik ${region.medianArea} m²)`,
        percent: Math.round(clamped * 10) / 10,
      });
  }
  const age =
    subject.buildingAge != null && subject.buildingAge !== "" ? Number(subject.buildingAge) : null;
  // Yaş filtreli yapıştırmalardan gelen veri öncelikli; yoksa elle girilen tipik yaş.
  const stats = ageStats(region?.listings);
  const slope = stats.ageSlope ?? region?.fallbackAgeSlope ?? null;
  const typical = stats.typicalAge ?? (region?.typicalAge != null ? Number(region.typicalAge) : 20);
  const typicalLabel = region?.nearAge ? "yakın emsallerde tipik" : "bölgede tipik";
  if (age != null && slope != null && age !== typical) {
    const p = Math.max(-25, Math.min(25, slope * (age - typical)));
    adj.push({
      label: `Bina yaşı (${age}, ${typicalLabel} ${typical}; bölge verisinden yılda %${slope})`,
      percent: Math.round(p * 10) / 10,
    });
  } else {
    const a1 = ageBand(age, f);
    const a0 = ageBand(typical, f);
    if (a1 != null && a0 != null && a1 !== a0)
      adj.push({
        label: `Bina yaşı (${age}, ${typicalLabel} ${typical})`,
        percent: Math.round((a1 - a0) * 10) / 10,
      });
  }
  const fl = floorAdjustment(subject.floor, subject.totalFloors, f);
  if (fl && fl.percent) adj.push(fl);
  const floorNo = Number(subject.floor);
  if (d.elevator === "Yok" && floorNo >= 3)
    adj.push({ label: `Asansörsüz ${floorNo}. kat`, percent: f.noElevatorHigh });
  if (/Kapalı/.test(d.parking || ""))
    adj.push({ label: "Kapalı otopark", percent: f.parkingClosed });
  else if (d.parking === "Açık Otopark")
    adj.push({ label: "Açık otopark", percent: f.parkingOpen });
  if (d.in_site === "Evet") adj.push({ label: "Site içinde", percent: f.inSite });
  const facade = asList(d.facade);
  if (facade.includes("Güney")) adj.push({ label: "Güney cephe", percent: f.facadeSouth });
  else if (facade.length === 1 && facade[0] === "Kuzey")
    adj.push({ label: "Sadece kuzey cephe", percent: f.facadeNorthOnly });
  const view = asList(d.view);
  if (view.includes("Deniz")) adj.push({ label: "Deniz manzarası", percent: f.viewSea });
  else if (view.includes("Doğa / Park"))
    adj.push({ label: "Doğa / park manzarası", percent: f.viewNature });
  const cond = {
    "Yeni / sıfır": f.conditionNew,
    "Yeni tadilatlı": f.conditionRenovated,
    Bakımlı: f.conditionWellKept,
    "Tadilat gerekli": f.conditionNeedsWork,
  }[d.condition];
  if (cond) adj.push({ label: `Durum: ${d.condition.toLocaleLowerCase("tr")}`, percent: cond });
  if (["Soba", "Yok"].includes(d.heating))
    adj.push({ label: `Isıtma: ${d.heating.toLocaleLowerCase("tr")}`, percent: f.heatingWeak });
  else if (d.heating === "Yerden Isıtma")
    adj.push({ label: "Yerden ısıtma", percent: f.heatingFloor });
  return adj.filter((a) => Number(a.percent));
}

const roundTo = (n, step) => Math.round(n / step) * step;

export function estimateValue({
  subject,
  saleRegion,
  rentRegion,
  marketIndex,
  factors,
  extraSpread = 0,
}) {
  const f = { ...AVM_FACTOR_DEFAULTS, ...(factors || {}) };
  // Sonuç sayfası brüt m² gösteriyor; sadece net bilinen dairede brüt ≈ net×1,2
  // (raporda açıkça yazılır).
  const gross =
    Number(subject.grossM2) || (Number(subject.netM2) ? Number(subject.netM2) * 1.2 : 0);
  if (!gross) return { error: "Dairenin m² bilgisini girin." };
  if (!saleRegion) return { error: "Bu mahalle için bölge fiyatı yok - aşağıdan ekleyin." };
  const s = { ...subject, grossM2: Math.round(gross) };
  // Dairenin yaşına yakın yeterli emsal varsa baz fiyat sadece onlardan
  // hesaplanır; yaş düzeltmesi yalnızca kalan küçük farkı kapatır.
  const near = nearAgeListings(saleRegion.listings, subject.buildingAge);
  const nearSummary = near.length >= MIN_NEAR_AGE_LISTINGS ? summarizeListings(near) : null;
  const fullRegion = saleRegion;
  if (nearSummary) {
    saleRegion = {
      ...saleRegion,
      medianM2: nearSummary.medianM2,
      q1M2: nearSummary.q1M2,
      q3M2: nearSummary.q3M2,
      medianArea: nearSummary.medianArea,
      listingCount: nearSummary.listingCount,
      listings: near,
      nearAge: true,
      fallbackAgeSlope: ageStats(fullRegion.listings).ageSlope,
    };
  }
  const ageBasis = {
    subjectAge:
      subject.buildingAge === "" || subject.buildingAge == null
        ? null
        : Number(subject.buildingAge),
    nearCount: near.length,
    enough: !!nearSummary,
    bands: [...new Set(near.map((l) => l.ageBand).filter(Boolean))],
  };
  const idx = indexFactor(marketIndex || [], saleRegion.city || subject.city, saleRegion.asOf);
  const askingUnit = saleRegion.medianM2 * idx.factor;
  const saleUnit = askingUnit * (1 - Number(f.askingDiscountPercent || 0) / 100);
  const adj = featureAdjustments(s, saleRegion, f);
  const total = Math.max(
    -40,
    Math.min(
      40,
      adj.reduce((t, a) => t + a.percent, 0),
    ),
  );
  const unit = saleUnit * (1 + total / 100);
  const mid = roundTo(unit * gross, 10000);
  // Bant, bölgedeki fiyat dağınıklığından gelir; az ilanla daha geniş tutulur.
  const dispersion =
    saleRegion.q1M2 && saleRegion.q3M2
      ? (saleRegion.q3M2 - saleRegion.q1M2) / saleRegion.medianM2
      : 0.2;
  const spread =
    Math.max(0.05, Math.min(0.12, dispersion * 0.35)) +
    (saleRegion.listingCount < 8 ? 0.03 : 0) +
    extraSpread;
  const result = {
    gross,
    grossEstimated: !Number(subject.grossM2),
    region: saleRegion,
    index: idx,
    askingUnit,
    saleUnit,
    unit,
    adjustments: adj,
    totalPercent: total,
    spread,
    extraSpread,
    ageBasis,
    fullRegion,
    lowConfidence: saleRegion.listingCount < 8,
    value: {
      low: roundTo(mid * (1 - spread), 10000),
      mid,
      high: roundTo(mid * (1 + spread), 10000),
    },
    factors: f,
  };
  if (rentRegion) {
    const rIdx = indexFactor(marketIndex || [], rentRegion.city || subject.city, rentRegion.asOf);
    const rentUnit =
      rentRegion.medianM2 * rIdx.factor * (1 - Number(f.rentDiscountPercent || 0) / 100);
    const rentAdj = featureAdjustments(s, rentRegion, f);
    const rentTotal = Math.max(
      -40,
      Math.min(
        40,
        rentAdj.reduce((t, a) => t + a.percent, 0),
      ),
    );
    const rent = roundTo(rentUnit * (1 + rentTotal / 100) * gross, 500);
    result.rent = {
      monthly: rent,
      region: rentRegion,
      paybackYears: rent ? mid / (rent * 12) : null,
    };
  }
  return result;
}

// Ofisin kendi kapanan işlemleri (portföyde "Satıldı/Kiralandı" + gerçekleşen
// fiyat). İlan fiyatı değil gerçek bedel olduğu için bölge verisinden değerli;
// her biri kapanış ayından bugüne TCMB endeksiyle taşınır.
const CLOSED_LOOKBACK_DAYS = 730;

function closedRecords(properties, transactionType, marketIndex) {
  const status = transactionType === "kiralik" ? "kiralandi" : "satildi";
  const cutoff = Date.now() - CLOSED_LOOKBACK_DAYS * 86400000;
  return properties
    .filter((p) => p.status === status && p.transactionType === transactionType)
    .map((p) => {
      const closedPrice = Number(p.details?.closed_price);
      const gross = Number(p.grossM2) || (Number(p.netM2) ? Number(p.netM2) * 1.2 : 0);
      const on = p.details?.closed_on || String(p.createdAt || "").slice(0, 10);
      if (!(closedPrice > 0) || !on || new Date(`${on}T00:00:00`) < cutoff) return null;
      const idx = indexFactor(marketIndex || [], p.city, on);
      return {
        property: p,
        closedPrice,
        closedOn: on,
        listPrice: Number(p.price) || null,
        unit: gross ? closedPrice / gross : null,
        unitToday: gross ? (closedPrice / gross) * idx.factor : null,
      };
    })
    .filter(Boolean);
}

export function closedTransactions(properties, subject, transactionType, marketIndex) {
  const n = normalizePlace(subject.neighborhood);
  if (!n) return { count: 0, items: [] };
  const type = String(subject.propertyType || "Daire").toLocaleLowerCase("tr");
  const items = closedRecords(properties, transactionType, marketIndex).filter(
    (r) =>
      r.unitToday &&
      normalizePlace(r.property.neighborhood) === n &&
      String(r.property.propertyType || "Daire").toLocaleLowerCase("tr") === type,
  );
  const units = items.map((r) => r.unitToday).sort((a, b) => a - b);
  return {
    count: items.length,
    items,
    medianUnitToday: units.length ? percentile(units, 0.5) : null,
  };
}

// Pazarlık payı = ilan fiyatından gerçekleşene iniş. Mahalle şartı yok - ofisin
// genel pazarlık alışkanlığı. Fiyat sonradan gerçekleşene çekilmişse (fark 0)
// veya ilan fiyatı yoksa o kayıt sayılmaz.
export function officeAskingDiscount(properties, transactionType = "satilik") {
  const ds = closedRecords(properties, transactionType, [])
    .filter((r) => r.listPrice && r.closedPrice < r.listPrice * 1.05)
    .map((r) => (1 - r.closedPrice / r.listPrice) * 100)
    .filter((d) => d > 0.1 && d < 40)
    .sort((a, b) => a - b);
  if (ds.length < 3) return { count: ds.length, percent: null };
  return { count: ds.length, percent: Math.round(percentile(ds, 0.5) * 10) / 10 };
}

// Birden fazla arama sayfası aynı kutuya peş peşe yapıştırılabilir (ör. önce
// "26-30 arası", sonra "31 ve üzeri"). Her sayfa kendi bina yaşı filtresiyle
// ayrı okunur, ilanlara kendi aralığının yaşı yazılır.
export function parseSearchPages(raw) {
  const text = String(raw || "").replace(/\r/g, "");
  const re = /"[^"\n]+"\s*\n?\s*aramanızda/g;
  const starts = [];
  let m;
  while ((m = re.exec(text))) starts.push(m.index);
  if (starts.length < 2) return { ...parseSearchResults(text), pages: null };
  const pages = starts.map((st, i) => {
    const chunk = text.slice(st, starts[i + 1] ?? text.length);
    const parsed = parseSearchResults(chunk);
    const band = AGE_BANDS.find((b) => b.label === parsed.ageBand) || null;
    return {
      parsed,
      ageBand: band?.label || null,
      listings: parsed.listings.map((l) => ({
        ...l,
        age: band ? band.age : null,
        ageBand: band ? band.label : null,
      })),
    };
  });
  const first = pages[0].parsed;
  return {
    ...first,
    ageBand: null,
    totalCount: pages.reduce((s, p) => s + (p.parsed.totalCount || 0), 0) || undefined,
    page: null,
    skipped: pages.reduce((s, p) => s + p.parsed.skipped, 0),
    listings: mergeListings(
      [],
      pages.flatMap((p) => p.listings),
    ),
    pages: pages.map((p) => ({
      ageBand: p.ageBand,
      count: p.listings.length,
      neighborhood: p.parsed.neighborhood,
    })),
  };
}

// Sahibinden "Bina Yaşı" filtresinin URL kodu (a812). Kullanıcının gönderdiği
// bağlantılarla doğrulanan: 31 ve üzeri=43904, 26-30 arası=43903. Kodlar
// sahibinden'in liste sırasıyla ardışık; 6-25 arası aynı sıradan çıkarıldı.
// Yanlış çıksa veri bozulmaz - yaş, yapıştırılan sayfadaki filtre yazısından
// okunur; bağlantı yalnızca kolaylık. 0-5 yaşların sırası belirsiz, filtresiz açılır.
export const SAHIBINDEN_AGE_CODES = {
  "31 ve üzeri": "43904",
  "26-30 arası": "43903",
  "21-25 arası": "43902",
  "16-20 arası": "43901",
  "11-15 arası": "43900",
  "6-10 arası": "43899",
};

export function normalizeSahibindenUrl(raw) {
  try {
    const u = new URL(String(raw || "").trim());
    if (!/(^|\.)sahibinden\.com$/.test(u.hostname)) return null;
    u.searchParams.delete("a812");
    u.searchParams.delete("pagingOffset");
    return u.toString();
  } catch {
    return null;
  }
}

export function sahibindenBandUrl(base, bandLabel) {
  const clean = normalizeSahibindenUrl(base);
  if (!clean) return null;
  const code = SAHIBINDEN_AGE_CODES[bandLabel];
  if (!code) return clean;
  const u = new URL(clean);
  u.searchParams.set("a812", code);
  return u.toString();
}

// Daire yaşı için yakın sayılan Sahibinden aralıkları (rapor şartı bunlardan).
export function nearBandsFor(age) {
  const a = age === "" || age == null ? null : Number(age);
  if (a == null || Number.isNaN(a)) return [];
  return AGE_BANDS.filter(
    (b) =>
      b.label !== "0 (Yapım Aşamasında)" &&
      a >= b.lo - NEAR_AGE_YEARS &&
      a <= b.hi + NEAR_AGE_YEARS,
  );
}
