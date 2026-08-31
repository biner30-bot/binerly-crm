// Herkese açık müşteri sayfalarının (randevu widget'ı, portal, onay/vitrin
// sayfaları) fon deseni: çok soluk mavi, sayfaya dağıtılmış sektöre özgü
// Tabler ikonları. Güzellik salonu müşterisi makas/tırnak/fırça/parfüm deseni
// görür, spor merkezi üyesi halter/koşu/yoga; alakasız ikon çıkmaz. Sektör
// bilinmeyen sayfalarda (genel portal, /lead, /onay) yalnızca nötr randevu/
// iletişim ikonları kullanılır.
//
// Ayrı, bağımsız modül (shared.jsx / Sectors.jsx büyük olduğu için bu public
// sayfalar onları import etmiyor - route bazlı kod bölme). Bağımlılıksız.

// Sektör id -> ana Tabler ikonu (src/Sectors.jsx SECTOR_PRESETS[].icon ile AYNI).
export const SECTOR_ICON = {
  guzellik_bakim: "ti-scissors",
  saglik_klinik: "ti-stethoscope",
  spor_merkezi: "ti-barbell",
  otel: "ti-bed",
  egitim_kurs: "ti-school",
  emlak: "ti-home",
  dijital_ajans: "ti-device-desktop-analytics",
  uretim_satis: "ti-truck-delivery",
  hizmet_danismanlik: "ti-briefcase",
  perakende: "ti-shopping-cart",
  sanayi_esnaf: "ti-tool",
  genel: "ti-building-store",
};

// Sektöre özgü ikon havuzu - fona bu listeden karışık dağıtılır. Hepsi o
// sektörle doğrudan alakalı (Tabler webfont'ta var olduğu doğrulandı).
const SECTOR_SET = {
  // saç (makas) + manikür/tırnak (hand-ring-finger = tırnak gösterme, diamond
  // = nail art) + makyaj (fırça) + fön (sprey) + parfüm + bakım (kıvılcım,
  // damla, maske) + memnun müşteri (gülümseme)
  guzellik_bakim: [
    "ti-scissors",
    "ti-hand-ring-finger",
    "ti-diamond",
    "ti-brush",
    "ti-spray",
    "ti-perfume",
    "ti-sparkles",
    "ti-droplet",
    "ti-face-mask",
    "ti-mood-smile",
  ],
  saglik_klinik: [
    "ti-stethoscope",
    "ti-heartbeat",
    "ti-pill",
    "ti-vaccine",
    "ti-first-aid-kit",
    "ti-dental",
    "ti-medical-cross",
    "ti-activity-heartbeat",
  ],
  spor_merkezi: [
    "ti-barbell",
    "ti-run",
    "ti-stretching",
    "ti-yoga",
    "ti-bottle",
    "ti-weight",
    "ti-jump-rope",
    "ti-treadmill",
  ],
  otel: [
    "ti-bed",
    "ti-key",
    "ti-luggage",
    "ti-pool",
    "ti-coffee",
    "ti-wifi",
    "ti-door",
    "ti-map-pin",
  ],
  egitim_kurs: [
    "ti-school",
    "ti-book",
    "ti-backpack",
    "ti-pencil",
    "ti-certificate",
    "ti-notebook",
    "ti-abacus",
  ],
  emlak: ["ti-home", "ti-building-estate", "ti-key", "ti-map-2", "ti-ruler-measure", "ti-door"],
  dijital_ajans: [
    "ti-device-desktop-analytics",
    "ti-chart-line",
    "ti-ad",
    "ti-speakerphone",
    "ti-palette",
    "ti-code",
    "ti-report-analytics",
  ],
  uretim_satis: [
    "ti-truck-delivery",
    "ti-package",
    "ti-box",
    "ti-forklift",
    "ti-building-factory",
    "ti-clipboard-list",
    "ti-barcode",
  ],
  hizmet_danismanlik: [
    "ti-briefcase",
    "ti-presentation",
    "ti-report-analytics",
    "ti-chart-line",
    "ti-clipboard-list",
    "ti-calendar-event",
    "ti-bulb",
  ],
  perakende: [
    "ti-shopping-cart",
    "ti-shopping-bag",
    "ti-basket",
    "ti-receipt",
    "ti-tag",
    "ti-barcode",
    "ti-credit-card",
  ],
  sanayi_esnaf: ["ti-tool", "ti-hammer", "ti-settings", "ti-box", "ti-truck-delivery", "ti-bolt"],
};

// Sektör yoksa: sadece randevu/iletişim temelleri (bu sayfaların yaptığı iş).
const NEUTRAL_SET = [
  "ti-calendar-event",
  "ti-circle-check",
  "ti-bell",
  "ti-message-circle",
  "ti-clock",
];

// i -> [0, mod) arası iyi dağılmış deterministik indeks (splitmix benzeri
// tamsayı hash). set[i % len] deseydik dikey şeritler oluşuyordu (kolon başına
// aynı ikon); bu hash her hücreye karışık ikon verir.
function pick(i, mod) {
  let h = ((i + 1) * 2246822519) >>> 0;
  h = ((h ^ (h >>> 13)) * 3266489917) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h % mod;
}

// Deterministik "dağınık ızgara": 6x9 hücre, her hücrede sabit jitter +
// rotasyon, ~%25 hücre atlanır (düzenli görünmesin). Her render aynı.
const COLS = 6;
const ROWS = 9;
const CELLS = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    if (pick(r * COLS + c, 100) < 25) continue; // ~%25 boş
    const jx = (((r * 13 + c * 29) % 13) - 6) * 1.1;
    const jy = (((r * 17 + c * 7) % 13) - 6) * 0.8;
    CELLS.push({
      idx: r * COLS + c,
      left: ((c + 0.5) / COLS) * 100 + jx,
      top: ((r + 0.5) / ROWS) * 100 + jy,
      size: 34 + pick(r * COLS + c + 500, 4) * 11, // 34..67
      rot: (pick(r * COLS + c + 900, 5) - 2) * 13, // -26..26
    });
  }
}

export default function BackgroundScatter({ sector }) {
  const set = SECTOR_SET[sector] || NEUTRAL_SET;
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        // Kartların/içeriğin ARKASINDA kalsın (içeriğe ayrıca zIndex vermeye
        // gerek yok). Sayfa kökü yarı saydam degrade zeminli olduğu için
        // body'nin nokta ızgarasıyla birlikte görünür.
        zIndex: -1,
      }}
    >
      {CELLS.map((it) => (
        <i
          key={it.idx}
          className={`ti ${set[pick(it.idx, set.length)]}`}
          style={{
            position: "absolute",
            top: `${it.top}%`,
            left: `${it.left}%`,
            fontSize: it.size,
            lineHeight: 1,
            color: "#185fa5",
            // Büyük olanlar biraz daha soluk, hepsi görünür ama dikkat dağıtmaz.
            opacity: it.size > 54 ? 0.09 : 0.12,
            transform: `translate(-50%, -50%) rotate(${it.rot}deg)`,
          }}
        />
      ))}
    </div>
  );
}
