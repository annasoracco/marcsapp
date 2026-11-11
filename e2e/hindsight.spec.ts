import { expect, test, type Page } from "@playwright/test";

const heroNumber = (page: Page) => page.locator(".hero-number .sr-only");
const h1 = (page: Page) => page.getByRole("heading", { level: 1 });

async function fresh(page: Page) {
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(h1(page)).toContainText("If you’d put $30,000 into Apple in Oct 2007");
  await expect(heroNumber(page)).toHaveText(/^\$[\d,]+$/);
}

test("first run shows one question, one number, one chart, and the dock", async ({ page }) => {
  await fresh(page);
  await expect(page.locator(".delta")).toContainText(/your money/);
  await expect(page.locator(".story")).toContainText(/The S&P 500 would have made it \$[\d,]+\./);
  await expect(page.locator(".chart svg")).toBeVisible();
  await expect(page.locator(".window")).toContainText(/From the close on Oct 1, 2007 to the close on \w{3} \d{1,2}, 20\d\d/);
  await expect(page.getByRole("slider", { name: "Start date" })).toBeVisible();
  await expect(page.locator(".thumb-label")).toHaveText("Oct 2007");
});

test("dragging the slider updates the number and the date live, then snaps to a month", async ({ page }) => {
  await fresh(page);
  const before = await heroNumber(page).textContent();
  const track = (await page.locator(".track").boundingBox())!;
  const thumb = (await page.locator(".thumb").boundingBox())!;
  await page.mouse.move(thumb.x + 22, thumb.y + 22);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width * 0.82, thumb.y + 22, { steps: 12 });
  // Still dragging: the label over the thumb and the headline already follow the finger.
  await expect
    .poll(async () => {
      const label = await page.locator(".thumb-label").textContent();
      const head = await h1(page).textContent();
      return !!label && head!.includes(`in ${label}`) && label !== "Oct 2007";
    })
    .toBe(true);
  await page.mouse.up();
  await expect(heroNumber(page)).not.toHaveText(before!);
  await expect(h1(page)).not.toContainText("Oct 2007");
  await expect(page.locator(".thumb-label")).toHaveText(/^[A-Z][a-z]{2} \d{4}$/);
});

test("year chips and month nudges move precisely", async ({ page }) => {
  await fresh(page);
  await page.getByRole("button", { name: "2009", exact: true }).click();
  await expect(h1(page)).toContainText("in Oct 2009");
  await page.getByRole("button", { name: "One month later" }).click();
  await expect(h1(page)).toContainText("in Nov 2009");
});

test("scrubbing the chart reads real closes on exact dates", async ({ page }) => {
  await fresh(page);
  const hit = (await page.locator(".ch-hit").boundingBox())!;
  await page.mouse.move(hit.x + hit.width * 0.3, hit.y + hit.height / 2);
  await page.mouse.down();
  await page.mouse.move(hit.x + hit.width * 0.6, hit.y + hit.height / 2, { steps: 5 });
  await expect(page.locator(".chart-readout.is-on .ro-date")).toHaveText(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
  await expect(page.locator(".chart-readout .ro-main")).toContainText(/Apple \$[\d,]+/);
  await page.mouse.up();
});

test("would you have held: guess, then the crash and recovery reveal", async ({ page }) => {
  await fresh(page);
  await page.locator("#held").scrollIntoViewIfNeeded();
  const handle = page.getByRole("slider", { name: "Your guess for the worst drop" });
  await handle.focus();
  await page.keyboard.press("PageDown");
  await page.keyboard.press("PageDown");
  await expect(handle).toHaveAttribute("aria-valuenow", "-50");
  await page.getByRole("button", { name: "Show me how far it fell" }).click();
  await expect(page.locator(".hg-big")).toContainText(/\d+%/);
  await expect(page.locator(".hg-verdict")).toContainText("You guessed \u221250%");
  await expect(page.locator(".hg-body").first()).toContainText(/fell \d+% over .+, from \$[\d,]+ on \w{3} \d{1,2}, \d{4} to \$[\d,]+ on/);
  await expect(page.locator(".hg-body").first()).toContainText(/climb back|hasn’t climbed back/);
});

test("moments start the clock at the first close on or after the day", async ({ page }) => {
  await fresh(page);
  await page.getByRole("button", { name: /Super Bowl LII win/ }).click();
  await expect(h1(page)).toContainText("on Feb 5, 2018");
  await expect(page.locator(".window")).toContainText("Super Bowl LII win: Feb 4, 2018");
});

test("the stock picker finds renamed companies and starts at the IPO", async ({ page }) => {
  await fresh(page);
  await page.getByRole("button", { name: /^Investment,/ }).click();
  await expect(page.getByRole("heading", { name: "Mentioned on Mad Money this week" })).toBeVisible();
  await page.getByRole("searchbox").fill("facebook");
  await page.getByRole("button", { name: /Meta \(Facebook\)/ }).first().click();
  await expect(h1(page)).toContainText("into Meta in May 2012");
  await expect(page.locator(".window")).toContainText("Meta’s first day of trading");
  await expect(page.locator(".window")).toContainText("May 18, 2012");
});

test("share makes the card on the phone and falls back to saving the image", async ({ page }) => {
  await fresh(page);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.locator(".card-preview img")).toBeVisible();
  const size = await page.locator(".card-preview img").evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]);
  expect(size).toEqual([1080, 1920]);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save image" }).click();
  expect((await download).suggestedFilename()).toBe("hindsight-apple-2007.png");
  await expect(page.getByText(/^Saved\./)).toBeVisible();
});

test("reduced motion shows final values immediately", async ({ browser }) => {
  const ctx = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    baseURL: test.info().project.use.baseURL,
  });
  const page = await ctx.newPage();
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const final = await heroNumber(page).textContent();
  await expect(page.locator(".hero-number [aria-hidden]")).toHaveText(final!);
  const dur = await page.locator(".ch-main").evaluate((el) => getComputedStyle(el).animationDuration);
  expect(parseFloat(dur)).toBeLessThanOrEqual(0.001);
  await ctx.close();
});

test("a phone with data from the earlier apps still opens straight into Hindsight", async ({ page }) => {
  await page.goto("./");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("marc-vs-cramer:v1", JSON.stringify({ v: 1, picks: [{ s: "AAPL", side: "bull", at: "2026-10-01" }], owned: ["MSFT"] }));
    localStorage.setItem("marcsapp:v1", JSON.stringify({ accounts: [{ name: "IRA", balance: 123456 }] }));
    localStorage.setItem("birdseye-watchlist", "[\"NVDA\"]");
    localStorage.setItem("hindsight:v1", "{not json");
  });
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("If you’d put $30,000 into Apple in Oct 2007");
  await expect(page.locator(".hero-number .sr-only")).toHaveText(/^\$[\d,]+$/);
  const keys = await page.evaluate(() => Object.keys(localStorage).sort());
  // The two oldest apps stored account details, so they're removed; Marc vs. Cramer picks are left alone.
  expect(keys).toEqual(["hindsight:v1", "marc-vs-cramer:v1"]);
});

test("every tap target is at least 44px", async ({ page }) => {
  await fresh(page);
  const check = async () =>
    page.evaluate(() => {
      const bad: string[] = [];
      const els = document.querySelectorAll<HTMLElement>("button, a[href], [role=slider], label.switch, select, input:not([type=checkbox])");
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(el).visibility === "hidden") continue;
        // Inline sentence tokens extend their hit area with a ::after inset of 9px by 6px.
        const extra = el.classList.contains("token") ? { w: 12, h: 18 } : { w: 0, h: 0 };
        if (r.width + extra.w < 44 || r.height + extra.h < 44)
          bad.push(`${el.tagName}.${el.className} "${el.textContent?.trim().slice(0, 20)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return bad;
    });
  expect(await check()).toEqual([]);
  await page.getByRole("button", { name: /^Investment,/ }).click();
  expect(await check()).toEqual([]);
});
