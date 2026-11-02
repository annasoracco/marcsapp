import { expect, test } from "@playwright/test";

// Runs against a local `vite preview` with whatever data is in public/data, or the live site via BASE_URL.

test("first run: empty record, a board of matchups, no dollar amounts", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Marc vs\. Cramer/);
  const standings = page.getByRole("table", { name: /Standings/ });
  await expect(standings.getByRole("row", { name: /Marc/ })).toContainText("0\u20130");
  await expect(standings.getByRole("row", { name: /Cramer/ })).toContainText("0\u20130");
  await expect(page.getByRole("heading", { name: "The board" })).toBeVisible();
  await expect(page.getByText(/Prices as of/)).toBeVisible();
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/\$\s?\d/);
  expect(errors).toEqual([]);
});

test("make a pick: confirm Cramer's call, make yours, lock it in", async ({ page }) => {
  await page.goto("./");
  const pick = page.locator(".night .row").first();
  await expect(pick).toBeVisible();
  const ticker = (await pick.locator(".tk").innerText()).trim();
  await pick.click();
  await page.getByRole("group", { name: "Cramer's call" }).getByText("Bull").click();
  await page.getByRole("group", { name: "Your pick" }).getByText("Bear").click();
  await expect(page.getByText("You're going against Cramer.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Lock it in" }).click();
  await expect(page.getByRole("status").filter({ hasText: `${ticker} is locked in` })).toBeVisible();
  const inPlay = page.getByRole("region", { name: "In play" });
  await expect(inPlay.getByText(ticker, { exact: true })).toBeVisible();

  // Saved on the phone only, and survives a reload.
  await page.reload();
  await expect(page.getByRole("region", { name: "In play" }).getByText(ticker, { exact: true })).toBeVisible();
  const saved = await page.evaluate(() => localStorage.getItem("marc-vs-cramer:v1"));
  expect(saved).toContain(`"s":"${ticker}"`);
});

test("first run on a phone that already opened Marc's App or Bird's Eye", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("marcsapp:v1", JSON.stringify({ accounts: [{ name: "Brokerage", holdings: [{ s: "AAPL", shares: 100 }] }] }));
    localStorage.setItem("birdseye:v2", JSON.stringify({ v: 2, calls: [{ s: "AMC", call: "sell", date: "2026-10-29" }] }));
  });
  await page.goto("./");
  const standings = page.getByRole("table", { name: /Standings/ });
  await expect(standings.getByRole("row", { name: /Marc/ })).toContainText("0\u20130");
  await expect(page.getByText(/Your season starts with your first pick/)).toBeVisible();
  const keys = await page.evaluate(() => Object.keys(localStorage).sort());
  expect(keys).toEqual(["marc-vs-cramer:v1"]);
  expect(errors).toEqual([]);
});

test("season page and stocks you own", async ({ page }) => {
  await page.goto("./");
  await page.getByPlaceholder("Add a ticker or company").fill("AAPL");
  await page.getByRole("search").getByRole("button", { name: /^AAPL/ }).first().click();
  await expect(page.getByRole("list", { name: "Your stocks" })).toContainText("AAPL");
  await page.getByRole("link", { name: "Season" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/\d{4} season/);
  await expect(page.getByText(/No finals yet/)).toBeVisible();
});
