// Herkese açık müşteri sayfalarının (randevu widget'ı, portal, onay/yasal
// sayfalar) fon süsü: çok soluk mavi, dağınık Tabler ikonları. Tek büyük köşe
// filigranının yerini aldı - hâlâ "çok abartmadan": ikonlar kartın ARKASINDA
// (kart opak), sadece kenar boşluklarında belli belirsiz görünür.
//
// Ayrı, bağımsız bir modül (shared.jsx / Sectors.jsx büyük olduğu için bu
// public sayfalar onları import etmiyor - route bazlı kod bölme). Bu dosya
// bağımlılıksız, ~1KB.

// Sektör id -> Tabler ikonu (src/Sectors.jsx SECTOR_PRESETS[].icon ile AYNI).
// Burada tutuluyor cunku herkese acik sayfalar (widget/vitrin) Sectors.jsx'i
// import etmiyor (route bazli kod bolme).
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

// Elle yerleştirilmiş, deterministik dağılım (her render'da aynı). Merkez
// bandı (kartların olduğu yer) daha seyrek. size px, rot derece, op opaklık.
const LAYOUT = [
  { icon: "ti-calendar-event", top: "7%", left: "6%", size: 66, rot: -12, op: 0.06 },
  { icon: "ti-clock", top: "16%", left: "89%", size: 50, rot: 10, op: 0.05 },
  { icon: "ti-star", top: "5%", left: "58%", size: 34, rot: 0, op: 0.045 },
  { icon: "ti-sparkles", top: "38%", left: "3.5%", size: 44, rot: 4, op: 0.05 },
  { icon: "ti-heart", top: "28%", left: "74%", size: 38, rot: 8, op: 0.04 },
  { icon: "ti-user", top: "50%", left: "95%", size: 40, rot: 6, op: 0.04 },
  { icon: "ti-credit-card", top: "66%", left: "5%", size: 46, rot: -10, op: 0.05 },
  { icon: "ti-circle-check", top: "60%", left: "93%", size: 58, rot: -8, op: 0.055 },
  { icon: "ti-bell", top: "82%", left: "9%", size: 48, rot: 12, op: 0.05 },
  { icon: "ti-message-circle", top: "88%", left: "80%", size: 44, rot: -6, op: 0.045 },
  { icon: "ti-map-pin", top: "93%", left: "44%", size: 38, rot: 0, op: 0.04 },
];

// sectorIcon verilirse sağ üstteki büyük slot o ikonla doldurulur (sayfanın
// "hangi tür işletme" olduğunu hissettirir), yoksa o slot da genel bir ikon olur.
export default function BackgroundScatter({ sectorIcon }) {
  const items = [
    ...LAYOUT,
    { icon: sectorIcon || "ti-checklist", top: "11%", left: "82%", size: 128, rot: -8, op: 0.07 },
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
