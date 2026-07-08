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

const path = window.location.pathname;

// Tek bir SPA index.html hem KOBİ ekranını hem /portal'ı sunuyor, ama PWA kurulum
// kısayolunun doğru sayfaya açılması için ikisinin ayrı manifest'i (ayrı start_url/scope)
// olması gerekiyor — vite-plugin-pwa varsayılan olarak sadece "/" için birini enjekte
// ediyor, /portal'daysak onu portale özel olanla değiştiriyoruz.
if (path.startsWith("/portal")) {
  const existing = document.querySelector('link[rel="manifest"]');
  if (existing) existing.href = "/manifest-portal.webmanifest";
  else {
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = "/manifest-portal.webmanifest";
    document.head.appendChild(link);
  }

  // Sekme başlığı/açıklaması varsayılan olarak "KOBİ Satış Takip" diyor — bu, kendi
  // hesabı olmayan, sadece portale bakan bir müşteriye "bu benim için değil" hissi
  // verir. Portalde kendi kimliğiyle (Müşteri Bilgi Sistemi) görünsün.
  document.title = "Binerly — Müşteri Bilgi Sistemi";
  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription) metaDescription.setAttribute("content", "Taleplerinizi ve tekliflerinizi buradan takip edin.");
}

function resolvePage() {
  if (path.startsWith("/portal")) return <CustomerPortal />;
  if (path.startsWith("/gizlilik")) return <PrivacyPolicyPage />;
  if (path.startsWith("/kvkk")) return <KvkkPage />;
  if (path.startsWith("/kullanim-kosullari")) return <TermsPage />;
  // Bilinçli olarak "/admin" gibi tahmin edilebilir bir isim değil — otomatik
  // tarayan botların/meraklıların rastlamasını zorlaştırmak için.
  if (path.startsWith("/panel-4k9x")) return <AdminPage />;
  if (path.startsWith("/onay/")) return <DealApprovalPage />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center", color: "#5b7088" }}>Yükleniyor…</div>}>
      {resolvePage()}
    </Suspense>
    {!path.startsWith("/panel-4k9x") && !path.startsWith("/onay/") && <CookieConsentBanner />}
  </React.StrictMode>
);
