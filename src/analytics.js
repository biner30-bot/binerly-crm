import { useEffect } from "react";

const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;
const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID;

let gaLoaded = false;
let pixelLoaded = false;

function loadGoogleAnalytics() {
  if (gaLoaded || !GA_ID) return;
  gaLoaded = true;
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(script);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID);
}

// Meta'nın resmi Pixel snippet'inin birebir aynısı, sadece değişken isimleri
// projenin kod stiline uyarlandı.
function loadMetaPixel() {
  if (pixelLoaded || !PIXEL_ID) return;
  pixelLoaded = true;
  (function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!f._fbq) f._fbq = n;
    n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
    t = b.createElement(e); t.async = true; t.src = v;
    s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  window.fbq("init", PIXEL_ID);
  window.fbq("track", "PageView");
}

function applyConsent({ analytics, marketing } = {}) {
  if (analytics) loadGoogleAnalytics();
  if (marketing) loadMetaPixel();
}

// Sadece herkese açık sayfalarda (landing page, yasal sayfalar) kullanılır —
// giriş yapılmış KOBİ panelinde veya müşteri portalında hiç render edilmez,
// böylece üçüncü taraf izleme kod olarak bile o ekranlara hiç girmez.
export function TrackingScripts() {
  useEffect(() => {
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem("binerly_cookie_consent") || "null");
    } catch {
      stored = null;
    }
    if (stored) applyConsent(stored);

    const onChange = (e) => applyConsent(e.detail);
    window.addEventListener("binerly-consent-changed", onChange);
    return () => window.removeEventListener("binerly-consent-changed", onChange);
  }, []);
  return null;
}
