// Ücretsiz harita yardımcıları (OpenStreetMap). Google'a geçilirse sadece
// buradaki URL'ler değişir.

export const OSM_ATTRIBUTION = "© OpenStreetMap katkıcıları";
export const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const isValidLocation = (loc) =>
  loc && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng));

export const streetViewUrl = ({ lat, lng }) =>
  `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
export const mapsUrl = ({ lat, lng }) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

// Bina ve daire numarası gönderilmez (adres + mal sahibi kişisel veri; bina
// pin'le elle işaretlenir) - sokak adı tek başına kişiyi belirtmez.
// Nominatim kullanım politikası: düşük hacim, sonuçlar önbelleğe alınır.
async function nominatim(q) {
  const cacheKey = `binerly.geo.${q.toLocaleLowerCase("tr")}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {
    // önbellek sadece kolaylık
  }
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=tr&accept-language=tr&q=${encodeURIComponent(q)}`,
    );
    if (!res.ok) return null;
    const [hit] = await res.json();
    const out = hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify(out));
    } catch {
      // önbellek sadece kolaylık
    }
    return out;
  } catch {
    return null;
  }
}

// "518 sk", "518. Sok." -> "518. Sokak" (OSM'deki yazım); "Cad."/"Blv." benzer.
export function normalizeStreet(raw) {
  return String(raw || "")
    .trim()
    .replace(/(?<![\p{L}\d])(\d+)\s*\.?\s*(sokağı|sokak|sok|sk)(?!\p{L})\.?/giu, "$1. Sokak")
    .replace(/(?<!\p{L})(caddesi|cadde|cad|cd)(?!\p{L})\.?/giu, "Caddesi")
    .replace(/(?<!\p{L})(bulvarı|bulvar|bulv|blv)(?!\p{L})\.?/giu, "Bulvarı")
    .replace(/\s+/g, " ");
}

// OSM'deki mahalle sınırları tapudakinden farklı olabiliyor (ör. tapuda Sakarya,
// OSM'de Beyazevler): mahalleyle birlikte aranan sokak hiç bulunmuyor, harita
// yerinden kıpırdamıyordu. Önce tam, sonra mahallesiz, en son alan düzeyinde.
export async function geocodeArea({ street, neighborhood, district, city }) {
  if (!district && !neighborhood) return null;
  const join = (...parts) => [...parts, "Türkiye"].filter(Boolean).join(", ");
  const mah = neighborhood && `${neighborhood} Mahallesi`;
  const st = normalizeStreet(street);
  if (st) {
    const hit =
      (await nominatim(join(st, mah, district, city))) ||
      (district && (await nominatim(join(st, district, city))));
    if (hit) return { ...hit, zoom: 17 };
  }
  const hit =
    (mah && (await nominatim(join(mah, district, city)))) ||
    (district && (await nominatim(join(district, city))));
  return hit ? { ...hit, zoom: mah ? 15 : 13 } : null;
}

// Haritadaki yazarken-öneren arama. Nominatim'in kullanım politikası otomatik
// tamamlamayı yasaklıyor; Photon (komoot, aynı OSM verisi) bunun için yapılmış
// ve ücretsiz - çağıran taraf debounce eder, sonuçlar sekme boyunca önbellekte.
// Photon alanları: name, type, district = mahalle, city = ilçe, state = il.
const TURKEY_BBOX = "25.6,35.8,44.9,42.2";
const PHOTON_ZOOM = { house: 18, street: 17, district: 15, locality: 15, city: 13, county: 12 };

// Öneride tür etiketi: "Peynir Ofisi" ararken "Petrol Ofisi" çıkınca "Akaryakıt"
// yazması danışmanın yanlış yeri seçmesini önler (OSM'de küçük dükkânlar eksik).
const OSM_VALUE_LABELS = {
  apartments: "Apartman",
  residential: "Konut / site",
  house: "Ev",
  commercial: "İş merkezi",
  supermarket: "Market",
  convenience: "Market",
  mall: "AVM",
  bakery: "Fırın",
  butcher: "Kasap",
  greengrocer: "Manav",
  pharmacy: "Eczane",
  fuel: "Akaryakıt",
  school: "Okul",
  kindergarten: "Anaokulu",
  university: "Üniversite",
  place_of_worship: "Cami / ibadethane",
  mosque: "Cami",
  hospital: "Hastane",
  clinic: "Sağlık merkezi",
  doctors: "Sağlık merkezi",
  bank: "Banka",
  restaurant: "Restoran",
  cafe: "Kafe",
  park: "Park",
  bus_station: "Otogar",
  station: "İstasyon",
  marketplace: "Pazar yeri",
  townhall: "Belediye / muhtarlık",
};
// Photon arazi alanlarını (landuse: site, iş merkezi arsası) da "district/locality"
// türüyle döndürüyor - "Folkart Towers Mahallesi" çıkıyordu. Mahalle = place anahtarı.
const isMahalleFeature = (p) =>
  p.osm_key === "place" && ["suburb", "neighbourhood", "quarter", "village"].includes(p.osm_value);
function placeKindLabel(p) {
  if (p.osm_key === "highway") return "Sokak / cadde";
  if (isMahalleFeature(p)) return "Mahalle";
  if (p.osm_key === "place") return "İlçe / şehir";
  if (p.osm_key === "landuse" && p.osm_value === "residential") return "Konut / site";
  if (OSM_VALUE_LABELS[p.osm_value]) return OSM_VALUE_LABELS[p.osm_value];
  if (p.osm_key === "shop") return "Dükkân";
  if (p.osm_key === "building") return "Bina";
  return null;
}

export async function suggestPlaces(text, { bias, district, city } = {}) {
  const q = normalizeStreet(text);
  if (q.length < 3) return [];
  // lang=default: yoksa tarayıcı dili İngilizceyse "Izmir/Istanbul" dönüyor.
  const params = new URLSearchParams({ q, limit: "10", bbox: TURKEY_BBOX, lang: "default" });
  if (isValidLocation(bias)) {
    params.set("lat", String(bias.lat));
    params.set("lon", String(bias.lng));
  }
  const cacheKey = `binerly.photon.${params.toString()}`;
  let features;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) features = JSON.parse(cached);
  } catch {
    // önbellek sadece kolaylık
  }
  if (!features) {
    try {
      const res = await fetch(`https://photon.komoot.io/api/?${params}`);
      if (!res.ok) return [];
      features = (await res.json()).features || [];
    } catch {
      return [];
    }
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify(features));
    } catch {
      // önbellek sadece kolaylık
    }
  }
  const lc = (v) => String(v || "").toLocaleLowerCase("tr");
  const streetQuery = /\b(Sokak|Caddesi|Bulvarı)\b/u.test(q);
  const seen = new Set();
  return features
    .filter((f) => f.properties?.countrycode === "TR")
    .map((f) => {
      const p = f.properties;
      const isMahalle = isMahalleFeature(p);
      const title = isMahalle && !/mahalle/i.test(p.name || "") ? `${p.name} Mahallesi` : p.name;
      const mahalle =
        !isMahalle && p.district
          ? /mah/iu.test(p.district)
            ? p.district
            : `${p.district} Mah.`
          : null;
      const subtitle = [p.street && p.street !== p.name ? p.street : null, mahalle, p.city, p.state]
        .filter((x, i, a) => x && a.indexOf(x) === i)
        .join(", ");
      const [lng, lat] = f.geometry.coordinates;
      // Formda seçili ilçe/il önce gelsin (aynı adlı mahalle başka ilçelerde de var).
      // "1700 sk" yazana önce sokağın kendisi (yoksa sokaktaki eczane öne geçiyordu).
      const rank =
        (district && lc(p.city) === lc(district) ? 0 : 4) +
        (city && lc(p.state) === lc(city) ? 0 : 2) +
        (streetQuery && p.osm_key !== "highway" ? 1 : 0);
      const kind = placeKindLabel(p);
      // Seçilince formun boş alanlarını doldurmak için (mahalle OSM'den - tapudakiyle
      // farklı olabilir, çağıran resmi listeyle doğrular).
      const parts = {
        city: p.state || "",
        district: p.city || "",
        neighborhood: (isMahalle ? p.name : p.district || "").replace(
          /\s*(mahallesi|mah\.?)$/iu,
          "",
        ),
        street: p.osm_key === "highway" ? p.name : p.street || "",
        building: p.osm_key === "building",
      };
      return { title, subtitle, kind, parts, lat, lng, zoom: PHOTON_ZOOM[p.type] || 17, rank };
    })
    .filter((s) => {
      const k = `${s.title}|${s.subtitle}`;
      if (!s.title || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 6);
}

// Rapor için harita görüntüsü. Karolar rapor penceresinden değil uygulama
// sayfasından çekilmeli: OSM, isteğin geldiği siteyi (Referer) göremeyince
// "Access blocked" karosu döner - boş yazdırma penceresinde de böyle oluyor.
// Keskin baskı için bir üst yakınlaştırmanın karoları 2 kat çözünürlükte çizilir.
export async function renderMapImage({ lat, lng }, { width = 340, height = 300, zoom = 17 } = {}) {
  const scale = 2;
  const z = zoom + 1;
  const W = width * scale;
  const H = height * scale;
  const n = 2 ** z;
  const latR = (Number(lat) * Math.PI) / 180;
  const px = ((Number(lng) + 180) / 360) * n * 256;
  const py = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n * 256;
  const left = px - W / 2;
  const top = py - H / 2;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(0, 0, W, H);
  const jobs = [];
  for (let tx = Math.floor(left / 256); tx <= Math.floor((left + W) / 256); tx++) {
    for (let ty = Math.floor(top / 256); ty <= Math.floor((top + H) / 256); ty++) {
      const url = OSM_TILE_URL.replace("{z}", z)
        .replace("{x}", ((tx % n) + n) % n)
        .replace("{y}", ty);
      jobs.push(
        new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            ctx.drawImage(img, Math.round(tx * 256 - left), Math.round(ty * 256 - top));
            resolve();
          };
          img.onerror = reject;
          img.src = url;
        }),
      );
    }
  }
  await Promise.all(jobs);
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 11 * scale * 0.6, 0, Math.PI * 2);
  ctx.fillStyle = "#dc2626";
  ctx.fill();
  ctx.lineWidth = 3 * scale * 0.6;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.font = `${9 * scale}px Arial`;
  const label = OSM_ATTRIBUTION;
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(W - tw - 8 * scale, H - 13 * scale, tw + 8 * scale, 13 * scale);
  ctx.fillStyle = "#374151";
  ctx.fillText(label, W - tw - 4 * scale, H - 3.5 * scale);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export const TKGM_PARSEL_SORGU_URL = "https://parselsorgu.tkgm.gov.tr/";

// Parsel Sorgu / Google Haritalar'dan kopyalanan koordinatı okur:
// "38.4664, 27.0880", "38,4664 27,0880" (Türkçe ondalık) veya
// 38°27'59.0"N 27°05'16.8"E. Okunamazsa null.
export function parseCoordinates(raw) {
  const t = String(raw || "").trim();
  if (!t) return null;
  const dms = [
    ...t.matchAll(
      /(\d{1,3})\s*[°º]\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:[.,]\d+)?)\s*["″]?\s*([NSEWKDGB])?/gi,
    ),
  ];
  if (dms.length >= 2) {
    const toDec = (m) => {
      const v = Number(m[1]) + Number(m[2]) / 60 + Number(m[3].replace(",", ".")) / 3600;
      return /[SWGB]/i.test(m[4] || "") ? -v : v;
    };
    return validLatLng(toDec(dms[0]), toDec(dms[1]));
  }
  // Önce Türkçe "38,4664 27,0880" (virgül ondalık, aralarında boşluk/noktalı virgül)
  // ":" TKGM Parsel Sorgu araç çubuğunun biçimi ("38.3400 : 27.1404").
  const tr = t.match(/^(-?\d{1,2},\d+)\s*[;:\s]\s*(-?\d{1,3},\d+)$/);
  if (tr) return validLatLng(Number(tr[1].replace(",", ".")), Number(tr[2].replace(",", ".")));
  const dec = t.match(/(-?\d{1,2}\.\d+)\s*[,;:\s]\s*(-?\d{1,3}\.\d+)/);
  if (dec) return validLatLng(Number(dec[1]), Number(dec[2]));
  return null;
}

function validLatLng(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  // Türkiye dışı büyük olasılıkla enlem/boylam ters yapıştırılmıştır.
  const inTurkey = (a, b) => a >= 35 && a <= 43 && b >= 25 && b <= 45;
  if (!inTurkey(lat, lng) && inTurkey(lng, lat)) return { lat: lng, lng: lat };
  return { lat, lng, outsideTurkey: !inTurkey(lat, lng) };
}
