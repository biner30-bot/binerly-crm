// Logo yüklerken düz, açık renkli arka planı (beyaz, krem, açık gri, açık bej...)
// şeffaf yapar - her logoya aynı kural, markaya özel ayar yok. Kenarların
// baskın rengi bulunur; kenardan başlayan taşma doldurmayla (flood fill) yalnızca
// kenara BAĞLI ve o renge yakın pikseller silinir - logonun içindeki aynı renkli
// alanlar (harf içleri) korunur.
// Dokunulmayanlar (null döner, orijinal yüklenir): zaten şeffaf logo, kenarı düz
// renk olmayan (fotoğraf/degrade) logo ve KOYU zeminli logo - koyu zemin silinirse
// üzerindeki beyaz yazı açık renkli sayfada kaybolurdu; o zemin logonun parçasıdır.
// Kullanıcı bildirdi: beyaz zeminli logo, açık renkli sayfada kutu gibi duruyordu.
const MAX_SIDE = 1000;
const TOLERANCE = 30; // kanal başına en büyük fark - JPG kirini de zemin sayar
const MIN_BORDER_SHARE = 0.6; // logo kenara değebilir; kenarın çoğu zeminse yeter
const MIN_LIGHTNESS = 200; // sadece açık zeminler silinir

export async function removeLogoBackground(file) {
  if (!file || !/^image\/(png|jpe?g|webp)$/i.test(file.type)) return null;
  let bmp;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    return null;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  const border = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);
  const opaque = border.filter((p) => d[p * 4 + 3] > 200);
  // Kenarın çoğu zaten şeffafsa logo şeffaftır - dokunma.
  if (opaque.length / border.length < MIN_BORDER_SHARE) return null;

  // Baskın kenar rengi: kanal kanal ortanca (logo kenara değse de zemini verir).
  const median = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const bg = [0, 1, 2].map((c) => median(opaque.map((p) => d[p * 4 + c])));
  if (Math.min(...bg) < MIN_LIGHTNESS) return null;
  const diff = (p) => {
    const i = p * 4;
    return Math.max(Math.abs(d[i] - bg[0]), Math.abs(d[i + 1] - bg[1]), Math.abs(d[i + 2] - bg[2]));
  };
  const bgAt = (p) => d[p * 4 + 3] > 200 && diff(p) <= TOLERANCE;
  if (border.filter(bgAt).length / border.length < MIN_BORDER_SHARE) return null;

  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  for (const p of border) {
    if (!seen[p] && bgAt(p)) {
      seen[p] = 1;
      queue[tail++] = p;
    }
  }
  while (head < tail) {
    const p = queue[head++];
    d[p * 4 + 3] = 0;
    const x = p % w;
    const y = (p - x) / w;
    const next = [
      x > 0 ? p - 1 : -1,
      x < w - 1 ? p + 1 : -1,
      y > 0 ? p - w : -1,
      y < h - 1 ? p + w : -1,
    ];
    for (const n of next) {
      if (n >= 0 && !seen[n] && bgAt(n)) {
        seen[n] = 1;
        queue[tail++] = n;
      }
    }
  }
  if (tail === 0) return null;
  // Silinen alana komşu, zemine yakın kenar pikselleri yarı saydam yapılır -
  // yoksa farklı renkli bir sayfada logonun çevresinde zemin renginde hale kalır.
  const SOFT = 90;
  for (let p = 0; p < w * h; p++) {
    if (seen[p]) continue;
    const x = p % w;
    const near = (x > 0 && seen[p - 1]) || (x < w - 1 && seen[p + 1]) || seen[p - w] || seen[p + w];
    if (!near) continue;
    const dist = diff(p);
    if (dist < SOFT) d[p * 4 + 3] = Math.round(d[p * 4 + 3] * (dist / SOFT));
  }
  ctx.putImageData(img, 0, 0);
  return await new Promise((res) => canvas.toBlob(res, "image/png"));
}
