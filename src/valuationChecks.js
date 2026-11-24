// Piyasa analizinin isabeti için yönlendirme ve uyarılar. Hesaplamayı
// değiştirmez (aralık genişletme hariç); danışmana neyin eksik/şüpheli
// olduğunu ve fiyata en çok ne kadar etki edebileceğini söyler.
import { AGE_BANDS, AVM_FACTOR_DEFAULTS, ageStats } from "./priceEstimate";

const num = (v) => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v));
const asList = (v) => (Array.isArray(v) ? v : v ? String(v).split(/,\s*/) : []);
const pct = (n) => `%${Math.round(n * 10) / 10}`.replace(".", ",");

// Bölge fiyatının mahallenin tamamını temsil etmesi gerekir - bu filtreler
// ilan kümesini daraltıp m² ortancasını kaydırır.
const BIASING_FILTERS = [
  "Fiyat",
  "m² (Brüt)",
  "m² (Net)",
  "Oda Sayısı",
  "Bulunduğu Kat",
  "Kat Sayısı",
  "Isıtma",
  "Banyo Sayısı",
  "Balkon",
  "Asansör",
  "Otopark",
  "Eşyalı",
  "Kullanım Durumu",
  "Site İçerisinde",
  "Krediye Uygun",
  "Tapu Durumu",
  "Cephe",
];

function selectedFilterSegment(raw) {
  const m = String(raw || "").match(/Seçtiklerimi Gizle([\s\S]*?)Tümünü Temizle/);
  return m ? m[1] : "";
}

export function bandForAge(age) {
  const a = num(age);
  if (a == null) return null;
  if (a <= 0) return AGE_BANDS[0];
  if (a <= 5) return AGE_BANDS.find((b) => b.label === String(a));
  if (a <= 10) return AGE_BANDS.find((b) => b.label === "6-10 arası");
  if (a <= 15) return AGE_BANDS.find((b) => b.label === "11-15 arası");
  if (a <= 20) return AGE_BANDS.find((b) => b.label === "16-20 arası");
  if (a <= 25) return AGE_BANDS.find((b) => b.label === "21-25 arası");
  if (a <= 30) return AGE_BANDS.find((b) => b.label === "26-30 arası");
  return AGE_BANDS.find((b) => b.label === "31 ve üzeri");
}

// Yaş aralıklarını raporlamak için kabaca gruplanmış hali (0-5 tek grup).
const COVERAGE_GROUPS = [
  { label: "0-5", test: (a) => a <= 5 },
  { label: "6-10", test: (a) => a >= 6 && a <= 10 },
  { label: "11-15", test: (a) => a >= 11 && a <= 15 },
  { label: "16-20", test: (a) => a >= 16 && a <= 20 },
  { label: "21-25", test: (a) => a >= 21 && a <= 25 },
  { label: "26-30", test: (a) => a >= 26 && a <= 30 },
  { label: "31+", test: (a) => a >= 31 },
];

export function ageCoverage(listings, subjectAge) {
  const aged = (listings || []).filter((l) => l.age != null);
  const groups = COVERAGE_GROUPS.map((g) => ({
    label: g.label,
    count: aged.filter((l) => g.test(l.age)).length,
  }));
  const a = num(subjectAge);
  const subjectGroup = a == null ? null : COVERAGE_GROUPS.find((g) => g.test(a))?.label;
  return {
    agedCount: aged.length,
    total: (listings || []).length,
    groups,
    subjectGroup,
    subjectGroupCount: subjectGroup ? groups.find((g) => g.label === subjectGroup).count : null,
  };
}

// Yapıştırılan arama sayfası için kontroller.
export function pasteChecks({
  raw,
  parsed,
  subject,
  existing,
  mergedCount,
  ageBandLabel,
  aliasTo,
}) {
  const plain = (x) =>
    String(x || "")
      .toLocaleLowerCase("tr")
      .replace(/\s*(mah\.?|mahallesi|mh\.?)$/, "");
  const out = [];
  const seg = selectedFilterSegment(raw);
  const other = BIASING_FILTERS.filter((f) => seg.includes(f));
  if (other.length)
    out.push({
      tone: "danger",
      text: `Aramada başka filtre de seçili: ${other.join(", ")}. Bölge fiyatı mahalledeki bütün daireleri temsil etmeli - bu filtre ortancayı kaydırır. Sahibinden'de bu filtreyi kaldırıp sadece mahalle (isterseniz + bina yaşı) ile arayın.`,
    });
  const multiPage = !!parsed.pages;
  if (multiPage && parsed.pages.some((pg) => !pg.ageBand))
    out.push({
      tone: "info",
      text: "Yapıştırılan sayfalardan bazılarında bina yaşı filtresi yok - o ilanlar daha önce yaşı öğrenilmişse yaşını korur, yoksa yaşsız sayılır.",
    });
  if (!multiPage && seg.includes("Bina Yaşı") && !parsed.ageBand)
    out.push({
      tone: "warning",
      text: "Birden fazla bina yaşı aralığı seçili görünüyor. Yaş bilgisinin ilanlara doğru işlenmesi için her aralığı ayrı arayıp ayrı yapıştırın; ya da aşağıdan bu sayfanın aralığını elle seçin.",
    });
  if (
    subject?.neighborhood &&
    parsed.neighborhood &&
    !(aliasTo && plain(aliasTo) === plain(parsed.neighborhood)) &&
    subject.neighborhood.toLocaleLowerCase("tr").replace(/\s*(mah\.?|mahallesi|mh\.?)$/, "") !==
      parsed.neighborhood.toLocaleLowerCase("tr").replace(/\s*(mah\.?|mahallesi|mh\.?)$/, "")
  )
    out.push({
      tone: "warning",
      text: `Yapıştırılan arama ${parsed.neighborhood} mahallesi, daire ise ${subject.neighborhood} olarak girili. Doğru mahalleyi yapıştırdığınızdan emin olun.`,
    });
  const read = parsed.listings.length;
  if (parsed.page && parsed.page.current < parsed.page.total) {
    // mevcut uyarı AutoValuation'da gösteriliyor
  } else if (parsed.totalCount && parsed.totalCount > read + 2)
    out.push({
      tone: "warning",
      text: `Bu aramada ${parsed.totalCount} ilan var, sayfadan ${read} tanesi okundu. Sahibinden'de "sayfa başına 50" seçin ya da diğer sayfaları da yapıştırın.`,
    });
  if (existing && mergedCount != null && mergedCount <= existing.listings?.length)
    out.push({
      tone: "info",
      text: "Bu sayfadaki ilanların hepsi zaten kayıtlı - yeni ilan eklenmedi. Farklı bir yaş aralığını veya sonraki sayfayı yapıştırın.",
    });
  if (!multiPage && !ageBandLabel && !seg.includes("Bina Yaşı")) {
    const band = bandForAge(subject?.buildingAge);
    out.push({
      tone: "info",
      text: band
        ? `Bina yaşı filtresi yok. En isabetli sonuç için Sahibinden'de soldaki Bina Yaşı'ndan önce dairenizin aralığını ("${band.label}") seçip yapıştırın, sonra diğer aralıkları da ekleyin.`
        : "Bina yaşı filtresi yok. Daha isabetli sonuç için Sahibinden'de soldaki Bina Yaşı'ndan tek bir aralık seçip her aralığı ayrı yapıştırın - böylece yaşın fiyata etkisi bu mahallenin kendi ilanlarından hesaplanır.",
    });
  }
  return out;
}

const ageSwing = (f) => {
  const v = [f.age0to2, f.age3to5, f.age6to10, f.age11to20, f.age21to30, f.age31plus].map(Number);
  return { min: Math.min(...v), max: Math.max(...v) };
};

// Dairede eksik bilgi + tutarsızlık kontrolleri. "impact" en kötü durumda
// fiyatın ne kadar oynayabileceği (yüzde puan).
export function subjectChecks({ subject, region, result, property, factors }) {
  const f = { ...AVM_FACTOR_DEFAULTS, ...(factors || {}) };
  const d = subject.details || {};
  const missing = [];
  const warnings = [];
  const gross = num(subject.grossM2);
  const net = num(subject.netM2);
  const age = num(subject.buildingAge);
  const floorRaw = String(subject.floor || "").trim();
  const floorNo = num(floorRaw);
  const totalFloors = num(subject.totalFloors);

  if (!gross && !net) missing.push({ key: "grossM2", label: "Brüt m²", impact: null });
  else if (!gross)
    warnings.push({
      tone: "warning",
      text: "Brüt m² girilmedi - net m² × 1,2 varsayıldı. Bölge fiyatı brüt m² üzerinden olduğu için brüt m²'yi tapudan/ilandan girin.",
    });
  if (age == null) {
    const stats = ageStats(region?.listings);
    const typical = stats.typicalAge ?? region?.typicalAge;
    const s = ageSwing(f);
    missing.push({
      key: "buildingAge",
      label: "Bina yaşı",
      impact: Math.max(Math.abs(s.min), Math.abs(s.max)),
      note:
        typical != null
          ? `bölgedeki tipik yaşta (${typical}) kabul edildi`
          : "bölgedeki tipik daire yaşında kabul edildi",
    });
  }
  if (!floorRaw)
    missing.push({
      key: "floor",
      label: "Bulunduğu kat",
      impact: Math.abs(f.floorBasement),
      note: "ara kat kabul edildi",
    });
  if (!totalFloors)
    missing.push({
      key: "totalFloors",
      label: "Kat sayısı",
      impact: Math.abs(f.floorTop),
      note: "en üst kat olup olmadığı bilinmiyor",
    });
  if (!d.elevator)
    missing.push({
      key: "elevator",
      label: "Asansör",
      impact: Math.abs(f.noElevatorHigh),
      note: "var kabul edildi",
    });
  if (!d.parking)
    missing.push({ key: "parking", label: "Otopark", impact: Math.abs(f.parkingClosed) });
  if (!d.in_site)
    missing.push({ key: "in_site", label: "Site içinde", impact: Math.abs(f.inSite) });
  if (!d.condition)
    missing.push({
      key: "condition",
      label: "Durum (tadilat)",
      impact: Math.max(Math.abs(f.conditionNeedsWork), Math.abs(f.conditionRenovated)),
      note: "standart kabul edildi",
    });
  if (!asList(d.facade).length)
    missing.push({
      key: "facade",
      label: "Cephe",
      impact: Math.max(Math.abs(f.facadeSouth), Math.abs(f.facadeNorthOnly)),
    });
  if (!asList(d.view).length)
    missing.push({
      key: "view",
      label: "Manzara",
      impact: Math.abs(f.viewSea),
      note: 'özel manzara yok kabul edildi - yoksa "Şehir" seçin',
    });
  if (!d.heating)
    missing.push({ key: "heating", label: "Isıtma", impact: Math.abs(f.heatingWeak) });

  if (gross && net && net > gross)
    warnings.push({
      tone: "danger",
      text: "Net m² brüt m²'den büyük girilmiş - yer değiştirmiş olabilir.",
    });
  else if (gross && net && gross / net > 1.45)
    warnings.push({
      tone: "warning",
      text: `Brüt m² net m²'nin ${(gross / net).toFixed(2).replace(".", ",")} katı - genelde 1,1-1,3 arasıdır. Değerleri kontrol edin.`,
    });
  if (floorNo != null && totalFloors && floorNo > totalFloors)
    warnings.push({
      tone: "danger",
      text: `Bulunduğu kat (${floorNo}) bina kat sayısından (${totalFloors}) büyük.`,
    });
  if (age != null && (age < 0 || age > 100))
    warnings.push({ tone: "danger", text: `Bina yaşı ${age} olamaz - kontrol edin.` });
  const rooms = String(subject.roomCount || "").match(/^(\d+(?:\.5)?)\s*\+\s*(\d+)/);
  const area = gross || (net ? net * 1.2 : null);
  if (rooms && area) {
    const count = Number(rooms[1]) + Number(rooms[2]);
    const perRoom = area / count;
    if (perRoom < 15 || perRoom > 90)
      warnings.push({
        tone: "warning",
        text: `${subject.roomCount} bir daire için ${Math.round(area)} m² alışılmadık - m² veya oda sayısını kontrol edin.`,
      });
  }
  if (age != null && age >= 25 && d.condition === "Yeni / sıfır")
    warnings.push({
      tone: "warning",
      text: `${age} yaşındaki binada daire "Yeni / sıfır" seçili - yenilendiyse "Yeni tadilatlı" daha doğru.`,
    });
  if (age != null && age <= 2 && d.condition === "Tadilat gerekli")
    warnings.push({
      tone: "warning",
      text: `${age} yaşındaki binada "Tadilat gerekli" seçili - kontrol edin.`,
    });
  if (d.elevator === "Var" && totalFloors && totalFloors <= 2)
    warnings.push({ tone: "info", text: "2 katlı binada asansör var seçili - doğru mu?" });

  // Bölge verisinin kapsamadığı daire: düzeltme dışarıdan tahmin edilir.
  const listings = (region?.listings || []).filter((l) => l.m2);
  if (area && listings.length >= 5) {
    const m2s = listings.map((l) => l.m2).sort((a, b) => a - b);
    const lo = m2s[Math.floor(m2s.length * 0.05)];
    const hi = m2s[Math.ceil(m2s.length * 0.95) - 1];
    if (area < lo * 0.85 || area > hi * 1.15)
      warnings.push({
        tone: "warning",
        text: `Bölgedeki ilanlar çoğunlukla ${lo}-${hi} m²; daire ${Math.round(area)} m². Bu büyüklükte daire az olduğu için tahmin daha belirsiz - sonucu benzer büyüklükteki satışlarla karşılaştırın.`,
      });
  }
  const aged = listings.filter((l) => l.age != null);
  if (age != null && aged.length >= 5) {
    const ages = aged.map((l) => l.age);
    if (age < Math.min(...ages) - 3 || age > Math.max(...ages) + 3)
      warnings.push({
        tone: "warning",
        text: `Yaşı bilinen ilanlar ${Math.min(...ages) === Math.max(...ages) ? `${Math.min(...ages)} yaşında` : `${Math.min(...ages)}-${Math.max(...ages)} yaş arasında`}, bina ${age} yaşında - yaş etkisi bu aralığın dışına taşınarak tahmin ediliyor. Dairenin yaş aralığını Bina Yaşı filtresiyle yapıştırın.`,
      });
  }
  if (result && !result.error && Math.abs(result.totalPercent) >= 25)
    warnings.push({
      tone: "warning",
      text: `Özellik düzeltmeleri toplamı ${result.totalPercent > 0 ? "+" : ""}${pct(result.totalPercent)} - daire bölgedeki tipik daireden çok farklı. Sonucu gerçekleşen satışlar veya detaylı emsal incelemesiyle doğrulayın.`,
    });
  if (
    result &&
    !result.error &&
    property?.transactionType === "satilik" &&
    Number(property.price) > 0
  ) {
    const diff = (Number(property.price) / result.value.mid - 1) * 100;
    if (Math.abs(diff) >= 10)
      warnings.push({
        tone: diff > 0 ? "warning" : "info",
        text:
          diff > 0
            ? `Portföy fiyatı piyasa değerinin ${pct(diff)} üstünde - satış süresi uzayabilir; mal sahibiyle bu raporu paylaşabilirsiniz.`
            : `Portföy fiyatı piyasa değerinin ${pct(-diff)} altında - mal sahibi değerin altında satıyor olabilir, kontrol edin.`,
      });
  }

  const critical = missing.filter((m) => ["buildingAge", "floor", "condition"].includes(m.key));
  return {
    missing,
    warnings,
    filled: 11 - missing.length,
    total: 11,
    maxImpact: missing.reduce((s, m) => s + (m.impact || 0), 0),
    // Kritik bilgi eksikse aralık genişler - bilinmeyeni dar bir aralıkla gizlemeyelim.
    extraSpread: Math.min(0.04, critical.length * 0.015),
  };
}
