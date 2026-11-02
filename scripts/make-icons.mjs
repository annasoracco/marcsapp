// Renders the PWA PNG icons and the SVG favicon with headless Chromium (Playwright).
// Run with `npm run icons` after changing the artwork; the generated files are committed.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const OUT = fileURLToPath(new URL("../public/icons/", import.meta.url));
const FONT = fileURLToPath(
  new URL("../node_modules/@fontsource-variable/public-sans/files/public-sans-latin-wght-normal.woff2", import.meta.url),
);
const GREEN = "#004c54";
const SILVER = "#a5acaf";

// "vs." in white on midnight green, with a short silver rule. `pad` shrinks it for maskable icons.
const html = (size, pad) => `<!doctype html><html><head><style>
@font-face { font-family: PS; src: url(data:font/woff2;base64,${readFileSync(FONT).toString("base64")}) format("woff2"); font-weight: 100 900; }
html, body { margin: 0; width: ${size}px; height: ${size}px; background: ${GREEN}; }
.mark { position: absolute; inset: ${pad * size}px; display: grid; place-items: center; }
.vs { font: 700 ${size * (0.46 - pad * 0.5)}px/1 PS; color: #fff; letter-spacing: -0.04em; transform: translateY(-4%); }
.rule { position: absolute; left: 50%; bottom: ${size * (0.24 + pad * 0.35)}px; width: ${size * (0.22 - pad * 0.2)}px; height: ${Math.max(2, size * 0.028)}px; margin-left: -${size * (0.11 - pad * 0.1)}px; background: ${SILVER}; border-radius: 2px; }
</style></head><body><div class="mark"><span class="vs">vs.</span></div><div class="rule"></div></body></html>`;

const targets = [
  ["icon-192.png", 192, 0],
  ["icon-512.png", 512, 0],
  ["icon-maskable-512.png", 512, 0.1],
  ["apple-touch-icon.png", 180, 0],
];

const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
for (const [name, size, pad] of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(html(size, pad));
  await page.evaluate(() => globalThis.document.fonts.ready);
  await page.screenshot({ path: path.join(OUT, name) });
  await page.close();
  console.log("wrote", name);
}
await browser.close();

writeFileSync(
  path.join(OUT, "favicon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${GREEN}"/><text x="32" y="38" text-anchor="middle" font-family="'Public Sans', Arial, Helvetica, sans-serif" font-weight="700" font-size="28" letter-spacing="-1" fill="#fff">vs.</text><rect x="25" y="46" width="14" height="2.5" rx="1.25" fill="${SILVER}"/></svg>\n`,
);
console.log("wrote favicon.svg");
