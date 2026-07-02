import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import CustomerPortal from "./CustomerPortal.jsx";
import { PrivacyPolicyPage, KvkkPage, TermsPage } from "./LegalPages.jsx";

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
}

function resolvePage() {
  if (path.startsWith("/portal")) return <CustomerPortal />;
  if (path.startsWith("/gizlilik")) return <PrivacyPolicyPage />;
  if (path.startsWith("/kvkk")) return <KvkkPage />;
  if (path.startsWith("/kullanim-kosullari")) return <TermsPage />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {resolvePage()}
  </React.StrictMode>
);
