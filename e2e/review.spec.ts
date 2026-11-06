import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

// Review screenshots and a short screen recording, all from real data. Only runs when SHOTS_DIR is set:
//   SHOTS_DIR=/some/folder npx playwright test e2e/review.spec.ts --project=chromium
const DIR = process.env.SHOTS_DIR ?? "";
test.skip(!DIR, "set SHOTS_DIR to write review screenshots");
test.describe.configure({ mode: "serial" });

async function fresh(page: Page) {
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator(".hero-number")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
}

async function dragThumbTo(page: Page, fraction: number, steps = 30) {
  const track = (await page.locator(".track").boundingBox())!;
  const thumb = (await page.locator(".thumb").boundingBox())!;
  await page.mouse.move(thumb.x + 22, thumb.y + 22);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width * fraction, thumb.y + 22, { steps });
  await page.mouse.up();
}

test("screenshots", async ({ page }) => {
  const shot = (name: string) => page.screenshot({ path: path.join(DIR, name) });
  await fresh(page);
  await shot("01-first-run.png");

  await dragThumbTo(page, 0.548);
  await page.waitForTimeout(900);
  await shot("02-after-slider.png");

  await fresh(page);
  await page.locator("#held").evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(300);
  const handle = (await page.locator(".hg-handle").boundingBox())!;
  await page.mouse.move(handle.x + 22, handle.y + 22);
  await page.mouse.down();
  await page.mouse.move(handle.x + 22, handle.y + 70, { steps: 10 });
  await page.mouse.up();
  await shot("03-held-guess.png");
  await page.getByRole("button", { name: "Show me how far it fell" }).click();
  await page.waitForTimeout(2200);
  await page.locator("#held").evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(200);
  await shot("04-held-reveal.png");

  await page.locator("#moments-h").evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(300);
  await shot("05-moments.png");

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: /^Investment,/ }).click();
  await page.waitForTimeout(500);
  await shot("06-stock-picker.png");
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.locator(".card-preview img")).toBeVisible();
  await page.waitForTimeout(400);
  await shot("07-share-sheet.png");
  const b64 = await page.locator(".card-preview img").evaluate((img: HTMLImageElement) => {
    // The app's CSP blocks fetch(blob:), so copy the decoded image through a canvas instead.
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext("2d")!.drawImage(img, 0, 0);
    return c.toDataURL("image/png").split(",")[1];
  });
  (await import("node:fs")).writeFileSync(path.join(DIR, "08-share-card.png"), Buffer.from(b64, "base64"));
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("switch").check({ force: true });
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot("09-todays-dollars.png");
});

test("screen recording", async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    baseURL: test.info().project.use.baseURL,
    recordVideo: { dir: path.join(DIR, "video-tmp"), size: { width: 390, height: 844 } },
  });
  const page = await ctx.newPage();
  await fresh(page);
  await page.waitForTimeout(1200);

  // Drag back through time, then forward, slowly enough to watch the number and chart follow.
  const track = (await page.locator(".track").boundingBox())!;
  const thumb = (await page.locator(".thumb").boundingBox())!;
  const y = thumb.y + 22;
  await page.mouse.move(thumb.x + 22, y);
  await page.mouse.down();
  for (const [to, ms] of [
    [0.3, 2600],
    [0.15, 1800],
    [0.55, 3000],
    [0.548, 400],
  ] as const) {
    const from = (await page.locator(".thumb").boundingBox())!.x + 22;
    const target = track.x + track.width * to;
    const steps = Math.max(10, Math.round(ms / 40));
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(from + ((target - from) * i) / steps, y);
      await page.waitForTimeout(40);
    }
  }
  await page.mouse.up();
  await page.waitForTimeout(1500);

  // Scrub the chart.
  const hit = (await page.locator(".ch-hit").boundingBox())!;
  await page.mouse.move(hit.x + 10, hit.y + hit.height / 2);
  await page.mouse.down();
  for (let i = 0; i <= 30; i++) {
    await page.mouse.move(hit.x + 10 + ((hit.width - 20) * i) / 30, hit.y + hit.height / 2);
    await page.waitForTimeout(45);
  }
  await page.mouse.up();
  await page.waitForTimeout(700);

  // Would you have held?
  await page.locator("#held").evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "start" }));
  await page.waitForTimeout(1200);
  const handle = (await page.locator(".hg-handle").boundingBox())!;
  await page.mouse.move(handle.x + 22, handle.y + 22);
  await page.mouse.down();
  for (let i = 1; i <= 25; i++) {
    await page.mouse.move(handle.x + 22, handle.y + 22 + i * 2.6);
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "Show me how far it fell" }).click();
  await page.waitForTimeout(3600);
  await page.mouse.wheel(0, 260);
  await page.waitForTimeout(2200);

  const video = page.video()!;
  await ctx.close();
  await video.saveAs(path.join(DIR, "hindsight-review.webm"));
});
