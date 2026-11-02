import type { MarketData, NewsItem, Series, TickerInfo } from "../lib/marketTypes";
import type { MarketSource } from "../lib/market";

/** Weekdays from `from` to `to` inclusive (no holidays). */
export function weekdays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T12:00:00Z`); t <= Date.parse(`${to}T12:00:00Z`); t += 86400000) {
    const d = new Date(t);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function series(dates: string[], start: number, step: number): Series {
  return { dates, closes: dates.map((_, i) => Number((start * (1 + step) ** i).toFixed(4))) };
}

/** Epoch seconds for an ET wall time (EDT, so valid for October dates). */
export const etEpoch = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00-04:00`) / 1000;

export const DATES = weekdays("2026-10-01", "2026-10-30");

const quote = (n: string, k: TickerInfo["k"], p: number, c: number, t = etEpoch("2026-10-30", "16:00")): TickerInfo => ({
  n,
  k,
  p,
  c,
  t,
  ms: "CLOSED",
});

export const HISTORIES: Record<string, Series> = {
  SPY: series(DATES, 600, 0.001),
  KMB: series(DATES, 100, -0.004),
  STZ: series(DATES, 150, 0.006),
  AVGO: series(DATES, 300, 0.01),
  AMC: series(DATES, 3, -0.01),
  MSFT: series(DATES, 400, 0.002),
};

const last = (s: string) => HISTORIES[s].closes[HISTORIES[s].closes.length - 1];

export const NEWS: NewsItem[] = [
  {
    title: "Jim Cramer says it's time to look beyond tech. Here are 4 consumer stocks he likes",
    link: "https://www.cnbc.com/2026/10/29/consumer.html",
    date: "2026-10-29T22:52:04.000Z",
    air: "2026-10-29",
    tk: [
      { s: "KMB", n: "Kimberly-Clark Corp", p: 1, m: -0.004 },
      { s: "STZ", n: "Constellation Brands Inc", p: 1, m: 0.006 },
      { s: "QQQ", n: "Invesco QQQ Trust" },
    ],
  },
  {
    title: "Cramer's lightning round: Sell AMC",
    link: "https://www.cnbc.com/2026/10/29/sell-amc.html",
    date: "2026-10-29T22:55:01.000Z",
    air: "2026-10-29",
    tk: [
      { s: "AVGO", n: "Broadcom Inc", p: 1, m: 0.01 },
      { s: "AMC", n: "AMC Entertainment Holdings Inc", m: -0.01 },
      { s: "OPENAI-FG", n: "OpenAI" },
      { s: "ZZZZ", n: "Not Covered Corp" },
    ],
  },
  {
    title: "Jim Cramer's guide to investing: You don't need to be perfect",
    link: "https://www.cnbc.com/2026/10/22/guide.html",
    date: "2026-10-22T23:01:09.000Z",
    air: "2026-10-22",
    tk: [],
  },
];

export function fixtureData(source: "live" | "sample" = "live"): MarketData {
  return {
    meta: {
      v: 1,
      source,
      generatedAt: "2026-10-31T03:00:00.000Z",
      quotesAsOf: "2026-10-30T20:00:00.000Z",
      historyAsOf: "2026-10-31T02:00:00.000Z",
      fundsAsOf: null,
      newsAsOf: "2026-10-31T03:00:00.000Z",
      sectorEtfs: [],
      indices: ["^GSPC", "^IXIC", "^DJI"],
      counts: { tickers: 9, history: 6, funds: 0, news: NEWS.length },
    },
    market: {
      asOf: "2026-10-31T03:00:00.000Z",
      t: {
        SPY: quote("SPDR S&P 500 ETF Trust", "e", last("SPY"), 0.004),
        QQQ: quote("Invesco QQQ Trust", "e", 500, 0.006),
        KMB: quote("Kimberly-Clark Corporation", "s", last("KMB"), -0.01),
        STZ: quote("Constellation Brands, Inc.", "s", last("STZ"), 0.012),
        AVGO: quote("Broadcom Inc.", "s", last("AVGO"), 0.02),
        AMC: quote("AMC Entertainment Holdings, Inc.", "s", last("AMC"), -0.03),
        MSFT: quote("Microsoft Corporation", "s", last("MSFT"), 0.001),
        "^GSPC": quote("S&P 500", "i", 7000, 0.003),
        "^IXIC": quote("NASDAQ Composite", "i", 23000, -0.002),
        "^DJI": quote("Dow Jones Industrial Average", "i", 47000, 0.001),
      },
    },
    news: { asOf: "2026-10-31T03:00:00.000Z", items: NEWS },
    recent: {
      asOf: "2026-10-31T03:00:00.000Z",
      d: DATES,
      c: Object.fromEntries(
        Object.entries(HISTORIES)
          .filter(([s]) => s !== "SPY")
          .map(([s, h]) => [s, h.closes]),
      ),
    },
  };
}

export function fixtureSource(source: "live" | "sample" = "live"): MarketSource {
  return {
    loadData: async () => fixtureData(source),
    loadHistory: async (s) => HISTORIES[s] ?? null,
  };
}
