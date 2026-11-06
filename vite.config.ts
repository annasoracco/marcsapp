/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const BASE = "/marcsapp/";

// Browser-enforced privacy: the built app may only talk to its own origin. (Dev mode skips this because
// Vite's dev server injects inline scripts.) Inline style attributes stay allowed for computed sizes.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-src 'none'",
].join("; ");

const cspPlugin = (): Plugin => ({
  name: "hindsight-csp",
  apply: "build",
  transformIndexHtml: (html) =>
    html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    cspPlugin(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      includeAssets: ["icons/favicon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        id: BASE,
        name: "Hindsight",
        short_name: "Hindsight",
        description: "If you'd put $30,000 into Apple in 2007, what would you have today? A what-if time machine for money, with real prices.",
        start_url: BASE,
        scope: BASE,
        display: "standalone",
        orientation: "portrait",
        background_color: "#faf9f6",
        theme_color: "#faf9f6",
        categories: ["finance"],
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest,woff2}"],
        // Only the Latin font files are precached; other scripts' subsets load on demand if ever needed.
        globIgnores: ["**/data/**", "**/*-vietnamese-*", "**/*-cyrillic*", "**/*-latin-ext-*"],
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
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
    css: false,
  },
});
