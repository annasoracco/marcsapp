// Renders the PWA PNG icons from an inline SVG using headless Chromium (Playwright).
// Run with `npm run icons` after changing the artwork; the PNGs are committed.
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const OUT = fileURLToPath(new URL("../public/icons/", import.meta.url));

// Full-bleed artwork; `pad` shrinks the mark for maskable icons (safe zone is the inner 80%).
const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <rect width="64" height="64" fill="#004c54"/>
  <g transform="translate(${pad} ${pad}) scale(${(64 - 2 * pad) / 64})">
    <path d="M14 46V20l10 13 10-13v26" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M38 42l6-8 4 4 6-10" fill="none" stroke="#a5acaf" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;

const targets = [
  ["icon-192.png", 192, 2],
  ["icon-512.png", 512, 2],
  ["icon-maskable-512.png", 512, 9],
  ["apple-touch-icon.png", 180, 4],
];

const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
for (const [name, size, pad] of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0;background:#004c54">${svg(pad)}</body></html>`);
  await page.screenshot({ path: path.join(OUT, name), omitBackground: false });
  await page.close();
  console.log("wrote", name);
}
await browser.close();
