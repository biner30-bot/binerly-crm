// Logo yüklerken beyaz arka planı şeffaf yapar: kenarlardan başlayan taşma
// doldurmayla (flood fill) yalnızca kenara BAĞLI beyaz silinir - harflerin
// içindeki beyazlar kalır. Kenarları zaten şeffaf ya da beyaz olmayan logoya
// dokunulmaz (null döner, orijinal dosya yüklenir).
// Kullanıcı bildirdi: beyaz zeminli logo, açık renkli sayfada kutu gibi duruyordu.
const WHITE = 236; // JPG sıkıştırma kirini de beyaz sayacak kadar toleranslı
const MAX_SIDE = 1000;

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
  const whiteAt = (p) => {
    const i = p * 4;
    return d[i + 3] > 200 && d[i] >= WHITE && d[i + 1] >= WHITE && d[i + 2] >= WHITE;
  };
  const border = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);
  const whiteBorder = border.filter(whiteAt).length;
  // Logo kenara değebilir (ör. ikon kenara dayalı) - kenarın çoğu beyazsa zemin beyazdır.
  if (whiteBorder / border.length < 0.6) return null;

  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  for (const p of border) {
    if (!seen[p] && whiteAt(p)) {
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
      if (n >= 0 && !seen[n] && whiteAt(n)) {
        seen[n] = 1;
        queue[tail++] = n;
      }
    }
  }
  // Silinen alana komşu açık renkli kenar pikselleri yarı saydam yapılır -
  // yoksa koyu zeminde logonun çevresinde beyaz bir hale kalır.
  for (let p = 0; p < w * h; p++) {
    if (seen[p]) continue;
    const x = p % w;
    const near = (x > 0 && seen[p - 1]) || (x < w - 1 && seen[p + 1]) || seen[p - w] || seen[p + w];
    if (!near) continue;
    const i = p * 4;
    const light = Math.min(d[i], d[i + 1], d[i + 2]);
    if (light > 180) d[i + 3] = Math.round(d[i + 3] * ((255 - light) / 75));
  }
  ctx.putImageData(img, 0, 0);
  const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
  return blob && tail > 0 ? blob : null;
}
