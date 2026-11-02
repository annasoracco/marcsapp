/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const BASE = "/marcsapp/";

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      includeAssets: ["icons/favicon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        id: BASE,
        name: "Marc vs. Cramer",
        short_name: "Vs. Cramer",
        description: "Pick Bull or Bear on the stocks from Mad Money and keep a season-long record against Jim Cramer. No dollar amounts, ever.",
        start_url: BASE,
        scope: BASE,
        display: "standalone",
        orientation: "portrait",
        background_color: "#ffffff",
        theme_color: "#ffffff",
        categories: ["finance", "sports"],
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest,woff2}"],
        globIgnores: ["**/data/**"],
        navigateFallback: `${BASE}index.html`,
        navigateFallbackDenylist: [/\/data\//],
        runtimeCaching: [
          {
            // Market data: try the network first so prices are fresh, fall back to the last copy offline.
            // A RegExp (not a function) so it survives being serialized into the generated service worker.
            urlPattern: new RegExp(`${BASE}data/`),
            handler: "NetworkFirst",
            options: {
              cacheName: "market-data",
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 14 },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
