// Renders the PWA PNG icons and the SVG favicon with headless Chromium (Playwright).
// Run with `npm run icons` after changing the artwork; the generated files are committed.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const OUT = fileURLToPath(new URL("../public/icons/", import.meta.url));
const FONT = fileURLToPath(
  new URL("../node_modules/@fontsource-variable/fraunces/files/fraunces-latin-opsz-normal.woff2", import.meta.url),
);
const GREEN = "#004c54";
const SILVER = "#a5acaf";

const PAPER = "#faf9f6";

// A paper-colored Fraunces "H" on midnight green, underlined in silver like the app's tappable words.
// `pad` shrinks it for maskable icons.
const html = (size, pad) => `<!doctype html><html><head><style>
@font-face { font-family: F; src: url(data:font/woff2;base64,${readFileSync(FONT).toString("base64")}) format("woff2"); font-weight: 100 900; }
html, body { margin: 0; width: ${size}px; height: ${size}px; background: ${GREEN}; }
.mark { position: absolute; inset: ${pad * size}px; display: grid; place-items: center; }
.h { font: 560 ${size * (0.6 - pad * 0.6)}px/1 F; font-variation-settings: "opsz" 144; color: ${PAPER}; transform: translateY(-5%); }
.rule { position: absolute; left: 50%; bottom: ${size * (0.2 + pad * 0.3)}px; width: ${size * (0.36 - pad * 0.3)}px; height: ${Math.max(2, size * 0.032)}px; margin-left: -${size * (0.18 - pad * 0.15)}px; background: ${SILVER}; border-radius: 2px; }
</style></head><body><div class="mark"><span class="h">H</span></div><div class="rule"></div></body></html>`;

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
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${GREEN}"/><text x="32" y="43" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="38" fill="${PAPER}">H</text><rect x="21" y="49" width="22" height="2.5" rx="1.25" fill="${SILVER}"/></svg>\n`,
);
console.log("wrote favicon.svg");
