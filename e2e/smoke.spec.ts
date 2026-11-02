import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Optional: set SCREENSHOT_DIR to save viewport screenshots of each screen.
const SHOTS = process.env.SCREENSHOT_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const PREFIX = process.env.SCREENSHOT_PREFIX ?? "after-";

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(SHOTS, `${PREFIX}${name}.png`) });
}

async function checkLayout(page: Page, label: string) {
  const problems = await page.evaluate(() => {
    const out: string[] = [];
    const w = window.innerWidth;
    for (const el of document.querySelectorAll("main *")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > w + 1) out.push(`overflow: ${el.tagName}.${(el as HTMLElement).className}`);
    }
    for (const el of document.querySelectorAll("input, textarea, select")) {
      const id = el.id;
      const label = id ? (document.querySelector(`label[for="${id}"]`)?.textContent ?? "") : "";
      const text = [el.getAttribute("name"), id, el.getAttribute("placeholder"), el.getAttribute("aria-label"), label, el.closest("label")?.textContent].join(" ");
      if (el.getAttribute("type") === "number" || /share|quantit|qty|account|balance|amount|holding|cost|portfolio/i.test(text)) out.push(`financial input: ${text}`);
    }
    return out.slice(0, 5);
  });
  expect(problems, label).toEqual([]);
  const text = await page.locator("main").innerText();
  expect(text, `${label} shows a dollar amount`).not.toMatch(/\$\s?\d/);
}

test("briefing, Cramer, Fund X-ray, and Markets work with sample data", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Bird's Eye" })).toBeVisible();
  await page.getByRole("button", { name: "Explore with sample calls" }).click();

  // Briefing
  await expect(page.locator(".hero-sentence")).toContainText(/S&P 500 (rose|fell|was about flat)/);
  await expect(page.getByRole("heading", { name: "What moved the market" })).toBeVisible();
  await expect(page.locator(".chg-chart").first()).toBeVisible({ timeout: 20_000 });
  await checkLayout(page, "Briefing");
  await shot(page, "briefing");

  // Cramer
  await page.getByRole("link", { name: "Cramer", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Would following Cramer/ })).toBeVisible();
  await expect(page.locator(".strategy")).toHaveCount(3, { timeout: 20_000 });
  await expect(page.locator(".call-row .vs").first()).toBeVisible();
  await checkLayout(page, "Cramer");
  await shot(page, "cramer");

  await page.locator(".call-row").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").locator(".chg-chart")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  // Log a back-dated call in a few taps.
  await page.getByRole("button", { name: "Log a Cramer call" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("combobox", { name: "Which stock?" }).fill("MSFT");
  await shot(page, "add-call");
  await sheet.getByRole("option", { name: /MSFT/ }).first().click();
  await sheet.getByText("Buy", { exact: true }).click();
  await sheet.getByRole("button", { name: "Pick a date" }).click();
  await sheet.getByLabel("Date aired").fill(new Date(Date.now() - 700 * 86400000).toISOString().slice(0, 10));
  await sheet.getByRole("button", { name: /Save Buy on MSFT/ }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  const row = page.locator(".call-row", { hasText: "MSFT" }).first();
  await expect(row.locator(".vs")).toContainText(/[+\u2212]\d+\.\d% vs market|0\.0% vs market/, { timeout: 20_000 });

  // Fund X-ray
  await page.getByRole("link", { name: "Fund X-ray", exact: true }).click();
  await expect(page.getByText(/Nothing about your own accounts is needed/)).toBeVisible();
  await page.getByRole("button", { name: "VOO", exact: true }).click();
  await expect(page.locator(".hero-sentence")).toContainText("VOO is a US stock ETF.");
  await expect(page.getByRole("heading", { name: "Top holdings" })).toBeVisible();
  await expect(page.locator("table.perf")).toBeVisible();
  await checkLayout(page, "Fund X-ray");
  await shot(page, "fund-xray");
  await page.getByRole("button", { name: /Compare with another/ }).click();
  await page.getByRole("button", { name: "FXAIX", exact: true }).click();
  await expect(page.locator(".hero")).toContainText(/VOO and FXAIX are almost the same fund/);
  await checkLayout(page, "Fund compare");

  // Markets
  await page.getByRole("link", { name: "Markets", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Stocks you're watching" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Earnings calendar" })).toBeVisible();
  await checkLayout(page, "Markets");
  await shot(page, "markets");

  // Ticker detail is the one place a per-share price appears.
  await page.goto("./#/t/AAPL");
  await expect(page.getByText(/a share/)).toBeVisible();
  await expect(page.locator(".chg-chart")).toBeVisible({ timeout: 20_000 });

  expect(errors).toEqual([]);
});

for (const width of [320, 430]) {
  test(`layout holds at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 860 });
    await page.goto("./");
    await page.getByRole("button", { name: "Explore with sample calls" }).click();
    await expect(page.locator(".hero-sentence")).toBeVisible();
    for (const [tab, ready] of [
      ["Briefing", "What moved the market"],
      ["Cramer", "Your calls (8)"],
      ["Markets", "Earnings calendar"],
    ] as const) {
      await page.getByRole("link", { name: tab, exact: true }).click();
      await expect(page.getByRole("heading", { name: ready })).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(400);
      await checkLayout(page, `${tab} at ${width}px`);
    }
    await page.goto("./#/funds/compare/VOO,QQQ,VTTSX");
    await expect(page.getByRole("heading", { name: "Performance side by side" })).toBeVisible();
    await checkLayout(page, `Compare at ${width}px`);
  });
}
