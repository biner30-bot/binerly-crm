// Herkese açık müşteri sayfalarının (randevu widget'ı, portal, onay/vitrin
// sayfaları) fon deseni: çok soluk mavi, tekrar eden sektöre özgü Tabler
// ikonları. Güzellik salonu müşterisi makas/tırnak/elmas/fırça deseni görür,
// spor merkezi üyesi halter/koşu/yoga; alakasız ikon çıkmaz. Sektör başına
// ~5 ikon dağınık ızgarada sık tekrarlanarak bir desen oluşturur. Sektör
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

// Desende tekrarlanan ikonlar - sektör başına ~5, hepsi o sektörle doğrudan
// alakalı (Tabler webfont'ta var olduğu doğrulandı). Grid ~28 hücre olduğu
// için her ikon ~5-6 kez tekrar eder - hem çeşit hem desen hissi.
const SECTOR_SET = {
  // saç (makas) + manikür/tırnak (yüzük parmağı = tırnak gösterme + elmas =
  // nail art / protez tırnak süsü) + makyaj (fırça) + bakım (kıvılcım)
  guzellik_bakim: ["ti-scissors", "ti-hand-ring-finger", "ti-diamond", "ti-brush", "ti-sparkles"],
  saglik_klinik: ["ti-stethoscope", "ti-heartbeat", "ti-pill", "ti-vaccine", "ti-medical-cross"],
  spor_merkezi: ["ti-barbell", "ti-run", "ti-yoga", "ti-jump-rope", "ti-bottle"],
  otel: ["ti-bed", "ti-key", "ti-luggage", "ti-pool", "ti-coffee"],
  egitim_kurs: ["ti-school", "ti-book", "ti-pencil", "ti-certificate", "ti-backpack"],
  emlak: ["ti-home", "ti-building-estate", "ti-key", "ti-map-2", "ti-ruler-measure"],
  dijital_ajans: [
    "ti-device-desktop-analytics",
    "ti-chart-line",
    "ti-speakerphone",
    "ti-palette",
    "ti-code",
  ],
  uretim_satis: ["ti-truck-delivery", "ti-package", "ti-box", "ti-forklift", "ti-barcode"],
  hizmet_danismanlik: [
    "ti-briefcase",
    "ti-presentation",
    "ti-chart-line",
    "ti-clipboard-list",
    "ti-report-analytics",
  ],
  perakende: ["ti-shopping-bag", "ti-shopping-cart", "ti-tag", "ti-receipt", "ti-barcode"],
  sanayi_esnaf: ["ti-tool", "ti-hammer", "ti-settings", "ti-box", "ti-truck-delivery"],
};

// Sektör yoksa: sadece randevu/iletişim temelleri (bu sayfaların yaptığı iş).
const NEUTRAL_SET = ["ti-calendar-event", "ti-circle-check", "ti-bell", "ti-message-circle"];

// Deterministik "dağınık ızgara": 5x7 hücre, her hücrede sabit jitter +
// rotasyon, birkaç hücre atlanır (düzenli görünmesin). Her render aynı.
const COLS = 5;
const ROWS = 7;
const ITEMS = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    if ((r * 7 + c * 3) % 5 === 2) continue; // düzensizlik için ~%20 hücre boş
    const jx = (((r * 13 + c * 29) % 11) - 5) * 1.1; // -5.5..5.5
    const jy = (((r * 17 + c * 7) % 11) - 5) * 0.9;
    ITEMS.push({
      idx: r * COLS + c,
      left: ((c + 0.5) / COLS) * 100 + jx,
      top: ((r + 0.5) / ROWS) * 100 + jy,
      size: 38 + ((r * 5 + c * 3) % 4) * 10, // 38..68
      rot: (((r + c) % 5) - 2) * 13, // -26..26
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
      {ITEMS.map((it) => (
        <i
          key={it.idx}
          className={`ti ${set[it.idx % set.length]}`}
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
