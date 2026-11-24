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

export async function geocodeArea({ street, neighborhood, district, city }) {
  if (!district && !neighborhood) return null;
  const area = [neighborhood && `${neighborhood} Mahallesi`, district, city, "Türkiye"]
    .filter(Boolean)
    .join(", ");
  if (street && street.trim()) {
    const hit = await nominatim(`${street.trim()}, ${area}`);
    if (hit) return { ...hit, zoom: 17 };
  }
  const hit = await nominatim(area);
  return hit ? { ...hit, zoom: neighborhood ? 15 : 13 } : null;
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
