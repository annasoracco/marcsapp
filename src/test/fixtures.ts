import type { FundsFile, MarketData, MarketFile, Series, TickerInfo } from "../lib/marketTypes";
import type { MarketSource } from "../lib/market";
import { addDays, todayET } from "../lib/dates";

const NOW = Math.floor(Date.now() / 1000);

function t(n: string, k: TickerInfo["k"], p: number, c: number, extra: Partial<TickerInfo> = {}): TickerInfo {
  return { n, k, p, c, t: NOW, ...extra };
}
const stock = (n: string, p: number, c: number, sec: string, mc: number, extra: Partial<TickerInfo> = {}) => t(n, "s", p, c, { sec, mc, sp: 1, ...extra });

export const market: MarketFile = {
  asOf: new Date().toISOString(),
  t: {
    SPY: t("SPDR S&P 500 ETF", "e", 600, -0.012),
    VOO: t("Vanguard S&P 500 ETF", "e", 550, -0.012),
    QQQ: t("Invesco QQQ Trust", "e", 500, -0.02),
    VTI: t("Vanguard Total Stock Market ETF", "e", 300, -0.011),
    BND: t("Vanguard Total Bond Market ETF", "e", 72, 0.002),
    FXAIX: t("Fidelity 500 Index", "f", 220, -0.012),
    VTTSX: t("Vanguard Target Retirement 2060 Fund", "f", 60, -0.008),
    VSMPX: t("Vanguard Total Stock Market Index Institutional Plus", "f", 250, -0.011),
    VGTSX: t("Vanguard Total International Stock Index", "f", 20, -0.004),
    SPAXX: t("Fidelity Government Money Market", "m", 1, 0),
    AAPL: stock("Apple Inc.", 230, -0.01, "Information Technology", 5000, { e: NOW + 2 * 86400, ec: NOW + 2 * 86400 }),
    NVDA: stock("NVIDIA Corporation", 140, -0.04, "Information Technology", 4900, { e: NOW + 4 * 86400 }),
    MSFT: stock("Microsoft Corporation", 420, 0.003, "Information Technology", 3800),
    AMZN: stock("Amazon.com, Inc.", 200, -0.007, "Consumer Discretionary", 2300),
    AVGO: stock("Broadcom Inc.", 330, -0.05, "Information Technology", 1500),
    XOM: stock("Exxon Mobil Corporation", 110, 0.02, "Energy", 480),
    COST: stock("Costco Wholesale Corporation", 900, -0.004, "Consumer Staples", 400, { e: NOW + 3 * 86400 }),
    JPM: stock("JPMorgan Chase & Co.", 240, 0.001, "Financials", 700),
    INTC: stock("Intel Corporation", 22, -0.01, "Information Technology", 100),
    F: stock("Ford Motor Company", 10, 0.002, "Consumer Discretionary", 45),
    DIS: stock("The Walt Disney Company", 110, 0.0, "Communication Services", 200),
    NKE: stock("NIKE, Inc.", 75, -0.006, "Consumer Discretionary", 110),
    PLTR: stock("Palantir Technologies Inc.", 160, 0.03, "Information Technology", 380, { e: NOW + 1 * 86400 }),
    TSLA: stock("Tesla, Inc.", 250, -0.025, "Consumer Discretionary", 900),
    AMD: stock("Advanced Micro Devices, Inc.", 150, 0.015, "Information Technology", 250, { e: NOW + 3 * 86400 }),
    LLY: stock("Eli Lilly and Company", 800, -0.003, "Health Care", 750),
    GOOGL: stock("Alphabet Inc.", 180, -0.006, "Communication Services", 2200),
    GOOG: stock("Alphabet Inc.", 181, -0.006, "Communication Services", 2200),
    ACHR: t("Archer Aviation Inc.", "s", 4.2, -0.04, { sec: "Industrials", mc: 3 }),
    AMC: t("AMC Entertainment Holdings, Inc.", "s", 3, 0.01, { sec: "Communication Services", mc: 1.5 }),
    SOFI: t("SoFi Technologies, Inc.", "s", 15, 0.02, { sec: "Financials", mc: 17 }),
    "^GSPC": t("S&P 500", "i", 6000, -0.012),
    "^IXIC": t("Nasdaq Composite", "i", 19000, -0.019),
    "^DJI": t("Dow Jones Industrial Average", "i", 44000, -0.006),
    "^RUT": t("Russell 2000", "i", 2300, -0.004),
    XLK: t("Technology Select Sector SPDR", "e", 230, -0.025),
    XLF: t("Financial Select Sector SPDR", "e", 48, 0.002),
    XLE: t("Energy Select Sector SPDR", "e", 90, 0.013),
  },
};

const SP_SEC = { "Information Technology": 0.33, Financials: 0.13, "Health Care": 0.1, "Consumer Discretionary": 0.1, "Communication Services": 0.1, Industrials: 0.08, "Consumer Staples": 0.06, Energy: 0.04, Utilities: 0.02, "Real Estate": 0.02, Materials: 0.02 };
const SP_TOP: [string, number, string][] = [
  ["NVDA", 0.08, "NVIDIA Corp"],
  ["AAPL", 0.07, "Apple Inc"],
  ["MSFT", 0.06, "Microsoft Corp"],
  ["AMZN", 0.04, "Amazon.com Inc"],
  ["GOOGL", 0.02, "Alphabet Inc Class A"],
];

export const funds: FundsFile = {
  asOf: new Date().toISOString(),
  f: {
    SPY: { st: 1, bd: 0, ca: 0, ot: 0, h: SP_TOP, sec: SP_SEC },
    VOO: { st: 1, bd: 0, ca: 0, ot: 0, h: SP_TOP, sec: SP_SEC },
    FXAIX: { st: 1, bd: 0, ca: 0, ot: 0, h: SP_TOP.map(([s, w, n]) => [s, w * 0.98, n] as [string, number, string]), sec: SP_SEC },
    QQQ: { st: 1, bd: 0, ca: 0, ot: 0, h: [["NVDA", 0.09, "NVIDIA"], ["AAPL", 0.08, "Apple"], ["MSFT", 0.07, "Microsoft"], ["AVGO", 0.05, "Broadcom"], ["TSLA", 0.03, "Tesla"]], sec: { "Information Technology": 0.6, "Consumer Discretionary": 0.2, "Communication Services": 0.2 } },
    BND: { st: 0, bd: 0.99, ca: 0.01, ot: 0, h: [], sec: {} },
    VSMPX: { st: 1, bd: 0, ca: 0, ot: 0, h: SP_TOP, sec: SP_SEC },
    VGTSX: { st: 1, bd: 0, ca: 0, ot: 0, h: [["TSM", 0.03, "Taiwan Semiconductor"]], sec: { Financials: 0.25, "Information Technology": 0.15, Industrials: 0.6 } },
    VTTSX: { st: 0.9, bd: 0.09, ca: 0.01, ot: 0, h: [["VSMPX", 0.55, "Vanguard Total Stock Mkt"], ["VGTSX", 0.36, "Vanguard Total Intl Stock"], ["BND", 0.09, "Vanguard Total Bond"]], sec: {} },
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
    counts: { tickers: Object.keys(market.t).length, history: 0, funds: 8, news: 3 },
  },
  market,
  funds,
  news: {
    asOf: new Date().toISOString(),
    items: [
      { title: "Cramer's lightning round: Archer Aviation 'is a pure spec'", link: "https://www.cnbc.com/2026/10/30/lightning-archer.html", date: new Date().toISOString() },
      { title: "Cramer's lightning round: Sell AMC", link: "https://www.cnbc.com/2026/10/29/lightning-amc.html", date: new Date(Date.now() - 86400000).toISOString() },
      { title: "Jim Cramer says Microsoft is winning the AI spending battle and Alphabet is paying the price", link: "https://www.cnbc.com/2026/10/28/msft.html", date: new Date(Date.now() - 2 * 86400000).toISOString() },
    ],
  },
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
