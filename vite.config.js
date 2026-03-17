import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/paw.jpg"],
      manifest: {
        name: "PawTimer — Dog Training",
        short_name: "PawTimer",
        description: "Separation anxiety training tracker for your dog",
        start_url: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#faf6ef",
        theme_color: "#d4813a",
        icons: [
          {
            src: "/icons/paw.jpg?v=20260317c",
            sizes: "2048x2048",
            type: "image/jpeg",
            purpose: "any"
          },
          {
            src: "/icons/paw.jpg?v=20260317c",
            sizes: "2048x2048",
            type: "image/jpeg",
            purpose: "any"
          },
          {
            src: "/icons/paw.jpg?v=20260317c",
            sizes: "2048x2048",
            type: "image/jpeg",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        // Cache app shell + assets for offline use
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            // Cache Google Fonts
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ]
      }
    })
  ]
});
