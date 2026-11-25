import React, { useState } from "react";
import { LocationFields } from "./LocationFields";
import { PROPERTY_TYPE_OPTIONS, ROOM_COUNT_OPTIONS } from "./realEstate";

// Vitrin "Evim ne kadar eder?" - ev sahibi önce talep bırakır (danışmana aday
// + görev + taslak analiz düşer); bölge verisi güncelse teşekkür ekranında
// tahmini aralık gösterilir (api/_valuation-request.js).

const fieldLabel = { fontSize: 12.5, color: "#5b7088", display: "block", marginBottom: 4 };
const inputStyle = { width: "100%" };
const fmtTL = (n) => `${new Intl.NumberFormat("tr-TR").format(n)} TL`;

export function ValuationRequestForm({ token, companyName, showRange }) {
  const [s, setS] = useState({
    city: "",
    district: "",
    neighborhood: "",
    propertyType: "Daire",
    grossM2: "",
    roomCount: "",
    buildingAge: "",
    floor: "",
    totalFloors: "",
    details: { elevator: "", parking: "", in_site: "", condition: "" },
    address: { street: "", siteName: "" },
  });
  const [contact, setContact] = useState({ name: "", phone: "", email: "", note: "" });
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  const set = (k) => (e) => setS((p) => ({ ...p, [k]: e.target.value }));
  const setD = (k) => (e) =>
    setS((p) => ({ ...p, details: { ...p.details, [k]: e.target.value } }));
  const setC = (k) => (e) => setContact((p) => ({ ...p, [k]: e.target.value }));
  const ready =
    s.district &&
    s.neighborhood.trim() &&
    Number(s.grossM2) > 0 &&
    s.buildingAge !== "" &&
    contact.name.trim() &&
    contact.phone.trim() &&
    contact.email.trim();

  const submit = async (e) => {
    e.preventDefault();
    if (!ready || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/lead-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          action: "valuation-request",
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
          note: contact.note,
          marketingConsent,
          website,
          subject: s,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Gönderilemedi, lütfen tekrar deneyin.");
      } else {
        setDone({ estimate: data.estimate || null });
      }
    } catch {
      setError("Bağlantı hatası, lütfen tekrar deneyin.");
    }
    setSending(false);
  };

  if (done) {
    return (
      <div style={{ textAlign: "center", padding: "8px 4px" }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: "#0c2540", margin: "0 0 8px" }}>
          Talebiniz alındı, teşekkürler!
        </p>
        {done.estimate ? (
          <>
            <p style={{ fontSize: 13, color: "#5b7088", margin: "0 0 6px" }}>
              Bölgedeki güncel ilanlara göre evinizin tahmini değer aralığı:
            </p>
            <p style={{ fontSize: 24, fontWeight: 800, color: "#185fa5", margin: "0 0 8px" }}>
              {fmtTL(done.estimate.low)} - {fmtTL(done.estimate.high)}
            </p>
            <p style={{ fontSize: 12, color: "#9aa8b8", margin: 0 }}>
              Bu otomatik bir ön tahmindir, resmi değerleme raporu değildir. Kesin değer evin
              durumu, cephesi, manzarası gibi özelliklere göre değişir - {companyName} detaylı
              raporunuzu hazırlayıp sizinle iletişime geçecek.
            </p>
          </>
        ) : (
          <p style={{ fontSize: 13, color: "#5b7088", margin: 0 }}>
            {companyName} bölgenizdeki güncel piyasa verileriyle piyasa değeri raporunuzu hazırlayıp
            en kısa sürede sizinle iletişime geçecek.
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
      />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <LocationFields
          value={s}
          onChange={(patch) => setS((p) => ({ ...p, ...patch }))}
          labelStyle={fieldLabel}
          fieldStyle={{ flex: "1 1 160px" }}
        />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ flex: "1 1 120px" }}>
          <label style={fieldLabel}>Tip</label>
          <select value={s.propertyType} onChange={set("propertyType")} style={inputStyle}>
            {PROPERTY_TYPE_OPTIONS.filter((o) => o !== "Arsa").map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: "1 1 100px" }}>
          <label style={fieldLabel}>Brüt m² *</label>
          <input
            type="number"
            min="15"
            value={s.grossM2}
            onChange={set("grossM2")}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: "1 1 100px" }}>
          <label style={fieldLabel}>Oda</label>
          <select value={s.roomCount} onChange={set("roomCount")} style={inputStyle}>
            <option value="">Seçiniz</option>
            {ROOM_COUNT_OPTIONS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: "1 1 100px" }}>
          <label style={fieldLabel}>Bina yaşı *</label>
          <input
            type="number"
            min="0"
            value={s.buildingAge}
            onChange={set("buildingAge")}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: "1 1 100px" }}>
          <label style={fieldLabel}>Bulunduğu kat</label>
          <input value={s.floor} onChange={set("floor")} style={inputStyle} />
        </div>
        <div style={{ flex: "1 1 100px" }}>
          <label style={fieldLabel}>Kat sayısı</label>
          <input
            type="number"
            min="1"
            value={s.totalFloors}
            onChange={set("totalFloors")}
            style={inputStyle}
          />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {[
          [
            "condition",
            "Durum",
            ["Yeni / sıfır", "Yeni tadilatlı", "Bakımlı", "Standart", "Tadilat gerekli"],
          ],
          ["elevator", "Asansör", ["Var", "Yok"]],
          [
            "parking",
            "Otopark",
            ["Yok", "Açık Otopark", "Kapalı Otopark", "Açık & Kapalı Otopark"],
          ],
          ["in_site", "Site içinde", ["Evet", "Hayır"]],
        ].map(([k, label, opts]) => (
          <div key={k} style={{ flex: "1 1 140px" }}>
            <label style={fieldLabel}>{label}</label>
            <select value={s.details[k]} onChange={setD(k)} style={inputStyle}>
              <option value="">Seçiniz</option>
              {opts.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 13, fontWeight: 700, color: "#0c2540", margin: "0 0 8px" }}>
        Sizin bilgileriniz
      </p>
      <p style={{ fontSize: 12.5, color: "#5b7088", margin: "-4px 0 8px" }}>
        Raporunuzu {companyName} hazırlayıp size telefonla ulaşacak.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <input
          value={contact.name}
          onChange={setC("name")}
          placeholder="Ad Soyad *"
          style={{ flex: "1 1 180px" }}
        />
        <input
          type="tel"
          value={contact.phone}
          onChange={setC("phone")}
          placeholder="Telefon *"
          style={{ flex: "1 1 150px" }}
        />
        <input
          type="email"
          value={contact.email}
          onChange={setC("email")}
          placeholder="E-posta *"
          style={{ flex: "1 1 180px" }}
        />
      </div>
      <textarea
        value={contact.note}
        onChange={setC("note")}
        placeholder="Not (opsiyonel) - ör. satmayı düşünüyorum / sadece merak ediyorum"
        style={{ width: "100%", minHeight: 50, resize: "vertical", marginBottom: 10 }}
      />
      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          fontSize: 12.5,
          color: "#5b7088",
          marginBottom: 8,
        }}
      >
        <input
          type="checkbox"
          checked={marketingConsent}
          onChange={(e) => setMarketingConsent(e.target.checked)}
          style={{ marginTop: 2 }}
        />
        Kampanya ve değerlendirme isteği gibi e-postalar almak istiyorum (opsiyonel)
      </label>
      <p style={{ fontSize: 11, color: "#9aa8b8", margin: "0 0 12px" }}>
        Bilgileriniz {companyName} tarafından talebinizin yanıtlanması
        {marketingConsent ? " ve onayladığınız kampanya e-postaları" : ""} amacıyla saklanır ve
        işlenir. Detaylar için{" "}
        <a href="/kvkk" target="_blank" rel="noopener noreferrer" style={{ color: "#185fa5" }}>
          KVKK Aydınlatma Metni
        </a>
        .
      </p>
      {error && <p style={{ color: "#b91c1c", fontSize: 13, margin: "0 0 10px" }}>{error}</p>}
      <button
        type="submit"
        disabled={!ready || sending}
        style={{
          width: "100%",
          background: ready ? "#185fa5" : "#9aa8b8",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "12px",
          fontWeight: 700,
          fontSize: 15,
          cursor: ready ? "pointer" : "default",
        }}
      >
        {sending ? "Gönderiliyor…" : "Ücretsiz raporumu istiyorum"}
      </button>
      {showRange && (
        <p style={{ fontSize: 11.5, color: "#9aa8b8", textAlign: "center", margin: "8px 0 0" }}>
          Bölgenizde güncel veri varsa tahmini değer aralığını hemen görürsünüz.
        </p>
      )}
    </form>
  );
}
