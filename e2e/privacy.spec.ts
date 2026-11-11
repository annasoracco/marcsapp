import { expect, test, type Request } from "@playwright/test";

// Proves the privacy contract: nothing leaves the site's own origin, and typing never makes a request.
test("no third-party requests, and typed values never reach the network or the URL", async ({ page, context }) => {
  const requests: Request[] = [];
  context.on("request", (r) => requests.push(r));
  const origin = new URL(test.info().project.use.baseURL!).origin;

  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator(".hero-number")).toBeVisible();
  // Let the service worker finish precaching so it isn't mistaken for typing traffic.
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2500);
  const startUrl = page.url();
  const settled = requests.length;

  // Amount
  await page.getByRole("button", { name: /^Amount,/ }).click();
  const amount = page.getByRole("dialog").getByRole("textbox");
  await amount.fill("");
  await amount.pressSequentially("98765", { delay: 30 });
  await page.getByRole("button", { name: "Use $98,765" }).click();
  // Stock search
  await page.getByRole("button", { name: /^Investment,/ }).click();
  await page.getByRole("searchbox").pressSequentially("nvidia", { delay: 30 });
  await page.getByRole("button", { name: /^Nvidia/ }).first().click();
  // Date
  await page.getByRole("button", { name: /^Start,/ }).click();
  await page.getByRole("dialog").getByLabel("Year").selectOption("2016");
  await page.getByRole("dialog").getByLabel("Month").selectOption({ label: "Jun" });
  await page.getByRole("button", { name: "Start in Jun 2016" }).click();
  // A saved personal date
  await page.getByRole("button", { name: "Save a date" }).click();
  await page.getByPlaceholder("My birthday").pressSequentially("Marc birthday", { delay: 20 });
  await page.locator('input[type="month"]').fill("1990-05");
  await page.getByRole("button", { name: "Save date" }).click();
  await expect(page.getByRole("button", { name: /^Marc birthday May 1990/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Marc birthday May 1990/ })).toContainText("Nvidia wasn’t trading yet");
  // Characters outside the bundled Latin fonts must not trigger a font download either.
  await page.getByRole("button", { name: "Save a date" }).click();
  await page.getByPlaceholder("My birthday").pressSequentially("Łukasz Dvořák Пётр", { delay: 20 });
  await page.locator('input[type="month"]').fill("2001-03");
  await page.getByRole("button", { name: "Save date" }).click();
  await expect(page.getByRole("button", { name: /^Łukasz/ })).toBeVisible();
  await page.getByRole("button", { name: /^Investment,/ }).click();
  await page.getByRole("searchbox").pressSequentially("Ελλάδα", { delay: 20 });
  await page.getByRole("button", { name: "Done" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toContainText("$98,765 into Nvidia in Jun 2016");
  const typed = requests.slice(settled);
  expect(typed.map((r) => r.url())).toEqual([]);
  expect(page.url()).toBe(startUrl);

  const all = requests.map((r) => r.url());
  const foreign = all.filter((u) => !u.startsWith(origin) && !u.startsWith("data:") && !u.startsWith("blob:"));
  expect(foreign).toEqual([]);
  for (const secret of ["98765", "nvidia", "NVDA", "birthday", "2016", "1990"]) {
    expect(all.filter((u) => u.toLowerCase().includes(secret.toLowerCase()))).toEqual([]);
  }
  test.info().annotations.push({ type: "requests", description: [...new Set(all.map((u) => u.replace(origin, "")))].join(" ") });
});
