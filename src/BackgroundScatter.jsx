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

// Homojen "duvar kağıdı" ızgarası: tek boyut, sabit hafif eğim, jitter yok,
// tek satır atlamalı (staggered) - klasik monogram deseni gibi düzgün dağılır.
// Tek satırlar yarım hücre kaydırılır. İkonlar (r*3+c) ile atanır -> her ikon
// düzenli çapraz bantlar halinde tekrarlar.
const COLS = 7;
const ROWS = 6;
const CELLS = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const offset = r % 2 ? (0.5 / COLS) * 100 : 0; // tek satır yarım hücre sağa
    CELLS.push({
      idx: r * COLS + c,
      seq: r * 3 + c,
      left: ((c + 0.5) / COLS) * 100 + offset,
      top: ((r + 0.5) / ROWS) * 100,
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
          className={`ti ${set[it.seq % set.length]}`}
          style={{
            position: "absolute",
            top: `${it.top}%`,
            left: `${it.left}%`,
            fontSize: 42,
            lineHeight: 1,
            color: "#185fa5",
            opacity: 0.09,
            transform: "translate(-50%, -50%) rotate(-8deg)",
          }}
        />
      ))}
    </div>
  );
}
