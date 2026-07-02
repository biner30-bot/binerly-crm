import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "favicon.ico", "apple-touch-icon-180x180.png"],
      manifest: {
        name: "Binerly — KOBİ Satış Takip Sistemi",
        short_name: "Binerly",
        description: "KOBİ'ler için müşteri ilişkileri, satış ve destek yönetimi.",
        theme_color: "#185fa5",
        background_color: "#f5f8fc",
        display: "standalone",
        start_url: "/",
        scope: "/",
        lang: "tr",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Vite kaynak asset'lerini önbelleğe alır; Supabase/API çağrılarına dokunmaz
        // (uygulama zaten oturum/veri işlemleri için ağ bağlantısı gerektiriyor).
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
});
