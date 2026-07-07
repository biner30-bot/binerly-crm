import { useState } from "react";
import { Modal } from "./shared";

const CONSENT_KEY = "binerly_cookie_consent";

function readConsent() {
  try {
    return JSON.parse(localStorage.getItem(CONSENT_KEY) || "null");
  } catch {
    return null;
  }
}

function writeConsent(analytics, marketing) {
  localStorage.setItem(CONSENT_KEY, JSON.stringify({ necessary: true, analytics, marketing, decidedAt: new Date().toISOString() }));
}

// Binerly şu an zorunlu (oturum/tema) dışında analitik veya pazarlama çerezi
// KULLANMIYOR — bu banner, ileride bu tür çerezler eklendiğinde (ör. ürün
// analitiği) zaten rıza altyapısının hazır olması için şimdiden kuruluyor.
// Tercihler kaydediliyor ama şu an hiçbir şeyi fiilen açıp kapatmıyor.
export function CookieConsentBanner() {
  const [dismissed, setDismissed] = useState(() => !!readConsent());
  const [showPrefs, setShowPrefs] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  if (dismissed) return null;

  const acceptAll = () => { writeConsent(true, true); setDismissed(true); };
  const rejectAll = () => { writeConsent(false, false); setDismissed(true); };
  const savePrefs = () => { writeConsent(analytics, marketing); setShowPrefs(false); setDismissed(true); };

  return (
    <>
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 3000,
          background: "var(--surface-2)",
          borderTop: "0.5px solid var(--border)",
          boxShadow: "0 -8px 24px rgba(12,37,64,0.12)",
          padding: "1rem",
        }}
      >
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600 }}>Gizliliğinize önem veriyoruz!</p>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Sitenin çalışması için gerekli çerezleri kullanıyoruz. İzin verirseniz deneyimi iyileştirmek için ek çerezler de kullanabiliriz.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setShowPrefs(true)} style={{ background: "none", fontSize: 13 }}>Tercihler</button>
            <button onClick={rejectAll} style={{ fontSize: 13 }}>Hepsini reddet</button>
            <button onClick={acceptAll} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none", fontSize: 13 }}>
              Hepsini kabul et
            </button>
          </div>
        </div>
      </div>

      {showPrefs && (
        <Modal title="Çerez Tercihleri" onClose={() => setShowPrefs(false)}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, marginBottom: 12 }}>
              <span>Zorunlu çerezler <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)" }}>Oturum açma ve tema tercihi için gerekli, kapatılamaz.</span></span>
              <input type="checkbox" checked disabled />
            </label>
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, marginBottom: 12, cursor: "pointer" }}>
              <span>Analitik çerezler <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)" }}>Kullanım istatistikleriyle Binerly'yi iyileştirmemize yardımcı olur.</span></span>
              <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} />
            </label>
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, cursor: "pointer" }}>
              <span>Pazarlama çerezleri <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)" }}>Size uygun kampanya ve içerikleri göstermek için kullanılır.</span></span>
              <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={() => setShowPrefs(false)}>Vazgeç</button>
            <button type="button" onClick={savePrefs} style={{ background: "var(--fill-accent)", color: "var(--on-accent)", border: "none" }}>
              Tercihleri Kaydet
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
