// Herkese açık müşteri sayfalarının (randevu widget'ı, portal, onay/vitrin
// sayfaları) fon deseni: çok soluk mavi, tekrar eden sektöre özgü Tabler
// ikonları. Güzellik salonu müşterisi makas/kıvılcım/fırça deseni görür,
// spor merkezi üyesi halter/koşu/yoga; alakasız ikon çıkmaz. Az sayıda
// (3) ikon sık tekrarlanarak dağınık bir desen oluşturur. Sektör bilinmeyen
// sayfalarda (genel portal, /lead, /onay) yalnızca nötr randevu/iletişim
// ikonları kullanılır.
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

// Desende tekrarlanan ikonlar - sektör başına 3 (en ikonik olanlar). Hepsi o
// sektörle doğrudan alakalı, Tabler webfont'ta var olduğu doğrulandı.
const SECTOR_SET = {
  // saç (makas) + tırnak/el/manikür (parmak) + bakım/parlaklık (kıvılcım)
  guzellik_bakim: ["ti-scissors", "ti-hand-finger", "ti-sparkles"],
  saglik_klinik: ["ti-stethoscope", "ti-heartbeat", "ti-medical-cross"],
  spor_merkezi: ["ti-barbell", "ti-run", "ti-yoga"],
  otel: ["ti-bed", "ti-key", "ti-luggage"],
  egitim_kurs: ["ti-school", "ti-book", "ti-pencil"],
  emlak: ["ti-home", "ti-key", "ti-map-2"],
  dijital_ajans: ["ti-device-desktop-analytics", "ti-chart-line", "ti-speakerphone"],
  uretim_satis: ["ti-truck-delivery", "ti-package", "ti-box"],
  hizmet_danismanlik: ["ti-briefcase", "ti-presentation", "ti-chart-line"],
  perakende: ["ti-shopping-bag", "ti-tag", "ti-receipt"],
  sanayi_esnaf: ["ti-tool", "ti-hammer", "ti-settings"],
};

// Sektör yoksa: sadece randevu/iletişim temelleri (bu sayfaların yaptığı iş).
const NEUTRAL_SET = ["ti-calendar-event", "ti-circle-check", "ti-bell"];

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
      size: 34 + ((r * 5 + c * 3) % 4) * 9, // 34..61
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
            opacity: it.size > 50 ? 0.06 : 0.085,
            transform: `translate(-50%, -50%) rotate(${it.rot}deg)`,
          }}
        />
      ))}
    </div>
  );
}
