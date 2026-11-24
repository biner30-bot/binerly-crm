import React, { useState } from "react";
import { zipSync } from "fflate";
import { formatTL } from "./shared";
import { buildEmlakListingTexts } from "./Sectors";
import { PROPERTY_DETAIL_FIELDS, propertyAsListingDeal, transactionLabel } from "./realEstate";

// Portala ilan girerken alanları tek tek kopyalamak için hazır liste + sıralı
// fotoğraf ZIP'i. Portala otomatik gönderim YOK (resmi entegrasyon şirket
// kurulunca) - bu, elle girişi dakikalardan saniyelere indiren ara çözüm.

function slugify(s) {
  return (s || "ilan")
    .toLocaleLowerCase("tr")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

// Fotoğraflar WebP saklanıyor; her portalın WebP kabul ettiği garanti değil,
// paket JPEG'e çevrilerek hazırlanır.
async function toJpegBytes(url) {
  const blob = await (await fetch(url)).blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  return new Uint8Array(await jpeg.arrayBuffer());
}

export function ListingPackage({ property: p, photos, getSignedUrls, notify }) {
  const [zipping, setZipping] = useState(null);
  const texts = buildEmlakListingTexts(propertyAsListingDeal(p));

  const detailRows = PROPERTY_DETAIL_FIELDS.filter(
    (d) => !d.only || d.only.includes(p.transactionType),
  )
    .map((d) => {
      const v = p.details?.[d.key];
      if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0))
        return null;
      return [d.label, Array.isArray(v) ? v.join(", ") : String(v)];
    })
    .filter(Boolean);

  const rows = [
    ["İlan başlığı", p.title],
    ["İşlem", transactionLabel(p.transactionType)],
    ["Emlak tipi", p.propertyType],
    ["Fiyat", p.price ? String(Math.round(p.price)) : null, p.price ? formatTL(p.price) : null],
    ["İl / İlçe / Mahalle", [p.city, p.district, p.neighborhood].filter(Boolean).join(" / ")],
    ["m² (Brüt)", p.grossM2 != null ? String(p.grossM2) : null],
    ["m² (Net)", p.netM2 != null ? String(p.netM2) : null],
    ["Oda sayısı", p.roomCount],
    ["Bina yaşı", p.buildingAge != null ? String(p.buildingAge) : null],
    ["Bulunduğu kat", p.floor],
    ["Kat sayısı", p.totalFloors != null ? String(p.totalFloors) : null],
    ...detailRows,
  ].filter(([, v]) => v);

  const description = p.description || texts.sahibinden;

  const copy = (text) => {
    navigator.clipboard?.writeText(text);
    notify("Kopyalandı.", "success");
  };

  const downloadZip = async () => {
    if (photos.length === 0) return;
    setZipping("Hazırlanıyor…");
    try {
      const urls = await getSignedUrls(photos.map((ph) => ph.storagePath));
      const files = {};
      const base = slugify(p.title);
      for (let i = 0; i < photos.length; i++) {
        setZipping(`Fotoğraf ${i + 1}/${photos.length}`);
        const url = urls[photos[i].storagePath];
        if (!url) continue;
        files[`${String(i + 1).padStart(2, "0")}-${base}.jpg`] = [
          await toJpegBytes(url),
          { level: 0 },
        ];
      }
      const zipped = zipSync(files);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([zipped], { type: "application/zip" }));
      a.download = `${base}-fotograflar.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      notify(`Fotoğraflar indirilemedi: ${e.message}`);
    }
    setZipping(null);
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px" }}>
        Portala ilan girerken her alanı yanındaki butonla kopyalayıp yapıştırın. Fotoğraflar
        portföydeki sırayla (kapak 01) numaralanmış JPEG olarak iner.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button
          type="button"
          disabled={!!zipping || photos.length === 0}
          onClick={downloadZip}
          style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}
        >
          <i className="ti ti-download" aria-hidden="true" />{" "}
          {zipping || `Fotoğrafları indir (${photos.length})`}
        </button>
      </div>
      <div
        style={{
          border: "0.5px solid var(--border)",
          borderRadius: 8,
          overflow: "hidden",
          marginBottom: 12,
        }}
      >
        {rows.map(([label, value, display], i) => (
          <div
            key={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              fontSize: 13,
              borderTop: i === 0 ? "none" : "0.5px solid var(--border)",
            }}
          >
            <span style={{ width: 150, flexShrink: 0, color: "var(--text-muted)" }}>{label}</span>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
              {display || value}
            </span>
            <button
              type="button"
              style={{ fontSize: 12, flexShrink: 0 }}
              onClick={() => copy(value)}
              aria-label={`${label} kopyala`}
            >
              <i className="ti ti-copy" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 500 }}>Açıklama</span>
        <button type="button" style={{ fontSize: 12 }} onClick={() => copy(description)}>
          <i className="ti ti-copy" aria-hidden="true" /> Kopyala
        </button>
      </div>
      <textarea
        readOnly
        value={description}
        rows={8}
        style={{ width: "100%", fontSize: 13, resize: "vertical", marginBottom: 12 }}
      />
      {[
        ["Instagram gönderisi", texts.instagram],
        ["WhatsApp mesajı", texts.whatsapp],
      ].map(([label, text]) => (
        <div key={label} style={{ marginBottom: 12 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 6,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
            <button type="button" style={{ fontSize: 12 }} onClick={() => copy(text)}>
              <i className="ti ti-copy" aria-hidden="true" /> Kopyala
            </button>
          </div>
          <textarea
            readOnly
            value={text}
            rows={5}
            style={{ width: "100%", fontSize: 13, resize: "vertical" }}
          />
        </div>
      ))}
      {!p.description && (
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
          Portföyde açıklama yok - yukarıdaki açıklama alanlardan otomatik üretildi. Kendi
          açıklamanızı portföy formuna yazarsanız burada o kullanılır.
        </p>
      )}
    </div>
  );
}
