import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Optional: set SCREENSHOT_DIR to save phone screenshots of each screen.
const SHOTS = process.env.SCREENSHOT_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

async function shot(page: Page, name: string, height = 844) {
  if (!SHOTS) return;
  await page.evaluate(() => window.scrollTo(0, 0));
  // Tall shots are scrolling captures at the same 390px phone width. Fixed and sticky bars would
  // otherwise be painted mid-image, so they're hidden just for the capture.
  const style =
    height > 844 ? await page.addStyleTag({ content: ".tabs{display:none!important}.sticky,.top{position:static!important}" }) : null;
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: height > 844, clip: { x: 0, y: 0, width: 390, height } });
  if (style) await style.evaluate((el) => (el as Element).remove());
}

test("onboarding with sample accounts, then every tab renders with real numbers", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await page.getByRole("button", { name: "Explore with sample accounts" }).click();

  // Calls: back-dated sample calls get returns versus the S&P 500.
  await expect(page.getByRole("heading", { name: "Cramer Call Tracker" })).toBeVisible();
  await expect(page.getByText("Hit rate")).toBeVisible();
  await expect(page.locator(".call .outcome dl").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Cramer (right|wrong)/).first()).toBeVisible();
  await page.getByRole("button", { name: "Got it" }).click();
  await shot(page, "cramer-tracker.png", 1900);

  // X-ray
  await page.getByRole("link", { name: "X-ray" }).click();
  await expect(page.getByRole("heading", { name: "Combined allocation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "True exposure (look-through)" })).toBeVisible();
  await shot(page, "xray.png", 2000);

  // Today
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sector heat map" })).toBeVisible();
  await expect(page.locator(".heat li")).toHaveCount(11);
  await shot(page, "today.png", 1500);

  // Earnings
  await page.getByRole("link", { name: "Earnings" }).click();
  await expect(page.getByRole("heading", { name: "Earnings radar" })).toBeVisible();
  await shot(page, "earnings.png", 1200);

  // No dollar amounts on the portfolio screens, and nothing wider than the phone.
  for (const tab of ["Calls", "X-ray", "Today", "Earnings"]) {
    await page.getByRole("link", { name: tab, exact: true }).click();
    await page.waitForTimeout(500);
    const text = await page.locator("main").innerText();
    expect(text, tab).not.toMatch(/\$\s?\d/);
    const overflow = await page.evaluate(() => {
      const wide = [...document.querySelectorAll("main *")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1);
      return wide.slice(0, 3).map((el) => `${el.tagName}.${el.className}`);
    });
    expect(overflow, `${tab} overflows horizontally`).toEqual([]);
    const overlaps = await page.evaluate(() => {
      const bad: string[] = [];
      for (const row of document.querySelectorAll("main .row-link")) {
        const kids = [...row.children].map((k) => k.getBoundingClientRect()).filter((r) => r.width > 0);
        for (let i = 1; i < kids.length; i++) {
          const a = kids[i - 1];
          const b = kids[i];
          if (Math.abs(a.top - b.top) < 4 && b.left < a.right - 1) bad.push(row.textContent ?? "");
        }
      }
      return bad.slice(0, 3);
    });
    expect(overlaps, `${tab} has overlapping text`).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test("ticker detail, account editor, and More screen work", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Explore with sample accounts" }).click();
  await page.goto("./#/t/AAPL");
  await expect(page.getByRole("heading", { name: /AAPL/, level: 1 })).toBeVisible();
  await expect(page.getByText("1 year")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".chart svg")).toBeVisible();
  await expect(page.getByText(/In your portfolio/)).toBeVisible();
  await shot(page, "ticker.png", 1500);

  await page.goto("./#/xray");
  await page.getByRole("link", { name: "Edit Sample Brokerage" }).click();
  await expect(page.getByRole("heading", { name: "Edit account" })).toBeVisible();
  await shot(page, "account-edit.png", 1400);

  await page.getByRole("link", { name: "More" }).click();
  await expect(page.getByRole("heading", { name: "Backup and move phones" })).toBeVisible();
  await expect(page.getByText(/Not financial advice/).first()).toBeVisible();
  await shot(page, "more.png", 1600);
});

test("logging a back-dated call computes a return versus SPY", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Start fresh" }).click();
  // With no calls yet, the quick-add form starts open. Buy is the default call.
  const form = page.locator("#call-form");
  await expect(form).toBeVisible();
  await form.getByRole("combobox", { name: "Ticker" }).fill("MSFT");
  await form.getByText("Buy", { exact: true }).click();
  const d = new Date(Date.now() - 700 * 86400000).toISOString().slice(0, 10);
  await form.getByLabel("Date aired").fill(d);
  await form.getByRole("button", { name: "Save call" }).click();
  const row = page.locator(".call").first();
  await expect(row.getByText("S&P 500")).toBeVisible({ timeout: 20_000 });
  await expect(row.locator(".chg").first()).toHaveText(/[+\u2212]\d+\.\d%|0\.0%/);
  await expect(row.getByText(/over \d+ days/)).toBeVisible();
});
