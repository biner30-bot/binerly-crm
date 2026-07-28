import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { CookieConsentBanner } from "./CookieConsent.jsx";

// DSN ayarlanmadığı sürece tamamen no-op — GA/Meta Pixel'deki (analytics.js)
// aynı "env var yoksa hiç yüklenmez" deseni. Pazarlama izleme değil, sadece
// operasyonel hata takibi olduğu için çerez onayına bağlanmadı (localStorage'a
// yazmaz, kullanıcı davranışını izlemez — yalnızca hata/çökme raporlar).
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
if (SENTRY_DSN) {
  import("@sentry/react").then((Sentry) => {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: import.meta.env.PROD ? "production" : "development",
      sendDefaultPii: false,
      tracesSampleRate: 0,
    });
  });
}

// Render sırasında beklenmedik bir hata olursa (önceden hiçbir ErrorBoundary
// yoktu) kullanıcı beyaz/boş bir ekranla baş başa kalıyordu, hiçbir kurtarma
// yolu sunulmuyordu. Artık en azından "Sayfayı Yenile" ile kurtarabiliyor,
// hata da (varsa) Sentry'ye gidiyor.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error(error, info);
    if (SENTRY_DSN) {
      import("@sentry/react").then((Sentry) => Sentry.captureException(error));
    }
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, background: "var(--bg, #f5f8fc)", padding: 24, textAlign: "center" }}>
        <img src="/favicon.svg" alt="" style={{ width: 40, height: 40 }} />
        <div>
          <p style={{ fontWeight: 600, fontSize: 16, margin: "0 0 4px" }}>Beklenmedik bir hata oluştu</p>
          <p style={{ color: "var(--text-muted, #6b7280)", fontSize: 13, margin: 0 }}>Sayfayı yenilemeyi deneyin. Sorun devam ederse bizimle iletişime geçin.</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "var(--fill-accent, #185fa5)", color: "#fff", fontWeight: 500, fontSize: 14, cursor: "pointer" }}
        >
          Sayfayı Yenile
        </button>
      </div>
    );
  }
}

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
  document.title = "Binerly - Müşteri Bilgi Sistemi";
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
    <ErrorBoundary>
      <Suspense fallback={<LoadingScreen />}>
        {resolvePage()}
      </Suspense>
      {!path.startsWith("/panel-4k9x") && !path.startsWith("/onay/") && !path.startsWith("/lead/") && <CookieConsentBanner />}
    </ErrorBoundary>
  </React.StrictMode>
);

// vite-plugin-pwa'nın ürettiği varsayılan registerSW.js sadece
// navigator.serviceWorker.register(...) çağırıyordu — yeni bir sürüm deploy
// edildiğinde indirilen worker "waiting" durumunda takılı kalıyor, kimse ona
// skipWaiting söylemediği için hiç aktifleşmiyordu. Kullanıcılar bu yüzden
// tüm sekmeleri kapatıp yeniden açana kadar (tarayıcının kendi doğal
// devralma anı) eski, önbelleğe alınmış sürümde kalıyordu — deploy ettiğimiz
// düzeltmeler sayfayı yenileseler bile görünmüyordu. Yeni sürüm kurulur
// kurulmaz hemen aktifleştirip sayfayı bir kez yeniliyoruz.
// import.meta.env.PROD: `vite dev`de gerçek bir /sw.js üretilmiyor (sadece
// build çıktısında var) — geliştirirken bu adres index.html'e düşüp
// "unsupported MIME type" konsol hatası veriyordu, sadece prod build'de dener.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registration) => {
      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          // navigator.serviceWorker.controller varsa bu ilk kurulum değil,
          // gerçek bir güncelleme — ilk kurulumda zaten skipWaiting'e gerek yok.
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            newWorker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
    });
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}
