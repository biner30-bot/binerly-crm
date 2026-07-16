import { formatTL, Badge } from "./shared";

// Teklif PDF'i artık tek bir sabit kodlanmış tasarım değil, mutlak konumlu
// bloklardan oluşan bir ŞABLON — bu şema, ileride eklenecek sürükle-bırak
// editörünün (blok taşıma/boyutlandırma) doğrudan üzerine inşa edeceği aynı
// veri yapısı (bkz. proje planı). v1'de sadece iki hazır şablon var, kullanıcı
// tanımlı/kaydedilmiş şablon henüz yok.
//
// Blok tipleri: "rect" (düz renk dikdörtgen, örn. başlık bandı), "line" (ince
// ayraç), "image" (örn. logo — src merge-field içerebilir), "text" (içerik
// merge-field içerebilir), "table" (sabit yapı: tek kalem + ara toplam/KDV/
// genel toplam satırları — v1 bilinçli sınırlaması: çoklu kalem/serbest sütun
// editörü sonraki faz).
//
// v1 bilinçli sınırlaması: canvas yüksekliği sabit, bloklar birbirini itmiyor
// (gerçek "akış" yok) — makul içerik uzunluklarıyla (birkaç satır adres, tek
// kalem) çakışma riski düşük. Otomatik akış, editör fazında ele alınacak.

function fillMergeFields(content, mergeData) {
  if (!content) return "";
  return content.replace(/\{\{(\w+)\}\}/g, (_, key) => mergeData[key] ?? "");
}

export function buildMergeData({ deal, customer, companySettings, netAmount, kdvAmount, kdvRate, noExpiry, validityDays, extraNote, belgeBasligi, noun }) {
  return {
    firma_adi: companySettings?.companyName || "Firma bilgisi eksik",
    firma_adres: companySettings?.address || "",
    firma_telefon: companySettings?.phone || "",
    firma_eposta: companySettings?.email || "",
    firma_iletisim_line: [companySettings?.phone, companySettings?.email].filter(Boolean).join("  ·  "),
    vergi_no_line: companySettings?.taxNumber ? `Vergi no: ${companySettings.taxNumber}` : "",
    logo_url: companySettings?.logoUrl || "",
    musteri_adi: customer?.name || "Bilinmeyen müşteri",
    musteri_telefon: customer?.phone || "",
    musteri_eposta: customer?.email || "",
    belge_basligi: belgeBasligi,
    tarih: new Date().toLocaleDateString("tr-TR"),
    teklif_basligi: deal.title,
    ara_toplam: formatTL(netAmount),
    kdv_orani: String(kdvRate),
    kdv_tutari: formatTL(kdvAmount),
    genel_toplam: formatTL(deal.value),
    gecerlilik_metni: noExpiry ? `Bu ${noun} süresiz geçerlidir.` : `Bu ${noun} ${validityDays || 15} gün geçerlidir.`,
    ek_not: (extraNote || "").trim(),
  };
}

export function renderTemplateBlocks(blocks, mergeData) {
  return blocks.map((b) => {
    if (b.type === "rect") {
      return <div key={b.id} style={{ position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h, background: b.color }} />;
    }
    if (b.type === "line") {
      return <div key={b.id} style={{ position: "absolute", left: b.x, top: b.y, width: b.w, height: 1, background: b.color || "#e1e8f0" }} />;
    }
    if (b.type === "image") {
      const src = fillMergeFields(b.src, mergeData);
      if (!src) return null;
      return <img key={b.id} src={src} alt="" style={{ position: "absolute", left: b.x, top: b.y, maxWidth: b.w, maxHeight: b.h, objectFit: "contain" }} />;
    }
    if (b.type === "table") {
      const accent = b.accentColor || "#0c2540";
      return (
        <table key={b.id} style={{ position: "absolute", left: b.x, top: b.y, width: b.w, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${accent}` }}>
              <th style={{ textAlign: "left", padding: "8px 0", fontSize: 12, textTransform: "uppercase", color: "#0c2540" }}>Açıklama</th>
              <th style={{ textAlign: "right", padding: "8px 0", fontSize: 12, textTransform: "uppercase", color: "#0c2540" }}>Tutar</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid #e1e8f0", background: b.accentColor ? "#f5f8fc" : "transparent" }}>
              <td style={{ padding: "12px 8px 12px 0", fontSize: 14, color: "#0c2540" }}>{mergeData.teklif_basligi}</td>
              <td style={{ padding: "12px 0", fontSize: 14, textAlign: "right", color: "#0c2540" }}>{mergeData.ara_toplam}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td style={{ padding: "6px 0", fontSize: 13, color: "#5b7088" }}>Ara toplam</td>
              <td style={{ padding: "6px 0", fontSize: 13, color: "#5b7088", textAlign: "right" }}>{mergeData.ara_toplam}</td>
            </tr>
            <tr>
              <td style={{ padding: "6px 0", fontSize: 13, color: "#5b7088" }}>KDV (%{mergeData.kdv_orani})</td>
              <td style={{ padding: "6px 0", fontSize: 13, color: "#5b7088", textAlign: "right" }}>{mergeData.kdv_tutari}</td>
            </tr>
            <tr>
              <td style={{ padding: "12px 0 0", fontWeight: 700, fontSize: 15, borderTop: `2px solid ${accent}`, color: accent }}>Genel Toplam</td>
              <td style={{ padding: "12px 0 0", fontWeight: 700, fontSize: 15, textAlign: "right", borderTop: `2px solid ${accent}`, color: accent }}>{mergeData.genel_toplam}</td>
            </tr>
          </tfoot>
        </table>
      );
    }
    const text = fillMergeFields(b.content, mergeData);
    if (!text.trim()) return null;
    return (
      <p
        key={b.id}
        style={{
          position: "absolute", left: b.x, top: b.y, width: b.w, margin: 0,
          fontSize: b.fontSize || 13, fontWeight: b.fontWeight || 400, color: b.color || "#0c2540",
          textAlign: b.align || "left", textTransform: b.textTransform || "none", lineHeight: 1.4,
        }}
      >
        {text}
      </p>
    );
  });
}

export const PDF_TEMPLATES = {
  klasik: {
    label: "Klasik",
    width: 700,
    height: 640,
    blocks: [
      { id: "logo", type: "image", src: "{{logo_url}}", x: 32, y: 64, w: 140, h: 56 },
      { id: "firma_adi", type: "text", content: "{{firma_adi}}", x: 32, y: 126, w: 380, fontSize: 18, fontWeight: 700, color: "#0c2540" },
      // Adres uzun bir Türkçe adreste 2 satıra sarabiliyor — bu yüzden altındaki
      // her blok arasında (tek satır ~18px'e göre) bolca boşluk bırakılıyor.
      { id: "firma_adres", type: "text", content: "{{firma_adres}}", x: 32, y: 150, w: 380, fontSize: 13, color: "#5b7088" },
      { id: "firma_telefon", type: "text", content: "{{firma_telefon}}", x: 32, y: 192, w: 380, fontSize: 13, color: "#5b7088" },
      { id: "firma_eposta", type: "text", content: "{{firma_eposta}}", x: 32, y: 210, w: 380, fontSize: 13, color: "#5b7088" },
      { id: "vergi_no", type: "text", content: "{{vergi_no_line}}", x: 32, y: 228, w: 380, fontSize: 13, color: "#5b7088" },
      { id: "belge_basligi", type: "text", content: "{{belge_basligi}}", x: 420, y: 64, w: 248, fontSize: 22, fontWeight: 700, color: "#0c2540", align: "right" },
      { id: "tarih", type: "text", content: "{{tarih}}", x: 420, y: 96, w: 248, fontSize: 13, color: "#5b7088", align: "right" },
      { id: "musteri_label", type: "text", content: "Müşteri", x: 32, y: 280, w: 380, fontSize: 12, color: "#5b7088", textTransform: "uppercase" },
      { id: "musteri_adi", type: "text", content: "{{musteri_adi}}", x: 32, y: 298, w: 380, fontSize: 15, fontWeight: 600, color: "#0c2540" },
      { id: "musteri_telefon", type: "text", content: "{{musteri_telefon}}", x: 32, y: 320, w: 380, fontSize: 13, color: "#5b7088" },
      { id: "musteri_eposta", type: "text", content: "{{musteri_eposta}}", x: 32, y: 338, w: 380, fontSize: 13, color: "#5b7088" },
      { id: "tablo", type: "table", x: 32, y: 382, w: 636 },
      { id: "gecerlilik", type: "text", content: "{{gecerlilik_metni}}", x: 32, y: 566, w: 550, fontSize: 12, color: "#5b7088" },
      { id: "ek_not", type: "text", content: "{{ek_not}}", x: 32, y: 584, w: 550, fontSize: 12, color: "#5b7088" },
    ],
  },
  modern: {
    label: "Modern",
    width: 700,
    height: 540,
    blocks: [
      { id: "band", type: "rect", x: 0, y: 0, w: 700, h: 110, color: "#185fa5" },
      { id: "logo", type: "image", src: "{{logo_url}}", x: 32, y: 23, w: 64, h: 64 },
      { id: "firma_adi", type: "text", content: "{{firma_adi}}", x: 110, y: 28, w: 300, fontSize: 18, fontWeight: 700, color: "#ffffff" },
      // Bant sadece 110px yüksek — uzun adres sığmayabileceği için burada sadece
      // kısa (tek satırlık) telefon+e-posta gösteriliyor, tam adres aşağıda,
      // sağ sütunda (çok daha fazla boş alanı olan) ayrı bir blokta.
      { id: "firma_iletisim", type: "text", content: "{{firma_iletisim_line}}", x: 110, y: 58, w: 400, fontSize: 12, color: "rgba(255,255,255,0.85)" },
      { id: "belge_basligi", type: "text", content: "{{belge_basligi}}", x: 400, y: 34, w: 268, fontSize: 20, fontWeight: 700, color: "#ffffff", align: "right" },
      { id: "tarih", type: "text", content: "{{tarih}}", x: 400, y: 66, w: 268, fontSize: 13, color: "rgba(255,255,255,0.85)", align: "right" },
      { id: "musteri_kart", type: "rect", x: 32, y: 140, w: 300, h: 110, color: "#f5f8fc" },
      { id: "musteri_label", type: "text", content: "Müşteri", x: 48, y: 152, w: 270, fontSize: 11, color: "#5b7088", textTransform: "uppercase" },
      { id: "musteri_adi", type: "text", content: "{{musteri_adi}}", x: 48, y: 170, w: 270, fontSize: 15, fontWeight: 700, color: "#0c2540" },
      { id: "musteri_telefon", type: "text", content: "{{musteri_telefon}}", x: 48, y: 192, w: 270, fontSize: 12, color: "#5b7088" },
      { id: "musteri_eposta", type: "text", content: "{{musteri_eposta}}", x: 48, y: 208, w: 270, fontSize: 12, color: "#5b7088" },
      // Sağ sütunda adres/vergi no için tabloya kadar ~114px yer var — birkaç
      // satıra sarsa bile rahatça sığar.
      { id: "firma_adres", type: "text", content: "{{firma_adres}}", x: 380, y: 140, w: 288, fontSize: 12, color: "#5b7088", align: "right" },
      { id: "vergi_no", type: "text", content: "{{vergi_no_line}}", x: 380, y: 224, w: 288, fontSize: 12, color: "#5b7088", align: "right" },
      { id: "tablo", type: "table", x: 32, y: 270, w: 636, accentColor: "#185fa5" },
      { id: "gecerlilik", type: "text", content: "{{gecerlilik_metni}}", x: 32, y: 468, w: 550, fontSize: 12, color: "#5b7088" },
      { id: "ek_not", type: "text", content: "{{ek_not}}", x: 32, y: 486, w: 550, fontSize: 12, color: "#5b7088" },
    ],
  },
};

const SAMPLE_MERGE_DATA = buildMergeData({
  deal: { title: "Web Sitesi Yenileme", value: 5000 },
  customer: { name: "Örnek Müşteri", phone: "0555 000 00 00", email: "ornek@musteri.com" },
  companySettings: { companyName: "Örnek A.Ş.", address: "Mevlana Mah. 1700. Sok. No 42/4 Önder Sitesi E Blok, Konyaaltı/Antalya", phone: "0553 062 43 99", email: "info@ornek.com", taxNumber: "1234567890" },
  netAmount: 4166.67,
  kdvAmount: 833.33,
  kdvRate: 20,
  noExpiry: false,
  validityDays: 15,
  extraNote: "",
  belgeBasligi: "TEKLİF",
  noun: "teklif",
});

const GALLERY_SCALE = 0.32;

export function TemplateGallery({ activeKey, onSelect }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {Object.entries(PDF_TEMPLATES).map(([key, tpl]) => (
        <div key={key} style={{ border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{tpl.label}</p>
            {activeKey === key ? (
              <Badge tone="success">Seçili</Badge>
            ) : (
              <button type="button" onClick={() => onSelect(key)} style={{ fontSize: 12, background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>
                Seç
              </button>
            )}
          </div>
          <div style={{ width: tpl.width * GALLERY_SCALE, height: tpl.height * GALLERY_SCALE, overflow: "hidden", position: "relative", background: "#fff", border: "0.5px solid var(--border)", borderRadius: 6 }}>
            <div style={{ width: tpl.width, height: tpl.height, position: "relative", transform: `scale(${GALLERY_SCALE})`, transformOrigin: "top left" }}>
              {renderTemplateBlocks(tpl.blocks, SAMPLE_MERGE_DATA)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
