import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { CookieConsentBanner } from "./CookieConsent.jsx";

// Rota bazlı kod bölme — bir KOBİ kullanıcısı hiç CustomerPortal/Yasal sayfa
// kodunu indirmez ve tam tersi, her ziyaretçi sadece kendi sayfasının bundle'ını çeker.
const App = lazy(() => import("./App.jsx"));
const CustomerPortal = lazy(() => import("./CustomerPortal.jsx"));
const PrivacyPolicyPage = lazy(() => import("./LegalPages.jsx").then((m) => ({ default: m.PrivacyPolicyPage })));
const KvkkPage = lazy(() => import("./LegalPages.jsx").then((m) => ({ default: m.KvkkPage })));
const TermsPage = lazy(() => import("./LegalPages.jsx").then((m) => ({ default: m.TermsPage })));
const AdminPage = lazy(() => import("./AdminPage.jsx"));
const DealApprovalPage = lazy(() => import("./DealApprovalPage.jsx"));
const LeadCapturePage = lazy(() => import("./LeadCapturePage.jsx"));

const path = window.location.pathname;
// Üretimde müşteri portalı artık ayrı bir alt alan adında (portal.binerly.com) sunuluyor —
// aynı Vercel projesine bağlı, ama kendi origin'i olduğu için KOBİ panelinin PWA scope'uyla
// çakışmıyor. binerly.com/portal ise zaten gönderilmiş linkler için hâlâ çalışmaya devam eder.
const isPortalHost = window.location.hostname.split(".")[0] === "portal";
const isPortal = path.startsWith("/portal") || isPortalHost;

// Tek bir SPA index.html hem KOBİ ekranını hem portalı sunuyor, ama PWA kurulum
// kısayolunun doğru sayfaya açılması için ayrı manifest'i (ayrı start_url/scope)
// olması gerekiyor — vite-plugin-pwa varsayılan olarak sadece "/" için birini enjekte
// ediyor, portaldaysak onu portale özel olanla değiştiriyoruz. Alt alan adında scope
// çakışması olmadığından kök ("/") scope'lu ayrı bir manifest kullanılır.
if (isPortal) {
  const existing = document.querySelector('link[rel="manifest"]');
  const manifestHref = isPortalHost ? "/manifest-portal-root.webmanifest" : "/manifest-portal.webmanifest";
  if (existing) existing.href = manifestHref;
  else {
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = manifestHref;
    document.head.appendChild(link);
  }

  // Sekme başlığı/açıklaması varsayılan olarak "KOBİ Satış Takip" diyor — bu, kendi
  // hesabı olmayan, sadece portale bakan bir müşteriye "bu benim için değil" hissi
  // verir. Portalde kendi kimliğiyle (Müşteri Bilgi Sistemi) görünsün.
  document.title = "Binerly — Müşteri Bilgi Sistemi";
  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription) metaDescription.setAttribute("content", "Taleplerinizi ve tekliflerinizi buradan takip edin.");
}

// Sekme uzun süre arka planda kalıp tarayıcı tarafından "discard" edildiğinde
// (özellikle mobilde), sekmeye dönüş App.jsx'i sıfırdan yeniden yüklüyor — bu
// Suspense fallback'i düz "Yükleniyor…" yerine logolu bir yükleme ekranı olsun
// diye ayrı bir bileşen olarak tutuluyor.
function LoadingScreen() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, background: "var(--bg, #f5f8fc)" }}>
      <div style={{ position: "relative", width: 60, height: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "3px solid var(--border, #e1e8f0)",
            borderTopColor: "var(--fill-accent, #185fa5)",
            animation: "app-loading-spin 0.8s linear infinite",
          }}
        />
        <img src="/favicon.svg" alt="" style={{ width: 30, height: 30 }} />
      </div>
    </div>
  );
}

function resolvePage() {
  // Path bazlı özel rotalar (onay/gizlilik/lead vb.) isPortal'dan ÖNCE kontrol
  // edilmeli — isPortal, "portal" alt alan adının TAMAMINI kapsıyor (path'e
  // bakmaksızın). Sıra tersi olsaydı, portal.binerly.com'daki bir müşterinin
  // tıkladığı /onay/{token} (ödeme/onay linki) her zaman portale düşer, ödeme
  // sayfası hiç açılmazdı — müşteri portaldan "Öde"ye bastığında yaşanan hata buydu.
  if (path.startsWith("/gizlilik")) return <PrivacyPolicyPage />;
  if (path.startsWith("/kvkk")) return <KvkkPage />;
  if (path.startsWith("/kullanim-kosullari")) return <TermsPage />;
  // Bilinçli olarak "/admin" gibi tahmin edilebilir bir isim değil — otomatik
  // tarayan botların/meraklıların rastlamasını zorlaştırmak için.
  if (path.startsWith("/panel-4k9x")) return <AdminPage />;
  if (path.startsWith("/onay/")) return <DealApprovalPage />;
  if (path.startsWith("/lead/")) return <LeadCapturePage />;
  if (isPortal) return <CustomerPortal />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Suspense fallback={<LoadingScreen />}>
      {resolvePage()}
    </Suspense>
    {!path.startsWith("/panel-4k9x") && !path.startsWith("/onay/") && !path.startsWith("/lead/") && <CookieConsentBanner />}
  </React.StrictMode>
);
