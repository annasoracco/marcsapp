import { defineConfig, devices } from "@playwright/test";

// Phone-sized end-to-end tests against BASE_URL (the live site) or a local `vite preview` of the build.
const BASE_URL = process.env.BASE_URL ?? "http://localhost:4173/marcsapp/";
const local = !process.env.BASE_URL;
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  retries: local ? 0 : 1,
  reporter: [["list"]],
  use: { baseURL: BASE_URL },
  projects: [
    {
      name: "chromium",
      use: { ...devices["iPhone 13"], ...phone, browserName: "chromium", launchOptions: { args: ["--mute-audio"] } },
    },
    // WebKit is the engine behind Safari; this is emulation, not a real iPhone.
    { name: "webkit", use: { ...devices["iPhone 13"], ...phone, browserName: "webkit" } },
  ],
  webServer: local
    ? { command: "npx vite preview --port 4173 --strictPort", url: "http://localhost:4173/marcsapp/", reuseExistingServer: true, timeout: 60_000 }
    : undefined,
});
