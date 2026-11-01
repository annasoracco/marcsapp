import type { FundsFile, MarketData, MarketFile, Series, TickerInfo } from "../lib/marketTypes";
import type { MarketSource } from "../lib/market";
import { addDays, todayET } from "../lib/dates";

const NOW = Math.floor(Date.now() / 1000);

function t(n: string, k: TickerInfo["k"], p: number, c: number, extra: Partial<TickerInfo> = {}): TickerInfo {
  return { n, k, p, c, t: NOW, ...extra };
}

export const market: MarketFile = {
  asOf: new Date().toISOString(),
  t: {
    SPY: t("SPDR S&P 500 ETF", "e", 600, 0.005),
    VOO: t("Vanguard S&P 500 ETF", "e", 550, 0.005),
    QQQ: t("Invesco QQQ Trust", "e", 500, 0.009),
    VTI: t("Vanguard Total Stock Market ETF", "e", 300, 0.004),
    SCHD: t("Schwab US Dividend Equity ETF", "e", 28, -0.002),
    FXAIX: t("Fidelity 500 Index", "f", 220, 0.005),
    FTIHX: t("Fidelity Total International Index", "f", 16, -0.001),
    FXNAX: t("Fidelity U.S. Bond Index", "f", 10.5, 0.001),
    VTTSX: t("Vanguard Target Retirement 2060 Fund", "f", 60, 0.003),
    SPAXX: t("Fidelity Government Money Market", "m", 1, 0),
    AAPL: t("Apple Inc.", "s", 230, 0.012, { sec: "Information Technology", e: NOW + 5 * 86400, ec: NOW + 5 * 86400 }),
    NVDA: t("NVIDIA Corporation", "s", 140, -0.021, { sec: "Information Technology", e: NOW + 20 * 86400 }),
    MSFT: t("Microsoft Corporation", "s", 420, 0.003, { sec: "Information Technology" }),
    AMZN: t("Amazon.com, Inc.", "s", 200, 0.007, { sec: "Consumer Discretionary" }),
    COST: t("Costco Wholesale", "s", 900, -0.004, { sec: "Consumer Staples" }),
    JPM: t("JPMorgan Chase & Co.", "s", 240, 0.001, { sec: "Financials" }),
    INTC: t("Intel Corporation", "s", 22, -0.01, { sec: "Information Technology" }),
    F: t("Ford Motor Company", "s", 10, 0.002, { sec: "Consumer Discretionary" }),
    DIS: t("Walt Disney Company", "s", 110, 0.0, { sec: "Communication Services" }),
    NKE: t("Nike, Inc.", "s", 75, -0.006, { sec: "Consumer Discretionary" }),
    PLTR: t("Palantir Technologies", "s", 160, 0.03, { sec: "Information Technology" }),
    TSLA: t("Tesla, Inc.", "s", 250, -0.025, { sec: "Consumer Discretionary" }),
    AMD: t("Advanced Micro Devices", "s", 150, 0.015, { sec: "Information Technology" }),
    LLY: t("Eli Lilly and Company", "s", 800, -0.003, { sec: "Health Care" }),
    SOFI: t("SoFi Technologies", "s", 15, 0.02, { sec: "Financials" }),
    "^GSPC": t("S&P 500", "i", 6000, 0.005),
    "^IXIC": t("Nasdaq Composite", "i", 19000, 0.008),
    "^DJI": t("Dow Jones Industrial Average", "i", 44000, 0.002),
    "^RUT": t("Russell 2000", "i", 2300, -0.004),
    XLK: t("Technology Select Sector SPDR", "e", 230, 0.011),
    XLF: t("Financial Select Sector SPDR", "e", 48, 0.002),
    XLE: t("Energy Select Sector SPDR", "e", 90, -0.013),
  },
};

export const funds: FundsFile = {
  asOf: new Date().toISOString(),
  f: {
    VOO: { st: 1, bd: 0, ca: 0, ot: 0, h: [["NVDA", 0.08, "NVIDIA"], ["AAPL", 0.07, "Apple"], ["MSFT", 0.06, "Microsoft"]], sec: { "Information Technology": 0.4, Financials: 0.2, "Health Care": 0.4 } },
    QQQ: { st: 1, bd: 0, ca: 0, ot: 0, h: [["NVDA", 0.09, "NVIDIA"], ["AAPL", 0.08, "Apple"]], sec: { "Information Technology": 0.6, "Consumer Discretionary": 0.4 } },
    FXAIX: { st: 1, bd: 0, ca: 0, ot: 0, h: [["NVDA", 0.08, "NVIDIA"], ["AAPL", 0.07, "Apple"]], sec: { "Information Technology": 0.4, Financials: 0.6 } },
    FXNAX: { st: 0, bd: 0.98, ca: 0.02, ot: 0, h: [], sec: {} },
  },
};

export const data: MarketData = {
  meta: {
    v: 1,
    source: "live",
    generatedAt: new Date().toISOString(),
    quotesAsOf: new Date().toISOString(),
    historyAsOf: new Date().toISOString(),
    fundsAsOf: new Date().toISOString(),
    newsAsOf: null,
    sectorEtfs: ["XLK", "XLF", "XLE"],
    indices: ["^GSPC", "^IXIC", "^DJI", "^RUT"],
    counts: { tickers: Object.keys(market.t).length, history: 0, funds: 4, news: 0 },
  },
  market,
  funds,
  news: { asOf: null, items: [] },
};

/** Weekday series ending today, growing at `dailyGrowth` per trading day. */
export function makeSeries(days: number, start: number, dailyGrowth: number, end = todayET()): Series {
  const dates: string[] = [];
  const closes: number[] = [];
  let p = start;
  for (let d = -days; d <= 0; d++) {
    const iso = addDays(end, d);
    const wd = new Date(`${iso}T12:00:00Z`).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    dates.push(iso);
    closes.push(p);
    p *= 1 + dailyGrowth;
  }
  return { dates, closes };
}

export const fakeSource: MarketSource = {
  loadData: async () => data,
  loadHistory: async (symbol) => (symbol === "SPY" ? makeSeries(800, 400, 0.0005) : makeSeries(800, 100, symbol.length % 2 ? 0.001 : -0.0005)),
};
