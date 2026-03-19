import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["icons/app-logo.png"],
      manifest: {
        name: "PawTimer — Dog Training",
        short_name: "PawTimer",
        description: "Separation anxiety training tracker for your dog",
        id: "/",
        scope: "/",
        start_url: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#F7F2E7",
        theme_color: "#067B78",
        icons: [
          {
            src: "/icons/app-logo.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/icons/app-logo.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/icons/app-logo.png",
            sizes: "1024x1024",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      }
    })
  ]
});
