import { test, type Page } from "@playwright/test";
import path from "node:path";
import { DEMO_STORAGE_KEY, demoState } from "./demo-season";

// Review screenshots. Skipped unless SHOTS_DIR is set:
//   SHOTS_DIR=/some/folder npx playwright test e2e/screenshots.spec.ts
// The demo season is seeded only into this test browser (see demo-season.ts).
const DIR = process.env.SHOTS_DIR;
test.skip(!DIR, "set SHOTS_DIR to capture review screenshots");

const shot = (name: string) => path.join(DIR ?? ".", name);

async function seed(page: Page) {
  const state = JSON.stringify(demoState());
  await page.addInitScript(
    ([key, value]) => {
      if (!sessionStorage.getItem("seeded")) {
        localStorage.setItem(key, value);
        sessionStorage.setItem("seeded", "1");
      }
    },
    [DEMO_STORAGE_KEY, state] as const,
  );
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

async function scrollToOpen(page: Page) {
  await page.evaluate(() => {
    const el = document.querySelector(".is-open, .chip-detail");
    if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 12);
  });
  await page.waitForTimeout(300);
}

test("01 first run", async ({ page }) => {
  await page.goto("./");
  await settle(page);
  await page.screenshot({ path: shot("01-first-run.png") });
});

test("02 board with a season under way", async ({ page }) => {
  await seed(page);
  await page.goto("./");
  await settle(page);
  await page.screenshot({ path: shot("02-board.png") });
  await page.screenshot({ path: shot("02b-board-full.png"), fullPage: true });
});

test("03 making a pick", async ({ page }) => {
  await seed(page);
  await page.goto("./");
  await settle(page);
  const row = page.locator(".night:not(.night-yours) .row").filter({ has: page.locator(".side") }).first();
  await row.click();
  await scrollToOpen(page);
  await page.screenshot({ path: shot("03a-pick-suggested.png") });
  const slip = page.locator(".row-detail .slip").first();
  await slip.locator(".is-suggested").click();
  await slip.getByRole("group", { name: "Your pick" }).getByText("Bear").click();
  await scrollToOpen(page);
  await page.screenshot({ path: shot("03b-pick-ready.png") });
});

test("04 season and a settled matchup", async ({ page }) => {
  await seed(page);
  await page.goto("./#/season");
  await settle(page);
  await page.screenshot({ path: shot("04a-season.png") });
  await page.screenshot({ path: shot("04b-season-full.png"), fullPage: true });
  await page.locator(".list .row").first().click();
  await scrollToOpen(page);
  await page.screenshot({ path: shot("04c-final-detail.png") });
});

test("05 stocks you own", async ({ page }) => {
  await seed(page);
  await page.goto("./");
  await settle(page);
  await page.getByRole("heading", { name: "Cramer talked about your stocks" }).evaluate((el) => {
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 12);
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: shot("05a-your-stocks-on-the-show.png") });
  await page.getByRole("heading", { name: "Stocks you own" }).evaluate((el) => {
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 12);
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: shot("05b-stocks-you-own.png") });
});
