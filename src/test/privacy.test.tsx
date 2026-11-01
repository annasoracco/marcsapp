// Privacy guard: holdings and accounts may only ever render as percentages.
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { StoreProvider } from "../lib/store";
import { MarketProvider } from "../lib/market";
import { defaultState } from "../lib/storage";
import { withSample } from "../lib/sample";
import { App } from "../App";
import { fakeSource } from "./fixtures";
import type { AppState } from "../lib/types";

// "$1", "$ 1,234", "USD 12", "1,234.00 USD" and the like.
const CURRENCY = /(\$\s?\d)|(\bUSD\b)|(\d[\d,]*\.\d{2}\s?(dollars|USD))/i;

function stateWithSharesToo(): AppState {
  const s = withSample({ ...defaultState(), onboarded: true });
  // Add share-based holdings so the X-ray has real per-share math to (not) leak.
  s.accounts.push({
    id: "acct-shares",
    name: "Share Count Brokerage",
    type: "Brokerage",
    holdings: [
      { id: "h1", kind: "shares", symbol: "AAPL", shares: 1234 },
      { id: "h2", kind: "shares", symbol: "MSFT", shares: 777 },
    ],
  });
  return s;
}

async function renderAt(hash: string, state: AppState) {
  window.location.hash = hash;
  const view = render(
    <StoreProvider initial={state}>
      <MarketProvider source={fakeSource}>
        <App />
      </MarketProvider>
    </StoreProvider>,
  );
  await waitFor(() => expect(screen.queryByText(/Loading market data/)).not.toBeInTheDocument());
  return view;
}

describe("privacy guard: no dollar amounts for holdings or accounts", () => {
  for (const [name, hash, ready] of [
    ["X-ray", "#/xray", /Combined allocation/],
    ["Today", "#/today", /Sector heat map/],
    ["Calls", "#/calls", /Scorecard/],
    ["Earnings", "#/earnings", /Earnings radar/],
  ] as const) {
    it(`${name} view renders no currency values`, async () => {
      const { container } = await renderAt(hash, stateWithSharesToo());
      await screen.findByText(ready);
      await waitFor(() => expect(screen.queryByText(/Loading prices/)).not.toBeInTheDocument());
      const text = container.textContent ?? "";
      expect(text).not.toMatch(CURRENCY);
      // Share counts are only allowed inside the account edit form.
      expect(text).not.toContain("1234");
      expect(text).not.toContain("1,234");
      expect(text).not.toContain("777");
    });
  }

  it("X-ray shows percentages", async () => {
    const { container } = await renderAt("#/xray", stateWithSharesToo());
    await screen.findByText(/Combined allocation/);
    expect(container.textContent).toMatch(/\d+\.\d%/);
  });

  it("share counts appear only in the account edit form", async () => {
    await renderAt("#/xray/account/acct-shares", stateWithSharesToo());
    expect(await screen.findByDisplayValue("1234")).toBeInTheDocument();
  });

  it("only the ticker detail view may use the per-share price formatter", () => {
    const sources = import.meta.glob(["../**/*.tsx", "../**/*.ts", "!../test/**", "!../**/*.test.*"], {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
    const users = Object.entries(sources)
      .filter(([path, src]) => /perSharePrice\(/.test(src) && !path.endsWith("lib/format.ts"))
      .map(([path]) => path);
    expect(users).toEqual(["../views/TickerView.tsx"]);
    for (const [path, src] of Object.entries(sources)) {
      expect(src, path).not.toMatch(/style:\s*["']currency["']/);
    }
  });
});
