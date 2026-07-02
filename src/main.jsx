import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import CustomerPortal from "./CustomerPortal.jsx";
import { PrivacyPolicyPage, KvkkPage, TermsPage } from "./LegalPages.jsx";

const path = window.location.pathname;

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
