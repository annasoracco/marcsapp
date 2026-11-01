import { defineConfig, devices } from "@playwright/test";

// Smoke tests run against BASE_URL (the live site) or a local `vite preview`.
const BASE_URL = process.env.BASE_URL ?? "http://localhost:4173/marcsapp/";
const local = !process.env.BASE_URL;

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  retries: local ? 0 : 1,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    ...devices["iPhone 13"],
    browserName: "chromium",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    launchOptions: { args: ["--mute-audio"] },
  },
  webServer: local
    ? { command: "npx vite preview --port 4173 --strictPort", url: "http://localhost:4173/marcsapp/", reuseExistingServer: true, timeout: 60_000 }
    : undefined,
});
