// Privacy guard. Bird's Eye must never ask for, accept, store, or show personal financial data.
import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StoreProvider } from "../lib/store";
import { MarketProvider } from "../lib/market";
import { UiProvider } from "../components/Sheet";
import { App } from "../App";
import { defaultState, LEGACY_KEYS, loadState, makeBackup, parseBackup, sanitizeState, STORAGE_KEY } from "../lib/storage";
import { withSample, withoutSample } from "../lib/sample";
import { STATE_KEYS, type AppState } from "../lib/types";
import { fakeSource } from "./fixtures";

const CURRENCY = /(\$\s?\d)|(\bUSD\b)/;
const FORBIDDEN_INPUT = /share|quantit|qty|account|balance|value|amount|holding|cost|basis|position|portfolio|weight/i;

function sampleState(): AppState {
  return withSample({ ...defaultState(), onboarded: true });
}

async function renderAt(hash: string, state = sampleState()) {
  window.location.hash = hash;
  const view = render(
    <StoreProvider initial={state}>
      <MarketProvider source={fakeSource}>
        <UiProvider>
          <App />
        </UiProvider>
      </MarketProvider>
    </StoreProvider>,
  );
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
  return view;
}

function describeInput(el: Element): string {
  const id = el.getAttribute("id");
  const label = id ? document.querySelector(`label[for="${id}"]`)?.textContent ?? "" : "";
  return [el.getAttribute("name"), id, el.getAttribute("placeholder"), el.getAttribute("aria-label"), label, el.closest("label")?.textContent].filter(Boolean).join(" | ");
}

function assertNoFinancialInputs(container: HTMLElement) {
  for (const el of container.ownerDocument.querySelectorAll("input, textarea, select")) {
    const type = el.getAttribute("type");
    expect(type, describeInput(el)).not.toBe("number");
    expect(describeInput(el), "an input asks for personal financial data").not.toMatch(FORBIDDEN_INPUT);
  }
}

const SCREENS = [
  ["Briefing", "#/briefing", /What moved the market/],
  ["Cramer", "#/cramer", /Would following Cramer/],
  ["Fund X-ray", "#/funds/VOO", /Top holdings/],
  ["Fund compare", "#/funds/compare/VOO,FXAIX", /almost the same fund/],
  ["Markets", "#/markets", /Stocks you're watching/],
  ["Settings", "#/settings", /Your money stays private/],
] as const;

describe("privacy guard: no personal financial data, ever", () => {
  for (const [name, hash, ready] of SCREENS) {
    it(`${name} has no money inputs and shows no dollar amounts`, async () => {
      const { container } = await renderAt(hash);
      await screen.findByText(ready, {}, { timeout: 3000 });
      assertNoFinancialInputs(container);
      expect(container.textContent ?? "").not.toMatch(CURRENCY);
      expect(container.textContent ?? "").not.toMatch(/your portfolio|your accounts? (is|are)|holdings? you own/i);
    });
  }

  it("the add-call sheet only asks for a ticker, the call, and the date", async () => {
    const user = userEvent.setup();
    await renderAt("#/cramer");
    await user.click(await screen.findByRole("button", { name: "Log a Cramer call" }));
    const dialog = await screen.findByRole("dialog");
    assertNoFinancialInputs(dialog);
    expect(within(dialog).getByRole("radiogroup", { name: "His call" })).toBeInTheDocument();
    expect(dialog.textContent).not.toMatch(CURRENCY);
  });

  it("only the ticker page shows a per-share price", async () => {
    const { container } = await renderAt("#/t/AAPL");
    await screen.findByText(/a share/);
    assertNoFinancialInputs(container);
    const sources = import.meta.glob(["../**/*.tsx", "../**/*.ts", "!../test/**", "!../**/*.test.*"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    const users = Object.entries(sources)
      .filter(([path, src]) => /perSharePrice\(/.test(src) && !path.endsWith("lib/format.ts"))
      .map(([path]) => path);
    expect(users).toEqual(["../views/Ticker.tsx"]);
  });

  it("no source file defines accounts, holdings, or brokerage import", () => {
    const sources = import.meta.glob(["../**/*.tsx", "../**/*.ts", "!../test/**"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    for (const [path, src] of Object.entries(sources)) {
      expect(src, path).not.toMatch(/interface Account\b|type Holding\b|kind: "shares"|importPositionsCsv|saveAccount/);
    }
  });
});

describe("stored data shape", () => {
  it("contains only calls, watchlist, and settings", () => {
    const s = sampleState();
    expect(Object.keys(s).sort()).toEqual([...STATE_KEYS].sort());
    const json = JSON.stringify(s);
    expect(json).not.toMatch(/"(accounts|holdings|shares|pct|portfolioPct|balance)"/);
    expect(Object.keys(makeBackup(s).data).sort()).toEqual(["calls", "settings", "watchlist"]);
  });

  it("drops accounts and holdings from old data and old backups", () => {
    const legacy = {
      version: 1,
      onboarded: true,
      accounts: [{ id: "a", name: "Roth", type: "Roth IRA", holdings: [{ id: "h", kind: "shares", symbol: "AAPL", shares: 50 }] }],
      calls: [{ id: "c1", symbol: "NVDA", action: "buy", date: "2026-01-05", createdAt: "x" }],
      watchlist: [{ symbol: "TSLA", addedOn: "2026-01-01" }],
      settings: { concentrationPct: 10 },
    };
    const clean = sanitizeState(legacy);
    expect(Object.keys(clean).sort()).toEqual([...STATE_KEYS].sort());
    expect(JSON.stringify(clean)).not.toMatch(/accounts|holdings|Roth|shares|concentration/);
    expect(clean.calls).toHaveLength(1);
    const restored = parseBackup(JSON.stringify({ app: "marcsapp", kind: "backup", version: 1, data: legacy }));
    expect(JSON.stringify(restored)).not.toMatch(/accounts|holdings|Roth/);
    expect(restored.watchlist.map((w) => w.symbol)).toEqual(["TSLA"]);
  });

  it("sample data has no accounts and can be cleared", () => {
    const s = sampleState();
    expect(s.calls.length).toBeGreaterThan(0);
    expect(s.watchlist.length).toBeGreaterThan(0);
    const cleared = withoutSample(s);
    expect(cleared.calls).toHaveLength(0);
    expect(cleared.watchlist).toHaveLength(0);
  });
});

describe("migration from older versions", () => {
  it("deletes old account and holding keys on load and keeps calls and the watchlist", () => {
    localStorage.clear();
    localStorage.setItem(
      LEGACY_KEYS[0],
      JSON.stringify({
        version: 1,
        onboarded: true,
        accounts: [{ id: "a", name: "Brokerage", type: "Brokerage", holdings: [{ id: "h", kind: "pct", symbol: "VOO", pct: 60 }] }],
        calls: [{ id: "c1", symbol: "NVDA", action: "buy", date: "2026-01-05", createdAt: "x" }],
        watchlist: [{ symbol: "AMD", addedOn: "2026-01-01" }],
        settings: { concentrationPct: 12, installTipDismissed: true },
      }),
    );
    localStorage.setItem("marcsapp:accounts", "[1]");
    localStorage.setItem("marcsapp-holdings-cache", "[2]");
    localStorage.setItem("unrelated-key", "keep me");

    const s = loadState();
    expect(s.calls.map((c) => c.symbol)).toEqual(["NVDA"]);
    expect(s.watchlist.map((w) => w.symbol)).toEqual(["AMD"]);
    expect(s.settings).toEqual({ installTipDismissed: true });
    expect(localStorage.getItem(LEGACY_KEYS[0])).toBeNull();
    expect(localStorage.getItem("marcsapp:accounts")).toBeNull();
    expect(localStorage.getItem("marcsapp-holdings-cache")).toBeNull();
    expect(localStorage.getItem("unrelated-key")).toBe("keep me");
    const stored = localStorage.getItem(STORAGE_KEY)!;
    expect(stored).not.toMatch(/accounts|holdings|VOO|Brokerage/);
    expect(Object.keys(JSON.parse(stored)).sort()).toEqual([...STATE_KEYS].sort());
  });

  it("starts clean when nothing is stored", () => {
    localStorage.clear();
    expect(loadState()).toEqual(defaultState());
  });
});
