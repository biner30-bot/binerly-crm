// Herkese açık müşteri sayfalarının (randevu widget'ı, portal, onay/vitrin
// sayfaları) fon süsü: çok soluk mavi, dağıtılmış Tabler ikonları. Bütün
// ikonlar SEKTÖRE ÖZGÜ - güzellik salonu müşterisi makas/fırça/parfüm görür,
// spor merkezi üyesi halter/koşu görür; alakasız ikon çıkmaz. Sektör
// bilinmeyen sayfalarda (genel portal, /lead, /onay) yalnızca nötr randevu/
// iletişim ikonları (takvim, saat, onay, zil, mesaj) kullanılır.
//
// Ayrı, bağımsız modül (shared.jsx / Sectors.jsx büyük olduğu için bu public
// sayfalar onları import etmiyor - route bazlı kod bölme). Bağımlılıksız, ~2KB.

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

// Sektöre özgü ikon havuzu - dağınık fon bu listeden çekilir. Hepsi o
// sektörle doğrudan alakalı (Tabler webfont'ta var olduğu doğrulandı).
const SECTOR_POOL = {
  guzellik_bakim: [
    "ti-scissors",
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
    "ti-medical-cross",
    "ti-dental",
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
  emlak: ["ti-home", "ti-building-estate", "ti-key", "ti-map-2", "ti-ruler-measure"],
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
  sanayi_esnaf: ["ti-tool", "ti-hammer", "ti-settings", "ti-box", "ti-truck-delivery"],
};

// Sektör yoksa: sadece randevu/iletişim temelleri (bu sayfaların yaptığı iş).
const NEUTRAL_POOL = [
  "ti-calendar-event",
  "ti-clock",
  "ti-circle-check",
  "ti-bell",
  "ti-message-circle",
];

// Elle yerleştirilmiş, deterministik konumlar (her render'da aynı). Merkez
// bandı seyrek. size px, rot derece, op opaklık. icon havuzdan sırayla atanır.
const SLOTS = [
  { top: "7%", left: "6%", size: 66, rot: -12, op: 0.06 },
  { top: "16%", left: "89%", size: 50, rot: 10, op: 0.05 },
  { top: "5%", left: "58%", size: 34, rot: 0, op: 0.045 },
  { top: "38%", left: "3.5%", size: 44, rot: 4, op: 0.05 },
  { top: "28%", left: "74%", size: 40, rot: 8, op: 0.045 },
  { top: "50%", left: "95%", size: 42, rot: 6, op: 0.045 },
  { top: "66%", left: "5%", size: 46, rot: -10, op: 0.05 },
  { top: "60%", left: "93%", size: 58, rot: -8, op: 0.055 },
  { top: "82%", left: "9%", size: 48, rot: 12, op: 0.05 },
  { top: "88%", left: "80%", size: 44, rot: -6, op: 0.045 },
  { top: "93%", left: "44%", size: 38, rot: 0, op: 0.04 },
];

export default function BackgroundScatter({ sector }) {
  const pool = SECTOR_POOL[sector] || NEUTRAL_POOL;
  const bigIcon = SECTOR_ICON[sector] || pool[0];
  const items = [
    ...SLOTS.map((s, i) => ({ ...s, icon: pool[i % pool.length] })),
    // Sağ üstte daha belirgin bir ana ikon - sayfanın "hangi tür işletme"
    // olduğunu hissettirir.
    { icon: bigIcon, top: "11%", left: "82%", size: 128, rot: -8, op: 0.07 },
  ];
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        // Kartların/içeriğin ARKASINDA kalsın (içeriğe ayrıca zIndex vermeye
        // gerek kalmadan). Sayfa kökü genelde yarı saydam degrade zeminli
        // olduğu için body'nin nokta ızgarasıyla birlikte görünür.
        zIndex: -1,
      }}
    >
      {items.map((it, i) => (
        <i
          key={i}
          className={`ti ${it.icon}`}
          style={{
            position: "absolute",
            top: it.top,
            left: it.left,
            fontSize: it.size,
            lineHeight: 1,
            color: "#185fa5",
            opacity: it.op,
            transform: `translate(-50%, -50%) rotate(${it.rot}deg)`,
          }}
        />
      ))}
    </div>
  );
}
