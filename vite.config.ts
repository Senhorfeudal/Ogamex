import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifestFilename: "site.webmanifest",
      includeAssets: [
        "favicon.ico",
        "favicon.png",
        "favicon-32.png",
        "apple-touch-icon.png",
        "icon.svg",
      ],
      manifest: {
        id: "/",
        name: "Ogamex Pro",
        short_name: "Ogamex Pro",
        description:
          "Estratégia espacial OGame em blocos voxel 3D com minas, pesquisas, hangar, frota e combate tático.",
        theme_color: "#070d18",
        background_color: "#070d18",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        scope: "/",
        lang: "pt-BR",
        categories: ["games", "strategy"],
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest,woff,woff2}"],
        navigateFallbackDenylist: [/^\/api\//, /^\/ws/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ],
  server: {
    host: "0.0.0.0",
    port: 3000,
    hmr: false,
    ws: false,
    allowedHosts: true,
  },
  build: {
    outDir: "dist",
    target: "es2022",
    emptyOutDir: true,
  },
});
